const { getDb } = require('../db/database');
const { generateTransactionHash } = require('./cryptoService');
const { classifyTransaction } = require('./categorizerService');

function listTransactions({ month = '', accountId = '', memberId = '', categoryId = '', flowType = '', search = '', limit = 500 } = {}) {
  const db = getDb();
  const safeLimit = Math.min(Number(limit) || 500, 2000);

  const clauses = ['1=1'];
  const params = [];

  if (month && month !== 'all') {
    if (month === 'last3') {
      const d = new Date();
      d.setMonth(d.getMonth() - 2);
      clauses.push('substr(t.date, 1, 7) >= ?');
      params.push(d.toISOString().slice(0, 7));
    } else if (month === 'last6') {
      const d = new Date();
      d.setMonth(d.getMonth() - 5);
      clauses.push('substr(t.date, 1, 7) >= ?');
      params.push(d.toISOString().slice(0, 7));
    } else {
      clauses.push('substr(t.date, 1, 7) = ?');
      params.push(month);
    }
  }
  if (accountId) {
    clauses.push('t.account_id = ?');
    params.push(Number(accountId));
  }
  if (memberId) {
    clauses.push('a.member_id = ?');
    params.push(Number(memberId));
  }
  if (categoryId) {
    clauses.push('t.category_id = ?');
    params.push(categoryId);
  }
  if (flowType) {
    clauses.push('t.flow_type = ?');
    params.push(flowType);
  }
  if (search) {
    clauses.push('(t.description LIKE ? OR t.memo LIKE ? OR a.name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const transactions = db.prepare(`
    SELECT
      t.*,
      a.name as account_name,
      a.account_type,
      a.company_id,
      a.color as account_color,
      m.name as member_name,
      m.avatar as member_avatar,
      c.name as category_name,
      c.icon as category_icon,
      c.color as category_color
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN members m ON m.id = a.member_id
    JOIN categories c ON c.id = t.category_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY t.date DESC, t.id DESC
    LIMIT ?
  `).all(...params, safeLimit);

  return { transactions };
}

function createTransaction(data) {
  const db = getDb();
  const accountId = Number(data.accountId);
  const date = (data.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const description = String(data.description || '').trim();
  const memo = String(data.memo || '').trim();
  const rawAmount = Number(data.amount);
  const isIncome = data.flowType === 'income';

  if (!accountId || !description || !Number.isFinite(rawAmount) || rawAmount === 0) {
    const error = new Error('נא למלא חשבון, תיאור וסכום תקין');
    error.statusCode = 400;
    throw error;
  }

  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) {
    const error = new Error('חשבון לא נמצא');
    error.statusCode = 404;
    throw error;
  }

  const chargedAmount = isIncome ? Math.abs(rawAmount) : -Math.abs(rawAmount);
  const customRules = db.prepare('SELECT pattern, category_id FROM category_rules').all();

  let categoryId = data.categoryId;
  let flowType = isIncome ? 'income' : 'expense';
  let isDuplicateSettlement = 0;

  if (!categoryId) {
    const cls = classifyTransaction({
      accountType: account.account_type,
      description,
      chargedAmount,
      customRules
    });
    categoryId = cls.categoryId;
    flowType = cls.flowType;
    isDuplicateSettlement = cls.isDuplicateSettlement;
  } else if (categoryId === 'cc_settlement') {
    flowType = 'transfer';
    isDuplicateSettlement = 1;
  }

  const hash = generateTransactionHash(accountId, date, description, chargedAmount, chargedAmount, `${memo}|${Date.now()}`);
  const info = db.prepare(`
    INSERT INTO transactions (
      tx_hash, account_id, date, processed_date, description, memo,
      original_amount, charged_amount, currency, category_id, flow_type,
      is_duplicate_settlement, status, is_demo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ILS', ?, ?, ?, 'completed', 0)
  `).run(
    hash,
    accountId,
    date,
    date,
    description,
    memo,
    chargedAmount,
    chargedAmount,
    categoryId,
    flowType,
    isDuplicateSettlement
  );

  return { id: info.lastInsertRowid, message: 'התנועה נוספה בהצלחה' };
}

function updateTransactionCategory(txId, { categoryId, memo, applyRuleToMerchant }) {
  const db = getDb();
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId);
  if (!tx) {
    const error = new Error('תנועה לא נמצאה');
    error.statusCode = 404;
    throw error;
  }

  const newCategoryId = categoryId || tx.category_id;
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(newCategoryId);
  if (!cat) {
    const error = new Error('קטגוריה לא חוקית');
    error.statusCode = 400;
    throw error;
  }

  const flowType = newCategoryId === 'cc_settlement'
    ? 'transfer'
    : (cat.type === 'transfer' ? 'transfer' : (tx.charged_amount > 0 ? 'income' : 'expense'));
  const isDuplicate = flowType === 'transfer' ? 1 : 0;

  db.prepare(`
    UPDATE transactions
    SET category_id = ?, flow_type = ?, is_duplicate_settlement = ?, memo = COALESCE(?, memo)
    WHERE id = ?
  `).run(newCategoryId, flowType, isDuplicate, memo !== undefined ? memo : null, txId);

  let updatedSimilar = 0;
  if (applyRuleToMerchant && tx.description) {
    const pattern = tx.description.trim();
    db.prepare(`
      INSERT INTO category_rules (pattern, category_id)
      VALUES (?, ?)
      ON CONFLICT(pattern) DO UPDATE SET category_id = excluded.category_id
    `).run(pattern, newCategoryId);

    const resSimilar = db.prepare(`
      UPDATE transactions
      SET category_id = ?, flow_type = ?, is_duplicate_settlement = ?
      WHERE LOWER(description) LIKE LOWER(?)
    `).run(newCategoryId, flowType, isDuplicate, `%${pattern}%`);
    updatedSimilar = resSimilar.changes;
  }

  return {
    updated: true,
    updatedSimilar,
    message: applyRuleToMerchant
      ? `הקטגוריה עודכנה ונוצר חוק אוטומטי (${updatedSimilar} תנועות סווגו)`
      : 'הקטגוריה עודכנה בהצלחה'
  };
}

function deleteTransaction(txId) {
  const db = getDb();
  db.prepare('DELETE FROM transactions WHERE id = ?').run(txId);
  return { deleted: true };
}

module.exports = {
  listTransactions,
  createTransaction,
  updateTransactionCategory,
  deleteTransaction
};
