import { config } from '../config.js';
// Bao ve cac endpoint quan tri bang header x-api-key
export function requireAdmin(req, res, next) {
  if (req.headers['x-api-key'] !== config.adminApiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
