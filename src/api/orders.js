import { Router } from 'express';
import { db } from '../db.js';
import { requireAdmin } from './_auth.js';
import { createPaymentOrder } from '../payment/zalopay.js';
import { sendText } from '../zalo/oa.js';
import { issueInvoiceForOrder } from '../einvoice/index.js';

const r = Router();

// ====== Public: khach dat truoc de den quan lay ======
// body: { zalo_user_id, customer_name, phone, store_id, pickup_time,
//         items:[{id,name,price,qty}], note, payment_method }
//   payment_method: 'zalopay' (tra truoc) | 'counter' (tra tai quay khi lay)
r.post('/', async (req, res) => {
  const b = req.body;
  if (!b.items?.length) return res.status(400).json({ error: 'Gio hang trong' });
  if (!b.store_id) return res.status(400).json({ error: 'Chua chon diem lay' });

  const total = b.items.reduce((s, it) => s + Number(it.price) * Number(it.qty), 0);
  const info = db
    .prepare(
      `INSERT INTO orders (zalo_user_id, customer_name, phone, store_id, pickup_time,
       items_json, total, note, payment_method) VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(
      b.zalo_user_id || null, b.customer_name || '', b.phone || '',
      b.store_id, b.pickup_time || null, JSON.stringify(b.items),
      total, b.note || '', b.payment_method || 'zalopay'
    );
  const orderId = info.lastInsertRowid;

  const store = db.prepare('SELECT name FROM stores WHERE id = ?').get(b.store_id);
  const pickupInfo = `${store?.name || 'quán'}${b.pickup_time ? ' lúc ' + b.pickup_time : ''}`;

  // Tra tai quay khi lay -> vao hang doi luon
  if (b.payment_method === 'counter') {
    db.prepare("UPDATE orders SET order_status='confirmed' WHERE id=?").run(orderId);
    if (b.zalo_user_id) {
      sendText(b.zalo_user_id,
        `Đã nhận đơn #${orderId} (${total.toLocaleString('vi-VN')}đ). Quán sẽ làm sẵn, mời bạn ghé ${pickupInfo} để lấy & thanh toán nhé! ☕`
      ).catch(() => {});
    }
    return res.json({ orderId, total, payment_method: 'counter', pickup: pickupInfo });
  }

  // Tra truoc qua ZaloPay
  const items = b.items.map((it) => ({ itemid: String(it.id), itemname: it.name, itemprice: it.price, itemquantity: it.qty }));
  const { appTransId, data } = await createPaymentOrder({
    orderId, amount: total, userId: b.zalo_user_id, items,
    description: `Anchor Coffee - don #${orderId}`,
  });
  db.prepare('UPDATE orders SET app_trans_id = ? WHERE id = ?').run(appTransId, orderId);

  if (data.return_code !== 1) {
    return res.status(502).json({ error: 'Tao don ZaloPay that bai', detail: data });
  }
  res.json({ orderId, total, appTransId, order_url: data.order_url, zp_trans_token: data.zp_trans_token, pickup: pickupInfo });
});

// ====== Public: tra cuu 1 don ======
r.get('/:id', (req, res) => {
  const o = db.prepare(
    `SELECT o.*, s.name AS store_name, s.address AS store_address
     FROM orders o LEFT JOIN stores s ON s.id = o.store_id WHERE o.id = ?`
  ).get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Khong tim thay don' });
  o.items = JSON.parse(o.items_json);
  delete o.items_json;
  res.json(o);
});

// ====== Admin: HANG DOI PHA CHE - canh theo gio lay ======
// GET /api/orders/queue/list?store_id=1&date=2026-06-14
// Tra them: start_prep_at (gio bat dau pha = gio lay - tong thoi gian pha - buffer),
//           minutes_until_start, due (da den gio pha chua)
const PREP_BUFFER_MIN = 2; // phut dem them cho an toan
r.get('/queue/list', requireAdmin, (req, res) => {
  let sql = `SELECT o.*, s.name AS store_name FROM orders o
             LEFT JOIN stores s ON s.id = o.store_id
             WHERE o.order_status IN ('confirmed','preparing','ready')`;
  const params = [];
  if (req.query.store_id) { sql += ' AND o.store_id = ?'; params.push(req.query.store_id); }
  if (req.query.date) { sql += " AND substr(o.pickup_time,1,10) = ?"; params.push(req.query.date); }
  sql += ' ORDER BY (o.pickup_time IS NULL), o.pickup_time, o.created_at';

  // Map id mon -> thoi gian pha
  const prepMap = {};
  for (const m of db.prepare('SELECT id, prep_minutes FROM menu_items').all()) prepMap[m.id] = m.prep_minutes || 5;

  const now = Date.now();
  const rows = db.prepare(sql).all(...params).map((o) => {
    const items = JSON.parse(o.items_json);
    const leadMin = items.reduce((s, it) => s + (prepMap[it.id] || 5), 0) + PREP_BUFFER_MIN;
    let start_prep_at = null, minutes_until_start = null, due = false;
    if (o.pickup_time) {
      const pickupMs = new Date(o.pickup_time.replace(' ', 'T')).getTime();
      const startMs = pickupMs - leadMin * 60000;
      start_prep_at = new Date(startMs).toISOString();
      minutes_until_start = Math.round((startMs - now) / 60000);
      due = now >= startMs && o.order_status === 'confirmed'; // den gio ma chua bat dau pha
    } else {
      due = o.order_status === 'confirmed'; // khong chon gio -> lam ngay
    }
    return { ...o, items, lead_minutes: leadMin, start_prep_at, minutes_until_start, due };
  });
  res.json(rows);
});

// ====== Admin: danh sach don (loc theo diem lay / ngay / trang thai) ======
r.get('/', requireAdmin, (req, res) => {
  let sql = `SELECT o.*, s.name AS store_name FROM orders o
             LEFT JOIN stores s ON s.id = o.store_id WHERE 1=1`;
  const params = [];
  if (req.query.store_id) { sql += ' AND o.store_id = ?'; params.push(req.query.store_id); }
  if (req.query.date) { sql += " AND substr(o.pickup_time,1,10) = ?"; params.push(req.query.date); }
  if (req.query.status) { sql += ' AND o.order_status = ?'; params.push(req.query.status); }
  sql += ' ORDER BY o.created_at DESC';
  const rows = db.prepare(sql).all(...params).map((o) => ({ ...o, items: JSON.parse(o.items_json) }));
  res.json(rows);
});

// ====== Admin: cap nhat trang thai (preparing -> ready -> picked) ======
r.patch('/:id/status', requireAdmin, async (req, res) => {
  const { order_status } = req.body;
  db.prepare('UPDATE orders SET order_status = ? WHERE id = ?').run(order_status, req.params.id);
  const o = db.prepare(
    `SELECT o.*, s.name AS store_name FROM orders o LEFT JOIN stores s ON s.id=o.store_id WHERE o.id=?`
  ).get(req.params.id);

  const msg = {
    preparing: `Quán đang pha đơn #${o.id} của bạn ☕`,
    ready: `🔔 Đơn #${o.id} đã sẵn sàng! Mời bạn ghé ${o.store_name || 'quán'} lấy nhé.`,
    picked: `Cảm ơn bạn đã ghé Anchor Coffee! Hẹn gặp lại ☕`,
    cancelled: `Đơn #${o.id} đã được huỷ.`,
  }[order_status];
  if (o?.zalo_user_id && msg) sendText(o.zalo_user_id, msg).catch(() => {});

  // Tra tai quay: khi khach da lay (picked) tuc da thanh toan -> xuat hoa don
  if (order_status === 'picked' && o?.payment_method === 'counter' && o.payment_status !== 'paid') {
    db.prepare("UPDATE orders SET payment_status='paid' WHERE id=?").run(o.id);
    issueInvoiceForOrder(o.id).catch((e) => console.error('[EInvoice] counter:', e.message));
  }
  res.json({ ok: true });
});

export default r;
