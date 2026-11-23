// Importa os CSVs do Rebrickable para data/brick.db.
//
// Uso:
//   npm run import:rebrickable                 # baixa os .csv.gz do CDN do Rebrickable
//   npm run import:rebrickable -- --from pasta # usa arquivos já baixados (.csv ou .csv.gz)
//
// AVISO: escrito sem acesso aos arquivos reais. As colunas são mapeadas pelo NOME no
// cabeçalho; se algum nome esperado não existir, o script para com uma mensagem clara.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { openDb, DATA_DIR } from '../src/db.js';
import { readCsv, findCsv } from '../src/csv.js';
import { norm } from '../src/text.js';

const BASE = 'https://cdn.rebrickable.com/media/downloads/';
const REQUIRED = {
  themes: ['id', 'name', 'parent_id'],
  sets: ['set_num', 'name', 'year', 'theme_id', 'num_parts'],
  part_categories: ['id', 'name'],
  parts: ['part_num', 'name', 'part_cat_id'],
  colors: ['id', 'name', 'rgb', 'is_trans'],
  inventories: ['id', 'version', 'set_num'],
  inventory_parts: ['inventory_id', 'part_num', 'color_id', 'quantity', 'is_spare'],
};
const OPTIONAL = {
  elements: ['element_id', 'part_num', 'color_id'],
  part_relationships: ['rel_type', 'child_part_num', 'parent_part_num'],
};

const args = process.argv.slice(2);
const argv = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const from = argv('--from');
const dir = from ? path.resolve(from) : path.join(DATA_DIR, 'rebrickable');

async function download(name) {
  fs.mkdirSync(dir, { recursive: true });
  const url = `${BASE}${name}.csv.gz`;
  const dest = path.join(dir, `${name}.csv.gz`);
  process.stdout.write(`Baixando ${url} ... `);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}. Baixe manualmente em https://rebrickable.com/downloads/ e use --from <pasta>.`);
  await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(dest));
  console.log('ok');
}

async function ensureFiles() {
  const names = [...Object.keys(REQUIRED), ...Object.keys(OPTIONAL)];
  const files = {};
  for (const n of names) {
    let f = findCsv(dir, n);
    if (!f && !from) {
      try { await download(n); f = findCsv(dir, n); }
      catch (e) { if (n in REQUIRED) throw e; console.log(`(opcional) ${n}: ${e.message}`); }
    }
    if (!f && n in REQUIRED) throw new Error(`Arquivo obrigatório não encontrado: ${n}.csv(.gz) em ${dir}`);
    files[n] = f;
  }
  return files;
}

async function* rows(name, file) {
  let first = true;
  const need = REQUIRED[name] || OPTIONAL[name];
  for await (const r of readCsv(file)) {
    if (first) {
      first = false;
      const missing = need.filter((c) => !(c in r));
      if (missing.length) {
        const found = Object.keys(r).join(', ');
        throw new Error(`${name}: faltam as colunas [${missing.join(', ')}]. Colunas encontradas: ${found}. O formato do Rebrickable pode ter mudado; ajuste scripts/import-rebrickable.mjs.`);
      }
    }
    yield r;
  }
}

const bool = (v) => (/^(t|true|1|yes)$/i.test(String(v).trim()) ? 1 : 0);
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isNaN(n) ? d : n; };

async function main() {
  const files = await ensureFiles();
  const db = openDb();
  db.exec('BEGIN');
  try {
    for (const t of ['themes', 'sets', 'part_categories', 'parts', 'colors', 'elements', 'part_rel', 'set_inventory']) db.exec(`DELETE FROM ${t}`);

    const ins = (sql) => db.prepare(sql);

    // Temas (com cadeia de pais para a busca)
    const themes = new Map();
    const iT = ins('INSERT INTO themes VALUES (?,?,?)');
    for await (const r of rows('themes', files.themes)) {
      themes.set(int(r.id), { name: r.name, parent: r.parent_id ? int(r.parent_id) : null });
      iT.run(int(r.id), r.name, r.parent_id ? int(r.parent_id) : null);
    }
    const themePath = (id) => {
      const out = [];
      for (let t = themes.get(id), g = 0; t && g < 6; t = t.parent != null ? themes.get(t.parent) : null, g++) out.unshift(t.name);
      return out.join(' / ');
    };

    const iS = ins('INSERT OR REPLACE INTO sets VALUES (?,?,?,?,?,?,?,?)');
    let nSets = 0;
    for await (const r of rows('sets', files.sets)) {
      const tn = themePath(int(r.theme_id));
      iS.run(r.set_num, r.name, int(r.year), int(r.theme_id), tn, int(r.num_parts), r.img_url || null,
        norm(`${r.set_num} ${r.name} ${tn} ${r.year}`));
      nSets++;
    }

    const iC = ins('INSERT OR REPLACE INTO part_categories VALUES (?,?)');
    for await (const r of rows('part_categories', files.part_categories)) iC.run(int(r.id), r.name);

    const iP = ins('INSERT OR REPLACE INTO parts VALUES (?,?,?,?)');
    let nParts = 0;
    for await (const r of rows('parts', files.parts)) {
      iP.run(r.part_num, r.name, int(r.part_cat_id), r.part_material || r.material || 'Plastic');
      nParts++;
    }

    const iCo = ins('INSERT OR REPLACE INTO colors VALUES (?,?,?,?)');
    for await (const r of rows('colors', files.colors)) iCo.run(int(r.id), r.name, r.rgb, bool(r.is_trans));

    if (files.elements) {
      const iE = ins('INSERT OR REPLACE INTO elements VALUES (?,?,?)');
      for await (const r of rows('elements', files.elements)) iE.run(String(r.element_id), r.part_num, int(r.color_id));
    }
    if (files.part_relationships) {
      const iR = ins('INSERT INTO part_rel VALUES (?,?,?)');
      for await (const r of rows('part_relationships', files.part_relationships)) iR.run(r.rel_type, r.child_part_num, r.parent_part_num);
    }

    // Somente a versão mais alta do inventário de cada conjunto
    const best = new Map(); // set_num -> {id, version}
    for await (const r of rows('inventories', files.inventories)) {
      const v = int(r.version, 1);
      const cur = best.get(r.set_num);
      if (!cur || v > cur.version) best.set(r.set_num, { id: String(r.id), version: v });
    }
    const invToSet = new Map();
    for (const [set, { id }] of best) invToSet.set(id, set);

    const iI = ins('INSERT INTO set_inventory VALUES (?,?,?,?,?)');
    let nInv = 0;
    for await (const r of rows('inventory_parts', files.inventory_parts)) {
      const set = invToSet.get(String(r.inventory_id));
      if (!set) continue;
      iI.run(set, r.part_num, int(r.color_id), int(r.quantity, 1), bool(r.is_spare));
      nInv++;
    }

    const m = db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)');
    m.run('rebrickable_imported_at', new Date().toISOString());
    m.run('rebrickable_counts', JSON.stringify({ sets: nSets, parts: nParts, inventory_lines: nInv }));
    db.exec('COMMIT');
    console.log(`Pronto: ${nSets} conjuntos, ${nParts} peças, ${nInv} linhas de inventário.`);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

main().catch((e) => { console.error('\nErro:', e.message); process.exit(1); });
