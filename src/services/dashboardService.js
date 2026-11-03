const { getDb } = require('../db/database');

function getDashboardAnalytics({ month = '', accountId = '', memberId = '', accountType = '' } = {}) {
  const db = getDb();

  const whereClauses = ['1=1'];
  const params = [];

  let cutoffYm = null;
  if (month && month !== 'all') {
    if (month === 'last3') {
      const d = new Date();
      d.setMonth(d.getMonth() - 2);
      cutoffYm = d.toISOString().slice(0, 7);
      whereClauses.push('substr(t.date, 1, 7) >= ?');
      params.push(cutoffYm);
    } else if (month === 'last6') {
      const d = new Date();
      d.setMonth(d.getMonth() - 5);
      cutoffYm = d.toISOString().slice(0, 7);
      whereClauses.push('substr(t.date, 1, 7) >= ?');
      params.push(cutoffYm);
    } else {
      whereClauses.push('substr(t.date, 1, 7) = ?');
      params.push(month);
    }
  }
  if (accountId) {
    whereClauses.push('t.account_id = ?');
    params.push(Number(accountId));
  }
  if (memberId) {
    whereClauses.push('a.member_id = ?');
    params.push(Number(memberId));
  }
  if (accountType) {
    whereClauses.push('a.account_type = ?');
    params.push(accountType);
  }

  const whereSql = whereClauses.join(' AND ');

  // Summary KPIs (excluding duplicate credit card settlements!)
  const kpiRow = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN t.flow_type = 'income' AND t.is_duplicate_settlement = 0 THEN t.charged_amount ELSE 0 END), 0) as total_income,
      COALESCE(SUM(CASE WHEN t.flow_type = 'expense' AND t.is_duplicate_settlement = 0 THEN ABS(t.charged_amount) ELSE 0 END), 0) as total_expense,
      COALESCE(SUM(CASE WHEN t.is_duplicate_settlement = 1 THEN ABS(t.charged_amount) ELSE 0 END), 0) as prevented_double_count,
      COUNT(CASE WHEN t.is_duplicate_settlement = 0 THEN 1 END) as tx_count
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE ${whereSql}
  `).get(...params);

  const totalIncome = Number(kpiRow.total_income || 0);
  const totalExpense = Number(kpiRow.total_expense || 0);
  const netCashflow = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? Math.round((netCashflow / totalIncome) * 1000) / 10 : 0;

  // Breakdown by Category (Expenses)
  const byCategory = db.prepare(`
    SELECT
      c.id, c.name, c.icon, c.color, c.monthly_budget,
      COALESCE(SUM(ABS(t.charged_amount)), 0) as total,
      COUNT(t.id) as count
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    JOIN categories c ON c.id = t.category_id
    WHERE ${whereSql} AND t.flow_type = 'expense' AND t.is_duplicate_settlement = 0
    GROUP BY c.id
    ORDER BY total DESC
  `).all(...params);

  // Breakdown by Account / Card
  const accJoinMonthSql = cutoffYm
    ? 'AND substr(t.date, 1, 7) >= ?'
    : (month && month !== 'all' ? 'AND substr(t.date, 1, 7) = ?' : '');
  const accJoinMonthParam = cutoffYm ? [cutoffYm] : (month && month !== 'all' ? [month] : []);

  const byAccount = db.prepare(`
    SELECT
      a.id, a.name, a.company_id, a.account_type, a.color, a.balance, a.credit_limit,
      m.name as member_name, m.avatar as member_avatar,
      COALESCE(SUM(CASE WHEN t.flow_type = 'income' AND t.is_duplicate_settlement = 0 THEN t.charged_amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN t.flow_type = 'expense' AND t.is_duplicate_settlement = 0 THEN ABS(t.charged_amount) ELSE 0 END), 0) as expense,
      COUNT(t.id) as tx_count
    FROM accounts a
    LEFT JOIN members m ON m.id = a.member_id
    LEFT JOIN transactions t ON t.account_id = a.id
      ${accJoinMonthSql}
    WHERE 1=1
      ${memberId ? 'AND a.member_id = ?' : ''}
      ${accountType ? 'AND a.account_type = ?' : ''}
    GROUP BY a.id
    ORDER BY a.account_type ASC, expense DESC
  `).all(
    ...[
      ...accJoinMonthParam,
      ...(memberId ? [Number(memberId)] : []),
      ...(accountType ? [accountType] : [])
    ]
  );

  // Breakdown by Member
  const byMember = db.prepare(`
    SELECT
      m.id, m.name, m.avatar, m.color,
      COALESCE(SUM(CASE WHEN t.flow_type = 'income' AND t.is_duplicate_settlement = 0 THEN t.charged_amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN t.flow_type = 'expense' AND t.is_duplicate_settlement = 0 THEN ABS(t.charged_amount) ELSE 0 END), 0) as expense
    FROM members m
    LEFT JOIN accounts a ON a.member_id = m.id
    LEFT JOIN transactions t ON t.account_id = a.id
      ${accJoinMonthSql}
    GROUP BY m.id
    ORDER BY expense DESC
  `).all(...accJoinMonthParam);

  // Monthly Trend (last 12 months)
  const trendFilterClauses = ['t.is_duplicate_settlement = 0'];
  const trendParams = [];
  if (accountId) {
    trendFilterClauses.push('t.account_id = ?');
    trendParams.push(Number(accountId));
  }
  if (memberId) {
    trendFilterClauses.push('a.member_id = ?');
    trendParams.push(Number(memberId));
  }
  if (accountType) {
    trendFilterClauses.push('a.account_type = ?');
    trendParams.push(accountType);
  }

  const monthlyTrend = db.prepare(`
    SELECT
      substr(t.date, 1, 7) as ym,
      COALESCE(SUM(CASE WHEN t.flow_type = 'income' THEN t.charged_amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN t.flow_type = 'expense' THEN ABS(t.charged_amount) ELSE 0 END), 0) as expense,
      COALESCE(SUM(CASE WHEN t.category_id = 'savings' THEN ABS(t.charged_amount) ELSE 0 END), 0) as savings,
      COUNT(t.id) as tx_count
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE ${trendFilterClauses.join(' AND ')}
    GROUP BY ym
    ORDER BY ym ASC
    LIMIT 12
  `).all(...trendParams);

  // Top Merchants
  const topMerchants = db.prepare(`
    SELECT
      t.description,
      c.name as category_name,
      c.icon as category_icon,
      COUNT(t.id) as tx_count,
      SUM(ABS(t.charged_amount)) as total_spent
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    JOIN categories c ON c.id = t.category_id
    WHERE ${whereSql} AND t.flow_type = 'expense' AND t.is_duplicate_settlement = 0
    GROUP BY t.description
    ORDER BY total_spent DESC
    LIMIT 8
  `).all(...params);

  // Total Balances
  const balancesRow = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN account_type = 'bank' THEN balance ELSE 0 END), 0) as bank_balance,
      COALESCE(SUM(CASE WHEN account_type = 'credit_card' THEN balance ELSE 0 END), 0) as cc_balance,
      COALESCE(SUM(CASE WHEN account_type = 'investment' THEN balance ELSE 0 END), 0) as inv_balance
    FROM accounts
  `).get();

  return {
    kpis: {
      totalIncome,
      totalExpense,
      netCashflow,
      savingsRate,
      preventedDoubleCount: Number(kpiRow.prevented_double_count || 0),
      txCount: Number(kpiRow.tx_count || 0),
      bankBalance: Number(balancesRow.bank_balance || 0),
      ccBalance: Number(balancesRow.cc_balance || 0),
      invBalance: Number(balancesRow.inv_balance || 0)
    },
    byCategory,
    byAccount,
    byMember,
    monthlyTrend,
    topMerchants
  };
}

module.exports = {
  getDashboardAnalytics
};
