const {
  isVaultConfigured,
  isVaultUnlocked,
  setupVaultPassword,
  unlockVaultWithPassword,
  lockVault,
  saveEncryptedVault
} = require('../db/database');

function getVaultStatus() {
  return {
    configured: isVaultConfigured(),
    unlocked: isVaultUnlocked()
  };
}

function setupVault(password) {
  if (!password || typeof password !== 'string') {
    const error = new Error('יש לספק סיסמת מאסטר תקינה');
    error.statusCode = 400;
    throw error;
  }
  setupVaultPassword(password);
  return {
    configured: true,
    unlocked: true,
    message: 'מסד הנתונים הוצפן בהצלחה ב-AES-256-GCM ומוגן כעת בסיסמה שלך!'
  };
}

function unlockVault(password) {
  if (!password) {
    const error = new Error('נא להזין סיסמה');
    error.statusCode = 400;
    throw error;
  }
  unlockVaultWithPassword(password);
  return {
    configured: true,
    unlocked: true,
    message: 'מסד הנתונים המוצפן נפתח בהצלחה!'
  };
}

function lockCurrentVault() {
  lockVault();
  return {
    configured: isVaultConfigured(),
    unlocked: false,
    message: 'מסד הנתונים ננעל והוצפן לדיסק'
  };
}

function persistVault() {
  try {
    saveEncryptedVault();
  } catch (err) {
    console.error('Failed to auto-save encrypted vault:', err.message);
  }
}

module.exports = {
  getVaultStatus,
  setupVault,
  unlockVault,
  lockCurrentVault,
  persistVault
};
