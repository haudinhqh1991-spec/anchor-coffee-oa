import { Router } from 'express';
import { db } from '../db.js';
import { requireAdmin } from './_auth.js';

const r = Router();

// Public: lay menu (cho Mini App)
r.get('/', (req, res) => {
  const items = db.prepare('SELECT * FROM menu_items WHERE available = 1 ORDER BY category, id').all();
  res.json(items);
});

// Admin: them mon
r.post('/', requireAdmin, (req, res) => {
  const { name, description, price, category, image_url } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Thieu name/price' });
  const info = db
    .prepare('INSERT INTO menu_items (name, description, price, category, image_url) VALUES (?,?,?,?,?)')
    .run(name, description || '', price, category || '', image_url || '');
  res.json({ id: info.lastInsertRowid });
});

// Admin: sua mon
r.put('/:id', requireAdmin, (req, res) => {
  const { name, description, price, category, image_url, available } = req.body;
  db.prepare(
    `UPDATE menu_items SET name=COALESCE(?,name), description=COALESCE(?,description),
     price=COALESCE(?,price), category=COALESCE(?,category), image_url=COALESCE(?,image_url),
     available=COALESCE(?,available) WHERE id=?`
  ).run(name, description, price, category, image_url, available, req.params.id);
  res.json({ ok: true });
});

// Admin: xoa mon (an di, khong xoa cung)
r.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('UPDATE menu_items SET available = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default r;
