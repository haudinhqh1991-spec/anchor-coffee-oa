import { config } from '../config.js';

/*
 * In bill nhiet ESC/POS + mo ket tien.
 * Dung thu vien 'node-thermal-printer' (ho tro Epson/Star, ket noi TCP/USB).
 * Neu khong cai duoc (vd may chua co may in) -> tu dong bo qua, khong lam crash.
 */
let ThermalPrinter, PrinterTypes;
try {
  const lib = await import('node-thermal-printer');
  ThermalPrinter = lib.printer || lib.ThermalPrinter;
  PrinterTypes = lib.types || lib.PrinterTypes;
} catch {
  console.warn('[Printer] Chua cai node-thermal-printer - se bo qua in bill.');
}

export async function printReceipt(order, invoiceData, invoice) {
  if (!ThermalPrinter) return;

  const printer = new ThermalPrinter({
    type: config.pos.printerType === 'star' ? PrinterTypes.STAR : PrinterTypes.EPSON,
    interface: config.pos.printerInterface, // vd 'tcp://192.168.1.100' hoac 'usb'
    removeSpecialCharacters: false,
    options: { timeout: 5000 },
  });

  const ok = await printer.isPrinterConnected();
  if (!ok) { console.warn('[Printer] Khong ket noi duoc may in'); return; }

  const s = config.seller;
  printer.alignCenter();
  printer.bold(true);
  printer.println(s.name || 'CAFE');
  printer.bold(false);
  if (s.address) printer.println(s.address);
  if (s.taxCode) printer.println('MST: ' + s.taxCode);
  printer.drawLine();

  printer.alignLeft();
  printer.println(`Hoa don #${order.id}  ${new Date().toLocaleString('vi-VN')}`);
  if (invoice?.invoice_no) {
    printer.println(`HDDT: ${invoice.invoice_series}-${invoice.invoice_no}`);
    if (invoice.tax_authority_code) printer.println(`Ma CQT: ${invoice.tax_authority_code}`);
  }
  printer.drawLine();

  invoiceData.lines.forEach((l) => {
    printer.tableCustom([
      { text: `${l.name} x${l.quantity}`, align: 'LEFT', width: 0.6 },
      { text: l.amountAfterTax.toLocaleString('vi-VN'), align: 'RIGHT', width: 0.4 },
    ]);
  });
  printer.drawLine();

  printer.tableCustom([
    { text: 'Tien hang (chua VAT)', align: 'LEFT', width: 0.6 },
    { text: invoiceData.totals.beforeTax.toLocaleString('vi-VN'), align: 'RIGHT', width: 0.4 },
  ]);
  printer.tableCustom([
    { text: 'Thue VAT', align: 'LEFT', width: 0.6 },
    { text: invoiceData.totals.vat.toLocaleString('vi-VN'), align: 'RIGHT', width: 0.4 },
  ]);
  printer.bold(true);
  printer.tableCustom([
    { text: 'TONG CONG', align: 'LEFT', width: 0.6 },
    { text: invoiceData.totals.payment.toLocaleString('vi-VN') + 'd', align: 'RIGHT', width: 0.4 },
  ]);
  printer.bold(false);
  printer.drawLine();

  // QR tra cuu hoa don
  if (invoice?.lookup_url) {
    printer.alignCenter();
    printer.println('Quet de tra cuu hoa don:');
    printer.printQR(invoice.lookup_url, { cellSize: 6 });
  }
  printer.alignCenter();
  printer.println('Cam on quy khach!');
  printer.cut();

  if (config.pos.openCashDrawer && order.payment_method === 'counter') {
    printer.openCashDrawer(); // mo ket khi thu tien mat tai quay
  }

  await printer.execute();
  console.log('[Printer] Da in bill don', order.id);
}
