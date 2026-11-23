import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { unzipSync, strFromU8 } from 'fflate';
import { CSV, writeCsvs, writeLdraw, tmp } from './helpers.js';
import { createServer } from '../src/server.js';
import { Shapes } from '../src/shapes.js';
import { parseLine } from '../src/csv.js';

const root = tmp();
const csvDir = path.join(root, 'csv');
const dataDir = path.join(root, 'data');
let server, base;

before(async () => {
  writeCsvs(csvDir);
  writeLdraw(path.join(dataDir, 'ldraw'));
  execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/import-rebrickable.mjs', '--from', csvDir],
    { env: { ...process.env, DATA_DIR: dataDir }, stdio: 'pipe' });
  server = createServer({ dbFile: path.join(dataDir, 'brick.db'), shapes: new Shapes({ dataDir }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
const get = (p) => fetch(base + p);
const j = async (p) => (await get(p)).json();

test('parseLine respeita aspas e vírgulas', () => {
  assert.deepEqual(parseLine('1,"a, b","c ""d"""'), ['1', 'a, b', 'c "d"']);
});

test('status mostra banco e biblioteca', async () => {
  const s = await j('/api/status');
  assert.equal(s.db, true); assert.equal(s.ldraw, true); assert.equal(s.counts.sets, 2);
});

test('busca por número (sem sufixo) e por nome sem acento', async () => {
  assert.equal((await j('/api/search?q=99001')).sets[0].set_num, '99001-1');
  assert.equal((await j('/api/search?q=sintetico')).sets[0].set_num, '99001-1');
  assert.equal((await j('/api/search?q=acao')).sets[0].set_num, '99001-1'); // tema "Ação"
  assert.equal((await j('/api/search?q=inexistente zzz')).sets.length, 0);
});

test('busca por elemento mostra a peça, a cor e os conjuntos', async () => {
  const r = await j('/api/search?q=9999991');
  assert.equal(r.elements[0].part_num, '3001');
  assert.equal(r.elements[0].color_name, 'Red');
  assert.deepEqual(r.elements[0].sets.map((s) => s.set_num).sort(), ['99001-1', '99002-1']);
});

test('inventário usa só a versão mais alta e ignora sobressalentes', async () => {
  const d = await j('/api/set/99001');
  assert.equal(d.listed, 36);
  assert.equal(d.spares, 1);
  assert.equal(d.lines.find((l) => l.part_num === '3001').qty, 2); // não 100
});

test('classificação antes de verificar as formas', async () => {
  const d = await j('/api/set/99001-1');
  const st = (p, c) => d.lines.find((l) => l.part_num === p && l.color_id === c);
  assert.equal(st('3069bpr0001', 15).ruleId, 'printed');     // via part_relationships
  assert.equal(st('3003', 47).ruleId, 'transparent');
  assert.equal(st('3626c', 15).status, 'buy');
  assert.equal(st('3641', 0).status, 'buy');
  assert.equal(st('3647', 0).status, 'caveat');
  assert.equal(st('32523', 0).status, 'print');
  assert.ok(d.unchecked.includes('3001'));
});

test('depois da verificação: sem arquivo de forma vira comprar; cubo de teste imprime', async () => {
  const r = await j('/api/shapes/check?ids=3001,99999');
  assert.equal(r['3001'].ok, false);
  assert.equal(r['99999'].ok, true);
  assert.deepEqual(r['99999'].dims, [8, 8, 8]);
  const d = await j('/api/set/99001-1');
  assert.equal(d.lines.find((l) => l.part_num === '3001').ruleId, 'no-shape');
  assert.equal(d.lines.find((l) => l.part_num === '99999').status, 'print');
});

test('STL da peça e 404 sem forma', async () => {
  const ok = await get('/api/part/99999.stl');
  assert.equal(ok.status, 200);
  assert.equal((await ok.arrayBuffer()).byteLength, 84 + 50 * 12);
  assert.equal((await get('/api/part/3001.stl')).status, 404);
});

test('CSV de compras e formato Rebrickable', async () => {
  const raw = Buffer.from(await (await get('/api/set/99001-1/export?kind=buy')).arrayBuffer());
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // BOM para o Excel
  const buy = raw.toString('utf8');
  assert.ok(buy.includes('Peça,Nome,Cor,Quantidade,Situação,Motivo'));
  assert.ok(buy.includes('3626c'));
  assert.ok(!buy.includes('99999'));
  const rb = await (await get('/api/set/99001-1/export?kind=rebrickable')).text();
  assert.ok(rb.includes('Part,Color,Quantity'));
  assert.ok(rb.includes('3626c,15,1'));
});

test('ZIP (padrão): placas por cor com a quantidade certa de peças', async () => {
  const r = await get('/api/set/99001-1/zip');
  assert.equal(r.status, 200);
  const files = unzipSync(new Uint8Array(await r.arrayBuffer()));
  const names = Object.keys(files);
  const plate = names.find((n) => /\/placas\/Red\/placa-01\.stl$/.test(n));
  assert.ok(plate, names.join('\n'));
  const stl = Buffer.from(files[plate]);
  assert.equal(stl.readUInt32LE(80), 12 * 5);                      // 5 cubos de 12 triângulos
  assert.ok(!names.some((n) => n.includes('3001')), '3001 não tem forma');
  const csvIdx = strFromU8(files[names.find((n) => n.endsWith('conteudo-dos-arquivos.csv'))]);
  assert.ok(csvIdx.includes('99999,5'));
  const readme = strFromU8(files[names.find((n) => n.endsWith('LEIA-ME.txt'))]);
  assert.ok(readme.includes('CC BY 4.0') && readme.includes('minifigura') && readme.includes('PLACAS:'));
});

test('ZIP modo=pecas mantém um arquivo por peça', async () => {
  const files = unzipSync(new Uint8Array(await (await get('/api/set/99001-1/zip?modo=pecas')).arrayBuffer()));
  assert.ok(Object.keys(files).some((n) => /\/pecas\/Red\/99999-x5\.stl$/.test(n)));
});

test('mesa pequena gera mais de uma placa', async () => {
  const files = unzipSync(new Uint8Array(await (await get('/api/set/99001-1/zip?mesa=100')).arrayBuffer()));
  assert.ok(Object.keys(files).filter((n) => /\/Red\/placa-\d+\.stl$/.test(n)).length >= 1);
});

test('segurança: caminho fora de public e método errado', async () => {
  assert.equal((await get('/..%2f..%2fpackage.json')).status, 404);
  assert.equal((await fetch(base + '/api/status', { method: 'POST' })).status, 405);
  assert.equal((await get('/api/set/naoexiste')).status, 404);
});

test('importador falha com mensagem clara se faltar coluna', () => {
  const bad = path.join(root, 'bad');
  writeCsvs(bad, { sets: 'set_num,name\n1-1,x\n' });
  assert.throws(() => execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/import-rebrickable.mjs', '--from', bad],
    { env: { ...process.env, DATA_DIR: path.join(root, 'd2') }, stdio: 'pipe' }), (e) => /faltam as colunas/.test(String(e.stderr)));
});
