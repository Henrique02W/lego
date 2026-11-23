// Instala a biblioteca de peças LDraw em data/ldraw/{parts,p}.
//
// Uso:
//   npm run import:ldraw                        # baixa o complete.zip oficial
//   npm run import:ldraw -- --zip arquivo.zip   # usa um zip já baixado
//   npm run import:ldraw -- --url <url do zip>  # outra origem
//   npm run import:ldraw -- --dir pasta         # copia de uma pasta que já tenha parts/ e p/
//
// LDraw Parts Library: licença CC BY 4.0 (exige atribuição), https://www.ldraw.org
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { DATA_DIR } from '../src/db.js';

const DEFAULT_URL = 'https://library.ldraw.org/library/updates/complete.zip';
const args = process.argv.slice(2);
const argv = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const out = path.join(DATA_DIR, 'ldraw');

function put(rel, data) {
  // rel já em minúsculas, sem "ldraw/". Só parts/ e p/. Bloqueia caminhos fora do destino.
  if (!/^(parts|p)\//.test(rel) || rel.includes('..') || rel.endsWith('/')) return false;
  if (!/\.(dat|ldr)$/.test(rel)) return false;
  const dest = path.join(out, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, data);
  return true;
}

async function main() {
  let n = 0;
  if (argv('--dir')) {
    const src = path.resolve(argv('--dir'));
    const walk = (d, rel) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name.toLowerCase()}` : e.name.toLowerCase();
        if (e.isDirectory()) walk(path.join(d, e.name), r);
        else if (put(r, fs.readFileSync(path.join(d, e.name)))) n++;
      }
    };
    walk(src, '');
  } else {
    let buf;
    if (argv('--zip')) buf = fs.readFileSync(argv('--zip'));
    else {
      const url = argv('--url') || DEFAULT_URL;
      console.log(`Baixando ${url} ...`);
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}. Baixe o "complete.zip" em https://www.ldraw.org/parts/latest-parts.html e use --zip arquivo.zip`);
      buf = Buffer.from(await r.arrayBuffer());
    }
    const files = unzipSync(new Uint8Array(buf), {
      filter: (f) => /^(ldraw\/)?(parts|p)\//i.test(f.name) && /\.(dat|ldr)$/i.test(f.name),
    });
    for (const [name, data] of Object.entries(files)) {
      const rel = name.replace(/\\/g, '/').toLowerCase().replace(/^ldraw\//, '');
      if (put(rel, data)) n++;
    }
  }
  if (!n) throw new Error('Nenhum arquivo parts/ ou p/ encontrado. Confira se o zip é a biblioteca completa do LDraw.');
  fs.writeFileSync(path.join(DATA_DIR, 'ldraw-installed.txt'), `${new Date().toISOString()}\n${n} arquivos\n`);
  // As formas em cache foram geradas com a biblioteca anterior.
  for (const f of ['shapes.json']) fs.rmSync(path.join(DATA_DIR, f), { force: true });
  fs.rmSync(path.join(DATA_DIR, 'stl'), { recursive: true, force: true });
  console.log(`Pronto: ${n} arquivos instalados em ${out}`);
}

main().catch((e) => { console.error('\nErro:', e.message); process.exit(1); });
