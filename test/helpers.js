// Fixtures SINTÉTICAS para teste. Nomes de conjuntos são fictícios ("[TESTE]").
// Os números de peça (3001, 3003...) são reais apenas como rótulo; os dados são inventados.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CSV = {
  themes: 'id,name,parent_id\n1,[TESTE] Tema,\n2,Sub Tema Ação,1\n',
  sets: 'set_num,name,year,theme_id,num_parts,img_url\n'
    + '99001-1,[TESTE] Conjunto Sintético,2020,2,40,\n'
    + '99002-1,[TESTE] Outro Conjunto,2021,1,3,\n',
  part_categories: 'id,name\n1,Bricks\n2,Plates\n3,Tiles\n4,Minifig Heads\n5,Wheels and Tyres\n6,Technic Gears\n7,Technic Axles and Pins\n8,"Technic, Liftarms Thick"\n',
  parts: 'part_num,name,part_cat_id,part_material\n'
    + '3001,Brick 2 x 4,1,Plastic\n3003,Brick 2 x 2,1,Plastic\n3023,Plate 1 x 2,2,Plastic\n3069b,Tile 1 x 2,3,Plastic\n'
    + '3069bpr0001,Tile 1 x 2 with Pattern,3,Plastic\n3626c,Minifig Head,4,Plastic\n3641,Tyre 14mm D. x 4mm Smooth,5,Rubber\n'
    + '3647,Technic Gear 8 Tooth,6,Plastic\n3705,Technic Axle 4,7,Plastic\n32523,"Technic Beam 3",8,Plastic\n99999,Cubo de teste,1,Plastic\n',
  colors: 'id,name,rgb,is_trans\n0,Black,05131D,f\n4,Red,C91A09,f\n15,White,FFFFFF,f\n47,Trans-Clear,FCFCFC,t\n',
  inventories: 'id,version,set_num\n1,1,99001-1\n2,2,99001-1\n3,1,99002-1\n',
  inventory_parts: 'inventory_id,part_num,color_id,quantity,is_spare,img_url\n'
    + '1,3001,4,100,f,\n' // versão antiga: deve ser ignorada
    + '2,3001,4,2,f,\n2,3003,0,4,f,\n2,3023,15,10,f,\n2,3069b,0,3,f,\n2,3069bpr0001,15,1,f,\n2,3626c,15,1,f,\n'
    + '2,3641,0,4,f,\n2,3647,0,2,f,\n2,3705,0,1,f,\n2,32523,0,2,f,\n2,3003,47,1,f,\n2,99999,4,5,f,\n2,3003,0,1,t,\n'
    + '3,3001,4,1,f,\n',
  elements: 'element_id,part_num,color_id,design_id\n9999991,3001,4,3001\n',
  part_relationships: 'rel_type,child_part_num,parent_part_num\nP,3069bpr0001,3069b\n',
};

export function writeCsvs(dir, overrides = {}) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [k, v] of Object.entries({ ...CSV, ...overrides })) fs.writeFileSync(path.join(dir, `${k}.csv`), v);
}

// Cubo de 20 LDU (8 mm). Faces com normal para fora (anti-horário matemático).
export const FACES = [
  [[10, -10, -10], [10, 10, -10], [10, 10, 10], [10, -10, 10]],
  [[-10, -10, -10], [-10, -10, 10], [-10, 10, 10], [-10, 10, -10]],
  [[-10, 10, -10], [-10, 10, 10], [10, 10, 10], [10, 10, -10]],
  [[-10, -10, -10], [10, -10, -10], [10, -10, 10], [-10, -10, 10]],
  [[-10, -10, 10], [10, -10, 10], [10, 10, 10], [-10, 10, 10]],
  [[-10, -10, -10], [-10, 10, -10], [10, 10, -10], [10, -10, -10]],
];
const quad = (f) => `4 16 ${f.flat().join(' ')}`;

export function writeLdraw(libDir) {
  const parts = path.join(libDir, 'parts');
  fs.mkdirSync(path.join(libDir, 'p'), { recursive: true });
  fs.mkdirSync(parts, { recursive: true });
  const head = (cw) => `0 teste\n0 BFC CERTIFY ${cw ? 'CW' : 'CCW'}\n`;
  fs.writeFileSync(path.join(parts, '99999.dat'), head(false) + FACES.map(quad).join('\n') + '\n');
  // Mesmo cubo escrito em sentido horário, declarado CW
  fs.writeFileSync(path.join(parts, '99997.dat'),
    head(true) + FACES.map((f) => quad([...f].reverse())).join('\n') + '\n');
  fs.writeFileSync(path.join(parts, '99994.dat'), head(false) + studCubeDat());
  // Dois cubos: um normal e um espelhado em X (determinante negativo)
  fs.writeFileSync(path.join(parts, '99998.dat'), head(false)
    + '1 16 0 0 0 1 0 0 0 1 0 0 0 1 99999.dat\n'
    + '1 16 50 0 0 -1 0 0 0 1 0 0 0 1 99999.dat\n');
  fs.writeFileSync(path.join(parts, '99995.dat'), head(false)
    + '0 BFC INVERTNEXT\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 99999.dat\n');
  // Espelho + INVERTNEXT: a inversão pedida continua valendo (cubo "do avesso")
  fs.writeFileSync(path.join(parts, '99996.dat'), head(false)
    + '0 BFC INVERTNEXT\n1 16 0 0 0 -1 0 0 0 1 0 0 0 1 99999.dat\n');
}

// Cubo com um "pino" hexagonal sem fundo sobre a face de cima (y negativo = para cima no LDraw),
// imitando a base aberta dos pinos do LDraw. Orientação das faces calculada, não digitada.
export function studCubeDat() {
  const R = 6, y0 = -10, y1 = -14;
  const ring = (y) => [0, 1, 2, 3, 4, 5].map((k) => [Math.round(R * Math.cos((k * Math.PI) / 3) * 1000) / 1000, y, Math.round(R * Math.sin((k * Math.PI) / 3) * 1000) / 1000]);
  const lo = ring(y0), hi = ring(y1);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const dot = (u, v) => u.reduce((a, x, i) => a + x * v[i], 0);
  const lines = [];
  const emit = (pts, outward) => {
    const n = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
    const p = dot(n, outward) >= 0 ? pts : [...pts].reverse();
    lines.push(`${p.length === 3 ? 3 : 4} 16 ${p.flat().join(' ')}`);
  };
  for (let k = 0; k < 6; k++) {
    const j = (k + 1) % 6;
    const mid = [(lo[k][0] + lo[j][0]) / 2, 0, (lo[k][2] + lo[j][2]) / 2];
    emit([lo[k], lo[j], hi[j], hi[k]], mid);
    emit([[0, y1, 0], hi[k], hi[j]], [0, -1, 0]);
  }
  return FACES.map(quad).join('\n') + '\n' + lines.join('\n') + '\n';
}

export function tmp(prefix = 'brick-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
