import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBase, refine } from '../src/classify.js';

const c = (o) => classifyBase({ material: 'Plastic', ...o });

test('tijolo simples -> imprimir', () => assert.equal(c({ name: 'Brick 2 x 4', cat: 'Bricks' }).status, 'print'));
test('transparente -> comprar, mas pode tentar', () => {
  const r = c({ name: 'Brick 2 x 2', cat: 'Bricks', is_trans: 1 });
  assert.equal(r.status, 'buy'); assert.equal(r.ruleId, 'transparent'); assert.ok(r.tryPrint);
});
test('estampada -> comprar', () => assert.equal(c({ name: 'Tile 1 x 2 with Pattern', cat: 'Tiles' }).ruleId, 'printed'));
test('relação P/T informada -> comprar', () => assert.equal(c({ name: 'Tile 1 x 2', cat: 'Tiles', printed: 1 }).ruleId, 'printed'));
test('borracha -> comprar', () => assert.equal(c({ name: 'Tyre', cat: 'Wheels', material: 'Rubber' }).status, 'buy'));
test('minifigura -> comprar', () => assert.equal(c({ name: 'Head', cat: 'Minifig Heads' }).ruleId, 'figure'));
test('engrenagem -> ressalvas', () => assert.equal(c({ name: 'Technic Gear 8 Tooth', cat: 'Technic Gears' }).status, 'caveat'));
test('eixo Technic -> ressalvas', () => assert.equal(c({ name: 'Technic Axle 4', cat: 'Technic Axles and Pins' }).status, 'caveat'));
test('viga Technic -> imprimir', () => assert.equal(c({ name: 'Technic Beam 3', cat: 'Technic, Liftarms Thick' }).status, 'print'));
test('categoria desconhecida -> comprar', () => assert.equal(c({ name: 'Algo', cat: 'Zzz' }).ruleId, 'unlisted'));

test('refine: sem forma conhecida -> comprar', () => {
  const r = refine(c({ name: 'Brick 2 x 4', cat: 'Bricks' }), { ok: false, error: 'Sem arquivo de forma' });
  assert.equal(r.status, 'buy'); assert.equal(r.ruleId, 'no-shape');
});
test('refine: grande demais', () => {
  const r = refine(c({ name: 'Plate', cat: 'Plates' }), { ok: true, dims: [300, 100, 3], openEdges: 0, tris: 10 });
  assert.equal(r.ruleId, 'oversize');
});
test('refine: fina demais', () => {
  const r = refine(c({ name: 'Plate', cat: 'Plates' }), { ok: true, dims: [10, 10, 0.4], openEdges: 0, tris: 10 });
  assert.equal(r.ruleId, 'tiny');
});
test('refine: transparente com forma vira "dá para tentar"', () => {
  const r = refine(c({ name: 'Brick', cat: 'Bricks', is_trans: 1 }), { ok: true, dims: [16, 16, 11], openEdges: 0, tris: 100 });
  assert.equal(r.status, 'buy'); assert.ok(r.canTry);
});
test('refine: não verificado mantém a classificação base', () => {
  const r = refine(c({ name: 'Brick', cat: 'Bricks' }), undefined);
  assert.equal(r.status, 'print'); assert.equal(r.shapeChecked, false);
});
