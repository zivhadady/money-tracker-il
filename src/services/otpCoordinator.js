const { EventEmitter } = require('node:events');

class OtpCoordinator extends EventEmitter {
  constructor() {
    super();
    this.pendingByAccount = new Map(); // accountId -> { accountId, accountName, companyId, promptText, createdAt }
    this.resolversByAccount = new Map(); // accountId -> resolve(code)
  }

  requestOtp({ accountId, accountName, companyId, promptText }) {
    const info = {
      accountId: Number(accountId),
      accountName,
      companyId,
      promptText: promptText || 'הזן את קוד האימות (OTP) שנשלח אליך ב-SMS מהבנק / חברת האשראי:',
      createdAt: Date.now()
    };
    this.pendingByAccount.set(Number(accountId), info);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingByAccount.delete(Number(accountId));
        this.resolversByAccount.delete(Number(accountId));
        reject(new Error('פג תוקף ההמתנה להזנת קוד SMS (OTP)'));
      }, 180000); // 3 minutes

      this.resolversByAccount.set(Number(accountId), code => {
        clearTimeout(timer);
        this.pendingByAccount.delete(Number(accountId));
        this.resolversByAccount.delete(Number(accountId));
        resolve(String(code || '').trim());
      });
    });
  }

  submitOtp(accountId, code) {
    const resolver = this.resolversByAccount.get(Number(accountId));
    if (!resolver) {
      return false;
    }
    resolver(code);
    return true;
  }

  getPendingList() {
    return Array.from(this.pendingByAccount.values());
  }

  clearAccount(accountId) {
    this.pendingByAccount.delete(Number(accountId));
    this.resolversByAccount.delete(Number(accountId));
  }
}

const otpCoordinator = new OtpCoordinator();

module.exports = {
  otpCoordinator
};
