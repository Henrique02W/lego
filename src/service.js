import { zipSync, strToU8 } from 'fflate';
import { tokens, norm } from './text.js';
import { classifyBase, refine, STATUS_LABEL } from './classify.js';
import { readStl, toStl } from './stl.js';
import { packPlates, plateTriangles, plateSummary } from './plates.js';

export function normalizeSetNum(q) {
  const s = String(q).trim();
  return /^\d{3,7}$/.test(s) ? `${s}-1` : s;
}

export function search(db, q) {
  const raw = String(q || '').trim();
  const res = { sets: [], elements: [], part: null };
  if (raw.length < 2) return res;
  const cols = 'set_num, name, year, theme_name, num_parts, img_url';

  if (/^\d{3,7}(-\d+)?$/.test(raw)) {
    res.sets = db.prepare(`SELECT ${cols} FROM sets WHERE set_num = ? OR set_num LIKE ? ORDER BY set_num LIMIT 30`)
      .all(raw, `${raw}-%`);
  }
  if (!res.sets.length) {
    const t = tokens(raw);
    if (t.length) {
      const where = t.map(() => 'search_text LIKE ?').join(' AND ');
      res.sets = db.prepare(`SELECT ${cols} FROM sets WHERE ${where} ORDER BY year DESC, num_parts DESC LIMIT 30`)
        .all(...t.map((x) => `%${x}%`));
    }
  }
  if (/^\d{5,8}$/.test(raw)) {
    res.elements = db.prepare(`
      SELECT e.element_id, e.part_num, p.name AS part_name, e.color_id, c.name AS color_name, c.rgb
      FROM elements e LEFT JOIN parts p ON p.part_num=e.part_num LEFT JOIN colors c ON c.id=e.color_id
      WHERE e.element_id = ? LIMIT 5`).all(raw);
    for (const el of res.elements) {
      el.sets = db.prepare(`
        SELECT s.set_num, s.name, s.year, i.qty FROM set_inventory i JOIN sets s ON s.set_num=i.set_num
        WHERE i.part_num=? AND i.color_id=? AND i.is_spare=0 ORDER BY s.year DESC LIMIT 20`).all(el.part_num, el.color_id);
    }
  }
  if (/^[0-9a-z]{2,20}$/i.test(raw)) {
    res.part = db.prepare(`SELECT p.part_num, p.name, c.name AS category FROM parts p
      LEFT JOIN part_categories c ON c.id=p.part_cat_id WHERE lower(p.part_num)=lower(?)`).get(raw) || null;
  }
  return res;
}

export function getSet(db, shapes, rawNum) {
  const setNum = normalizeSetNum(rawNum);
  const set = db.prepare('SELECT * FROM sets WHERE set_num = ?').get(setNum);
  if (!set) return null;
  const rows = db.prepare(`
    SELECT i.part_num, i.color_id, SUM(i.qty) AS qty,
           p.name, p.material, pc.name AS cat,
           c.name AS color_name, c.rgb, c.is_trans,
           EXISTS(SELECT 1 FROM part_rel r WHERE r.child=i.part_num AND r.rel_type IN ('P','T')) AS printed
    FROM set_inventory i
    LEFT JOIN parts p ON p.part_num=i.part_num
    LEFT JOIN part_categories pc ON pc.id=p.part_cat_id
    LEFT JOIN colors c ON c.id=i.color_id
    WHERE i.set_num=? AND i.is_spare=0
    GROUP BY i.part_num, i.color_id
    ORDER BY c.name, i.part_num`).all(setNum);
  const spares = db.prepare('SELECT COALESCE(SUM(qty),0) AS n FROM set_inventory WHERE set_num=? AND is_spare=1').get(setNum).n;

  const lines = rows.map((r) => {
    const base = classifyBase({ name: r.name, cat: r.cat, material: r.material, is_trans: r.is_trans, printed: r.printed });
    const cls = refine(base, shapes.cached(r.part_num));
    return {
      part_num: r.part_num, name: r.name || '(sem nome)', category: r.cat,
      color_id: r.color_id, color_name: r.color_name || `#${r.color_id}`, rgb: r.rgb, qty: r.qty,
      ...cls,
    };
  });
  const summary = { print: { lines: 0, pieces: 0 }, caveat: { lines: 0, pieces: 0 }, buy: { lines: 0, pieces: 0 } };
  for (const l of lines) { summary[l.status].lines++; summary[l.status].pieces += l.qty; }
  const listed = lines.reduce((a, l) => a + l.qty, 0);
  return {
    set: { set_num: set.set_num, name: set.name, year: set.year, theme: set.theme_name, num_parts: set.num_parts, img_url: set.img_url },
    listed, spares, summary, lines,
    unchecked: [...new Set(lines.filter((l) => !l.shapeChecked).map((l) => l.part_num))],
    libraryAvailable: shapes.libraryAvailable,
  };
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

export function csvFor(data, kind) {
  const L = data.lines;
  if (kind === 'rebrickable') {
    // Formato de importação de "lista de peças" do Rebrickable: Part,Color,Quantity
    return csv([['Part', 'Color', 'Quantity'], ...L.filter((l) => l.status === 'buy').map((l) => [l.part_num, l.color_id, l.qty])]);
  }
  const sel = kind === 'buy' ? L.filter((l) => l.status === 'buy') : L;
  return csv([
    ['Peça', 'Nome', 'Cor', 'Quantidade', 'Situação', 'Motivo'],
    ...sel.map((l) => [l.part_num, l.name, l.color_name, l.qty, STATUS_LABEL[l.status], l.reason]),
  ]);
}

const safe = (s) => String(s).replace(/[^\w.\- ]+/g, '_').trim() || 'x';

export function buildZip(data, shapes, { modo = 'placas', mesa = 256 } = {}) {
  const files = {};
  const skipped = [];
  const root = safe(`${data.set.set_num} ${data.set.name}`);
  const byColor = new Map(); // cor -> [{ id, qty, dims, tris }]
  const trisCache = new Map();
  for (const l of data.lines) {
    if (l.status === 'buy') continue;
    const sh = shapes.compute(l.part_num, { persist: false });
    const c = refine(l, sh);
    if (c.status === 'buy') { skipped.push(`${l.part_num} (${l.color_name}) x${l.qty}: ${c.reason}`); continue; }
    const p = shapes.stlPath(l.part_num);
    if (!p) { skipped.push(`${l.part_num} (${l.color_name}) x${l.qty}: STL indisponível`); continue; }
    if (!trisCache.has(l.part_num)) trisCache.set(l.part_num, readStl(shapes._read(p)));
    if (!byColor.has(l.color_name)) byColor.set(l.color_name, []);
    byColor.get(l.color_name).push({ id: l.part_num, qty: l.qty, w: sh.dims[0], d: sh.dims[1], tris: trisCache.get(l.part_num) });
  }
  shapes.save();

  const index = [['Arquivo', 'Cor', 'Peça', 'Quantidade']];
  const plateNotes = [];
  for (const [color, items] of byColor) {
    const dir = `${root}/${modo === 'pecas' ? 'pecas' : 'placas'}/${safe(color)}`;
    if (modo === 'pecas') {
      for (const it of items) {
        const f = `${dir}/${safe(it.id)}-x${it.qty}.stl`;
        files[f] = [new Uint8Array(shapes._read(shapes.stlPath(it.id))), { level: 0 }];
        index.push([f.slice(root.length + 1), color, it.id, it.qty]);
      }
    } else {
      const plates = packPlates(items, mesa);
      plates.forEach((pl, i) => {
        const name = `placa-${String(i + 1).padStart(2, '0')}.stl`;
        const f = `${dir}/${name}`;
        files[f] = [new Uint8Array(toStl(plateTriangles(pl, trisCache))), { level: 0 }];
        const counts = new Map();
        for (const pp of pl.placements) counts.set(pp.id, (counts.get(pp.id) || 0) + 1);
        for (const [id, q] of counts) index.push([f.slice(root.length + 1), color, id, q]);
        plateNotes.push(`- ${color}/${name}: ${plateSummary(pl)} (${Math.round(pl.w)}×${Math.round(pl.d)} mm${pl.oversize ? ', MAIOR QUE A MESA INFORMADA' : ''})`);
      });
    }
  }
  files[`${root}/conteudo-dos-arquivos.csv`] = [strToU8(csv(index)), { level: 6 }];
  files[`${root}/lista-completa.csv`] = [strToU8(csvFor(data, 'all')), { level: 6 }];
  files[`${root}/lista-de-compras.csv`] = [strToU8(csvFor(data, 'buy')), { level: 6 }];
  files[`${root}/LEIA-ME.txt`] = [strToU8(readme(data, skipped, { modo, mesa, plateNotes })), { level: 6 }];
  return zipSync(files);
}

function readme(data, skipped, { modo, mesa, plateNotes }) {
  return `${data.set.set_num} - ${data.set.name} (${data.set.year})
Gerado por brick-rebuild (projeto pessoal, sem vínculo com a LEGO).

COMO USAR
${modo === 'pecas'
  ? '- Cada pasta é uma cor. O arquivo "PECA-xN.stl" significa: imprima N unidades dessa peça.'
  : `- Cada pasta é uma cor. Cada "placa-NN.stl" já traz várias peças organizadas para uma mesa de ${mesa} x ${mesa} mm
  (a quantidade certa de cada peça). Imprima a placa inteira com o filamento daquela cor.
- "conteudo-dos-arquivos.csv" diz o que há em cada placa. Se a sua mesa for menor, gere de novo informando o tamanho.
- As peças ficam sobre a mesa com os pinos para cima; sem suportes, as peças com furos para baixo podem pedir ajuste.`}
- Antes de imprimir tudo, imprima UMA peça de encaixe (um tijolo e uma placa) e confira
  se encaixa. Este projeto NAO aplica ajuste de tolerância: ele depende da sua impressora.
- "lista-de-compras.csv" traz o que deve ser comprado.

IMPORTANTE
- A lista vem do inventário do Rebrickable, que não inclui peças de minifigura.
  Listadas: ${data.listed} peças (o conjunto declara ${data.set.num_parts}).
- A classificação imprimir/comprar é uma heurística, não uma garantia.
${plateNotes && plateNotes.length ? `\nPLACAS:\n${plateNotes.join('\n')}\n` : ''}${skipped.length ? `\nNAO GERADAS (comprar):\n${skipped.map((s) => '- ' + s).join('\n')}\n` : ''}
CREDITOS
- Dados de conjuntos e peças: Rebrickable (https://rebrickable.com).
- Formas das peças: LDraw Parts Library (https://www.ldraw.org), licença CC BY 4.0.
  Os STL são derivados dessa biblioteca; mantenha esta atribuição ao compartilhá-los.
- LEGO é marca registrada do Grupo LEGO, que não patrocina este projeto.
`;
}
