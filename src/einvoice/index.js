import { config } from '../config.js';
import { db } from '../db.js';
import { buildInvoiceData } from './builder.js';
import { getProvider } from './provider.js';
import { sendText } from '../zalo/oa.js';
import { printReceipt } from '../pos/printer.js';

/*
 * Phat hanh hoa don cho 1 don hang (idempotent - khong xuat 2 lan).
 * Goi tu: callback thanh toan thanh cong, hoac POS bam "thanh toan".
 */
export async function issueInvoiceForOrder(orderId, { print = true } = {}) {
  if (!config.einvoice.enabled) {
    console.log('[EInvoice] Tat - bo qua xuat hoa don don', orderId);
    return null;
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new Error('Khong tim thay don ' + orderId);
  if (order.invoice_id) {
    return db.prepare('SELECT * FROM invoices WHERE id = ?').get(order.invoice_id); // da xuat
  }
  order.items = JSON.parse(order.items_json);

  const invoiceData = buildInvoiceData(order);

  let result, status = 'issued', rawErr = null;
  try {
    result = await getProvider().publish(invoiceData);
  } catch (e) {
    status = 'error';
    rawErr = e.message;
    console.error('[EInvoice] Loi phat hanh:', e.message);
  }

  const info = db
    .prepare(
      `INSERT INTO invoices (order_id, provider, invoice_no, invoice_series, tax_authority_code,
        lookup_code, lookup_url, pdf_url, total_before_tax, total_tax, total_payment, status, raw_response)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      orderId, config.einvoice.provider, result?.invoiceNo || null, invoiceData.series,
      result?.taxAuthorityCode || null, result?.lookupCode || null, result?.lookupUrl || null,
      result?.pdfUrl || null, invoiceData.totals.beforeTax, invoiceData.totals.vat,
      invoiceData.totals.payment, status, JSON.stringify(result?.raw || { error: rawErr })
    );

  const invoiceId = info.lastInsertRowid;
  db.prepare('UPDATE orders SET invoice_id = ? WHERE id = ?').run(invoiceId, orderId);
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);

  if (status === 'issued') {
    // In bill kem QR tra cuu (phan cung)
    if (print) {
      printReceipt(order, invoiceData, invoice).catch((e) =>
        console.error('[Printer] Loi in:', e.message)
      );
    }
    // Gui hoa don cho khach qua Zalo OA
    if (order.zalo_user_id) {
      const msg =
        `🧾 Hóa đơn điện tử đơn #${orderId}\n` +
        `Ký hiệu: ${invoice.invoice_series} - Số: ${invoice.invoice_no}\n` +
        `Mã CQT: ${invoice.tax_authority_code}\n` +
        `Tổng thanh toán: ${invoice.total_payment.toLocaleString('vi-VN')}đ\n` +
        (invoice.lookup_url ? `Tra cứu: ${invoice.lookup_url}` : '');
      sendText(order.zalo_user_id, msg).catch(() => {});
    }
  }

  return invoice;
}
