import express from 'express';
import cron from 'node-cron';
import { config } from './config.js';
import { seed } from './db.js';
import { refreshToken } from './zalo/token.js';

import menuApi from './api/menu.js';
import storesApi from './api/stores.js';
import ordersApi from './api/orders.js';
import paymentApi from './api/payment.js';
import invoicesApi from './api/invoices.js';
import webhook from './zalo/webhook.js';

seed();

const app = express();

// Luu rawBody de verify chu ky webhook Zalo (BAT BUOC dung chuoi goc)
app.use(
  express.json({
    verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
  })
);
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/', (_req, res) => res.send('Cafe Zalo OA backend OK'));

// API
app.use('/api/menu', menuApi);
app.use('/api/stores', storesApi);
app.use('/api/orders', ordersApi);
app.use('/api/payment', paymentApi);
app.use('/api/invoices', invoicesApi);

// Webhook Zalo OA (khai bao URL nay trong Zalo Developer > Webhook)
app.use('/webhook', webhook);

// (Tuy chon) phuc vu Mini App build san o /miniapp
app.use('/miniapp', express.static('public/miniapp'));

app.listen(config.port, () => {
  console.log(`Server chay tai ${config.publicUrl} (port ${config.port})`);
});

// Tu dong refresh access token OA moi 12h (token song ~25h)
cron.schedule('0 */12 * * *', () => {
  refreshToken().catch((e) => console.error('[Cron] Refresh loi:', e.message));
});
