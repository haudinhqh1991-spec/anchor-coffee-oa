import crypto from 'crypto';
import { config } from '../config.js';
import { getAccessToken } from './token.js';

// ====== Verify webhook tu Zalo ======
// Cong thuc chinh thuc: mac = sha256(app_id + rawBody + timestamp + OA_SECRET_KEY)
// Header: X-ZEvent-Signature: mac=<hash>
// LUU Y: phai dung rawBody (chuoi goc) chu khong stringify lai -> tranh lech.
export function verifyWebhook(rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  let parsed;
  try { parsed = JSON.parse(rawBody); } catch { return false; }
  const expected =
    'mac=' +
    crypto
      .createHash('sha256')
      .update(parsed.app_id + rawBody + parsed.timestamp + config.zalo.oaSecret)
      .digest('hex');
  // So sanh chong timing-attack
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ====== Gui tin nhan van ban (trong cua so cham soc 7 ngay) ======
export async function sendText(userId, text) {
  const accessToken = await getAccessToken();
  const res = await fetch(config.zalo.sendCsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', access_token: accessToken },
    body: JSON.stringify({
      recipient: { user_id: userId },
      message: { text },
    }),
  });
  return res.json();
}

// ====== Gui tin nhan dang list (menu / nut bam) ======
// elements: [{title, subtitle, image_url, default_action:{type,url}}]
export async function sendListTemplate(userId, elements, buttons = []) {
  const accessToken = await getAccessToken();
  const res = await fetch(config.zalo.sendCsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', access_token: accessToken },
    body: JSON.stringify({
      recipient: { user_id: userId },
      message: {
        attachment: {
          type: 'template',
          payload: { template_type: 'list', elements, buttons },
        },
      },
    }),
  });
  return res.json();
}

// ====== Gui nut mo Mini App / link dat hang ======
export async function sendOrderButton(userId, miniAppUrl) {
  const accessToken = await getAccessToken();
  const res = await fetch(config.zalo.sendCsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', access_token: accessToken },
    body: JSON.stringify({
      recipient: { user_id: userId },
      message: {
        text: 'Mời bạn xem menu và đặt món tại đây 👇',
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            buttons: [{ title: '☕ Đặt hàng ngay', type: 'oa.open.url', payload: { url: miniAppUrl } }],
          },
        },
      },
    }),
  });
  return res.json();
}
