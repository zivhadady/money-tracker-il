const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const KEY_FILE = path.join(__dirname, '../../data/.master.key');

// In-memory unlocked session key (32 bytes) derived from User's Master Password
let sessionVaultKey = null;

function setSessionVaultKey(keyBuffer) {
  sessionVaultKey = keyBuffer;
}

function getSessionVaultKey() {
  return sessionVaultKey;
}

function deriveKeyFromPassword(password, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  return crypto.scryptSync(String(password), salt, 32, { N: 16384, r: 8, p: 1 });
}

function getActiveEncryptionKey() {
  if (sessionVaultKey) {
    return sessionVaultKey;
  }
  if (process.env.MASTER_KEY && process.env.MASTER_KEY.length === 64) {
    return Buffer.from(process.env.MASTER_KEY, 'hex');
  }
  const dir = path.dirname(KEY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (fs.existsSync(KEY_FILE)) {
    const hex = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (hex.length === 64) {
      return Buffer.from(hex, 'hex');
    }
  }
  const newKey = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, newKey.toString('hex'), { mode: 0o600 });
  return newKey;
}

function encryptBuffer(plainBuffer, keyBuffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    tag: authTag.toString('hex'),
    data: encrypted.toString('base64')
  };
}

function decryptBuffer(payload, keyBuffer) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    keyBuffer,
    Buffer.from(payload.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.data, 'base64')),
    decipher.final()
  ]);
}

function encryptCredentials(credentialsObj) {
  if (!credentialsObj) return null;
  const key = getActiveEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(credentialsObj);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return JSON.stringify({
    iv: iv.toString('hex'),
    tag: authTag,
    data: encrypted
  });
}

function decryptCredentials(encryptedStr) {
  if (!encryptedStr) return null;
  const payload = JSON.parse(encryptedStr);

  // Try active session key first, then fallback to legacy .master.key if migrating
  const candidateKeys = [];
  if (sessionVaultKey) candidateKeys.push(sessionVaultKey);
  if (fs.existsSync(KEY_FILE)) {
    const hex = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (hex.length === 64) candidateKeys.push(Buffer.from(hex, 'hex'));
  }

  for (const key of candidateKeys) {
    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(payload.iv, 'hex')
      );
      decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));
      let decrypted = decipher.update(payload.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    } catch (_e) {
      // try next key
    }
  }
  console.error('Failed to decrypt credentials with available keys');
  return null;
}

function generateTransactionHash(accountId, date, description, chargedAmount, originalAmount, memo = '') {
  const raw = `${accountId}|${date}|${(description || '').trim()}|${Number(chargedAmount).toFixed(2)}|${Number(originalAmount || chargedAmount).toFixed(2)}|${(memo || '').trim()}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

module.exports = {
  setSessionVaultKey,
  getSessionVaultKey,
  deriveKeyFromPassword,
  encryptBuffer,
  decryptBuffer,
  encryptCredentials,
  decryptCredentials,
  generateTransactionHash
};
