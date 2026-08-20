const crypto = require('crypto');
const { ethers } = require('ethers');

/**
 * 錢包簽章驗證 + 管理端金鑰。
 *
 * 先前所有寫入端點（/api/kyc、/api/buy、/api/pwa/buy、/api/admin/*）都沒有任何
 * 身分驗證，而伺服器本身持有簽章錢包 —— 任何人都能指定任意地址通過 KYC、
 * 領空投、索取 PropertyToken，或觸發收益派發。
 *
 * 這裡用兩層修正：
 *   1. 一般使用者端點：要求呼叫者用該地址簽一段含 nonce 的訊息（EIP-191），
 *      證明自己確實控制這個地址。nonce 一次性、5 分鐘過期，避免重放。
 *   2. 管理端點：要求 ADMIN_API_KEY，且沒設就直接拒絕（fail-closed）。
 */

const NONCE_TTL_MS = 5 * 60 * 1000;
const nonces = new Map(); // nonce -> { address, expiresAt }

function issueNonce(address) {
  let normalized;
  try {
    normalized = ethers.getAddress(address);
  } catch {
    return null;
  }
  const nonce = crypto.randomBytes(24).toString('base64url');
  nonces.set(nonce, { address: normalized, expiresAt: Date.now() + NONCE_TTL_MS });
  return nonce;
}

// 定期清掉過期 nonce，避免記憶體無限成長
setInterval(() => {
  const now = Date.now();
  for (const [nonce, entry] of nonces) {
    if (entry.expiresAt < now) nonces.delete(nonce);
  }
}, 60 * 1000).unref();

function messageFor(address, nonce) {
  return `Pepe RWA 身分驗證\n地址: ${address}\nNonce: ${nonce}`;
}

/**
 * 驗證 body 中的 { address, nonce, signature }。
 * 通過後把正規化位址放到 req.verifiedAddress，後續 handler 一律只信這個值。
 */
function requireWalletSignature(req, res, next) {
  const { address, nonce, signature } = req.body || {};
  if (!address || !nonce || !signature) {
    return res.status(401).json({ error: '缺少 address / nonce / signature，請先呼叫 POST /api/auth/nonce' });
  }

  const entry = nonces.get(nonce);
  if (!entry) return res.status(401).json({ error: 'nonce 無效或已使用' });
  // nonce 一次性：不論驗證成敗都消耗掉，避免暴力嘗試
  nonces.delete(nonce);
  if (entry.expiresAt < Date.now()) return res.status(401).json({ error: 'nonce 已過期' });

  let claimed;
  try {
    claimed = ethers.getAddress(address);
  } catch {
    return res.status(400).json({ error: '地址格式錯誤' });
  }
  if (claimed !== entry.address) return res.status(401).json({ error: 'nonce 與地址不符' });

  let recovered;
  try {
    recovered = ethers.verifyMessage(messageFor(claimed, nonce), signature);
  } catch {
    return res.status(401).json({ error: '簽章無法驗證' });
  }
  if (recovered !== claimed) return res.status(401).json({ error: '簽章與地址不符' });

  req.verifiedAddress = claimed;
  next();
}

/**
 * 管理端點金鑰。刻意 fail-closed：沒設定 ADMIN_API_KEY 就一律拒絕，
 * 而不是「沒設就放行」。比較時用 timingSafeEqual 避免時間側通道。
 */
function requireAdminKey(req, res, next) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    return res.status(503).json({ error: '伺服器未設定 ADMIN_API_KEY，管理端點停用' });
  }
  const provided = req.header('X-Admin-Key') || '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

module.exports = { issueNonce, messageFor, requireWalletSignature, requireAdminKey };
