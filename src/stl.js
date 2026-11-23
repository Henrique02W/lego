// Análise de malha e escrita de STL binário.

// Volume com sinal (positivo = normais para fora, enrolamento anti-horário).
export function signedVolume(t) {
  let v = 0;
  for (let i = 0; i < t.length; i += 9) {
    const ax = t[i], ay = t[i + 1], az = t[i + 2];
    const bx = t[i + 3], by = t[i + 4], bz = t[i + 5];
    const cx = t[i + 6], cy = t[i + 7], cz = t[i + 8];
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

// Arestas abertas: arestas dirigidas sem a oposta correspondente (malha não fechada).
export function openEdges(t) {
  const q = (x) => Math.round(x * 1000);
  const key = (i) => `${q(t[i])},${q(t[i + 1])},${q(t[i + 2])}`;
  const m = new Map();
  for (let i = 0; i < t.length; i += 9) {
    const k = [key(i), key(i + 3), key(i + 6)];
    if (k[0] === k[1] || k[1] === k[2] || k[0] === k[2]) continue;
    for (let e = 0; e < 3; e++) {
      const a = k[e], b = k[(e + 1) % 3];
      const rev = `${b}|${a}`;
      const n = m.get(rev);
      if (n) { if (n === 1) m.delete(rev); else m.set(rev, n - 1); }
      else m.set(`${a}|${b}`, (m.get(`${a}|${b}`) || 0) + 1);
    }
  }
  let c = 0;
  for (const n of m.values()) c += n;
  return c;
}


// Fecha furos planos (ex.: a base sem fundo dos pinos do LDraw) com um leque de triângulos.
// Só fecha laços planos e "em estrela" em relação ao centroide; o resto fica como está.
export function capHoles(t) {
  const q = (x) => Math.round(x * 1000);
  const key = (i) => `${q(t[i])},${q(t[i + 1])},${q(t[i + 2])}`;
  const pos = new Map();
  const edges = new Map(); // "a|b" -> contagem de arestas dirigidas
  for (let i = 0; i < t.length; i += 9) {
    const k = [key(i), key(i + 3), key(i + 6)];
    if (k[0] === k[1] || k[1] === k[2] || k[0] === k[2]) continue;
    for (let e = 0; e < 3; e++) {
      if (!pos.has(k[e])) pos.set(k[e], [t[i + e * 3], t[i + e * 3 + 1], t[i + e * 3 + 2]]);
      const a = k[e], b = k[(e + 1) % 3];
      const rev = `${b}|${a}`;
      const n = edges.get(rev);
      if (n) { if (n === 1) edges.delete(rev); else edges.set(rev, n - 1); }
      else edges.set(`${a}|${b}`, (edges.get(`${a}|${b}`) || 0) + 1);
    }
  }
  const out = new Map(); // a -> [b, ...]
  for (const k of edges.keys()) { const [a, b] = k.split('|'); (out.get(a) || out.set(a, []).get(a)).push(b); }
  const extra = [];
  let capped = 0;
  const used = new Set();
  for (const start of out.keys()) {
    if (used.has(start)) continue;
    const loop = [start];
    let cur = start, ok = true;
    for (;;) {
      const nx = out.get(cur);
      if (!nx || nx.length !== 1) { ok = false; break; }
      cur = nx[0];
      if (cur === start) break;
      if (loop.includes(cur) || loop.length > 400) { ok = false; break; }
      loop.push(cur);
    }
    loop.forEach((k) => used.add(k));
    if (!ok || loop.length < 3) continue;
    const P = loop.map((k) => pos.get(k));
    // normal (Newell) e centroide
    let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
      cx += a[0]; cy += a[1]; cz += a[2];
    }
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-9) continue;
    nx /= nl; ny /= nl; nz /= nl; cx /= P.length; cy /= P.length; cz /= P.length;
    if (P.some((p) => Math.abs((p[0] - cx) * nx + (p[1] - cy) * ny + (p[2] - cz) * nz) > 0.01)) continue; // não plano
    // O furo é fechado com o sentido contrário ao do laço: triângulos (c, b, a) para cada aresta a->b.
    const tris = [];
    let good = true;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      const ux = b[0] - cx, uy = b[1] - cy, uz = b[2] - cz, vx = a[0] - cx, vy = a[1] - cy, vz = a[2] - cz;
      const dn = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz;
      if (dn > 1e-9) { good = false; break; } // a tampa deve apontar contra o sentido do laço; senão não é estrela
      tris.push(cx, cy, cz, b[0], b[1], b[2], a[0], a[1], a[2]);
    }
    if (!good) continue;
    extra.push(...tris);
    capped++;
  }
  if (!capped) return { tris: t, capped: 0 };
  const merged = new Float32Array(t.length + extra.length);
  merged.set(t); merged.set(extra, t.length);
  return { tris: merged, capped };
}

// Lê um STL binário e devolve só os triângulos (9 floats cada).
export function readStl(buf) {
  const n = buf.readUInt32LE(80);
  const t = new Float32Array(n * 9);
  let o = 84;
  for (let i = 0; i < n; i++) {
    o += 12;
    for (let k = 0; k < 9; k++) { t[i * 9 + k] = buf.readFloatLE(o); o += 4; }
    o += 2;
  }
  return t;
}

// Centraliza em XY e apoia a peça em Z=0. Inverte o enrolamento se o volume sair negativo.
// Devolve { tris, dims:[x,y,z], volume, openEdges }.
export function prepare(tris) {
  let t = Float32Array.from(tris);
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < t.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (t[i + k] < min[k]) min[k] = t[i + k];
      if (t[i + k] > max[k]) max[k] = t[i + k];
    }
  }
  const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2;
  for (let i = 0; i < t.length; i += 3) { t[i] -= cx; t[i + 1] -= cy; t[i + 2] -= min[2]; }
  const cap = capHoles(t);
  t = cap.tris;
  let vol = signedVolume(t);
  if (vol < 0) {
    for (let i = 0; i < t.length; i += 9) {
      for (let k = 0; k < 3; k++) { const a = t[i + 3 + k]; t[i + 3 + k] = t[i + 6 + k]; t[i + 6 + k] = a; }
    }
    vol = -vol;
  }
  return {
    tris: t,
    dims: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    volume: vol,
    openEdges: openEdges(t),
    capped: cap.capped,
  };
}

export function toStl(tris, header = 'brick-rebuild') {
  const n = tris.length / 9;
  const buf = Buffer.alloc(84 + n * 50);
  buf.write(header.slice(0, 79), 0, 'ascii');
  buf.writeUInt32LE(n, 80);
  let o = 84;
  for (let i = 0; i < tris.length; i += 9) {
    const ux = tris[i + 3] - tris[i], uy = tris[i + 4] - tris[i + 1], uz = tris[i + 5] - tris[i + 2];
    const vx = tris[i + 6] - tris[i], vy = tris[i + 7] - tris[i + 1], vz = tris[i + 8] - tris[i + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const f of [nx, ny, nz]) { buf.writeFloatLE(f, o); o += 4; }
    for (let k = 0; k < 9; k++) { buf.writeFloatLE(tris[i + k], o); o += 4; }
    buf.writeUInt16LE(0, o); o += 2;
  }
  return buf;
}
