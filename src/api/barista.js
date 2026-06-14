import { Router } from 'express';
import { db } from '../db.js';
import { requireBarista } from './_barista_auth.js';
import { requireAdmin } from './_auth.js';
import { sendText } from '../zalo/oa.js';
import { issueInvoiceForOrder } from '../einvoice/index.js';

const r = Router();
const PREP_BUFFER_MIN = 2;

// ====== Barista: xac thuc + lay thong tin chi nhanh ======
r.get('/me', requireBarista, (req, res) => {
  res.json({ ok: true, barista: req.barista });
});

// ====== Barista: hang doi pha che cua chi nhanh minh ======
// GET /api/barista/queue?date=2026-06-14
r.get('/queue', requireBarista, (req, res) => {
  const storeId = req.barista.store_id;
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  let sql = `SELECT o.*, s.name AS store_name FROM orders o
             LEFT JOIN stores s ON s.id = o.store_id
             WHERE o.store_id = ? AND o.order_status IN ('confirmed','preparing','ready')`;
  const params = [storeId];
  if (date) { sql += " AND (o.pickup_time IS NULL OR substr(o.pickup_time,1,10) = ?)"; params.push(date); }
  sql += ' ORDER BY (o.pickup_time IS NULL), o.pickup_time, o.created_at';

  const prepMap = {};
  for (const m of db.prepare('SELECT id, prep_minutes FROM menu_items').all()) prepMap[m.id] = m.prep_minutes || 5;

  const now = Date.now();
  const rows = db.prepare(sql).all(...params).map((o) => {
    const items = JSON.parse(o.items_json);
    const leadMin = items.reduce((s, it) => s + (prepMap[it.id] || 5), 0) + PREP_BUFFER_MIN;
    let start_prep_at = null, minutes_until_start = null, due = false;
    if (o.pickup_time) {
      const pickupMs = new Date(o.pickup_time.replace(' ', 'T')).getTime();
      const startMs  = pickupMs - leadMin * 60000;
      start_prep_at  = new Date(startMs).toISOString();
      minutes_until_start = Math.round((startMs - now) / 60000);
      due = now >= startMs && o.order_status === 'confirmed';
    } else {
      due = o.order_status === 'confirmed';
    }
    return { ...o, items, lead_minutes: leadMin, start_prep_at, minutes_until_start, due };
  });

  res.json({ store: req.barista, date, orders: rows });
});

// ====== Barista: cap nhat trang thai don (chi trong chi nhanh minh) ======
// PATCH /api/barista/orders/:id/status  body: { order_status }
r.patch('/orders/:id/status', requireBarista, async (req, res) => {
  const { order_status } = req.body;
  const allowed = ['preparing', 'ready', 'picked'];
  if (!allowed.includes(order_status))
    return res.status(400).json({ error: 'Trang thai khong hop le: ' + allowed.join('|') });

  // Bao dam barista chi cap nhat don trong chi nhanh minh
  const o = db.prepare(
    'SELECT o.*, s.name AS store_name FROM orders o LEFT JOIN stores s ON s.id=o.store_id WHERE o.id=? AND o.store_id=?'
  ).get(req.params.id, req.barista.store_id);
  if (!o) return res.status(404).json({ error: 'Khong tim thay don hoac khong thuoc chi nhanh ban' });

  db.prepare('UPDATE orders SET order_status = ? WHERE id = ?').run(order_status, o.id);

  const msg = {
    preparing: `☕ Quán đang pha đơn #${o.id} của bạn!`,
    ready: `🔔 Đơn #${o.id} đã sẵn sàng! Mời bạn ghé ${o.store_name || 'quán'} lấy nhé.`,
    picked: `Cảm ơn bạn đã ghé Anchor Coffee! Hẹn gặp lại ☕`,
  }[order_status];
  if (o?.zalo_user_id && msg) sendText(o.zalo_user_id, msg).catch(() => {});

  if (order_status === 'picked' && o?.payment_method === 'counter' && o.payment_status !== 'paid') {
    db.prepare("UPDATE orders SET payment_status='paid' WHERE id=?").run(o.id);
    issueInvoiceForOrder(o.id).catch((e) => console.error('[EInvoice]', e.message));
  }
  res.json({ ok: true });
});

// ====== Admin: quan ly tai khoan barista ======
r.get('/accounts', requireAdmin, (req, res) => {
  const rows = db.prepare(
    'SELECT b.*, s.name AS store_name FROM barista_accounts b JOIN stores s ON s.id=b.store_id ORDER BY b.store_id, b.id'
  ).all();
  res.json(rows);
});

r.post('/accounts', requireAdmin, (req, res) => {
  const { name, store_id, api_key } = req.body;
  if (!name || !store_id || !api_key) return res.status(400).json({ error: 'Thieu name/store_id/api_key' });
  const info = db.prepare('INSERT INTO barista_accounts (name, store_id, api_key) VALUES (?,?,?)').run(name, store_id, api_key);
  res.json({ id: info.lastInsertRowid });
});

r.put('/accounts/:id', requireAdmin, (req, res) => {
  const { name, store_id, api_key, active } = req.body;
  db.prepare(
    `UPDATE barista_accounts SET name=COALESCE(?,name), store_id=COALESCE(?,store_id),
     api_key=COALESCE(?,api_key), active=COALESCE(?,active) WHERE id=?`
  ).run(name, store_id, api_key, active, req.params.id);
  res.json({ ok: true });
});

r.delete('/accounts/:id', requireAdmin, (req, res) => {
  db.prepare('UPDATE barista_accounts SET active=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

export default r;
