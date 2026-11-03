const assert = require('node:assert');
const { encryptCredentials, decryptCredentials, generateTransactionHash } = require('../src/services/cryptoService');
const { classifyTransaction } = require('../src/services/categorizerService');
const { server } = require('../src/server');
const vaultService = require('../src/services/vaultService');
const memberService = require('../src/services/memberService');
const budgetService = require('../src/services/budgetService');
const transactionService = require('../src/services/transactionService');
const dashboardService = require('../src/services/dashboardService');

async function runVerification() {
  console.log('1. Testing AES-256-GCM encryption & decryption...');
  const sampleCreds = { username: 'israel123', password: 'secretPassword!' };
  const encrypted = encryptCredentials(sampleCreds);
  assert.ok(encrypted && !encrypted.includes('secretPassword!'), 'Credentials must be encrypted');
  const decrypted = decryptCredentials(encrypted);
  assert.deepStrictEqual(decrypted, sampleCreds, 'Decrypted credentials must match original');
  console.log('   ✅ Encryption verified.');

  console.log('2. Testing Categorization & Duplicate Credit Card Settlement detection...');
  const ccSettlementOnBank = classifyTransaction({
    accountType: 'bank',
    description: 'ישראכרט בע"מ - חיוב חודשי',
    chargedAmount: -4250
  });
  assert.strictEqual(ccSettlementOnBank.categoryId, 'cc_settlement');
  assert.strictEqual(ccSettlementOnBank.isDuplicateSettlement, 1, 'Bank CC settlement must be flagged to avoid double counting');

  const supermarketOnCard = classifyTransaction({
    accountType: 'credit_card',
    description: 'שופרסל דיל אקסטרה',
    chargedAmount: -540
  });
  assert.strictEqual(supermarketOnCard.categoryId, 'groceries');
  assert.strictEqual(supermarketOnCard.isDuplicateSettlement, 0);
  console.log('   ✅ Categorization & duplicate prevention verified.');

  console.log('3. Testing Modular Services directly...');
  // Vault status
  const vStatus = vaultService.getVaultStatus();
  assert.ok(typeof vStatus.configured === 'boolean');

  // Member service
  const newMember = memberService.createMember({ name: 'בדיקה שירותים', role: 'ילד', color: '#6366f1', avatar: '🧒' });
  assert.ok(newMember.id > 0);

  // Budget service
  const budgets = budgetService.getBudgets();
  assert.ok(budgets.categories.length > 0);
  const newGoal = budgetService.createSavingsGoal({ name: 'רכב חדש', targetAmount: 80000, currentAmount: 15000 });
  assert.ok(newGoal.id > 0);

  // Dashboard service
  const dashData = dashboardService.getDashboardAnalytics();
  assert.ok(dashData.kpis);
  assert.ok(dashData.byCategory.length > 0);
  console.log('   ✅ Direct Service layer verified.');

  console.log('4. Testing HTTP Server & REST API endpoints...');
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Test /api/meta
  const metaRes = await fetch(`${baseUrl}/api/meta`);
  assert.strictEqual(metaRes.status, 200);
  const meta = await metaRes.json();
  assert.ok(meta.accounts.length >= 5, 'Should have demo accounts seeded');
  assert.ok(meta.providers.length >= 10, 'Should list Israeli bank & card providers');

  // Test /api/dashboard
  const dashRes = await fetch(`${baseUrl}/api/dashboard?month=all`);
  assert.strictEqual(dashRes.status, 200);
  const dash = await dashRes.json();
  assert.ok(dash.kpis.totalIncome > 0, 'Total income should be positive');
  assert.ok(dash.kpis.totalExpense > 0, 'Total expense should be positive');
  assert.ok(dash.kpis.preventedDoubleCount > 0, 'Prevented double count should be tracked');

  // Test CSV Import
  const csvSample = [
    'תאריך עסקה,שם בית העסק,סכום חיוב,הערות',
    '15/10/2026,רמי לוי שיווק השקמה,412.80,קנייה לבית',
    '16/10/2026,פז תחנת דלק,280.00,תדלוק מלא'
  ].join('\n');

  const importRes = await fetch(`${baseUrl}/api/accounts/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId: meta.accounts[2].id,
      content: csvSample
    })
  });
  assert.strictEqual(importRes.status, 200);
  const importData = await importRes.json();
  assert.ok(importData.importedCount + importData.skippedDuplicates === 2, 'Should process 2 CSV rows');

  // Test Manual Transaction creation & deletion
  const addTxRes = await fetch(`${baseUrl}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId: meta.accounts[0].id,
      description: 'קפה ומאפה',
      amount: 32,
      flowType: 'expense',
      categoryId: 'dining'
    })
  });
  assert.strictEqual(addTxRes.status, 201);
  const newTx = await addTxRes.json();
  assert.ok(newTx.id > 0);

  const delTxRes = await fetch(`${baseUrl}/api/transactions/${newTx.id}`, { method: 'DELETE' });
  assert.strictEqual(delTxRes.status, 200);

  server.close();
  console.log('   ✅ All API endpoints & CSV importer verified successfully!');
}

runVerification().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
