import test from 'node:test';
import assert from 'node:assert/strict';
import { packPlates, plateTriangles, plateSummary } from '../src/plates.js';

const sq = (w, d) => new Float32Array([-w / 2, -d / 2, 0, w / 2, -d / 2, 0, 0, d / 2, 5]);
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;

test('todas as cópias entram, dentro da mesa e sem sobreposição', () => {
  const items = [{ id: 'a', w: 16, d: 8, qty: 40 }, { id: 'b', w: 8, d: 8, qty: 55 }, { id: 'c', w: 32, d: 16, qty: 20 }];
  const plates = packPlates(items, 256);
  const all = plates.flatMap((p) => p.placements);
  assert.equal(all.length, 115);
  for (const pl of plates) {
    for (const p of pl.placements) assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= 248.001 && p.y + p.d <= 248.001);
    for (let i = 0; i < pl.placements.length; i++) for (let j = i + 1; j < i + 40 && j < pl.placements.length; j++) {
      assert.ok(!overlap(pl.placements[i], pl.placements[j]), `sobreposição ${i}/${j}`);
    }
  }
});

test('mesa menor gera mais placas', () => {
  const items = [{ id: 'a', w: 16, d: 16, qty: 100 }];
  assert.ok(packPlates(items, 100).length > packPlates(items, 256).length);
});

test('peça maior que a mesa vai sozinha e marcada', () => {
  const pl = packPlates([{ id: 'x', w: 300, d: 20, qty: 1 }, { id: 'y', w: 10, d: 10, qty: 2 }], 256);
  assert.equal(pl.filter((p) => p.oversize).length, 1);
  assert.equal(pl.flatMap((p) => p.placements).length, 3);
});

test('triângulos da placa: posição deslocada e Z preservado', () => {
  const pl = packPlates([{ id: 'a', w: 10, d: 10, qty: 2 }], 256);
  const t = plateTriangles(pl[0], new Map([['a', sq(10, 10)]]));
  assert.equal(t.length, 18);
  assert.ok(t.every((v, i) => i % 3 !== 2 || v === 0 || v === 5));
  assert.equal(plateSummary(pl[0]), 'a ×2');
});
