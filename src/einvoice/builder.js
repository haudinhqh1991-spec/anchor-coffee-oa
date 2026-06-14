import { config } from '../config.js';

const round = (n) => Math.round(n);

// Tu 1 don hang -> du lieu hoa don chuan (NĐ123/NĐ70 + TT78)
// items: [{name, price, qty, unit?, vatRate?}]
export function buildInvoiceData(order) {
  const e = config.einvoice;
  const defaultRate = e.defaultVatRate;

  const lines = order.items.map((it, idx) => {
    const rate = it.vatRate ?? defaultRate;
    const qty = Number(it.qty);
    const grossUnit = Number(it.price);
    // Gia menu thuong da gom VAT -> tach nguoc ra gia chua thue
    const netUnit = e.priceIncludesVat ? grossUnit / (1 + rate / 100) : grossUnit;
    const lineNet = round(netUnit * qty);
    const lineVat = round(lineNet * (rate / 100));
    return {
      stt: idx + 1,
      name: it.name,
      unit: it.unit || 'Ly',
      quantity: qty,
      unitPrice: round(netUnit),
      vatRate: rate,
      amountBeforeTax: lineNet,
      vatAmount: lineVat,
      amountAfterTax: lineNet + lineVat,
    };
  });

  const totalBeforeTax = lines.reduce((s, l) => s + l.amountBeforeTax, 0);
  const totalVat = lines.reduce((s, l) => s + l.vatAmount, 0);
  const totalPayment = totalBeforeTax + totalVat;

  const vatBreakdown = {};
  for (const l of lines) {
    vatBreakdown[l.vatRate] ||= { rate: l.vatRate, beforeTax: 0, vat: 0 };
    vatBreakdown[l.vatRate].beforeTax += l.amountBeforeTax;
    vatBreakdown[l.vatRate].vat += l.vatAmount;
  }

  return {
    seller: config.seller,
    invoiceType: 'mtt',          // hoa don khoi tao tu may tinh tien
    templateCode: e.templateCode,
    series: e.invoiceSeries,
    issuedAt: new Date().toISOString(),
    buyer: {
      name: order.customer_name || 'Khách lẻ',
      taxCode: order.buyer_tax_code || '',
      company: order.buyer_company || '',
      phone: order.phone || '',
      address: order.address || '',
    },
    paymentMethod: order.payment_method === 'counter' ? 'TM' : 'CK',
    lines,
    totals: { beforeTax: totalBeforeTax, vat: totalVat, payment: totalPayment },
    vatBreakdown: Object.values(vatBreakdown),
    orderRef: order.id,
  };
}
