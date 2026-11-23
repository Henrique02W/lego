import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';

// Divide uma linha CSV respeitando aspas. (Não suporta quebra de linha dentro de campo.)
export function parseLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// Lê um .csv ou .csv.gz e devolve um objeto por linha, usando o cabeçalho como chaves.
export async function* readCsv(file) {
  let stream = fs.createReadStream(file);
  if (file.endsWith('.gz')) stream = stream.pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) {
    if (!line) continue;
    const f = parseLine(line);
    if (!header) { header = f.map((h) => h.replace(/^﻿/, '').trim()); continue; }
    const o = {};
    for (let i = 0; i < header.length; i++) o[header[i]] = f[i] ?? '';
    yield o;
  }
}

export function findCsv(dir, name) {
  for (const ext of ['.csv', '.csv.gz']) {
    const p = path.join(dir, name + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function readHeader(file) {
  for await (const row of readCsv(file)) return Object.keys(row);
  return [];
}
