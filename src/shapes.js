// Gera e guarda em cache a forma (STL + medidas) de cada peça.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './db.js';
import { LDrawLibrary, partToTriangles } from './ldraw.js';
import { prepare, toStl } from './stl.js';

// Mude ao alterar como as formas são geradas: invalida o cache antigo.
const SHAPE_VERSION = 2;

export class Shapes {
  constructor({ dataDir = DATA_DIR, libDir = path.join(dataDir, 'ldraw') } = {}) {
    this.dataDir = dataDir;
    this.libDir = libDir;
    this.stlDir = path.join(dataDir, 'stl');
    this.indexFile = path.join(dataDir, 'shapes.json');
    this.lib = new LDrawLibrary(libDir);
    this.index = {};
    try {
      const j = JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
      if (j._v === SHAPE_VERSION) this.index = j.parts;
      else fs.rmSync(this.stlDir, { recursive: true, force: true }); // cache de uma versão antiga
    } catch { /* sem cache ainda */ }
  }

  get libraryAvailable() {
    return fs.existsSync(path.join(this.libDir, 'parts')) && fs.existsSync(path.join(this.libDir, 'p'));
  }

  // Só consulta o cache (rápido). undefined = ainda não verificado.
  cached(partNum) { return this.index[partNum]; }

  save() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.indexFile, JSON.stringify({ _v: SHAPE_VERSION, parts: this.index }));
  }

  // Calcula (ou lê do cache) a forma de uma peça.
  compute(partNum, { persist = true } = {}) {
    if (this.index[partNum]) return this.index[partNum];
    let res;
    if (!this.libraryAvailable) {
      return { ok: false, error: 'Biblioteca LDraw não instalada (rode npm run import:ldraw).', transient: true };
    }
    try {
      const r = partToTriangles(this.lib, partNum);
      if (!r) res = { ok: false, error: 'Sem arquivo de forma (LDraw) para esta peça.' };
      else if (!r.tris.length) res = { ok: false, error: 'Arquivo de forma vazio.' };
      else {
        const p = prepare(r.tris);
        fs.mkdirSync(this.stlDir, { recursive: true });
        fs.writeFileSync(path.join(this.stlDir, `${partNum}.stl`), toStl(p.tris));
        res = {
          ok: true,
          dims: p.dims.map((d) => Math.round(d * 100) / 100),
          volume: Math.round(p.volume),
          openEdges: p.openEdges,
          capped: p.capped,
          tris: p.tris.length / 9,
          ...(r.missing.length ? { missingSub: r.missing.length } : {}),
        };
      }
    } catch (e) {
      res = { ok: false, error: `Falha ao converter: ${e.message}` };
    }
    this.index[partNum] = res;
    if (persist) this.save();
    return res;
  }

  _read(file) { return fs.readFileSync(file); }

  stlPath(partNum) {
    const s = this.compute(partNum);
    if (!s.ok) return null;
    const f = path.join(this.stlDir, `${partNum}.stl`);
    return fs.existsSync(f) ? f : null;
  }
}
