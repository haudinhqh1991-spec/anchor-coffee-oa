import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const db = new Database(path.join(__dirname, '..', 'cafe.db'));
db.pragma('journal_mode = WAL');

// ---------- Schema ----------
db.exec(`
CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,            -- VND
  category TEXT,
  image_url TEXT,
  prep_minutes INTEGER DEFAULT 5,    -- thoi gian pha che uoc tinh (de tinh gio bat dau lam)
  available INTEGER DEFAULT 1
);

-- Diem lay hang (chi nhanh tren tuyen duong khach hay di)
CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  area TEXT,                         -- khu vuc / tuyen (vd "Tuyen Vo Thi Sau - Q3")
  open_time TEXT,                    -- gio mo cua (vd "06:30")
  close_time TEXT,                   -- gio dong cua (vd "22:00")
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_trans_id TEXT UNIQUE,          -- ma giao dich ZaloPay
  zalo_user_id TEXT,
  customer_name TEXT,
  phone TEXT,
  address TEXT,                      -- tuy chon (chi dung khi xuat hoa don cong ty)
  store_id INTEGER,                  -- diem khach den lay
  pickup_time TEXT,                  -- gio khach se den lay (YYYY-MM-DD HH:MM)
  items_json TEXT NOT NULL,          -- [{id,name,price,qty}]
  total INTEGER NOT NULL,
  note TEXT,
  payment_method TEXT DEFAULT 'zalopay',  -- zalopay (tra truoc) | counter (tra tai quay khi lay)
  payment_status TEXT DEFAULT 'pending',  -- pending | paid | failed
  order_status TEXT DEFAULT 'new',        -- new | confirmed | preparing | ready | picked | cancelled
  buyer_tax_code TEXT,
  buyer_company TEXT,
  invoice_id INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(store_id) REFERENCES stores(id),
  FOREIGN KEY(invoice_id) REFERENCES invoices(id)
);

-- Hoa don dien tu da phat hanh
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER,
  provider TEXT,
  invoice_no TEXT,
  invoice_series TEXT,
  tax_authority_code TEXT,
  lookup_code TEXT,
  lookup_url TEXT,
  pdf_url TEXT,
  total_before_tax INTEGER,
  total_tax INTEGER,
  total_payment INTEGER,
  status TEXT DEFAULT 'issued',
  raw_response TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS oa_token (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER
);

-- Tai khoan barista - phan quyen theo chi nhanh
CREATE TABLE IF NOT EXISTS barista_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  store_id INTEGER NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(store_id) REFERENCES stores(id)
);
`);

// ---------- Seed du lieu mau ----------
export function seed() {
  const countMenu = db.prepare('SELECT COUNT(*) c FROM menu_items').get().c;
  if (countMenu === 0) {
    const ins = db.prepare(
      'INSERT INTO menu_items (name, description, price, category, prep_minutes, available) VALUES (?,?,?,?,?,1)'
    );
    [
      ['Cà phê sữa đá', 'Cà phê phin truyền thống', 25000, 'Cà phê', 4],
      ['Cà phê đen đá', 'Đậm, ít ngọt', 20000, 'Cà phê', 3],
      ['Bạc xỉu', 'Nhiều sữa, dịu nhẹ', 30000, 'Cà phê', 4],
      ['Trà đào cam sả', 'Giải nhiệt', 35000, 'Trà', 6],
      ['Trà sữa trân châu', 'Topping trân châu đường đen', 40000, 'Trà sữa', 6],
      ['Bánh mì chảo', 'Kèm pate trứng', 45000, 'Đồ ăn', 8],
    ].forEach((r) => ins.run(...r));
    console.log('Seeded menu_items');
  }

  const countStore = db.prepare('SELECT COUNT(*) c FROM stores').get().c;
  if (countStore === 0) {
    const ins = db.prepare(
      'INSERT INTO stores (name, address, area, open_time, close_time, active) VALUES (?,?,?,?,?,1)'
    );
    [
      ['Anchor Coffee - Nguyễn Huệ', '12 Nguyễn Huệ, Q1', 'Tuyến Q1 - trung tâm', '06:30', '22:00'],
      ['Anchor Coffee - Võ Thị Sáu', '88 Võ Thị Sáu, Q3', 'Tuyến Q3 - Võ Thị Sáu', '06:00', '21:00'],
      ['Anchor Coffee - Phạm Văn Đồng', '256 Phạm Văn Đồng, Thủ Đức', 'Tuyến Thủ Đức', '06:00', '21:30'],
    ].forEach((r) => ins.run(...r));
    console.log('Seeded stores');
  }

  // Seed barista accounts
  const countBarista = db.prepare('SELECT COUNT(*) c FROM barista_accounts').get().c;
  if (countBarista === 0) {
    const ins = db.prepare(
      'INSERT INTO barista_accounts (name, store_id, api_key) VALUES (?,?,?)'
    );
    [
      ['Barista Nguyễn Huệ', 1, 'barista-nhu-001'],
      ['Barista Võ Thị Sáu', 2, 'barista-vts-001'],
      ['Barista Phạm Văn Đồng', 3, 'barista-pvd-001'],
    ].forEach((r) => ins.run(...r));
    console.log('Seeded barista_accounts');
  }
}

if (process.argv.includes('--seed')) {
  seed();
  console.log('Done.');
}
