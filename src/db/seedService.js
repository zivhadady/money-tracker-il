const { getDb } = require('./database');
const { generateTransactionHash } = require('../services/cryptoService');
const { classifyTransaction } = require('../services/categorizerService');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function getRecentMonths(count = 6) {
  const now = new Date();
  const months = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      ym: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
    });
  }
  return months;
}

function seedDemoData() {
  const db = getDb();

  // Check if demo accounts already exist
  const existingDemo = db.prepare('SELECT COUNT(*) as c FROM accounts WHERE is_demo = 1').get().c;
  if (existingDemo > 0) {
    return { seeded: false, message: 'נתוני הדגמה כבר קיימים במערכת' };
  }

  // Ensure demo members exist
  db.exec("DELETE FROM members WHERE name IN ('עומר (שלי)', 'נועה (בת זוג)', 'משותף - משק בית')");
  const insertMember = db.prepare('INSERT INTO members (name, role, color, avatar) VALUES (?, ?, ?, ?)');
  const m1 = insertMember.run('עומר (שלי)', 'ראשי', '#3b82f6', '👨‍💻').lastInsertRowid;
  const m2 = insertMember.run('נועה (בת זוג)', 'בת זוג', '#ec4899', '👩‍⚕️').lastInsertRowid;
  const m3 = insertMember.run('משותף - משק בית', 'חשבון משותף', '#10b981', '🏡').lastInsertRowid;

  const insertAccount = db.prepare(`
    INSERT INTO accounts (name, company_id, account_type, account_number, member_id, balance, credit_limit, last_sync_at, last_sync_status, color, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), 'סונכרן בהצלחה (הדגמה)', ?, 1)
  `);

  const accPoalim = insertAccount.run('בנק הפועלים - עו"ש משותף', 'hapoalim', 'bank', '12-654-882910', m3, 28450.00, 15000, '#ef4444').lastInsertRowid;
  const accLeumi = insertAccount.run('בנק לאומי - עו"ש אישי', 'leumi', 'bank', '10-800-441209', m1, 14200.50, 10000, '#3b82f6').lastInsertRowid;
  const accMax = insertAccount.run('מקס (Max) - כרטיס משפחתי', 'max', 'credit_card', '4580-****-****-8821', m3, -6420.30, 25000, '#8b5cf6').lastInsertRowid;
  const accIsracard = insertAccount.run('ישראכרט פלטינום - עומר', 'isracard', 'credit_card', '5326-****-****-1094', m1, -3890.00, 20000, '#0ea5e9').lastInsertRowid;
  const accCal = insertAccount.run('כאל (Cal) פיקס - נועה', 'cal', 'credit_card', '4580-****-****-3319', m2, -2945.80, 15000, '#f59e0b').lastInsertRowid;

  const customRules = db.prepare('SELECT pattern, category_id FROM category_rules').all();

  const insertTx = db.prepare(`
    INSERT OR IGNORE INTO transactions (
      tx_hash, account_id, date, processed_date, description, memo,
      original_amount, charged_amount, currency, category_id, flow_type,
      is_duplicate_settlement, installment_number, installment_total, status, is_demo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ILS', ?, ?, ?, ?, ?, 'completed', 1)
  `);

  const months = getRecentMonths(6);
  let totalInserted = 0;

  for (let idx = 0; idx < months.length; idx++) {
    const { ym } = months[idx];
    const variance = 1 + ((idx % 3) - 1) * 0.04; // slight realistic monthly fluctuation

    const monthlyItems = [
      // Bank Hapoalim (Joint) - Salaries, Mortgage, Bills, Credit Card Settlements
      { acc: accPoalim, type: 'bank', day: '01', desc: 'העברת משכורת - הייטק בע"מ', amount: 18500, memo: 'משכורת עומר' },
      { acc: accPoalim, type: 'bank', day: '02', desc: 'משכורת - משרד הבריאות', amount: 12800, memo: 'משכורת נועה' },
      { acc: accPoalim, type: 'bank', day: '20', desc: 'ביטוח לאומי - קצבת ילדים', amount: 312, memo: 'קצבה חודשית' },
      { acc: accPoalim, type: 'bank', day: '10', desc: 'משכנתא בנק הפועלים הו"ק', amount: -5450, memo: 'חיוב משכנתא חודשי' },
      { acc: accPoalim, type: 'bank', day: '10', desc: 'מקס איט פיננסים - חיוב כרטיס אשראי', amount: -Math.round(6200 * variance), memo: 'חיוב חודשי אשראי מקס (מוחרג אוטומטית מכפילות)' },
      { acc: accPoalim, type: 'bank', day: '15', desc: 'כרטיסי אשראי לישראל כאל - חיוב אשראי', amount: -Math.round(2900 * variance), memo: 'חיוב חודשי אשראי כאל (מוחרג אוטומטית מכפילות)' },
      { acc: accPoalim, type: 'bank', day: '05', desc: 'מעון ויצו - הוראת קבע', amount: -1650, memo: 'גן ילדים' },
      { acc: accPoalim, type: 'bank', day: '08', desc: 'ועד בית - הוראת קבע', amount: -380, memo: 'תחזוקת בניין' },
      { acc: accPoalim, type: 'bank', day: '28', desc: 'עמלת ניהול חשבון עו"ש', amount: -14.5, memo: 'עמלה חודשית' },

      // Bank Leumi (Personal) - Extra Income, Isracard Settlement, Cash
      { acc: accLeumi, type: 'bank', day: '06', desc: 'החזר מס / בונוס רבעוני', amount: idx % 2 === 0 ? 1400 : 650, memo: 'הכנסה נוספת' },
      { acc: accLeumi, type: 'bank', day: '02', desc: 'ישראכרט בע"מ - חיוב חודשי', amount: -Math.round(3850 * variance), memo: 'חיוב כרטיס ישראכרט (מוחרג אוטומטית מכפילות)' },
      { acc: accLeumi, type: 'bank', day: '18', desc: 'משיכת מזומן כספומט לאומי', amount: -400, memo: 'מזומן' },

      // Max Credit Card (Family Groceries, Utilities, Subscriptions)
      { acc: accMax, type: 'credit_card', day: '03', desc: 'שופרסל דיל אקסטרה', amount: -Math.round(820 * variance), memo: 'קנייה שבועית' },
      { acc: accMax, type: 'credit_card', day: '10', desc: 'רמי לוי שיווק השקמה', amount: -Math.round(740 * variance), memo: 'קנייה שבועית' },
      { acc: accMax, type: 'credit_card', day: '17', desc: 'יוחננוף סופרמרקט', amount: -Math.round(690 * variance), memo: 'קנייה שבועית' },
      { acc: accMax, type: 'credit_card', day: '24', desc: 'קרפור מרקט (Carrefour)', amount: -Math.round(610 * variance), memo: 'השלמות לשבת' },
      { acc: accMax, type: 'credit_card', day: '12', desc: 'חברת החשמל לישראל', amount: -Math.round(580 * variance), memo: 'חשבון חשמל' },
      { acc: accMax, type: 'credit_card', day: '14', desc: 'עיריית תל אביב - ארנונה ומים', amount: -720, memo: 'תשלום דו-חודשי בחלוקה' },
      { acc: accMax, type: 'credit_card', day: '19', desc: 'פרטנר תקשורת - סיבים וסלולר', amount: -219, memo: 'מנוי חודשי' },
      { acc: accMax, type: 'credit_card', day: '21', desc: 'נטפליקס (Netflix.com)', amount: -69.9, memo: 'מנוי סטרימינג' },
      { acc: accMax, type: 'credit_card', day: '22', desc: 'מכבי שירותי בריאות', amount: -345, memo: 'מכבי שלי משפחתי' },
      { acc: accMax, type: 'credit_card', day: '26', desc: 'מחסני חשמל - מדיח כלים', amount: -450, orig: -2700, instNum: idx + 1, instTot: 6, memo: `תשלום ${idx + 1} מתוך 6` },

      // Isracard (Omer - Fuel, Dining, Tech, Car Insurance)
      { acc: accIsracard, type: 'credit_card', day: '04', desc: 'פז תחנת דלק - פזומט', amount: -Math.round(360 * variance), memo: 'תדלוק' },
      { acc: accIsracard, type: 'credit_card', day: '16', desc: 'סונול תחנות דלק', amount: -Math.round(340 * variance), memo: 'תדלוק' },
      { acc: accIsracard, type: 'credit_card', day: '07', desc: 'וולט (Wolt) - משלוחי אוכל', amount: -Math.round(285 * variance), memo: 'ארוחת ערב' },
      { acc: accIsracard, type: 'credit_card', day: '15', desc: 'וולט (Wolt) - משלוחים', amount: -Math.round(210 * variance), memo: 'משלוח סושי' },
      { acc: accIsracard, type: 'credit_card', day: '11', desc: 'ארומה אספרסו בר', amount: -68, memo: 'קפה וכריך' },
      { acc: accIsracard, type: 'credit_card', day: '20', desc: 'כביש 6 - דרך ארץ', amount: -94, memo: 'נסיעות אגרה' },
      { acc: accIsracard, type: 'credit_card', day: '23', desc: 'פנגו (Pango) חניה', amount: -75, memo: 'חניה עירונית' },
      { acc: accIsracard, type: 'credit_card', day: '25', desc: 'הפניקס ביטוח רכב מקיף וחובה', amount: -490, orig: -5880, instNum: idx + 1, instTot: 12, memo: `תשלום ${idx + 1} מתוך 12` },
      { acc: accIsracard, type: 'credit_card', day: '27', desc: 'KSP מחשבים וסלולר', amount: -320, memo: 'אביזרי מחשב' },
      { acc: accIsracard, type: 'credit_card', day: '28', desc: 'הולמס פלייס - מנוי כושר', amount: -299, memo: 'מנוי חודשי' },

      // Cal Credit Card (Noa - Pharm, Shopping, Kids, Entertainment, Bit)
      { acc: accCal, type: 'credit_card', day: '05', desc: 'סופר-פארם (Super-Pharm)', amount: -Math.round(310 * variance), memo: 'פארם ומוצרי תינוקות' },
      { acc: accCal, type: 'credit_card', day: '09', desc: 'זארה (ZARA) קניון רמת אביב', amount: -Math.round(480 * variance), memo: 'ביגוד' },
      { acc: accCal, type: 'credit_card', day: '13', desc: 'טרמינל איקס (Terminal X)', amount: -Math.round(350 * variance), memo: 'קנייה אונליין' },
      { acc: accCal, type: 'credit_card', day: '17', desc: 'שילב - בגדי ילדים וצעצועים', amount: -240, memo: 'ציוד לילדים' },
      { acc: accCal, type: 'credit_card', day: '19', desc: 'מתנ"ס קהילתי - חוג שחייה וג׳ודו', amount: -420, memo: 'חוגים לילדים' },
      { acc: accCal, type: 'credit_card', day: '21', desc: 'ביט (Bit) העברה כספית', amount: -250, memo: 'מתנה ליום הולדת / ועד הורים' },
      { acc: accCal, type: 'credit_card', day: '24', desc: 'סינמה סיטי גלילות', amount: -165, memo: 'בילוי סופ"ש' },
      { acc: accCal, type: 'credit_card', day: '26', desc: 'גולדה גלידריה', amount: -92, memo: 'גלידה משפחתית' }
    ];

    for (const item of monthlyItems) {
      const txDate = `${ym}-${item.day}`;
      const origAmount = item.orig !== undefined ? item.orig : item.amount;
      const classification = classifyTransaction({
        accountType: item.type,
        description: item.desc,
        chargedAmount: item.amount,
        customRules
      });

      const hash = generateTransactionHash(item.acc, txDate, item.desc, item.amount, origAmount, item.memo);
      const res = insertTx.run(
        hash,
        item.acc,
        txDate,
        txDate,
        item.desc,
        item.memo || '',
        origAmount,
        item.amount,
        classification.categoryId,
        classification.flowType,
        classification.isDuplicateSettlement,
        item.instNum || null,
        item.instTot || null
      );
      totalInserted += res.changes;
    }
  }

  // Seed Savings Goals
  const insertGoal = db.prepare(`
    INSERT INTO savings_goals (name, target_amount, current_amount, target_date, icon, color, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  insertGoal.run('קרן חירום משפחתית (3 חודשי מחיה)', 60000, 42500, '2027-03-01', '🛡️', '#10b981');
  insertGoal.run('חופשה משפחתית בקיץ (איטליה)', 18000, 11200, '2027-07-01', '✈️', '#3b82f6');
  insertGoal.run('שדרוג רכב משפחתי', 45000, 19800, '2027-12-01', '🚙', '#8b5cf6');

  return {
    seeded: true,
    accountsCreated: 5,
    transactionsCreated: totalInserted,
    message: 'נתוני הדגמה מלאים (2 חשבונות בנק ו-3 כרטיסי אשראי) נטענו בהצלחה!'
  };
}

function clearDemoData() {
  const db = getDb();
  db.exec('DELETE FROM transactions WHERE is_demo = 1;');
  db.exec('DELETE FROM accounts WHERE is_demo = 1;');
  db.exec('DELETE FROM savings_goals WHERE is_demo = 1;');
  return { cleared: true, message: 'כל נתוני ההדגמה נמחקו מהמערכת' };
}

module.exports = {
  seedDemoData,
  clearDemoData
};
