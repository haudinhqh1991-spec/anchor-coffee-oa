import { Router } from 'express';
import { db } from '../db.js';
import { verifyCallback, queryOrder } from '../payment/zalopay.js';
import { sendText } from '../zalo/oa.js';
import { issueInvoiceForOrder } from '../einvoice/index.js';

const r = Router();

// ====== Callback tu ZaloPay (server-to-server) ======
// ZaloPay POST { data, mac, type }. Phai tra ve { return_code, return_message }.
r.post('/callback', async (req, res) => {
  let result = { return_code: 0, return_message: '' };
  try {
    if (!verifyCallback(req.body)) {
      result.return_message = 'mac not equal';
      return res.json(result);
    }
    const data = JSON.parse(req.body.data);
    const appTransId = data.app_trans_id;

    const order = db.prepare('SELECT * FROM orders WHERE app_trans_id = ?').get(appTransId);
    if (order && order.payment_status !== 'paid') {
      db.prepare("UPDATE orders SET payment_status='paid', order_status='confirmed' WHERE id=?").run(order.id);
      if (order.zalo_user_id) {
        sendText(order.zalo_user_id,
          `✅ Thanh toán thành công đơn #${order.id} (${order.total.toLocaleString('vi-VN')}đ). Quán đang chuẩn bị nhé!`
        ).catch(() => {});
      }
      // Tu dong xuat hoa don dien tu ngay khi thanh toan thanh cong
      issueInvoiceForOrder(order.id).catch((e) => console.error('[EInvoice] callback:', e.message));
    }
    result.return_code = 1;
    result.return_message = 'success';
  } catch (e) {
    result.return_code = 0;
    result.return_message = e.message;
  }
  res.json(result);
});

// ====== Du phong: client goi de kiem tra lai trang thai (neu callback miss) ======
r.get('/check/:appTransId', async (req, res) => {
  const data = await queryOrder(req.params.appTransId);
  if (data.return_code === 1) {
    const order = db.prepare('SELECT * FROM orders WHERE app_trans_id = ?').get(req.params.appTransId);
    if (order && order.payment_status !== 'paid') {
      db.prepare("UPDATE orders SET payment_status='paid', order_status='confirmed' WHERE id=?").run(order.id);
    }
  }
  res.json(data);
});

export default r;
