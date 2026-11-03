const { getDb } = require('../db/database');

function listMembers() {
  const db = getDb();
  return db.prepare('SELECT * FROM members ORDER BY id ASC').all();
}

function createMember(data) {
  const db = getDb();
  if (!data.name || !data.name.trim()) {
    const error = new Error('נא להזין שם');
    error.statusCode = 400;
    throw error;
  }
  const info = db.prepare('INSERT INTO members (name, role, color, avatar) VALUES (?, ?, ?, ?)')
    .run(data.name.trim(), data.role || 'בן/בת משפחה', data.color || '#3b82f6', data.avatar || '👤');
  return { id: info.lastInsertRowid, message: 'בן/בת משפחה נוסף בהצלחה' };
}

module.exports = {
  listMembers,
  createMember
};
