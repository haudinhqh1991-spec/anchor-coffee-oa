import { Router } from 'express';
import { config } from '../config.js';
import { db } from '../db.js';
import { verifyWebhook, sendText, sendOrderButton } from './oa.js';

const r = Router();

// Zalo gui POST kem rawBody. Ta da bat express.json verify de luu rawBody (xem index.js).
r.post('/', async (req, res) => {
  // Tra 200 ngay de Zalo khong retry
  res.sendStatus(200);

  try {
    if (!verifyWebhook(req.rawBody, req.headers['x-zevent-signature'])) {
      console.warn('[Webhook] Sai chu ky, bo qua');
      return;
    }
    const event = req.body;
    const userId = event.sender?.id || event.follower?.id;

    switch (event.event_name) {
      case 'follow': // khach quan tam OA
        if (userId) await sendOrderButton(userId, `${config.publicUrl}/miniapp`);
        break;

      case 'user_send_text': {
        const text = (event.message?.text || '').toLowerCase().trim();
        if (!userId) break;

        if (/menu|thực đơn|thuc don|đồ uống/.test(text)) {
          const items = db.prepare('SELECT * FROM menu_items WHERE available=1 ORDER BY category,id').all();
          const lines = items.map((i) => `• ${i.name} — ${i.price.toLocaleString('vi-VN')}đ`).join('\n');
          await sendText(userId, `☕ MENU HÔM NAY:\n${lines}`);
          await sendOrderButton(userId, `${config.publicUrl}/miniapp`);
        } else if (/đặt|dat hang|order|mua|lấy|lay/.test(text)) {
          await sendText(userId, 'Bạn đặt trước, quán làm sẵn để bạn ghé lấy khỏi phải chờ 👇');
          await sendOrderButton(userId, `${config.publicUrl}/miniapp`);
        } else if (/quán|quan|điểm|diem|chi nhánh|chi nhanh|gần|gan/.test(text)) {
          const stores = db.prepare('SELECT * FROM stores WHERE active=1').all();
          const lines = stores.map((s) => `• ${s.name} — ${s.address} (mở ${s.open_time}-${s.close_time})`).join('\n');
          await sendText(userId, `📍 CÁC ĐIỂM LẤY HÀNG:\n${lines}\n\nChọn điểm thuận tiện trên tuyến đường của bạn khi đặt nhé!`);
        } else {
          await sendText(userId, 'Chào bạn 👋 Gõ "menu" để xem thực đơn, "đặt hàng" để đặt trước & ghé lấy, hoặc "điểm lấy" để xem các quán gần bạn.');
        }
        break;
      }

      default:
        console.log('[Webhook] Event chua xu ly:', event.event_name);
    }
  } catch (e) {
    console.error('[Webhook] Loi:', e.message);
  }
});

export default r;
