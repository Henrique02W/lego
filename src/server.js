import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, getMeta, DB_PATH } from './db.js';
import { Shapes } from './shapes.js';
import { search, getSet, csvFor, buildZip } from './service.js';

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

export function createServer({ dbFile = DB_PATH, shapes = new Shapes() } = {}) {
  const dbs = { db: null };
  const db = () => (dbs.db ||= openDb(dbFile, { readOnly: true }));
  // Se o banco foi criado depois do servidor subir, tenta abrir de novo.
  const json = (res, code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(obj));
  };

  return http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const p = decodeURIComponent(url.pathname);
      if (req.method !== 'GET') return json(res, 405, { error: 'Método não permitido' });

      if (p === '/api/status') {
        const d = db();
        return json(res, 200, {
          db: !!d,
          rebrickableImportedAt: d ? getMeta(d, 'rebrickable_imported_at') : null,
          counts: d ? JSON.parse(getMeta(d, 'rebrickable_counts') || 'null') : null,
          ldraw: shapes.libraryAvailable,
        });
      }
      if (p.startsWith('/api/')) {
        const d = db();
        if (!d) return json(res, 503, { error: 'Banco de dados vazio. Rode: npm run import:rebrickable' });

        if (p === '/api/search') return json(res, 200, search(d, url.searchParams.get('q')));

        if (p === '/api/shapes/check') {
          const ids = (url.searchParams.get('ids') || '').split(',').filter((x) => /^[0-9a-z_\-]{1,30}$/i.test(x)).slice(0, 15);
          const out = {};
          for (const id of ids) out[id] = shapes.compute(id, { persist: false });
          shapes.save();
          return json(res, 200, out);
        }

        let m;
        if ((m = p.match(/^\/api\/part\/([0-9a-z_\-]{1,30})\.stl$/i))) {
          const f = shapes.stlPath(m[1]);
          if (!f) return json(res, 404, { error: 'Sem forma 3D para esta peça.' });
          res.writeHead(200, { 'content-type': 'model/stl', 'content-disposition': `attachment; filename="${m[1]}.stl"` });
          return res.end(fs.readFileSync(f));
        }
        if ((m = p.match(/^\/api\/set\/([0-9a-z\-]{3,20})(\/zip|\/export)?$/i))) {
          const data = getSet(d, shapes, m[1]);
          if (!data) return json(res, 404, { error: 'Conjunto não encontrado.' });
          if (m[2] === '/zip') {
            if (!shapes.libraryAvailable) return json(res, 409, { error: 'Biblioteca LDraw não instalada. Rode: npm run import:ldraw' });
            const modo = url.searchParams.get('modo') === 'pecas' ? 'pecas' : 'placas';
            const mesa = Math.min(500, Math.max(100, Number(url.searchParams.get('mesa')) || 256));
            const zip = buildZip(data, shapes, { modo, mesa });
            res.writeHead(200, { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${data.set.set_num}.zip"` });
            return res.end(Buffer.from(zip));
          }
          if (m[2] === '/export') {
            const kind = ['all', 'buy', 'rebrickable'].includes(url.searchParams.get('kind')) ? url.searchParams.get('kind') : 'all';
            res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${data.set.set_num}-${kind}.csv"` });
            return res.end(csvFor(data, kind));
          }
          return json(res, 200, data);
        }
        return json(res, 404, { error: 'Rota desconhecida' });
      }

      // Arquivos estáticos
      const rel = p === '/' ? 'index.html' : p.slice(1);
      const file = path.resolve(PUBLIC, rel);
      if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404); return res.end('Não encontrado');
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  createServer().listen(port, host, () => console.log(`brick-rebuild em http://${host}:${port}`));
}
