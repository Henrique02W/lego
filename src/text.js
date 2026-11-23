// Normaliza texto para busca: minúsculas, sem acentos, espaços simples.
export function norm(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Quebra a consulta em termos (sem palavras vazias comuns).
const STOP = new Set(['lego', 'set', 'sets', 'kit', 'the', 'a', 'an', 'of']);
export function tokens(q) {
  const all = norm(q).replace(/[^a-z0-9\- ]/g, ' ').split(' ').filter(Boolean);
  const keep = all.filter((t) => !STOP.has(t));
  return keep.length ? keep : all;
}
