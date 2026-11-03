const { getDb, saveEncryptedVault } = require('../db/database');
const { decryptCredentials, generateTransactionHash } = require('./cryptoService');
const { classifyTransaction } = require('./categorizerService');
const { otpCoordinator } = require('./otpCoordinator');
const { syncGovPortalAccount } = require('./govScraperService');
const { fetchOfficialFundMetrics } = require('./gemelNetApiService');

// Supported Israeli Banks & Credit Card Providers metadata (compatible with israeli-bank-scrapers)
const SUPPORTED_PROVIDERS = [
  // Banks
  {
    id: 'hapoalim',
    name: 'בנק הפועלים',
    type: 'bank',
    color: '#ef4444',
    fields: [
      { key: 'userCode', label: 'קוד משתמש', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' }
    ]
  },
  {
    id: 'leumi',
    name: 'בנק לאומי / פפר (Pepper)',
    type: 'bank',
    color: '#3b82f6',
    fields: [
      { key: 'username', label: 'שם משתמש', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' }
    ]
  },
  {
    id: 'pepper',
    name: 'פפר (Pepper - מבית בנק לאומי)',
    type: 'bank',
    color: '#ec4899',
    fields: [
      { key: 'username', label: 'שם משתמש (זהה ללאומי / פפר)', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' }
    ]
  },
  {
    id: 'discount',
    name: 'בנק דיסקונט',
    type: 'bank',
    color: '#10b981',
    fields: [
      { key: 'id', label: 'תעודת זהות', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' },
      { key: 'num', label: 'קוד מזהה', type: 'text' }
    ]
  },
  {
    id: 'mizrahi',
    name: 'בנק מזרחי-טפחות',
    type: 'bank',
    color: '#f97316',
    fields: [
      { key: 'username', label: 'שם משתמש', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' }
    ]
  },
  {
    id: 'beinleumi',
    name: 'הבנק הבינלאומי (FIBI)',
    type: 'bank',
    color: '#eab308',
    fields: [
      { key: 'username', label: 'שם משתמש', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' }
    ]
  },
  {
    id: 'otsarHahayal',
    name: 'בנק אוצר החייל',
    type: 'bank',
    color: '#06b6d4',
    fields: [
      { key: 'username', label: 'שם משתמש', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' }
    ]
  },
  {
    id: 'yahav',
    name: 'בנק יהב',
    type: 'bank',
    color: '#14b8a6',
    fields: [
      { key: 'username', label: 'שם משתמש', type: 'text' },
      { key: 'nationalID', label: 'תעודת זהות', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' }
    ]
  },
  {
    id: 'oneZero',
    name: 'בנק וואן זירו (One Zero)',
    type: 'bank',
    color: '#18181b',
    fields: [
      { key: 'email', label: 'אימייל', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' },
      { key: 'phoneNumber', label: 'טלפון (ל-OTP)', type: 'text' }
    ]
  },
  // Credit Cards
  {
    id: 'max',
    name: 'מקס (Max)',
    type: 'credit_card',
    color: '#8b5cf6',
    fields: [
      { key: 'username', label: 'שם משתמש / ת.ז', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' }
    ]
  },
  {
    id: 'isracard',
    name: 'ישראכרט (Isracard)',
    type: 'credit_card',
    color: '#0ea5e9',
    fields: [
      { key: 'id', label: 'תעודת זהות', type: 'text' },
      { key: 'card6Digits', label: '6 ספרות אחרונות של הכרטיס', type: 'text' },
      { key: 'password', label: 'סיסמה / קוד קבוע', type: 'password' }
    ]
  },
  {
    id: 'cal',
    name: 'כאל (Cal)',
    type: 'credit_card',
    color: '#f59e0b',
    fields: [
      { key: 'username', label: 'שם משתמש', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' }
    ]
  },
  {
    id: 'amex',
    name: 'אמריקן אקספרס (Amex)',
    type: 'credit_card',
    color: '#6366f1',
    fields: [
      { key: 'id', label: 'תעודת זהות', type: 'text' },
      { key: 'card6Digits', label: '6 ספרות אחרונות של הכרטיס', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' }
    ]
  },
  {
    id: 'behatsdaa',
    name: 'מועדון בהצדעה (Behatsdaa)',
    type: 'credit_card',
    color: '#0d9488',
    fields: [
      { key: 'id', label: 'תעודת זהות', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' }
    ]
  },
  {
    id: 'beyahadBishvilha',
    name: 'ביחד בשבילך (הסתדרות)',
    type: 'credit_card',
    color: '#2563eb',
    fields: [
      { key: 'id', label: 'תעודת זהות', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' }
    ]
  },
  // Investment Houses, Provident Funds & Trading Platforms (קופות גמל, קרנות השתלמות ותוכניות מסחר)
  {
    id: 'altshuler',
    name: 'אלטשולר שחם (קופות גמל, השתלמות וטרייד)',
    type: 'investment',
    color: '#10b981',
    fields: [
      { key: 'id', label: 'תעודת זהות', type: 'text' },
      { key: 'phoneOrEmail', label: 'טלפון נייד / אימייל (ל-OTP)', type: 'text' }
    ]
  },
  {
    id: 'meitav',
    name: 'מיטב דש / מיטב טרייד (גמל, פנסיה ומסחר עצמאי)',
    type: 'investment',
    color: '#06b6d4',
    fields: [
      { key: 'username', label: 'תעודת זהות / שם משתמש', type: 'text' },
      { key: 'password', label: 'סיסמה (אם קיימת)', type: 'password' }
    ]
  },
  {
    id: 'more',
    name: 'מור בית השקעות (קופות גמל וקרנות השתלמות)',
    type: 'investment',
    color: '#8b5cf6',
    fields: [
      { key: 'id', label: 'תעודת זהות', type: 'text' },
      { key: 'phone', label: 'טלפון נייד (ל-OTP)', type: 'text' }
    ]
  },
  {
    id: 'yelin',
    name: 'ילין לפידות (קופות גמל וניהול תיקים)',
    type: 'investment',
    color: '#3b82f6',
    fields: [
      { key: 'id', label: 'תעודת זהות', type: 'text' },
      { key: 'phone', label: 'טלפון נייד (ל-OTP)', type: 'text' }
    ]
  },
  {
    id: 'analyst',
    name: 'אנליסט בית השקעות (גמל והשתלמות)',
    type: 'investment',
    color: '#ec4899',
    fields: [
      { key: 'id', label: 'תעודת זהות', type: 'text' },
      { key: 'phone', label: 'טלפון נייד (ל-OTP)', type: 'text' }
    ]
  },
  {
    id: 'ibi',
    name: 'אי.בי.אי (IBI Smart / גמל ומסחר עצמאי)',
    type: 'investment',
    color: '#14b8a6',
    fields: [
      { key: 'username', label: 'שם משתמש / ת.ז', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' }
    ]
  },
  {
    id: 'excellence',
    name: 'אקסלנס טרייד / הפניקס (גמל, השתלמות ומסחר)',
    type: 'investment',
    color: '#f97316',
    fields: [
      { key: 'username', label: 'שם משתמש / ת.ז', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' }
    ]
  },
  {
    id: 'psagot',
    name: 'פסגות בית השקעות (גמל ומסחר)',
    type: 'investment',
    color: '#0ea5e9',
    fields: [
      { key: 'id', label: 'תעודת זהות', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' }
    ]
  },
  {
    id: 'harel_inv',
    name: 'הראל פיננסים וביטוח (גמל, השתלמות וחיסכון)',
    type: 'investment',
    color: '#2563eb',
    fields: [
      { key: 'id', label: 'תעודת זהות', type: 'text' },
      { key: 'phone', label: 'טלפון נייד (ל-OTP)', type: 'text' }
    ]
  },
  {
    id: 'menora_inv',
    name: 'מנורה מבטחים (פנסיה, גמל וחיסכון)',
    type: 'investment',
    color: '#eab308',
    fields: [
      { key: 'id', label: 'תעודת זהות', type: 'text' },
      { key: 'phone', label: 'טלפון נייד (ל-OTP)', type: 'text' }
    ]
  },
  {
    id: 'migdal_inv',
    name: 'מגדל (קופות גמל, פנסיה וחיסכון)',
    type: 'investment',
    color: '#6366f1',
    fields: [
      { key: 'id', label: 'תעודת זהות', type: 'text' },
      { key: 'phone', label: 'טלפון נייד (ל-OTP)', type: 'text' }
    ]
  },
  {
    id: 'blink',
    name: 'בלינק (Blink) - אפליקציית מסחר והשקעות',
    type: 'investment',
    color: '#a855f7',
    fields: [
      { key: 'phone', label: 'טלפון נייד', type: 'text' }
    ]
  },
  {
    id: 'ibkr',
    name: 'אינטראקטיב ברוקרס (Interactive Brokers / IBKR)',
    type: 'investment',
    color: '#dc2626',
    fields: [
      { key: 'username', label: 'שם משתמש (IBKR)', type: 'text' }
    ]
  },
  {
    id: 'har_habituach',
    name: 'הר הביטוח - רשות שוק ההון (שאיבה אוטומטית דרך הזדהות לאומית Gov.il)',
    type: 'investment',
    color: '#0284c7',
    fields: [
      { key: 'id', label: 'מספר תעודת זהות (9 ספרות)', type: 'text' },
      { key: 'password', label: 'סיסמה למערכת ההזדהות הלאומית (Gov.il)', type: 'password' }
    ]
  },
  {
    id: 'har_hakesef',
    name: 'הר הכסף - משרד האוצר (שאיבת קופות גמל ופנסיה דרך הזדהות לאומית Gov.il)',
    type: 'investment',
    color: '#059669',
    fields: [
      { key: 'id', label: 'מספר תעודת זהות (9 ספרות)', type: 'text' },
      { key: 'password', label: 'סיסמה למערכת ההזדהות הלאומית (Gov.il)', type: 'password' }
    ]
  },
  {
    id: 'cash',
    name: 'מזומן / ארנק ביט / ידני',
    type: 'cash',
    color: '#64748b',
    fields: []
  }
];

async function syncAccountWithScraper(accountId, options = {}) {
  const db = getDb();
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) {
    throw new Error('חשבון לא נמצא');
  }

  // If it's a demo account, simulate realistic refresh and update timestamp
  if (account.is_demo) {
    db.prepare(`
      UPDATE accounts
      SET last_sync_at = datetime('now'),
          last_sync_status = 'סונכרן אוטומטית בהצלחה'
      WHERE id = ?
    `).run(accountId);
    return {
      success: true,
      accountId,
      accountName: account.name,
      newTransactions: 0,
      message: `החשבון "${account.name}" סונכרן בהצלחה (חשבון הדגמה)`
    };
  }

  // Handle Har HaBituach & Har HaKesef via Gov.il National SSO Scraper!
  if (account.company_id === 'har_habituach' || account.company_id === 'har_hakesef') {
    const credentials = decryptCredentials(account.encrypted_credentials);
    if (!credentials || (!credentials.id && !credentials.username) || !credentials.password) {
      throw new Error('נא להזין תעודת זהות וסיסמה של מערכת ההזדהות הלאומית (Gov.il) עבור הר הביטוח / הר הכסף');
    }
    return syncGovPortalAccount({ account, credentials });
  }

  // Sync Investment / Provident Funds against Official Ministry of Finance GemelNet API (data.gov.il) + Linked Bank Deposits!
  if (account.account_type === 'investment') {
    const linkedSavingsRow = db.prepare(`
      SELECT COALESCE(SUM(ABS(charged_amount)), 0) as total_deposited, COUNT(*) as cnt
      FROM transactions
      WHERE category_id = 'savings' AND is_demo = 0
        AND (LOWER(description) LIKE LOWER(?) OR LOWER(memo) LIKE LOWER(?))
    `).get(`%${account.name.split(' ')[0]}%`, `%${account.name.split(' ')[0]}%`);

    let apiMetrics = null;
    try {
      const searchHint = account.name
        .replace(/\(מזוהה.*?\)/g, '')
        .replace(/[-–]/g, ' ')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .join(' ');
      apiMetrics = await fetchOfficialFundMetrics({
        fundId: account.account_number,
        searchName: searchHint
      });
    } catch (_err) {
      // ignore API network errors and fallback to local deposit sync
    }

    let statusText = linkedSavingsRow && linkedSavingsRow.cnt > 0
      ? `מעודכן (${linkedSavingsRow.cnt} הפקדות מהבנק)`
      : 'פעיל';

    if (apiMetrics) {
      statusText = `API גמל-נט (#${apiMetrics.fundId}): תשואה שנתית ${apiMetrics.ytdYield}% | 3 שנים: ${apiMetrics.yield3Yrs}% | דמי ניהול: ${apiMetrics.avgManagementFee}%`;
      if (!account.account_number || !/^\d+$/.test(account.account_number)) {
        db.prepare('UPDATE accounts SET account_number = ? WHERE id = ?').run(String(apiMetrics.fundId), accountId);
      }
    }

    db.prepare(`
      UPDATE accounts
      SET last_sync_at = datetime('now'),
          last_sync_status = ?
      WHERE id = ?
    `).run(statusText, accountId);

    saveEncryptedVault();
    return {
      success: true,
      accountId,
      accountName: account.name,
      newTransactions: 0,
      apiMetrics,
      message: apiMetrics
        ? `חובר בהצלחה ל-API גמל-נט של משרד האוצר! (${apiMetrics.fundName} - תשואה: ${apiMetrics.ytdYield}%)`
        : `תיק השקעות / קופת גמל "${account.name}" עודכן בהצלחה!`
    };
  }

  const credentials = decryptCredentials(account.encrypted_credentials);
  if (!credentials || Object.keys(credentials).length === 0) {
    throw new Error('לא הוגדרו פרטי התחברות לחשבון זה. ניתן לערוך את החשבון או לייבא קובץ אקסל/CSV.');
  }

  // Attempt to load israeli-bank-scrapers if installed in node_modules
  let createScraper = null;
  try {
    const scrapers = require('israeli-bank-scrapers');
    createScraper = scrapers.createScraper;
  } catch (_e) {
    // Package not yet installed locally
  }

  if (!createScraper) {
    db.prepare(`
      UPDATE accounts
      SET last_sync_status = 'ממתין להתקנת רכיב דפדפן או ייבוא CSV'
      WHERE id = ?
    `).run(accountId);

    return {
      success: false,
      requiresBrowserSetup: true,
      accountId,
      accountName: account.name,
      message: 'פרטי ההתחברות שמורים ומוצפנים (AES-256). בסביבה זו ניתן לייבא קובץ תנועות (CSV/Excel) בלחיצה אחת או להריץ את ה-Scraper מול כרום מקומי.'
    };
  }

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - (options.monthsBack || 12));

  const path = require('node:path');
  const fs = require('node:fs');
  const profileDir = path.join(__dirname, `../../data/browser_profiles/acc_${accountId}`);
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  const showBrowser = Boolean(options.showBrowser);
  const browserArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    `--user-data-dir=${profileDir}`
  ];

  db.prepare('UPDATE accounts SET last_sync_status = ? WHERE id = ?')
    .run('מושך יתרות ותנועות מהמוסד הפיננסי...', accountId);

  const scraperCompanyId = account.company_id === 'pepper' ? 'leumi' : account.company_id;
  const scraper = createScraper({
    companyId: scraperCompanyId,
    startDate,
    combineInstallments: false,
    showBrowser,
    timeout: 180000,
    defaultTimeout: 180000,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: browserArgs,
    onOtpRequest: async (promptText) => {
      db.prepare('UPDATE accounts SET last_sync_status = ? WHERE id = ?')
        .run('ממתין להזנת קוד SMS (OTP) בחלון שקפץ באתר...', accountId);
      const code = await otpCoordinator.requestOtp({
        accountId,
        accountName: account.name,
        companyId: account.company_id,
        promptText
      });
      db.prepare('UPDATE accounts SET last_sync_status = ? WHERE id = ?')
        .run('מאמת קוד SMS ומושך תנועות...', accountId);
      return code;
    }
  });

  const scrapeResult = await scraper.scrape(credentials);
  if (!scrapeResult.success) {
    const errMsg = scrapeResult.errorMessage || scrapeResult.errorType || 'שגיאת התחברות למוסד הפיננסי';
    db.prepare('UPDATE accounts SET last_sync_status = ? WHERE id = ?').run(`שגיאה: ${errMsg}`, accountId);
    throw new Error(errMsg);
  }

  const customRules = db.prepare('SELECT pattern, category_id FROM category_rules').all();
  const insertTx = db.prepare(`
    INSERT OR IGNORE INTO transactions (
      tx_hash, account_id, date, processed_date, description, memo,
      original_amount, charged_amount, currency, category_id, flow_type,
      is_duplicate_settlement, installment_number, installment_total, status, is_demo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

  let newTxCount = 0;
  for (const scrapedAcc of scrapeResult.accounts || []) {
    if (typeof scrapedAcc.balance === 'number') {
      db.prepare("UPDATE accounts SET balance = ?, account_number = COALESCE(NULLIF(account_number, ''), ?) WHERE id = ?")
        .run(scrapedAcc.balance, scrapedAcc.accountNumber || '', accountId);
    }

    for (const txn of scrapedAcc.txns || []) {
      const txDate = (txn.date || '').slice(0, 10);
      const procDate = (txn.processedDate || txn.date || '').slice(0, 10);
      const chargedAmount = Number(txn.chargedAmount ?? txn.originalAmount ?? 0);
      const originalAmount = Number(txn.originalAmount ?? chargedAmount);
      const description = txn.description || 'תנועה ללא תיאור';
      const memo = txn.memo || '';

      const classification = classifyTransaction({
        accountType: account.account_type,
        description,
        chargedAmount,
        customRules
      });

      const hash = generateTransactionHash(accountId, txDate, description, chargedAmount, originalAmount, memo);
      const res = insertTx.run(
        hash,
        accountId,
        txDate,
        procDate,
        description,
        memo,
        originalAmount,
        chargedAmount,
        txn.originalCurrency || 'ILS',
        classification.categoryId,
        classification.flowType,
        classification.isDuplicateSettlement,
        txn.installments ? txn.installments.number : null,
        txn.installments ? txn.installments.total : null,
        txn.status || 'completed'
      );
      newTxCount += res.changes;
    }
  }

  db.prepare(`
    UPDATE accounts
    SET last_sync_at = datetime('now'),
        last_sync_status = ?
    WHERE id = ?
  `).run(`סונכרן (${newTxCount} תנועות חדשות)`, accountId);

  saveEncryptedVault();

  return {
    success: true,
    accountId,
    accountName: account.name,
    newTransactions: newTxCount,
    message: `הסנכרון הושלם בהצלחה! נוספו ${newTxCount} תנועות חדשות.`
  };
}

module.exports = {
  SUPPORTED_PROVIDERS,
  syncAccountWithScraper
};
