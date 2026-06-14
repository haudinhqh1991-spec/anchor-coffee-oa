import { db } from '../db.js';

// Middleware: xac thuc barista theo x-api-key, gan req.barista = { id, name, store_id }
export function requireBarista(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.key;
  if (!key) return res.status(401).json({ error: 'Thieu api key' });

  const acct = db
    .prepare('SELECT b.*, s.name AS store_name FROM barista_accounts b JOIN stores s ON s.id = b.store_id WHERE b.api_key = ? AND b.active = 1')
    .get(key);

  if (!acct) return res.status(403).json({ error: 'Key khong hop le hoac tai khoan bi vo hieu' });

  req.barista = { id: acct.id, name: acct.name, store_id: acct.store_id, store_name: acct.store_name };
  next();
}
