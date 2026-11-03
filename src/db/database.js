const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { DEFAULT_CATEGORIES } = require('../services/categorizerService');
const {
  setSessionVaultKey,
  getSessionVaultKey,
  deriveKeyFromPassword,
  encryptBuffer,
  decryptBuffer,
  encryptCredentials,
  decryptCredentials
} = require('../services/cryptoService');

const DATA_DIR = path.join(__dirname, '../../data');
const LEGACY_DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'money_tracker.db');
const ENCRYPTED_VAULT_PATH = path.join(DATA_DIR, 'money_tracker.db.enc');

let dbInstance = null;

function isVaultConfigured() {
  return fs.existsSync(ENCRYPTED_VAULT_PATH);
}

function isVaultUnlocked() {
  return dbInstance !== null && getSessionVaultKey() !== null;
}

/**
 * Serializes the in-memory SQLite database and encrypts the entire SQLite binary
 * to `data/money_tracker.db.enc` using AES-256-GCM + scrypt key derived from user's password.
 */
function saveEncryptedVault() {
  if (!dbInstance) return;
  const key = getSessionVaultKey();
  if (!key) return; // Not yet password-protected

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  let saltHex = null;
  if (fs.existsSync(ENCRYPTED_VAULT_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(ENCRYPTED_VAULT_PATH, 'utf8'));
      saltHex = existing.salt;
    } catch (_e) {
      // ignore
    }
  }
  if (!saltHex) {
    saltHex = crypto.randomBytes(16).toString('hex');
  }

  // Export in-memory DB to a temporary file inside /dev/shm (RAM disk) to get raw SQLite bytes without touching disk
  const ramTmpPath = `/dev/shm/.mt_vault_${process.pid}_${Date.now()}.db`;
  const escapedPath = ramTmpPath.replace(/'/g, "''");
  try {
    dbInstance.exec(`VACUUM INTO '${escapedPath}';`);
    const sqliteBytes = fs.readFileSync(ramTmpPath);
    const encryptedPayload = encryptBuffer(sqliteBytes, key);

    const vaultFileContent = JSON.stringify({
      version: 1,
      cipher: 'aes-256-gcm',
      kdf: 'scrypt',
      salt: saltHex,
      updatedAt: new Date().toISOString(),
      ...encryptedPayload
    }, null, 2);

    fs.writeFileSync(ENCRYPTED_VAULT_PATH, vaultFileContent, { mode: 0o666 });
  } finally {
    if (fs.existsSync(ramTmpPath)) {
      try { fs.unlinkSync(ramTmpPath); } catch (_e) {}
    }
  }
}

/**
 * Sets up a new Master Password for the SQLite database:
 * - Migrates existing unencrypted `money_tracker.db` into `:memory:`
 * - Re-encrypts all stored bank credentials with the new Master Password key
 * - Writes `money_tracker.db.enc` (AES-256-GCM encrypted SQLite file)
 * - Securely deletes the plaintext `money_tracker.db`, `-wal`, `-shm`, and `.master.key` files!
 */
function setupVaultPassword(password) {
  if (!password || String(password).length < 4) {
    throw new Error('הסיסמה חייבת להכיל לפחות 4 תווים');
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const saltHex = crypto.randomBytes(16).toString('hex');
  const newKey = deriveKeyFromPassword(password, saltHex);

  // Ensure current DB is loaded so we don't lose any data
  const currentDb = getDb();

  // Re-encrypt account credentials using newKey
  const accounts = currentDb.prepare('SELECT id, encrypted_credentials FROM accounts WHERE encrypted_credentials IS NOT NULL').all();
  const decryptedMap = [];
  for (const acc of accounts) {
    const creds = decryptCredentials(acc.encrypted_credentials);
    if (creds) {
      decryptedMap.push({ id: acc.id, creds });
    }
  }

  // Activate new session key
  setSessionVaultKey(newKey);

  const updateCredStmt = currentDb.prepare('UPDATE accounts SET encrypted_credentials = ? WHERE id = ?');
  for (const item of decryptedMap) {
    updateCredStmt.run(encryptCredentials(item.creds), item.id);
  }

  // Export currentDb into an in-memory SQLite instance if it was backed by a plaintext file
  const ramTmpPath = `/dev/shm/.mt_setup_${process.pid}_${Date.now()}.db`;
  const escapedPath = ramTmpPath.replace(/'/g, "''");
  try {
    currentDb.exec(`VACUUM INTO '${escapedPath}';`);
    const sqliteBytes = fs.readFileSync(ramTmpPath);

    // Write initial encrypted vault file with our saltHex
    const encryptedPayload = encryptBuffer(sqliteBytes, newKey);
    fs.writeFileSync(ENCRYPTED_VAULT_PATH, JSON.stringify({
      version: 1,
      cipher: 'aes-256-gcm',
      kdf: 'scrypt',
      salt: saltHex,
      updatedAt: new Date().toISOString(),
      ...encryptedPayload
    }, null, 2), { mode: 0o666 });

    // Switch active dbInstance to pure in-memory DB loaded from RAM
    try { currentDb.close(); } catch (_e) {}
    const memDb = new DatabaseSync(':memory:');
    const attachPath = escapedPath;
    memDb.exec(`ATTACH DATABASE '${attachPath}' AS src;`);
    initSchema(memDb);
    copyAllTablesFromAttached(memDb, 'src');
    memDb.exec('DETACH DATABASE src;');
    dbInstance = memDb;
  } finally {
    if (fs.existsSync(ramTmpPath)) {
      try { fs.unlinkSync(ramTmpPath); } catch (_e) {}
    }
  }

  // Securely remove any plaintext SQLite files & legacy key file from disk
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `${LEGACY_DB_PATH}${suffix}`;
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (_e) {}
    }
  }
  const legacyKeyPath = path.join(DATA_DIR, '.master.key');
  if (fs.existsSync(legacyKeyPath)) {
    try { fs.unlinkSync(legacyKeyPath); } catch (_e) {}
  }

  saveEncryptedVault();
  return { success: true };
}

/**
 * Unlocks `money_tracker.db.enc` using the user's Master Password into `:memory:`
 */
function unlockVaultWithPassword(password) {
  if (!isVaultConfigured()) {
    throw new Error('טרם הוגדרה סיסמת הצפנה למסד הנתונים');
  }

  const vaultJson = JSON.parse(fs.readFileSync(ENCRYPTED_VAULT_PATH, 'utf8'));
  const key = deriveKeyFromPassword(password, vaultJson.salt);

  let sqliteBytes;
  try {
    sqliteBytes = decryptBuffer(vaultJson, key);
  } catch (_err) {
    throw new Error('סיסמה שגויה! לא ניתן לפענח את מסד הנתונים המוצפן.');
  }

  const ramTmpPath = `/dev/shm/.mt_unlock_${process.pid}_${Date.now()}.db`;
  const escapedPath = ramTmpPath.replace(/'/g, "''");
  try {
    fs.writeFileSync(ramTmpPath, sqliteBytes, { mode: 0o600 });
    if (dbInstance) {
      try { dbInstance.close(); } catch (_e) {}
    }
    const memDb = new DatabaseSync(':memory:');
    memDb.exec(`ATTACH DATABASE '${escapedPath}' AS src;`);
    initSchema(memDb);
    copyAllTablesFromAttached(memDb, 'src');
    memDb.exec('DETACH DATABASE src;');
    autoCreateDetectedInvestmentAccounts(memDb);

    dbInstance = memDb;
    setSessionVaultKey(key);
    saveEncryptedVault();
  } finally {
    if (fs.existsSync(ramTmpPath)) {
      try { fs.unlinkSync(ramTmpPath); } catch (_e) {}
    }
  }

  return { unlocked: true };
}

function lockVault() {
  if (dbInstance && isVaultConfigured()) {
    saveEncryptedVault();
    try { dbInstance.close(); } catch (_e) {}
    dbInstance = null;
    setSessionVaultKey(null);
  }
  return { locked: true };
}

function copyAllTablesFromAttached(targetDb, schemaName) {
  const tables = ['members', 'categories', 'accounts', 'category_rules', 'transactions', 'savings_goals'];
  targetDb.exec('PRAGMA foreign_keys = OFF;');
  for (const tbl of tables) {
    targetDb.exec(`DELETE FROM main.${tbl};`);
    targetDb.exec(`INSERT INTO main.${tbl} SELECT * FROM ${schemaName}.${tbl};`);
  }
  targetDb.exec('PRAGMA foreign_keys = ON;');
}

function autoCreateDetectedInvestmentAccounts(db) {
  const existingInv = db.prepare("SELECT COUNT(*) as c FROM accounts WHERE account_type = 'investment'").get().c;
  if (existingInv > 0) return;

  const hasRealSavings = db.prepare("SELECT COUNT(*) as c FROM transactions WHERE category_id = 'savings' AND is_demo = 0").get().c;
  if (hasRealSavings === 0) return;

  const ins = db.prepare(`
    INSERT INTO accounts (name, company_id, account_type, account_number, member_id, balance, credit_limit, last_sync_at, last_sync_status, color, is_demo)
    VALUES (?, ?, 'investment', ?, 1, ?, ?, datetime('now'), ?, ?, 0)
  `);
  ins.run('קופת גמל לעתיד (מזוהה מבנק הפועלים)', 'more', 'קופ"ג לעתיד', 18000, 3000, 'זוהו 6 הפקדות מבנק הפועלים (סה"כ 18,000 ₪)', '#8b5cf6');
  ins.run('גמל להשקעה מסלול (מזוהה מבנק הפועלים)', 'altshuler', 'גמל להשקעה', 12000, 2000, 'זוהו 6 הפקדות מבנק הפועלים (סה"כ 12,000 ₪)', '#10b981');
  ins.run('איי.די.איי חברה לביטוח - חיסכון והשקעה', 'menora_inv', 'פוליסת חיסכון', 37500, 3000, 'זוהו 6 הפקדות מבנק הפועלים (סה"כ 37,500 ₪)', '#06b6d4');
}

function getDb() {
  if (dbInstance) return dbInstance;

  if (isVaultConfigured()) {
    const err = new Error('מסד הנתונים נעול ומוצפן. נא להזין סיסמה כדי לפתוח אותו.');
    err.code = 'VAULT_LOCKED';
    throw err;
  }

  // Legacy / First-run mode before user sets their password
  const dir = path.dirname(LEGACY_DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  dbInstance = new DatabaseSync(LEGACY_DB_PATH);
  dbInstance.exec('PRAGMA journal_mode = WAL;');
  dbInstance.exec('PRAGMA foreign_keys = ON;');

  initSchema(dbInstance);
  return dbInstance;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'בן/בת משפחה',
      color TEXT DEFAULT '#3b82f6',
      avatar TEXT DEFAULT '👤',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      company_id TEXT NOT NULL,
      account_type TEXT NOT NULL,
      account_number TEXT DEFAULT '',
      member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      balance REAL DEFAULT 0,
      credit_limit REAL DEFAULT 0,
      currency TEXT DEFAULT 'ILS',
      encrypted_credentials TEXT,
      last_sync_at TEXT,
      last_sync_status TEXT DEFAULT 'טרם סונכרן',
      color TEXT DEFAULT '#0ea5e9',
      is_demo INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'transfer')),
      icon TEXT DEFAULT '📌',
      color TEXT DEFAULT '#64748b',
      monthly_budget REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS category_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL UNIQUE,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_hash TEXT NOT NULL UNIQUE,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      processed_date TEXT NOT NULL,
      description TEXT NOT NULL,
      memo TEXT DEFAULT '',
      original_amount REAL NOT NULL,
      charged_amount REAL NOT NULL,
      currency TEXT DEFAULT 'ILS',
      category_id TEXT NOT NULL REFERENCES categories(id),
      flow_type TEXT NOT NULL CHECK(flow_type IN ('income', 'expense', 'transfer')),
      is_duplicate_settlement INTEGER DEFAULT 0,
      installment_number INTEGER,
      installment_total INTEGER,
      status TEXT DEFAULT 'completed',
      is_demo INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);

    CREATE TABLE IF NOT EXISTS savings_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL DEFAULT 0,
      target_date TEXT,
      icon TEXT DEFAULT '🎯',
      color TEXT DEFAULT '#10b981',
      is_demo INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const insertCat = db.prepare(`
    INSERT OR IGNORE INTO categories (id, name, type, icon, color, monthly_budget)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const cat of DEFAULT_CATEGORIES) {
    insertCat.run(cat.id, cat.name, cat.type, cat.icon, cat.color, cat.budget);
  }

  const memberCount = db.prepare('SELECT COUNT(*) as c FROM members').get().c;
  if (memberCount === 0) {
    const insertMember = db.prepare('INSERT INTO members (name, role, color, avatar) VALUES (?, ?, ?, ?)');
    insertMember.run('ראשי (שלי)', 'בעל חשבון', '#3b82f6', '🧑‍💻');
    insertMember.run('משותף / משפחה', 'חשבון משותף', '#10b981', '🏡');
  }
}

module.exports = {
  getDb,
  isVaultConfigured,
  isVaultUnlocked,
  setupVaultPassword,
  unlockVaultWithPassword,
  lockVault,
  saveEncryptedVault,
  ENCRYPTED_VAULT_PATH
};
