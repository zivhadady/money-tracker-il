const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('../../node_modules/puppeteer');
const { getDb, saveEncryptedVault } = require('../db/database');
const { generateTransactionHash } = require('./cryptoService');
const { otpCoordinator } = require('./otpCoordinator');

/**
 * Automated Puppeteer Scraper for:
 * 1. הר הביטוח (harb.cma.gov.il) - כל פוליסות הביטוח והפרמיות החודשיות
 * 2. הר הכסף (itur.mof.gov.il) - כל קופות הגמל, קרנות ההשתלמות, הפנסיה וביטוחי החיים
 * Uses Israel's National Identification System (login.gov.il) + Real-time SMS OTP Popup!
 */
async function syncGovPortalAccount({ account, credentials }) {
  const db = getDb();
  const isHarHabituach = account.company_id === 'har_habituach';
  const targetUrl = isHarHabituach
    ? 'https://harb.cma.gov.il/sso/Overview'
    : 'https://itur.mof.gov.il/sso/results/live/shuk';

  const nationalId = String(credentials.id || credentials.username || '').replace(/\D/g, '');
  const password = String(credentials.password || '').trim();

  if (!nationalId || !password) {
    throw new Error('נא להזין מספר תעודת זהות (9 ספרות) וסיסמה של מערכת ההזדהות הלאומית (Gov.il)');
  }

  const profileDir = path.join(__dirname, `../../data/browser_profiles/gov_il_${nationalId}`);
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  db.prepare('UPDATE accounts SET last_sync_status = ? WHERE id = ?')
    .run('מתחבר למערכת ההזדהות הלאומית (Gov.il)...', account.id);

  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      `--user-data-dir=${profileDir}`
    ]
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 900 });

    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2500));

    // Check if redirected to login.gov.il
    if (page.url().includes('login.gov.il')) {
      await page.waitForSelector('#userId', { visible: true, timeout: 30000 });
      await page.click('#userId', { clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.type('#userId', nationalId, { delay: 40 });

      await page.click('#userPass', { clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.type('#userPass', password, { delay: 40 });

      await new Promise(r => setTimeout(r, 400));
      await page.click('#loginSubmit');

      // Wait for either SMS OTP screen on login.gov.il, error message, or redirect back to harb/itur
      const loginStart = Date.now();
      let otpRequested = false;

      while (Date.now() - loginStart < 180000) {
        await new Promise(r => setTimeout(r, 1200));
        const curUrl = page.url();

        if (!curUrl.includes('login.gov.il')) {
          break; // Redirected to Har HaBituach / Har HaKesef!
        }

        const pageState = await page.evaluate(() => {
          const text = document.body ? document.body.innerText : '';
          const otpInputs = Array.from(document.querySelectorAll('input')).filter(
            inp => inp.id !== 'userId' && inp.id !== 'userPass' && inp.offsetParent !== null
          );
          const hasError =
            text.includes('פרטי ההזדהות שגויים') ||
            text.includes('שם משתמש או סיסמה שגויים') ||
            text.includes('שגיאה');
          const needsOtp =
            otpInputs.length > 0 ||
            text.includes('קוד אימות') ||
            text.includes('נשלח קוד') ||
            text.includes('חד פעמי');
          return { text: text.slice(0, 600), hasError, needsOtp, otpInputCount: otpInputs.length };
        });

        if (pageState.hasError && !pageState.needsOtp) {
          throw new Error('פרטי ההזדהות ב-Gov.il (ת.ז או סיסמה) שגויים');
        }

        if (pageState.needsOtp && !otpRequested) {
          otpRequested = true;
          db.prepare('UPDATE accounts SET last_sync_status = ? WHERE id = ?')
            .run('ממתין להזנת קוד SMS ממערכת ההזדהות הלאומית (Gov.il)...', account.id);

          const otpCode = await otpCoordinator.requestOtp({
            accountId: account.id,
            accountName: account.name,
            companyId: account.company_id,
            promptText: 'הזן את קוד האימות (6 ספרות) שנשלח אליך ב-SMS ממערכת ההזדהות הממשלתית (Gov.il):'
          });

          const cleanDigits = String(otpCode).replace(/\D/g, '');
          const visibleInputs = await page.$$('input:not(#userId):not(#userPass)');
          const activeInputs = [];
          for (const inp of visibleInputs) {
            const box = await inp.boundingBox();
            if (box && box.width > 0 && box.height > 0) activeInputs.push(inp);
          }

          if (activeInputs.length > 1 && activeInputs.length >= cleanDigits.length) {
            for (let i = 0; i < cleanDigits.length; i++) {
              await activeInputs[i].focus();
              await activeInputs[i].type(cleanDigits[i], { delay: 50 });
            }
          } else if (activeInputs.length >= 1) {
            await activeInputs[0].focus();
            await activeInputs[0].type(cleanDigits, { delay: 50 });
          }

          await new Promise(r => setTimeout(r, 500));
          // Click submit button on Gov.il OTP page
          await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
            const submit = btns.find(b => {
              const t = (b.innerText || b.value || '').trim();
              return t.includes('כניסה') || t.includes('המשך') || t.includes('אישור') || b.id === 'loginSubmit';
            });
            if (submit) submit.click();
          });
        }
      }
    }

    db.prepare('UPDATE accounts SET last_sync_status = ? WHERE id = ?')
      .run(isHarHabituach ? 'שואב פוליסות ביטוח מהר הביטוח...' : 'שואב קופות גמל ופנסיה מהר הכסף...', account.id);

    // Wait for data tables/cards to load on Har HaBituach / Har HaKesef
    await new Promise(r => setTimeout(r, 6000));

    // Extract structured rows from tables or cards on the page
    const extractedItems = await page.evaluate(() => {
      const items = [];
      // 1. Check standard HTML tables
      const rows = Array.from(document.querySelectorAll('table tbody tr, .table-row, .policy-row, .card-policy, .result-row'));
      for (const r of rows) {
        const cells = Array.from(r.querySelectorAll('td, .cell, span, div'))
          .map(c => (c.innerText || '').trim())
          .filter(Boolean);
        const rowText = (r.innerText || '').replace(/\s+/g, ' ').trim();
        if (rowText.length > 8) {
          items.push({ rawText: rowText, cells: cells.slice(0, 8) });
        }
      }
      return {
        url: window.location.href,
        pageTitle: document.title,
        items: items.slice(0, 100),
        bodySummary: (document.body ? document.body.innerText : '').slice(0, 2000)
      };
    });

    const today = new Date().toISOString().slice(0, 10);
    const insertTx = db.prepare(`
      INSERT OR IGNORE INTO transactions (
        tx_hash, account_id, date, processed_date, description, memo,
        original_amount, charged_amount, currency, category_id, flow_type,
        is_duplicate_settlement, status, is_demo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ILS', ?, 'expense', 0, 'completed', 0)
    `);

    let addedCount = 0;
    for (const item of extractedItems.items) {
      // Look for currency / premium numbers in the row
      const numMatch = item.rawText.match(/(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s*₪|₪\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/);
      const rawNum = numMatch ? (numMatch[1] || numMatch[2]).replace(/,/g, '') : null;
      const amount = rawNum ? -Math.abs(Number(rawNum)) : 0;

      const desc = item.rawText.slice(0, 90);
      const categoryId = isHarHabituach ? 'health' : 'savings';
      const hash = generateTransactionHash(account.id, today, desc, amount, amount, 'gov_portal');

      if (amount !== 0) {
        const res = insertTx.run(hash, account.id, today, today, desc, isHarHabituach ? 'פוליסת הר הביטוח' : 'קופה מהר הכסף', amount, amount, categoryId);
        addedCount += res.changes;
      }
    }

    const statusMsg = `סונכרן מ-${isHarHabituach ? 'הר הביטוח' : 'הר הכסף'} (${extractedItems.items.length} רשומות זוהו)`;
    db.prepare(`
      UPDATE accounts
      SET last_sync_at = datetime('now'),
          last_sync_status = ?
      WHERE id = ?
    `).run(statusMsg, account.id);

    saveEncryptedVault();

    return {
      success: true,
      accountId: account.id,
      accountName: account.name,
      newTransactions: addedCount,
      message: `${statusMsg}!`
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = {
  syncGovPortalAccount
};
