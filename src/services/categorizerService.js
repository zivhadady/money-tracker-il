// Built-in Categorization & Duplicate Detection Engine for Israeli Banks & Credit Cards

// Keywords that identify a bank line item as a monthly credit card bill settlement
// (to prevent double-counting when the user also tracks the credit card itself)
const CC_SETTLEMENT_PATTERNS = [
  'ישראכרט',
  'מסטרקרד',
  'מאסטרקארד',
  'מקס איט',
  'מקס פיננסים',
  'לאומי קארד',
  'כרטיסי אשראי לישראל',
  'כ.א.ל',
  'כאל',
  'אמריקן אקספרס',
  'פרימיום אקספרס',
  'דיינרס',
  'חיוב כרטיס אשראי',
  'חיוב אשראי',
  'isracard',
  'max it',
  'cal ',
  'amex'
];

const INTERNAL_TRANSFER_PATTERNS = [
  'העברה לעו"ש אחר שלי',
  'העברה בין חשבונותי'
];

const DEFAULT_CATEGORIES = [
  { id: 'salary', name: 'משכורת והכנסות עבודה', type: 'income', icon: '💼', color: '#10b981', budget: 0 },
  { id: 'allowance', name: 'קצבאות, מילואים והחזרים', type: 'income', icon: '🏛️', color: '#34d399', budget: 0 },
  { id: 'other_income', name: 'הכנסות אחרות / העברות', type: 'income', icon: '💰', color: '#059669', budget: 0 },
  { id: 'savings', name: 'חיסכון, פיקדונות והשקעות (קופ"ג/פק"מ)', type: 'expense', icon: '🐷', color: '#06b6d4', budget: 5000 },
  { id: 'groceries', name: 'סופרמרקט ומזון', type: 'expense', icon: '🛒', color: '#3b82f6', budget: 3500 },
  { id: 'dining', name: 'מסעדות, בתי קפה ומשלוחים', type: 'expense', icon: '🍔', color: '#f59e0b', budget: 1500 },
  { id: 'housing', name: 'דיור, משכנתא וחשבונות בית', type: 'expense', icon: '🏠', color: '#8b5cf6', budget: 6500 },
  { id: 'transport', name: 'רכב, דלק, ליסינג ותחבורה', type: 'expense', icon: '🚗', color: '#ef4444', budget: 2500 },
  { id: 'shopping', name: 'קניות, ביגוד ואונליין', type: 'expense', icon: '🛍️', color: '#ec4899', budget: 1500 },
  { id: 'health', name: 'בריאות, פארם וביטוחים', type: 'expense', icon: '💊', color: '#14b8a6', budget: 1200 },
  { id: 'telecom', name: 'תקשורת, אינטרנט ומנויים', type: 'expense', icon: '📱', color: '#6366f1', budget: 450 },
  { id: 'education', name: 'חינוך, חוגים וילדים', type: 'expense', icon: '🎓', color: '#f97316', budget: 2000 },
  { id: 'entertainment', name: 'פנאי, בילויים וחופשות', type: 'expense', icon: '🎬', color: '#a855f7', budget: 1000 },
  { id: 'cash_bit', name: 'מזומן והעברות (ביט/פייבוקס/עו"ש)', type: 'expense', icon: '💸', color: '#64748b', budget: 1500 },
  { id: 'fees', name: 'עמלות בנק וכרטיסי אשראי', type: 'expense', icon: '🏦', color: '#94a3b8', budget: 150 },
  { id: 'cc_settlement', name: 'חיוב חודשי כרטיס אשראי (מוחרג מכפילות)', type: 'transfer', icon: '💳', color: '#475569', budget: 0 },
  { id: 'uncategorized', name: 'כללי / ללא סיווג', type: 'expense', icon: '📌', color: '#71717a', budget: 800 }
];

const DEFAULT_MERCHANT_RULES = [
  // Savings, Deposits & Investments (חיסכון והשקעות)
  { pattern: 'קופת גמל', categoryId: 'savings' },
  { pattern: 'גמל להשקעה', categoryId: 'savings' },
  { pattern: 'הפקדה לפקדון', categoryId: 'savings' },
  { pattern: 'הפקדה לפיקדון', categoryId: 'savings' },
  { pattern: 'משיכת פקדון', categoryId: 'savings' },
  { pattern: 'משיכה מפיקדון', categoryId: 'savings' },
  { pattern: 'חיסכון לכל ילד', categoryId: 'savings' },
  { pattern: 'תוכנית חיסכון', categoryId: 'savings' },
  { pattern: 'פק"מ', categoryId: 'savings' },
  { pattern: 'פר"י', categoryId: 'savings' },
  { pattern: 'קרן השתלמות', categoryId: 'savings' },
  { pattern: 'אלטשולר שחם', categoryId: 'savings' },
  { pattern: 'מיטב דש', categoryId: 'savings' },
  { pattern: 'ילין לפידות', categoryId: 'savings' },
  { pattern: 'מור גמל', categoryId: 'savings' },
  { pattern: 'אנליסט', categoryId: 'savings' },
  { pattern: 'אי.בי.אי', categoryId: 'savings' },
  { pattern: 'אקסלנס', categoryId: 'savings' },

  // Income, Salaries & Allowances (הכנסות וקצבאות)
  { pattern: 'משכורת', categoryId: 'salary' },
  { pattern: 'שכר עבודה', categoryId: 'salary' },
  { pattern: 'העברת משכורת', categoryId: 'salary' },
  { pattern: 'פארגון פתרונות', categoryId: 'salary' },
  { pattern: 'ביטוח לאומי', categoryId: 'allowance' },
  { pattern: 'בטוח לאומי', categoryId: 'allowance' },
  { pattern: 'מופ"ת', categoryId: 'allowance' },
  { pattern: 'מילואים', categoryId: 'allowance' },
  { pattern: 'קצבת ילדים', categoryId: 'allowance' },
  { pattern: 'החזר מס', categoryId: 'allowance' },

  // Groceries
  { pattern: 'שופרסל', categoryId: 'groceries' },
  { pattern: 'רמי לוי', categoryId: 'groceries' },
  { pattern: 'יוחננוף', categoryId: 'groceries' },
  { pattern: 'ויקטורי', categoryId: 'groceries' },
  { pattern: 'קרפור', categoryId: 'groceries' },
  { pattern: 'יינות ביתן', categoryId: 'groceries' },
  { pattern: 'אושר עד', categoryId: 'groceries' },
  { pattern: 'חצי חינם', categoryId: 'groceries' },
  { pattern: 'טיב טעם', categoryId: 'groceries' },
  { pattern: 'קשת טעמים', categoryId: 'groceries' },
  { pattern: 'מחסני השוק', categoryId: 'groceries' },
  { pattern: 'am:pm', categoryId: 'groceries' },
  { pattern: 'סופר יודה', categoryId: 'groceries' },
  { pattern: 'מאפיית', categoryId: 'groceries' },
  { pattern: 'ירקות', categoryId: 'groceries' },
  { pattern: 'קצביה', categoryId: 'groceries' },

  // Dining & Delivery
  { pattern: 'וולט', categoryId: 'dining' },
  { pattern: 'wolt', categoryId: 'dining' },
  { pattern: 'תן ביס', categoryId: 'dining' },
  { pattern: '10bis', categoryId: 'dining' },
  { pattern: 'משלוחה', categoryId: 'dining' },
  { pattern: 'מקדונלד', categoryId: 'dining' },
  { pattern: 'ארומה', categoryId: 'dining' },
  { pattern: 'קפה ', categoryId: 'dining' },
  { pattern: 'מסעדת', categoryId: 'dining' },
  { pattern: 'פיצה', categoryId: 'dining' },
  { pattern: 'סושי', categoryId: 'dining' },
  { pattern: 'גולדה', categoryId: 'dining' },
  { pattern: 'בורגר', categoryId: 'dining' },
  { pattern: 'פלאפל', categoryId: 'dining' },
  { pattern: 'שווארמה', categoryId: 'dining' },
  { pattern: 'לנדוור', categoryId: 'dining' },
  { pattern: 'גרג', categoryId: 'dining' },

  // Housing & Utilities
  { pattern: 'חברת החשמל', categoryId: 'housing' },
  { pattern: 'חשמל לישראל', categoryId: 'housing' },
  { pattern: 'עיריית', categoryId: 'housing' },
  { pattern: 'מועצה', categoryId: 'housing' },
  { pattern: 'ארנונה', categoryId: 'housing' },
  { pattern: 'מי אביבים', categoryId: 'housing' },
  { pattern: 'מניב', categoryId: 'housing' },
  { pattern: 'תאגיד מים', categoryId: 'housing' },
  { pattern: 'אמישראגז', categoryId: 'housing' },
  { pattern: 'סופרגז', categoryId: 'housing' },
  { pattern: 'פזגז', categoryId: 'housing' },
  { pattern: 'משכנתא', categoryId: 'housing' },
  { pattern: 'הבנק הבינלאומי', categoryId: 'housing' },
  { pattern: 'שכר דירה', categoryId: 'housing' },
  { pattern: 'שכ"ד', categoryId: 'housing' },
  { pattern: 'ועד בית', categoryId: 'housing' },
  { pattern: 'איקאה', categoryId: 'housing' },
  { pattern: 'הום סנטר', categoryId: 'housing' },
  { pattern: 'אייס', categoryId: 'housing' },

  // Transport, Fuel & Leasing
  { pattern: 'פז ', categoryId: 'transport' },
  { pattern: 'סונול', categoryId: 'transport' },
  { pattern: 'דלק ', categoryId: 'transport' },
  { pattern: 'דור אלון', categoryId: 'transport' },
  { pattern: 'ten ', categoryId: 'transport' },
  { pattern: 'תן דלק', categoryId: 'transport' },
  { pattern: 'מנטה', categoryId: 'transport' },
  { pattern: 'yellow', categoryId: 'transport' },
  { pattern: 'פנגו', categoryId: 'transport' },
  { pattern: 'pango', categoryId: 'transport' },
  { pattern: 'סלופארק', categoryId: 'transport' },
  { pattern: 'כביש 6', categoryId: 'transport' },
  { pattern: 'דרך ארץ', categoryId: 'transport' },
  { pattern: 'נתיבי הגליל', categoryId: 'transport' },
  { pattern: 'הנתיב המהיר', categoryId: 'transport' },
  { pattern: 'רכבת ישראל', categoryId: 'transport' },
  { pattern: 'רב קו', categoryId: 'transport' },
  { pattern: 'מוובאיט', categoryId: 'transport' },
  { pattern: 'moovit', categoryId: 'transport' },
  { pattern: 'גט טקסי', categoryId: 'transport' },
  { pattern: 'gett', categoryId: 'transport' },
  { pattern: 'יאנגו', categoryId: 'transport' },
  { pattern: 'חניון', categoryId: 'transport' },
  { pattern: 'מוסך', categoryId: 'transport' },
  { pattern: 'יו.טי.אס', categoryId: 'transport' },
  { pattern: 'אלדן', categoryId: 'transport' },
  { pattern: 'שלמה סיקסט', categoryId: 'transport' },
  { pattern: 'אוויס', categoryId: 'transport' },

  // Health, Pharm & Insurance
  { pattern: 'סופר פארם', categoryId: 'health' },
  { pattern: 'סופר-פארם', categoryId: 'health' },
  { pattern: 'super-pharm', categoryId: 'health' },
  { pattern: 'be פארם', categoryId: 'health' },
  { pattern: 'גוד פארם', categoryId: 'health' },
  { pattern: 'מכבי שירותי בריאות', categoryId: 'health' },
  { pattern: 'קופת חולים', categoryId: 'health' },
  { pattern: 'כללית', categoryId: 'health' },
  { pattern: 'מאוחדת', categoryId: 'health' },
  { pattern: 'לאומית', categoryId: 'health' },
  { pattern: 'הראל', categoryId: 'health' },
  { pattern: 'הפניקס', categoryId: 'health' },
  { pattern: 'מגדל', categoryId: 'health' },
  { pattern: 'מנורה', categoryId: 'health' },
  { pattern: 'כלל ביטוח', categoryId: 'health' },
  { pattern: 'ביטוח ישיר', categoryId: 'health' },
  { pattern: 'איי.די.איי', categoryId: 'health' },
  { pattern: 'ליברה', categoryId: 'health' },
  { pattern: 'ווישור', categoryId: 'health' },

  // Telecom & Subscriptions
  { pattern: 'פרטנר', categoryId: 'telecom' },
  { pattern: 'סלקום', categoryId: 'telecom' },
  { pattern: 'פלאפון', categoryId: 'telecom' },
  { pattern: 'הוט מובייל', categoryId: 'telecom' },
  { pattern: 'הוט ', categoryId: 'telecom' },
  { pattern: 'גולן טלקום', categoryId: 'telecom' },
  { pattern: '019', categoryId: 'telecom' },
  { pattern: 'בזק', categoryId: 'telecom' },
  { pattern: 'יס ', categoryId: 'telecom' },
  { pattern: 'yes ', categoryId: 'telecom' },
  { pattern: 'free tv', categoryId: 'telecom' },
  { pattern: 'netflix', categoryId: 'telecom' },
  { pattern: 'נטפליקס', categoryId: 'telecom' },
  { pattern: 'spotify', categoryId: 'telecom' },
  { pattern: 'apple.com/bill', categoryId: 'telecom' },
  { pattern: 'google *', categoryId: 'telecom' },
  { pattern: 'openai', categoryId: 'telecom' },
  { pattern: 'claude', categoryId: 'telecom' },

  // Shopping
  { pattern: 'זארה', categoryId: 'shopping' },
  { pattern: 'zara', categoryId: 'shopping' },
  { pattern: 'פוקס', categoryId: 'shopping' },
  { pattern: 'fox', categoryId: 'shopping' },
  { pattern: 'קסטרו', categoryId: 'shopping' },
  { pattern: 'רנואר', categoryId: 'shopping' },
  { pattern: 'טרמינל איקס', categoryId: 'shopping' },
  { pattern: 'terminal x', categoryId: 'shopping' },
  { pattern: 'ksp', categoryId: 'shopping' },
  { pattern: 'אייבורי', categoryId: 'shopping' },
  { pattern: 'באג ', categoryId: 'shopping' },
  { pattern: 'מחסני חשמל', categoryId: 'shopping' },
  { pattern: 'שקם אלקטריק', categoryId: 'shopping' },
  { pattern: 'aliexpress', categoryId: 'shopping' },
  { pattern: 'עליאקספרס', categoryId: 'shopping' },
  { pattern: 'amazon', categoryId: 'shopping' },
  { pattern: 'אמזון', categoryId: 'shopping' },
  { pattern: 'shein', categoryId: 'shopping' },
  { pattern: 'נקסט', categoryId: 'shopping' },
  { pattern: 'next ', categoryId: 'shopping' },
  { pattern: 'אסוס', categoryId: 'shopping' },
  { pattern: 'asos', categoryId: 'shopping' },
  { pattern: 'מקס סטוק', categoryId: 'shopping' },
  { pattern: 'דקתלון', categoryId: 'shopping' },

  // Cash & Bit/Paybox/Transfers
  { pattern: 'bit ', categoryId: 'cash_bit' },
  { pattern: 'ביט ', categoryId: 'cash_bit' },
  { pattern: 'פייבוקס', categoryId: 'cash_bit' },
  { pattern: 'paybox', categoryId: 'cash_bit' },
  { pattern: 'משיכת מזומן', categoryId: 'cash_bit' },
  { pattern: 'משיכה מבנקט', categoryId: 'cash_bit' },
  { pattern: 'כספומט', categoryId: 'cash_bit' },
  { pattern: 'בנקט', categoryId: 'cash_bit' },
  { pattern: 'העברה מיידית', categoryId: 'cash_bit' },
  { pattern: "העב' לאחר", categoryId: 'cash_bit' },
  { pattern: 'שיק', categoryId: 'cash_bit' },

  // Education & Kids
  { pattern: 'גן ילדים', categoryId: 'education' },
  { pattern: 'מעון', categoryId: 'education' },
  { pattern: 'ויצו', categoryId: 'education' },
  { pattern: 'נעמת', categoryId: 'education' },
  { pattern: 'צהרון', categoryId: 'education' },
  { pattern: 'מתנ"ס', categoryId: 'education' },
  { pattern: 'אוניברסיט', categoryId: 'education' },
  { pattern: 'מכללת', categoryId: 'education' },
  { pattern: 'שילב', categoryId: 'education' },
  { pattern: 'עידן 2000', categoryId: 'education' },
  { pattern: 'כפר השעשועים', categoryId: 'education' },

  // Entertainment
  { pattern: 'סינמה סיטי', categoryId: 'entertainment' },
  { pattern: 'פלאנט', categoryId: 'entertainment' },
  { pattern: 'יס פלאנט', categoryId: 'entertainment' },
  { pattern: 'לב קולנוע', categoryId: 'entertainment' },
  { pattern: 'בוקינג', categoryId: 'entertainment' },
  { pattern: 'booking.com', categoryId: 'entertainment' },
  { pattern: 'airbnb', categoryId: 'entertainment' },
  { pattern: 'אל על', categoryId: 'entertainment' },
  { pattern: 'ישראייר', categoryId: 'entertainment' },
  { pattern: 'ארקיע', categoryId: 'entertainment' },
  { pattern: 'מלון ', categoryId: 'entertainment' },
  { pattern: 'הולמס פלייס', categoryId: 'entertainment' },
  { pattern: 'אייקון פיטנס', categoryId: 'entertainment' },

  // Fees
  { pattern: 'עמלת', categoryId: 'fees' },
  { pattern: 'ע.מפעולות', categoryId: 'fees' },
  { pattern: "עמ'הקצאת", categoryId: 'fees' },
  { pattern: 'דמי כרטיס', categoryId: 'fees' },
  { pattern: 'ריבית חובה', categoryId: 'fees' }
];

/**
 * Classifies a transaction based on account type, description, amount, and custom user rules.
 */
function classifyTransaction({ accountType, description, chargedAmount, customRules = [] }) {
  const descLower = (description || '').toLowerCase().trim();

  // 1. Check custom user rules first (highest priority)
  for (const rule of customRules) {
    if (rule.pattern && descLower.includes(rule.pattern.toLowerCase())) {
      const flowType = rule.category_id === 'cc_settlement'
        ? 'transfer'
        : (chargedAmount > 0 ? 'income' : 'expense');
      return {
        categoryId: rule.category_id,
        flowType,
        isDuplicateSettlement: flowType === 'transfer' ? 1 : 0
      };
    }
  }

  // 2. Check if this is a Bank transaction that settles a Credit Card bill
  if (accountType === 'bank' && chargedAmount < 0) {
    for (const ccPat of CC_SETTLEMENT_PATTERNS) {
      if (descLower.includes(ccPat.toLowerCase())) {
        return {
          categoryId: 'cc_settlement',
          flowType: 'transfer',
          isDuplicateSettlement: 1
        };
      }
    }
    for (const trPat of INTERNAL_TRANSFER_PATTERNS) {
      if (descLower.includes(trPat.toLowerCase())) {
        return {
          categoryId: 'cc_settlement',
          flowType: 'transfer',
          isDuplicateSettlement: 1
        };
      }
    }
  }

  // 3. Check built-in Israeli merchant & bank dictionary
  for (const rule of DEFAULT_MERCHANT_RULES) {
    if (descLower.includes(rule.pattern.toLowerCase())) {
      const flowType = chargedAmount > 0 ? 'income' : 'expense';
      return {
        categoryId: rule.categoryId,
        flowType,
        isDuplicateSettlement: 0
      };
    }
  }

  // 4. Fallback based on sign of chargedAmount
  if (chargedAmount > 0) {
    return {
      categoryId: 'other_income',
      flowType: 'income',
      isDuplicateSettlement: 0
    };
  }

  return {
    categoryId: 'uncategorized',
    flowType: 'expense',
    isDuplicateSettlement: 0
  };
}

module.exports = {
  DEFAULT_CATEGORIES,
  DEFAULT_MERCHANT_RULES,
  CC_SETTLEMENT_PATTERNS,
  classifyTransaction
};
