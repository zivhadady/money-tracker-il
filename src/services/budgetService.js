const { getDb } = require('../db/database');

function getBudgets(month = new Date().toISOString().slice(0, 7)) {
  const db = getDb();

  const categories = db.prepare(`
    SELECT
      c.id, c.name, c.icon, c.color, c.monthly_budget,
      COALESCE(SUM(CASE WHEN substr(t.date, 1, 7) = ? AND t.flow_type = 'expense' AND t.is_duplicate_settlement = 0 THEN ABS(t.charged_amount) ELSE 0 END), 0) as spent
    FROM categories c
    LEFT JOIN transactions t ON t.category_id = c.id
    WHERE c.type = 'expense'
    GROUP BY c.id
    ORDER BY c.monthly_budget DESC, spent DESC
  `).all(month);

  const goals = db.prepare('SELECT * FROM savings_goals ORDER BY id ASC').all();
  return { month, categories, goals };
}

function updateCategoryBudget(categoryId, monthlyBudget) {
  const db = getDb();
  db.prepare('UPDATE categories SET monthly_budget = ? WHERE id = ?')
    .run(Number(monthlyBudget || 0), categoryId);
  return { updated: true, message: 'תקציב הקטגוריה עודכן' };
}

function createSavingsGoal(data) {
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO savings_goals (name, target_amount, current_amount, target_date, icon, color, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(
    data.name,
    Number(data.targetAmount || 0),
    Number(data.currentAmount || 0),
    data.targetDate || null,
    data.icon || '🎯',
    data.color || '#10b981'
  );
  return { id: info.lastInsertRowid, message: 'יעד חיסכון נוסף בהצלחה' };
}

function updateSavingsGoal(goalId, data) {
  const db = getDb();
  db.prepare('UPDATE savings_goals SET current_amount = ?, target_amount = COALESCE(?, target_amount) WHERE id = ?')
    .run(Number(data.currentAmount), data.targetAmount ? Number(data.targetAmount) : null, goalId);
  return { updated: true, message: 'יעד החיסכון עודכן' };
}

module.exports = {
  getBudgets,
  updateCategoryBudget,
  createSavingsGoal,
  updateSavingsGoal
};
