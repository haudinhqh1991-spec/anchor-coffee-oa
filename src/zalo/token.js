import { config } from '../config.js';
import { db } from '../db.js';

function ensureRow() {
  const row = db.prepare('SELECT * FROM oa_token WHERE id = 1').get();
  if (!row) {
    db.prepare(
      'INSERT INTO oa_token (id, access_token, refresh_token, expires_at) VALUES (1, NULL, ?, 0)'
    ).run(config.zalo.refreshToken || null);
  }
}
ensureRow();

async function refresh() {
  const row = db.prepare('SELECT * FROM oa_token WHERE id = 1').get();
  const refreshToken = row.refresh_token || config.zalo.refreshToken;
  if (!refreshToken) throw new Error('Chua co ZALO_OA_REFRESH_TOKEN');

  const body = new URLSearchParams({
    app_id: config.zalo.appId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch(config.zalo.oauthUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      secret_key: config.zalo.appSecret,
    },
    body,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Refresh token loi: ' + JSON.stringify(data));

  // Zalo tra access_token (~25h) + refresh_token MOI (xoay vong) -> phai luu lai
  const expiresAt = Date.now() + (Number(data.expires_in || 90000) - 300) * 1000;
  db.prepare(
    'UPDATE oa_token SET access_token = ?, refresh_token = ?, expires_at = ? WHERE id = 1'
  ).run(data.access_token, data.refresh_token || refreshToken, expiresAt);

  console.log('[Zalo] Refreshed access_token, het han:', new Date(expiresAt).toLocaleString());
  return data.access_token;
}

export async function getAccessToken() {
  const row = db.prepare('SELECT * FROM oa_token WHERE id = 1').get();
  if (row.access_token && row.expires_at > Date.now()) return row.access_token;
  return refresh();
}

export { refresh as refreshToken };
