import { config } from '../config.js';

/*
 * Adapter HDDT - provider-agnostic.
 * Moi nha cung cap (VNPT, Viettel S-Invoice, MISA meInvoice, EasyInvoice...) co API rieng
 * nhung deu lam 3 viec: phat hanh (publish), huy (cancel), tra cuu (query).
 * -> Ta dinh nghia 1 interface chung, va viet adapter cho tung nha cung cap.
 *
 * Tat ca adapter tra ve dang chuan:
 *   { invoiceNo, series, taxAuthorityCode, lookupCode, lookupUrl, pdfUrl, raw }
 */

// ----- 1) MOCK: dung de chay thu khi chua ky hop dong nha cung cap -----
const mockProvider = {
  async publish(invoiceData) {
    const no = String(Date.now()).slice(-7);
    return {
      invoiceNo: no,
      series: invoiceData.series,
      taxAuthorityCode: 'M' + no + 'CQT',
      lookupCode: 'LK' + no,
      lookupUrl: `https://tracuuhoadon.example/${no}`,
      pdfUrl: null,
      raw: { mock: true },
    };
  },
  async cancel() { return { ok: true, mock: true }; },
  async query(no) { return { invoiceNo: no, status: 'issued', mock: true }; },
};

// ----- 2) REST: mau cho cac nha cung cap co REST/JSON (vd Viettel S-Invoice, EasyInvoice) -----
// LUU Y: ten field + endpoint thay doi theo tung nha cung cap -> chinh lai theo tai lieu API anh nhan duoc.
const restProvider = {
  async publish(invoiceData) {
    const e = config.einvoice;
    // Map sang payload nha cung cap (vi du chung). Doi theo tai lieu thuc te.
    const payload = {
      generalInvoiceInfo: {
        invoiceType: 'mtt',                 // hoa don tu may tinh tien
        templateCode: e.templateCode,
        invoiceSeries: invoiceData.series,
        transactionUuid: `LT-${invoiceData.orderRef}-${Date.now()}`, // chong trung
        paymentStatus: true,
        paymentMethodName: invoiceData.paymentMethod,
      },
      sellerInfo: {
        sellerLegalName: invoiceData.seller.name,
        sellerTaxCode: invoiceData.seller.taxCode,
        sellerAddressLine: invoiceData.seller.address,
        sellerPhoneNumber: invoiceData.seller.phone,
      },
      buyerInfo: {
        buyerName: invoiceData.buyer.name,
        buyerLegalName: invoiceData.buyer.company,
        buyerTaxCode: invoiceData.buyer.taxCode,
        buyerPhoneNumber: invoiceData.buyer.phone,
        buyerAddressLine: invoiceData.buyer.address,
      },
      itemInfo: invoiceData.lines.map((l) => ({
        lineNumber: l.stt,
        itemName: l.name,
        unitName: l.unit,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatPercentage: l.vatRate,
        itemTotalAmountWithoutVat: l.amountBeforeTax,
        vatAmount: l.vatAmount,
        itemTotalAmountWithVat: l.amountAfterTax,
      })),
      summarizeInfo: {
        sumOfTotalLineAmountWithoutVat: invoiceData.totals.beforeTax,
        totalVATAmount: invoiceData.totals.vat,
        totalAmountWithVat: invoiceData.totals.payment,
      },
      taxBreakdowns: invoiceData.vatBreakdown.map((b) => ({
        vatPercentage: b.rate, vatTaxableAmount: b.beforeTax, vatAmount: b.vat,
      })),
    };

    const res = await fetch(`${e.apiUrl}/InvoiceAPI/InvoiceWS/createInvoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Nhieu NCC dung Basic Auth hoac token rieng -> chinh lai cho dung
        Authorization: 'Basic ' + Buffer.from(`${e.username}:${e.password}`).toString('base64'),
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error('Phat hanh hoa don loi: ' + JSON.stringify(data));

    // Map ket qua tra ve (ten field tuy NCC)
    return {
      invoiceNo: data.invoiceNo || data.result?.invoiceNo,
      series: invoiceData.series,
      taxAuthorityCode: data.codeOfTax || data.result?.reservationCode,
      lookupCode: data.lookupCode || data.result?.lookupCode,
      lookupUrl: data.lookupUrl || data.result?.lookupUrl,
      pdfUrl: data.pdfUrl || null,
      raw: data,
    };
  },

  async cancel(invoiceNo, reason) {
    const e = config.einvoice;
    const res = await fetch(`${e.apiUrl}/InvoiceAPI/InvoiceWS/cancelInvoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(`${e.username}:${e.password}`).toString('base64'),
      },
      body: JSON.stringify({ invoiceNo, reason }),
    });
    return res.json();
  },

  async query(invoiceNo) {
    const e = config.einvoice;
    const res = await fetch(`${e.apiUrl}/InvoiceAPI/InvoiceWS/getInvoiceByNo?no=${invoiceNo}`, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${e.username}:${e.password}`).toString('base64') },
    });
    return res.json();
  },
};

const providers = { mock: mockProvider, rest: restProvider };

export function getProvider() {
  return providers[config.einvoice.provider] || mockProvider;
}
