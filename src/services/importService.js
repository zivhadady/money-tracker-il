const { getDb, saveEncryptedVault } = require('../db/database');
const { generateTransactionHash } = require('./cryptoService');
const { classifyTransaction } = require('./categorizerService');

// Common Hebrew/English headers in Israeli bank & credit card CSV exports
const DATE_HEADERS = ['תאריך עסקה', 'תאריך', 'תאריך ערך', 'date', 'transaction date'];
const PROCESSED_DATE_HEADERS = ['תאריך חיוב', 'תאריך מאזן', 'processed date', 'billing date'];
const DESC_HEADERS = ['שם בית העסק', 'שם בית עסק', 'תיאור', 'פעולה', 'פרטים', 'description', 'merchant'];
const CHARGED_AMOUNT_HEADERS = ['סכום חיוב', 'סכום בש"ח', 'סכום', 'חובה/זכות', 'amount', 'charged amount'];
const DEBIT_HEADERS = ['חובה', 'סכום חובה', 'debit'];
const CREDIT_HEADERS = ['זכות', 'סכום זכות', 'credit'];
const MEMO_HEADERS = ['הערות', 'פירוט נוסף', 'אסמכתא', 'סוג עסקה', 'memo', 'notes'];

function parseCsvLine(line, delimiter = ',') {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeDateString(rawDate) {
  if (!rawDate) return null;
  const cleaned = String(rawDate).replace(/['"]/g, '').trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    return cleaned.slice(0, 10);
  }

  // DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY or DD/MM/YY
  const match = cleaned.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (match) {
    const day = String(match[1]).padStart(2, '0');
    const month = String(match[2]).padStart(2, '0');
    let year = match[3];
    if (year.length === 2) {
      year = Number(year) > 70 ? `19${year}` : `20${year}`;
    }
    if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) {
      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

function parseCleanNumber(val) {
  if (val === undefined || val === null || val === '') return null;
  const str = String(val)
    .replace(/[₪$€£,\s'"]/g, '')
    .replace(/\(([\d.]+)\)/, '-$1'); // handle (123.45) negative format
  // Handle trailing minus like "123.45-" common in Israeli bank exports
  const trailingMinus = str.match(/^([\d.]+)-$/);
  const normalized = trailingMinus ? `-${trailingMinus[1]}` : str;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function findColumnIndex(headers, candidates) {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim();
    for (const c of candidates) {
      if (h === c.toLowerCase() || h.includes(c.toLowerCase())) {
        return i;
      }
    }
  }
  return -1;
}

function parseAndImportStatement({ accountId, content, defaultIsExpenseForCreditCard = true }) {
  const db = getDb();
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) {
    throw new Error('חשבון לא נמצא במערכת');
  }

  const lines = content
    .replace(/^\uFEFF/, '') // Strip BOM
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error('הקובץ ריק או לא מכיל שורות נתונים');
  }

  // Detect delimiter (comma, tab, or semicolon)
  const sample = lines.slice(0, 10).join('\n');
  let delimiter = ',';
  if ((sample.match(/\t/g) || []).length > (sample.match(/,/g) || []).length) {
    delimiter = '\t';
  } else if ((sample.match(/;/g) || []).length > (sample.match(/,/g) || []).length) {
    delimiter = ';';
  }

  // Locate header row (many Israeli bank files have 3-8 metadata lines at top before actual table header)
  let headerRowIdx = 0;
  let headers = [];
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const cols = parseCsvLine(lines[i], delimiter);
    const hasDate = findColumnIndex(cols, DATE_HEADERS) !== -1;
    const hasDesc = findColumnIndex(cols, DESC_HEADERS) !== -1;
    if (hasDate && hasDesc) {
      headerRowIdx = i;
      headers = cols;
      break;
    }
  }

  if (headers.length === 0) {
    headers = parseCsvLine(lines[0], delimiter);
    headerRowIdx = 0;
  }

  const dateIdx = findColumnIndex(headers, DATE_HEADERS);
  const procDateIdx = findColumnIndex(headers, PROCESSED_DATE_HEADERS);
  const descIdx = findColumnIndex(headers, DESC_HEADERS);
  const amountIdx = findColumnIndex(headers, CHARGED_AMOUNT_HEADERS);
  const debitIdx = findColumnIndex(headers, DEBIT_HEADERS);
  const creditIdx = findColumnIndex(headers, CREDIT_HEADERS);
  const memoIdx = findColumnIndex(headers, MEMO_HEADERS);

  const customRules = db.prepare('SELECT pattern, category_id FROM category_rules').all();
  const insertTx = db.prepare(`
    INSERT OR IGNORE INTO transactions (
      tx_hash, account_id, date, processed_date, description, memo,
      original_amount, charged_amount, currency, category_id, flow_type,
      is_duplicate_settlement, status, is_demo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ILS', ?, ?, ?, 'completed', 0)
  `);

  let importedCount = 0;
  let skippedDuplicates = 0;

  for (let i = headerRowIdx + 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delimiter);
    if (cols.length < 2) continue;

    const rawDate = dateIdx !== -1 ? cols[dateIdx] : cols[0];
    const txDate = normalizeDateString(rawDate);
    if (!txDate) continue;

    const procDate = (procDateIdx !== -1 && normalizeDateString(cols[procDateIdx])) || txDate;
    const description = (descIdx !== -1 ? cols[descIdx] : cols[1] || '').trim();
    if (!description) continue;

    let chargedAmount = null;
    if (debitIdx !== -1 && creditIdx !== -1) {
      const debit = parseCleanNumber(cols[debitIdx]) || 0;
      const credit = parseCleanNumber(cols[creditIdx]) || 0;
      if (debit > 0 && credit === 0) chargedAmount = -Math.abs(debit);
      else if (credit > 0 && debit === 0) chargedAmount = Math.abs(credit);
      else chargedAmount = credit - debit;
    } else if (amountIdx !== -1) {
      chargedAmount = parseCleanNumber(cols[amountIdx]);
    } else if (cols.length >= 3) {
      chargedAmount = parseCleanNumber(cols[2]);
    }

    if (chargedAmount === null || chargedAmount === 0) continue;

    // In Israeli credit card CSVs (Max, Isracard, Cal), expenses are often listed as positive numbers!
    // If account_type is credit_card and defaultIsExpenseForCreditCard is true, flip positive charges to negative expenses
    // unless description clearly indicates "זיכוי" or "החזר"
    if (account.account_type === 'credit_card' && defaultIsExpenseForCreditCard) {
      const isRefund = description.includes('זיכוי') || description.includes('החזר') || description.includes('ביטול');
      if (chargedAmount > 0 && !isRefund) {
        chargedAmount = -Math.abs(chargedAmount);
      } else if (chargedAmount < 0 && isRefund) {
        chargedAmount = Math.abs(chargedAmount);
      }
    }

    const memo = memoIdx !== -1 ? (cols[memoIdx] || '') : '';
    const classification = classifyTransaction({
      accountType: account.account_type,
      description,
      chargedAmount,
      customRules
    });

    const hash = generateTransactionHash(accountId, txDate, description, chargedAmount, chargedAmount, memo);
    const res = insertTx.run(
      hash,
      accountId,
      txDate,
      procDate,
      description,
      memo,
      chargedAmount,
      chargedAmount,
      classification.categoryId,
      classification.flowType,
      classification.isDuplicateSettlement
    );

    if (res.changes > 0) {
      importedCount++;
    } else {
      skippedDuplicates++;
    }
  }

  db.prepare(`
    UPDATE accounts
    SET last_sync_at = datetime('now'),
        last_sync_status = ?
    WHERE id = ?
  `).run(`יובאו ${importedCount} תנועות מקובץ`, accountId);

  saveEncryptedVault();

  return {
    importedCount,
    skippedDuplicates
  };
}

module.exports = {
  parseAndImportStatement
};
