import { db } from '../db.js';

/*
 * Dong bo du lieu voi POS ngoai (KiotViet, Sapo, iPOS, Pos365...).
 * 2 chieu:
 *  - Nhan don ban tu POS (vd ban tai quay) -> luu vao orders -> xuat hoa don.
 *  - (mo rong) Day don tu Zalo sang POS de quan ly tap trung.
 *
 * Moi POS co format webhook khac nhau -> ta chuan hoa ve 1 schema chung tai day.
 */

// Chuan hoa payload tu cac POS khac nhau ve schema noi bo
export function normalizePosSale(source, body) {
  switch (source) {
    case 'kiotviet':
      return {
        external_id: body.Id || body.Code,
        items: (body.Products || body.OrderDetails || []).map((p) => ({
          id: p.ProductId, name: p.ProductName, price: p.Price, qty: p.Quantity,
        })),
        total: body.Total,
        payment_method: body.PaymentMethod === 'Cash' ? 'counter' : 'transfer',
        customer_name: body.CustomerName || 'Khách lẻ',
        phone: body.ContactNumber || '',
      };
    case 'sapo':
      return {
        external_id: body.id || body.code,
        items: (body.order_line_items || []).map((p) => ({
          id: p.product_id, name: p.product_name, price: p.price, qty: p.quantity,
        })),
        total: body.total,
        payment_method: 'counter',
        customer_name: body.customer_data?.name || 'Khách lẻ',
        phone: body.customer_data?.phone_number || '',
      };
    default: // generic
      return {
        external_id: body.external_id,
        items: body.items || [],
        total: body.total,
        payment_method: body.payment_method || 'counter',
        customer_name: body.customer_name || 'Khách lẻ',
        phone: body.phone || '',
      };
  }
}

// Tao don tu giao dich POS (tranh trung bang external_id)
export function ingestPosSale(sale) {
  if (sale.external_id) {
    const dup = db.prepare('SELECT id FROM orders WHERE note = ?').get('POS:' + sale.external_id);
    if (dup) return dup.id;
  }
  const total = sale.total ?? sale.items.reduce((s, it) => s + it.price * it.qty, 0);
  const info = db
    .prepare(
      `INSERT INTO orders (customer_name, phone, items_json, total, note, payment_method,
        payment_status, order_status) VALUES (?,?,?,?,?,?, 'paid', 'done')`
    )
    .run(
      sale.customer_name, sale.phone, JSON.stringify(sale.items), total,
      sale.external_id ? 'POS:' + sale.external_id : 'POS', sale.payment_method
    );
  return info.lastInsertRowid;
}
