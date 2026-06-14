import 'dotenv/config';

export const config = {
  port: process.env.PORT || 3000,
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:3000',

  zalo: {
    appId: process.env.ZALO_APP_ID,
    appSecret: process.env.ZALO_APP_SECRET,
    oaSecret: process.env.ZALO_OA_SECRET,
    refreshToken: process.env.ZALO_OA_REFRESH_TOKEN,
    // Endpoint chinh thuc
    oauthUrl: 'https://oauth.zaloapp.com/v4/oa/access_token',
    sendCsUrl: 'https://openapi.zalo.me/v3.0/oa/message/cs', // tra loi trong 7 ngay (customer service)
  },

  zalopay: {
    appId: process.env.ZALOPAY_APP_ID,
    key1: process.env.ZALOPAY_KEY1,
    key2: process.env.ZALOPAY_KEY2,
    env: process.env.ZALOPAY_ENV || 'sandbox',
    get createUrl() {
      return this.env === 'production'
        ? 'https://openapi.zalopay.vn/v2/create'
        : 'https://sb-openapi.zalopay.vn/v2/create';
    },
    get queryUrl() {
      return this.env === 'production'
        ? 'https://openapi.zalopay.vn/v2/query'
        : 'https://sb-openapi.zalopay.vn/v2/query';
    },
  },

  adminApiKey: process.env.ADMIN_API_KEY || 'changeme',

  // ====== Thong tin nguoi ban (in tren hoa don) ======
  seller: {
    taxCode: process.env.SELLER_TAX_CODE,          // MST
    name: process.env.SELLER_NAME,                 // Ten don vi
    address: process.env.SELLER_ADDRESS,
    phone: process.env.SELLER_PHONE,
    bankAccount: process.env.SELLER_BANK_ACCOUNT,
    bankName: process.env.SELLER_BANK_NAME,
  },

  // ====== Hoa don dien tu (HDDT khoi tao tu may tinh tien) ======
  einvoice: {
    enabled: process.env.EINVOICE_ENABLED === 'true',
    provider: process.env.EINVOICE_PROVIDER || 'mock', // mock | rest (vnpt/viettel/misa/easyinvoice...)
    apiUrl: process.env.EINVOICE_API_URL,
    username: process.env.EINVOICE_USERNAME,
    password: process.env.EINVOICE_PASSWORD,
    // Mau so + ky hieu hoa don tu may tinh tien (dang ky voi CQT)
    // Vi du mau so "1", ky hieu "C25MAA" (M = hoa don tu may tinh tien)
    templateCode: process.env.EINVOICE_TEMPLATE_CODE || '1',
    invoiceSeries: process.env.EINVOICE_SERIES || 'C25MAA',
    defaultVatRate: Number(process.env.EINVOICE_DEFAULT_VAT || 8), // % (an uong thuong 8 hoac 10)
    priceIncludesVat: process.env.EINVOICE_PRICE_INCLUDES_VAT !== 'false', // gia menu da gom VAT?
  },

  // ====== POS & phan cung ======
  pos: {
    // May in nhiet ESC/POS
    printerType: process.env.PRINTER_TYPE || 'epson',     // epson | star
    printerInterface: process.env.PRINTER_INTERFACE || 'tcp://192.168.1.100', // tcp://ip | usb | printer:name
    openCashDrawer: process.env.PRINTER_OPEN_DRAWER === 'true',
    // Webhook xac thuc tu POS ngoai (KiotViet/Sapo/iPOS...)
    webhookSecret: process.env.POS_WEBHOOK_SECRET || 'changeme',
  },
};
