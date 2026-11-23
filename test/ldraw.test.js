import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LDrawLibrary, partToTriangles } from '../src/ldraw.js';
import { signedVolume, openEdges, prepare, toStl, capHoles, readStl } from '../src/stl.js';
import { writeLdraw, tmp } from './helpers.js';

const dir = tmp();
writeLdraw(dir);
const lib = new LDrawLibrary(dir);
const near = (a, b, e = 0.5) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);

test('cubo simples: 8 mm, volume +512, malha fechada', () => {
  const r = partToTriangles(lib, '99999');
  assert.equal(r.tris.length / 9, 12);
  near(signedVolume(r.tris), 512);
  const p = prepare(r.tris);
  p.dims.forEach((d) => near(d, 8, 0.001));
  assert.equal(p.openEdges, 0);
});

test('cubo CW declarado produz o mesmo volume positivo', () => {
  near(signedVolume(partToTriangles(lib, '99997').tris), 512);
});

test('subarquivo espelhado: BFC mantém o sentido (volume bruto positivo, sem inverter depois)', () => {
  const r = partToTriangles(lib, '99998');
  near(signedVolume(r.tris), 1024); // sem o tratamento de BFC o cubo espelhado sairia -512
  assert.equal(openEdges(r.tris), 0);
});

test('INVERTNEXT inverte a face de propósito (volume negativo), com ou sem espelho', () => {
  near(signedVolume(partToTriangles(lib, '99996').tris), -512); // espelho + INVERTNEXT
  near(signedVolume(partToTriangles(lib, '99995').tris), -512); // só INVERTNEXT
});

test('orientação: Z para cima, apoiado em Z=0 e centralizado em XY', () => {
  const p = prepare(partToTriangles(lib, '99999').tris);
  let minZ = Infinity, minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < p.tris.length; i += 3) { minX = Math.min(minX, p.tris[i]); maxX = Math.max(maxX, p.tris[i]); minZ = Math.min(minZ, p.tris[i + 2]); }
  near(minZ, 0, 1e-6); near(minX, -4, 1e-6); near(maxX, 4, 1e-6);
});

test('prepare inverte malha com volume negativo', () => {
  const r = partToTriangles(lib, '99999').tris;
  const bad = Float32Array.from(r);
  for (let i = 0; i < bad.length; i += 9) for (let k = 0; k < 3; k++) { const a = bad[i + 3 + k]; bad[i + 3 + k] = bad[i + 6 + k]; bad[i + 6 + k] = a; }
  assert.ok(signedVolume(bad) < 0);
  near(prepare(bad).volume, 512);
});

test('arquivo inexistente ou nome inválido -> null', () => {
  assert.equal(partToTriangles(lib, '12345'), null);
  assert.equal(partToTriangles(lib, '../etc/passwd'), null);
});

test('STL binário: tamanho = 84 + 50*triângulos', () => {
  const p = prepare(partToTriangles(lib, '99999').tris);
  const buf = toStl(p.tris);
  assert.equal(buf.length, 84 + 50 * 12);
  assert.equal(buf.readUInt32LE(80), 12);
});

// Opcional: valida contra peças LDraw reais se a pasta for informada (não é distribuída).
const real = process.env.LDRAW_TEST_DIR;
test('peças LDraw reais (opcional, LDRAW_TEST_DIR)', { skip: !real || !fs.existsSync(path.join(real || '', 'parts')) }, () => {
  const l = new LDrawLibrary(real);
  const b = prepare(partToTriangles(l, '3001').tris);
  near(b.dims[0], 32, 0.01); near(b.dims[1], 16, 0.01); near(b.dims[2], 11.2, 0.01);
  assert.ok(b.volume > 0);
  const tile = prepare(partToTriangles(l, '3069b').tris);
  near(tile.dims[2], 3.2, 0.01);
  assert.equal(tile.openEdges, 0);
  assert.equal(b.openEdges, 0, 'pinos do tijolo 2x4 devem estar fechados');
});

test('base aberta do pino: antes 6 arestas abertas, depois do fechamento 0', () => {
  const raw = partToTriangles(lib, '99994').tris;
  assert.equal(openEdges(raw), 6);
  const c = capHoles(raw);
  assert.equal(c.capped, 1);
  assert.equal(openEdges(c.tris), 0);
  const p = prepare(raw);
  assert.equal(p.openEdges, 0);
  assert.ok(p.volume > 512);               // cubo + pino
  assert.ok(Math.abs(p.dims[2] - (8 + 1.6)) < 0.01);
});

test('fechamento não mexe em malha já fechada', () => {
  const raw = partToTriangles(lib, '99999').tris;
  assert.equal(capHoles(raw).capped, 0);
});

test('readStl devolve o que toStl escreveu', () => {
  const p = prepare(partToTriangles(lib, '99999').tris);
  const back = readStl(toStl(p.tris));
  assert.equal(back.length, p.tris.length);
  assert.ok(Math.abs(back[5] - p.tris[5]) < 1e-5);
});
