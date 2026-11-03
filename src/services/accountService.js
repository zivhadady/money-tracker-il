const { getDb } = require('../db/database');
const { encryptCredentials } = require('./cryptoService');
const { SUPPORTED_PROVIDERS, syncAccountWithScraper } = require('./scraperService');

function getMeta() {
  const db = getDb();
  const members = db.prepare('SELECT * FROM members ORDER BY id ASC').all();
  const categories = db.prepare('SELECT * FROM categories ORDER BY type ASC, name ASC').all();
  const accounts = db.prepare(`
    SELECT a.id, a.name, a.company_id, a.account_type, a.account_number,
           a.member_id, m.name as member_name, m.avatar as member_avatar, m.color as member_color,
           a.balance, a.credit_limit, a.currency, a.last_sync_at, a.last_sync_status,
           a.color, a.is_demo,
           CASE WHEN a.encrypted_credentials IS NOT NULL AND a.encrypted_credentials != '' THEN 1 ELSE 0 END as has_credentials
    FROM accounts a
    LEFT JOIN members m ON m.id = a.member_id
    ORDER BY a.account_type ASC, a.id ASC
  `).all();

  const availableMonthsRows = db.prepare(`
    SELECT DISTINCT substr(date, 1, 7) as ym
    FROM transactions
    ORDER BY ym DESC
  `).all();

  const currentYm = new Date().toISOString().slice(0, 7);
  const monthsSet = new Set(availableMonthsRows.map(r => r.ym));
  monthsSet.add(currentYm);
  const availableMonths = Array.from(monthsSet).sort().reverse();

  const rules = db.prepare(`
    SELECT r.*, c.name as category_name, c.icon as category_icon
    FROM category_rules r
    LEFT JOIN categories c ON c.id = r.category_id
    ORDER BY r.id DESC
  `).all();

  return {
    providers: SUPPORTED_PROVIDERS,
    members,
    categories,
    accounts,
    availableMonths,
    rules
  };
}

function createAccount(data) {
  const db = getDb();
  const provider = SUPPORTED_PROVIDERS.find(p => p.id === data.companyId) || {
    id: data.companyId || 'custom',
    type: data.accountType || 'bank',
    color: '#3b82f6'
  };

  const name = String(data.name || provider.name).trim();
  const accountNumber = String(data.accountNumber || '').trim();
  const memberId = data.memberId ? Number(data.memberId) : null;
  const balance = Number(data.balance || 0);
  const creditLimit = Number(data.creditLimit || 0);
  const encrypted = data.credentials && Object.keys(data.credentials).length > 0
    ? encryptCredentials(data.credentials)
    : null;

  const info = db.prepare(`
    INSERT INTO accounts (
      name, company_id, account_type, account_number, member_id,
      balance, credit_limit, encrypted_credentials, color, is_demo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    name,
    provider.id,
    data.accountType || provider.type,
    accountNumber,
    memberId,
    balance,
    creditLimit,
    encrypted,
    data.color || provider.color
  );

  return {
    id: info.lastInsertRowid,
    message: `החשבון "${name}" נוסף בהצלחה (פרטי ההתחברות הוצפנו ב-AES-256)`
  };
}

function updateAccount(accId, data) {
  const db = getDb();
  db.prepare(`
    UPDATE accounts
    SET balance = COALESCE(?, balance),
        credit_limit = COALESCE(?, credit_limit),
        name = COALESCE(?, name),
        last_sync_at = datetime('now'),
        last_sync_status = 'יתרה/צבירה עודכנה'
    WHERE id = ?
  `).run(
    data.balance !== undefined ? Number(data.balance) : null,
    data.creditLimit !== undefined ? Number(data.creditLimit) : null,
    data.name || null,
    accId
  );
  return { updated: true, message: 'יתרת הקופה / החשבון עודכנה בהצלחה!' };
}

function deleteAccount(accId) {
  const db = getDb();
  db.prepare('DELETE FROM accounts WHERE id = ?').run(accId);
  return { deleted: true, message: 'החשבון וכל תנועותיו נמחקו' };
}

async function syncAccounts({ accountId, monthsBack = 6, showBrowser = false } = {}) {
  const db = getDb();
  const targetId = accountId ? Number(accountId) : null;
  const accounts = targetId
    ? db.prepare('SELECT * FROM accounts WHERE id = ?').all(targetId)
    : db.prepare('SELECT * FROM accounts').all();

  const results = [];
  for (const acc of accounts) {
    try {
      const resSync = await syncAccountWithScraper(acc.id, {
        monthsBack: Number(monthsBack || 6),
        showBrowser: Boolean(showBrowser)
      });
      results.push(resSync);
    } catch (err) {
      results.push({
        success: false,
        accountId: acc.id,
        accountName: acc.name,
        message: err.message
      });
    }
  }

  return { results };
}

module.exports = {
  getMeta,
  createAccount,
  updateAccount,
  deleteAccount,
  syncAccounts
};
