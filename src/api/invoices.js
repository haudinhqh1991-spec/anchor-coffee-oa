import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../db.js';
import { config } from '../config.js';
import { requireAdmin } from './_auth.js';
import { issueInvoiceForOrder } from '../einvoice/index.js';
import { getProvider } from '../einvoice/provider.js';
import { normalizePosSale, ingestPosSale } from '../pos/adapters.js';

const r = Router();

// ====== Admin: xuat hoa don thu cong cho 1 don ======
r.post('/issue/:orderId', requireAdmin, async (req, res) => {
  try {
    const inv = await issueInvoiceForOrder(Number(req.params.orderId), { print: req.body?.print !== false });
    res.json(inv || { skipped: true, reason: 'einvoice disabled' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ====== Lay hoa don theo don ======
r.get('/by-order/:orderId', (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE order_id = ? ORDER BY id DESC').get(req.params.orderId);
  if (!inv) return res.status(404).json({ error: 'Chua co hoa don' });
  res.json(inv);
});

// ====== Admin: huy hoa don ======
r.post('/:invoiceNo/cancel', requireAdmin, async (req, res) => {
  const result = await getProvider().cancel(req.params.invoiceNo, req.body?.reason || 'Huy theo yeu cau');
  db.prepare("UPDATE invoices SET status='cancelled' WHERE invoice_no=?").run(req.params.invoiceNo);
  res.json(result);
});

// ====== Webhook nhan don tu POS ngoai (KiotViet/Sapo/...) ======
// Header xac thuc: x-pos-secret
r.post('/pos-webhook/:source', async (req, res) => {
  if (req.headers['x-pos-secret'] !== config.pos.webhookSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const sale = normalizePosSale(req.params.source, req.body);
    if (!sale.items?.length) return res.status(400).json({ error: 'Don POS rong' });
    const orderId = ingestPosSale(sale);
    // Tu dong xuat hoa don cho giao dich POS (ban tai quay)
    const inv = await issueInvoiceForOrder(orderId).catch(() => null);
    res.json({ orderId, invoice: inv });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default r;
