import crypto from 'crypto';
import { config } from '../config.js';

const hmac256 = (key, data) =>
  crypto.createHmac('sha256', key).update(data).digest('hex');

// app_trans_id BAT BUOC dinh dang: yymmdd_xxxxx
function genAppTransId(orderId) {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}_${orderId}${Date.now().toString().slice(-5)}`;
}

// ====== Tao don thanh toan ======
export async function createPaymentOrder({ orderId, amount, userId, items, description }) {
  const appTransId = genAppTransId(orderId);
  const embedData = JSON.stringify({
    redirecturl: config.publicUrl, // sau khi thanh toan xong quay lai
    orderId,
  });
  const order = {
    app_id: Number(config.zalopay.appId),
    app_trans_id: appTransId,
    app_user: userId || `user_${orderId}`,
    app_time: Date.now(),
    amount: Number(amount),
    item: JSON.stringify(items || []),
    embed_data: embedData,
    description: description || `Thanh toan don #${orderId}`,
    bank_code: '',
    callback_url: `${config.publicUrl}/api/payment/callback`,
  };

  // hmacinput = app_id|app_trans_id|app_user|amount|app_time|embed_data|item  (ky bang key1)
  const mac = hmac256(
    config.zalopay.key1,
    [order.app_id, order.app_trans_id, order.app_user, order.amount, order.app_time, order.embed_data, order.item].join('|')
  );

  const res = await fetch(config.zalopay.createUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...order, mac }),
  });
  const data = await res.json();
  // data.return_code === 1 => OK; data.order_url => mo de thanh toan
  return { appTransId, data };
}

// ====== Verify callback tu ZaloPay (ky bang key2) ======
export function verifyCallback(body) {
  const mac = hmac256(config.zalopay.key2, body.data);
  return mac === body.mac;
}

// ====== Truy van trang thai don (du phong khi callback miss) ======
export async function queryOrder(appTransId) {
  const data = `${config.zalopay.appId}|${appTransId}|${config.zalopay.key1}`;
  const mac = hmac256(config.zalopay.key1, data);
  const res = await fetch(config.zalopay.queryUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ app_id: config.zalopay.appId, app_trans_id: appTransId, mac }),
  });
  return res.json(); // return_code: 1 = thanh cong, 2 = that bai, 3 = dang xu ly
}
