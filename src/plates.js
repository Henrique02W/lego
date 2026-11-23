// Junta várias peças (com repetição) em "placas" de impressão: um STL por mesa cheia.
// Empacotamento simples por prateleiras (linhas), sem rotação. As peças já vêm centradas em
// XY e apoiadas em Z=0 (ver stl.prepare).

const GAP = 4;     // mm entre peças
const MARGIN = 4;  // mm de borda da mesa

// items: [{ id, w, d, qty, tris }]  (w, d = largura/profundidade em mm)
// Devolve [{ placements: [{ id, x, y }], w, d, oversize? }]; x,y = canto mínimo da peça na placa.
export function packPlates(items, bed = 256) {
  const copies = [];
  for (const it of items) for (let i = 0; i < it.qty; i++) copies.push(it);
  copies.sort((a, b) => b.d - a.d || b.w - a.w || String(a.id).localeCompare(String(b.id)));

  const usable = bed - 2 * MARGIN;
  const plates = [];
  let cur = null, x = 0, y = 0, rowD = 0;
  const newPlate = () => { cur = { placements: [], w: 0, d: 0 }; plates.push(cur); x = 0; y = 0; rowD = 0; };

  for (const c of copies) {
    if (c.w > usable || c.d > usable) { // não cabe nem sozinha: vai numa placa própria, avisada
      plates.push({ placements: [{ id: c.id, x: 0, y: 0, w: c.w, d: c.d }], w: c.w, d: c.d, oversize: true });
      cur = null;
      continue;
    }
    if (!cur) newPlate();
    if (x > 0 && x + c.w > usable) { x = 0; y += rowD + GAP; rowD = 0; }
    if (y + c.d > usable) { newPlate(); }
    cur.placements.push({ id: c.id, x, y, w: c.w, d: c.d });
    cur.w = Math.max(cur.w, x + c.w);
    cur.d = Math.max(cur.d, y + c.d);
    x += c.w + GAP;
    rowD = Math.max(rowD, c.d);
  }
  return plates;
}

// Monta os triângulos de uma placa. byId: id -> Float32Array de triângulos da peça.
export function plateTriangles(plate, byId) {
  let total = 0;
  for (const p of plate.placements) total += byId.get(p.id).length;
  const out = new Float32Array(total);
  let o = 0;
  for (const p of plate.placements) {
    const src = byId.get(p.id);
    const dx = p.x + MARGIN + p.w / 2, dy = p.y + MARGIN + p.d / 2;
    for (let i = 0; i < src.length; i += 3) {
      out[o++] = src[i] + dx; out[o++] = src[i + 1] + dy; out[o++] = src[i + 2];
    }
  }
  return out;
}

// Resumo "99999 ×5, 3003 ×4" de uma placa.
export function plateSummary(plate) {
  const n = new Map();
  for (const p of plate.placements) n.set(p.id, (n.get(p.id) || 0) + 1);
  return [...n].map(([id, q]) => `${id} ×${q}`).join(', ');
}
