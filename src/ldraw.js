// Leitor de arquivos LDraw (.dat) que produz triângulos, com tratamento de BFC.
//
// Biblioteca esperada em <libDir>/parts/** e <libDir>/p/** (nomes em minúsculas).
// Unidade LDraw (LDU) = 0,4 mm. Eixos LDraw: Y para baixo. Convertemos para Z para cima
// com (x,y,z) -> (x, z, -y)*0,4, que é uma rotação própria (não espelha a peça).

import fs from 'node:fs';
import path from 'node:path';

const LDU_MM = 0.4;
const MAX_DEPTH = 30;

export class LDrawLibrary {
  constructor(libDir) {
    this.dir = libDir;
    this.parsed = new Map();
    this.exists = new Map();
  }

  has(name) { return !!this.resolve(name); }

  resolve(name) {
    const n = String(name).replace(/\\/g, '/').toLowerCase().trim();
    if (this.exists.has(n)) return this.exists.get(n);
    let found = null;
    for (const base of ['p', 'parts', '']) {
      const f = path.join(this.dir, base, n);
      if (path.resolve(f).startsWith(path.resolve(this.dir)) && fs.existsSync(f) && fs.statSync(f).isFile()) { found = f; break; }
    }
    this.exists.set(n, found);
    return found;
  }

  parse(name) {
    const file = this.resolve(name);
    if (!file) return null;
    if (this.parsed.has(file)) return this.parsed.get(file);
    const cmds = [];
    let cw = false;          // sentido de enrolamento atual do arquivo
    let invertNext = false;
    const text = fs.readFileSync(file, 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const p = line.split(/\s+/);
      const t = p[0];
      if (t === '0') {
        if (p[1] === 'BFC') {
          const w = p.slice(2).join(' ');
          if (/CERTIFY\s+CW/.test(w)) cw = true;
          else if (/CERTIFY(\s+CCW)?$/.test(w)) cw = false;
          else if (w === 'CW') cw = true;
          else if (w === 'CCW') cw = false;
          else if (w === 'INVERTNEXT') invertNext = true;
        }
      } else if (t === '1') {
        if (p.length < 15) continue;
        const n = p.slice(2, 14).map(Number);
        if (n.some(Number.isNaN)) continue;
        const R = [n[3], n[4], n[5], n[6], n[7], n[8], n[9], n[10], n[11]];
        const det = R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]);
        cmds.push({ t: 'ref', file: p.slice(14).join(' '), R, tr: [n[0], n[1], n[2]], flip: (det < 0) !== invertNext });
        invertNext = false;
      } else if (t === '3' || t === '4') {
        const k = t === '3' ? 9 : 12;
        if (p.length < 2 + k) continue;
        const v = p.slice(2, 2 + k).map(Number);
        if (v.some(Number.isNaN)) continue;
        cmds.push({ t: 'poly', v, cw });
        invertNext = false;
      } else {
        invertNext = false;
      }
    }
    this.parsed.set(file, cmds);
    return cmds;
  }
}

function mul(Ra, Rb) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    o[r * 3 + c] = Ra[r * 3] * Rb[c] + Ra[r * 3 + 1] * Rb[3 + c] + Ra[r * 3 + 2] * Rb[6 + c];
  }
  return o;
}
const app = (R, v) => [
  R[0] * v[0] + R[1] * v[1] + R[2] * v[2],
  R[3] * v[0] + R[4] * v[1] + R[5] * v[2],
  R[6] * v[0] + R[7] * v[1] + R[8] * v[2],
];

// Converte uma peça em triângulos. Devolve { tris: Float32Array (9 por triângulo, em mm), missing: [...] }
// ou null se o arquivo da peça não existir.
export function partToTriangles(lib, partNum) {
  const name = `${String(partNum).toLowerCase()}.dat`;
  if (!/^[a-z0-9_\-]+\.dat$/.test(name) || !lib.has(name)) return null;
  const out = [];
  const missing = new Set();
  const walk = (fname, R, tr, flip, depth) => {
    if (depth > MAX_DEPTH) return;
    const cmds = lib.parse(fname);
    if (!cmds) { missing.add(fname); return; }
    for (const c of cmds) {
      if (c.t === 'ref') {
        const R2 = mul(R, c.R);
        const t2 = app(R, c.tr);
        walk(c.file, R2, [t2[0] + tr[0], t2[1] + tr[1], t2[2] + tr[2]], flip !== c.flip, depth + 1);
      } else {
        const pts = [];
        for (let i = 0; i < c.v.length; i += 3) {
          const w = app(R, [c.v[i], c.v[i + 1], c.v[i + 2]]);
          pts.push([w[0] + tr[0], w[1] + tr[1], w[2] + tr[2]]);
        }
        const reverse = c.cw !== flip;
        const tri = (a, b, d) => (reverse ? out.push(a, d, b) : out.push(a, b, d));
        tri(pts[0], pts[1], pts[2]);
        if (pts.length === 4) tri(pts[0], pts[2], pts[3]);
      }
    }
  };
  walk(name, [1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0], false, 0);
  if (!out.length) return { tris: new Float32Array(0), missing: [...missing] };

  // LDraw (x,y,z) -> mm com Z para cima: (x, z, -y)
  const f = new Float32Array(out.length * 3);
  for (let i = 0; i < out.length; i++) {
    const [x, y, z] = out[i];
    f[i * 3] = x * LDU_MM;
    f[i * 3 + 1] = z * LDU_MM;
    f[i * 3 + 2] = -y * LDU_MM;
  }
  return { tris: f, missing: [...missing] };
}
