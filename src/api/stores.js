import { Router } from 'express';
import { db } from '../db.js';
import { requireAdmin } from './_auth.js';

const r = Router();

// Public: danh sach diem lay dang hoat dong (khach chon diem tren tuyen cua minh)
r.get('/', (req, res) => {
  const stores = db.prepare('SELECT * FROM stores WHERE active = 1 ORDER BY id').all();
  res.json(stores);
});

// Admin: them diem lay
r.post('/', requireAdmin, (req, res) => {
  const { name, address, area, open_time, close_time } = req.body;
  if (!name) return res.status(400).json({ error: 'Thieu name' });
  const info = db
    .prepare('INSERT INTO stores (name, address, area, open_time, close_time) VALUES (?,?,?,?,?)')
    .run(name, address || '', area || '', open_time || '', close_time || '');
  res.json({ id: info.lastInsertRowid });
});

// Admin: sua / bat-tat diem lay
r.put('/:id', requireAdmin, (req, res) => {
  const { name, address, area, open_time, close_time, active } = req.body;
  db.prepare(
    `UPDATE stores SET name=COALESCE(?,name), address=COALESCE(?,address), area=COALESCE(?,area),
     open_time=COALESCE(?,open_time), close_time=COALESCE(?,close_time), active=COALESCE(?,active) WHERE id=?`
  ).run(name, address, area, open_time, close_time, active, req.params.id);
  res.json({ ok: true });
});

export default r;
