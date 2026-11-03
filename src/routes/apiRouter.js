const { sendJson, readJsonBody } = require('./httpHelpers');
const vaultService = require('../services/vaultService');
const dashboardService = require('../services/dashboardService');
const transactionService = require('../services/transactionService');
const accountService = require('../services/accountService');
const budgetService = require('../services/budgetService');
const memberService = require('../services/memberService');
const { parseAndImportStatement } = require('../services/importService');
const { otpCoordinator } = require('../services/otpCoordinator');
const { searchOfficialFunds } = require('../services/gemelNetApiService');
const { seedDemoData, clearDemoData } = require('../db/seedService');

async function handleApi(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // 1. Vault Management Endpoints (Can be accessed even when vault is locked)
  if (pathname === '/api/vault/status' && method === 'GET') {
    return sendJson(res, 200, vaultService.getVaultStatus());
  }

  if (pathname === '/api/vault/setup' && method === 'POST') {
    const body = await readJsonBody(req);
    const result = vaultService.setupVault(body.password);
    return sendJson(res, 200, result);
  }

  if (pathname === '/api/vault/unlock' && method === 'POST') {
    const body = await readJsonBody(req);
    const result = vaultService.unlockVault(body.password);
    return sendJson(res, 200, result);
  }

  if (pathname === '/api/vault/lock' && method === 'POST') {
    const result = vaultService.lockCurrentVault();
    return sendJson(res, 200, result);
  }

  // 2. Metadata & Dashboard
  if (pathname === '/api/meta' && method === 'GET') {
    const meta = accountService.getMeta();
    return sendJson(res, 200, meta);
  }

  if (pathname === '/api/dashboard' && method === 'GET') {
    const data = dashboardService.getDashboardAnalytics({
      month: parsedUrl.searchParams.get('month') || '',
      accountId: parsedUrl.searchParams.get('accountId') || '',
      memberId: parsedUrl.searchParams.get('memberId') || '',
      accountType: parsedUrl.searchParams.get('accountType') || ''
    });
    return sendJson(res, 200, data);
  }

  // 3. Transactions
  if (pathname === '/api/transactions' && method === 'GET') {
    const data = transactionService.listTransactions({
      month: parsedUrl.searchParams.get('month') || '',
      accountId: parsedUrl.searchParams.get('accountId') || '',
      memberId: parsedUrl.searchParams.get('memberId') || '',
      categoryId: parsedUrl.searchParams.get('categoryId') || '',
      flowType: parsedUrl.searchParams.get('flowType') || '',
      search: parsedUrl.searchParams.get('search') || '',
      limit: parsedUrl.searchParams.get('limit') || 500
    });
    return sendJson(res, 200, data);
  }

  if (pathname === '/api/transactions' && method === 'POST') {
    const body = await readJsonBody(req);
    const result = transactionService.createTransaction(body);
    return sendJson(res, 201, result);
  }

  if (pathname.startsWith('/api/transactions/') && method === 'PATCH') {
    const txId = Number(pathname.split('/').pop());
    const body = await readJsonBody(req);
    const result = transactionService.updateTransactionCategory(txId, body);
    return sendJson(res, 200, result);
  }

  if (pathname.startsWith('/api/transactions/') && method === 'DELETE') {
    const txId = Number(pathname.split('/').pop());
    const result = transactionService.deleteTransaction(txId);
    return sendJson(res, 200, result);
  }

  // 4. Accounts & Sync
  if (pathname === '/api/accounts' && method === 'POST') {
    const body = await readJsonBody(req);
    const result = accountService.createAccount(body);
    return sendJson(res, 201, result);
  }

  if (pathname.startsWith('/api/accounts/') && method === 'PATCH') {
    const accId = Number(pathname.split('/').pop());
    const body = await readJsonBody(req);
    const result = accountService.updateAccount(accId, body);
    return sendJson(res, 200, result);
  }

  if (pathname.startsWith('/api/accounts/') && method === 'DELETE') {
    const accId = Number(pathname.split('/').pop());
    const result = accountService.deleteAccount(accId);
    return sendJson(res, 200, result);
  }

  if (pathname === '/api/accounts/sync' && method === 'POST') {
    const body = await readJsonBody(req);
    const result = await accountService.syncAccounts({
      accountId: body.accountId,
      monthsBack: body.monthsBack,
      showBrowser: body.showBrowser
    });
    return sendJson(res, 200, result);
  }

  if (pathname === '/api/accounts/import' && method === 'POST') {
    const body = await readJsonBody(req);
    if (!body.accountId || !body.content) {
      return sendJson(res, 400, { error: 'חסר מזהה חשבון או תוכן קובץ' });
    }
    const result = parseAndImportStatement({
      accountId: Number(body.accountId),
      content: String(body.content),
      defaultIsExpenseForCreditCard: body.defaultIsExpenseForCreditCard !== false
    });
    return sendJson(res, 200, {
      ...result,
      message: `יובאו בהצלחה ${result.importedCount} תנועות חדשות (${result.skippedDuplicates} כפילויות דולגו אוטומטית)`
    });
  }

  // 5. OTP for 2FA
  if (pathname === '/api/otp/pending' && method === 'GET') {
    return sendJson(res, 200, { pending: otpCoordinator.getPendingList() });
  }

  if (pathname === '/api/otp/submit' && method === 'POST') {
    const body = await readJsonBody(req);
    const ok = otpCoordinator.submitOtp(body.accountId, body.code);
    if (!ok) {
      return sendJson(res, 400, { error: 'לא נמצאה בקשת OTP ממתינה לחשבון זה' });
    }
    return sendJson(res, 200, { submitted: true, message: 'קוד האימות נשלח לבנק! ממשיך במשיכת הנתונים...' });
  }

  // 6. Provident / Pension Funds Search
  if (pathname === '/api/funds/search' && method === 'GET') {
    const q = parsedUrl.searchParams.get('q') || '';
    const funds = await searchOfficialFunds(q, 20);
    return sendJson(res, 200, { funds });
  }

  // 7. Household Members
  if (pathname === '/api/members' && method === 'POST') {
    const body = await readJsonBody(req);
    const result = memberService.createMember(body);
    return sendJson(res, 201, result);
  }

  // 8. Budgets & Savings Goals
  if (pathname === '/api/budgets' && method === 'GET') {
    const month = parsedUrl.searchParams.get('month') || undefined;
    const result = budgetService.getBudgets(month);
    return sendJson(res, 200, result);
  }

  if (pathname === '/api/budgets/category' && method === 'PATCH') {
    const body = await readJsonBody(req);
    const result = budgetService.updateCategoryBudget(body.categoryId, body.monthlyBudget);
    return sendJson(res, 200, result);
  }

  if (pathname === '/api/budgets/goals' && method === 'POST') {
    const body = await readJsonBody(req);
    const result = budgetService.createSavingsGoal(body);
    return sendJson(res, 201, result);
  }

  if (pathname.startsWith('/api/budgets/goals/') && method === 'PATCH') {
    const goalId = Number(pathname.split('/').pop());
    const body = await readJsonBody(req);
    const result = budgetService.updateSavingsGoal(goalId, body);
    return sendJson(res, 200, result);
  }

  // 9. Demo Data
  if (pathname === '/api/demo/seed' && method === 'POST') {
    const result = seedDemoData();
    vaultService.persistVault();
    return sendJson(res, 200, result);
  }

  if (pathname === '/api/demo/clear' && method === 'POST') {
    const result = clearDemoData();
    vaultService.persistVault();
    return sendJson(res, 200, result);
  }

  return sendJson(res, 404, { error: 'נתיב API לא נמצא' });
}

module.exports = {
  handleApi
};
