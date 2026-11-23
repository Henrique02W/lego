import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
export const DB_PATH = path.join(DATA_DIR, 'brick.db');

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS themes (id INTEGER PRIMARY KEY, name TEXT, parent_id INTEGER);
CREATE TABLE IF NOT EXISTS sets (
  set_num TEXT PRIMARY KEY, name TEXT, year INTEGER, theme_id INTEGER,
  theme_name TEXT, num_parts INTEGER, img_url TEXT, search_text TEXT
);
CREATE TABLE IF NOT EXISTS part_categories (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE IF NOT EXISTS parts (part_num TEXT PRIMARY KEY, name TEXT, part_cat_id INTEGER, material TEXT);
CREATE TABLE IF NOT EXISTS colors (id INTEGER PRIMARY KEY, name TEXT, rgb TEXT, is_trans INTEGER);
CREATE TABLE IF NOT EXISTS elements (element_id TEXT PRIMARY KEY, part_num TEXT, color_id INTEGER);
CREATE TABLE IF NOT EXISTS part_rel (rel_type TEXT, child TEXT, parent TEXT);
CREATE TABLE IF NOT EXISTS set_inventory (
  set_num TEXT, part_num TEXT, color_id INTEGER, qty INTEGER, is_spare INTEGER
);
CREATE INDEX IF NOT EXISTS idx_inv_set ON set_inventory(set_num);
CREATE INDEX IF NOT EXISTS idx_inv_part ON set_inventory(part_num, color_id);
CREATE INDEX IF NOT EXISTS idx_rel_child ON part_rel(child);
CREATE INDEX IF NOT EXISTS idx_sets_num ON sets(set_num);
`;

export function openDb(file = DB_PATH, { readOnly = false } = {}) {
  if (readOnly && !fs.existsSync(file)) return null;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file, readOnly ? { readOnly: true } : {});
  if (!readOnly) db.exec(SCHEMA);
  return db;
}

export function getMeta(db, key) {
  try {
    return db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value ?? null;
  } catch { return null; }
}
