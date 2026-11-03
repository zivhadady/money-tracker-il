// Money Tracker IL - Frontend Application Logic (Hebrew RTL)

const state = {
  providers: [],
  members: [],
  categories: [],
  accounts: [],
  availableMonths: [],
  rules: [],
  selectedMonth: '',
  selectedMemberId: '',
  selectedAccountType: '',
  selectedAccountId: '',
  currentView: 'dashboard',
  lastTransactions: []
};

const HEBREW_MONTHS = {
  '01': 'ינואר',
  '02': 'פברואר',
  '03': 'מרץ',
  '04': 'אפריל',
  '05': 'מאי',
  '06': 'יוני',
  '07': 'יולי',
  '08': 'אוגוסט',
  '09': 'ספטמבר',
  '10': 'אוקטובר',
  '11': 'נובמבר',
  '12': 'דצמבר'
};

function formatCurrency(num) {
  const n = Number(num || 0);
  const sign = n < 0 ? '-' : '';
  return `${sign}₪${Math.abs(n).toLocaleString('he-IL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })}`;
}

function formatCurrencyExact(num) {
  const n = Number(num || 0);
  const sign = n < 0 ? '-' : (n > 0 ? '+' : '');
  return `${sign}₪${Math.abs(n).toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatMonthLabel(ym) {
  if (!ym || ym === 'all') return 'כל החודשים (מצטבר)';
  if (ym === 'last3') return '3 חודשים אחרונים';
  if (ym === 'last6') return '6 חודשים אחרונים';
  const [y, m] = ym.split('-');
  return `${HEBREW_MONTHS[m] || m} ${y}`;
}

function showToast(message, color = '#3b82f6') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.borderRightColor = color;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 4200);
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'שגיאה בביצוע הפעולה');
  }
  return data;
}

// Initialize App
async function initApp() {
  bindEvents();
  const vaultReady = await checkVaultStatus();
  if (vaultReady) {
    await loadMetadata();
    await refreshAllViews();
  }
}

async function checkVaultStatus() {
  try {
    const status = await apiFetch('/api/vault/status');
    updateVaultBadgeUi(status);
    if (status.configured && !status.unlocked) {
      promptVaultModal('unlock');
      return false;
    }
    return true;
  } catch (_e) {
    return true;
  }
}

function updateVaultBadgeUi(status) {
  const titleEl = document.getElementById('vaultStatusTitle');
  const subEl = document.getElementById('vaultStatusSub');
  const btnEl = document.getElementById('btnVaultAction');
  if (!titleEl || !btnEl) return;

  if (status.configured && status.unlocked) {
    titleEl.textContent = 'SQLite Vault פתוח ומוצפן';
    subEl.textContent = 'מוצפן AES-256-GCM (קובץ .db.enc)';
    btnEl.textContent = '🔒 נעל מסד נתונים עכשיו';
    btnEl.onclick = async () => {
      await apiFetch('/api/vault/lock', { method: 'POST' });
      showToast('מסד הנתונים ננעל והוצפן!', '#f59e0b');
      await checkVaultStatus();
    };
  } else if (status.configured && !status.unlocked) {
    titleEl.textContent = 'SQLite Vault נעול';
    subEl.textContent = 'נדרשת סיסמה לפתיחת הנתונים';
    btnEl.textContent = '🔓 פתח מסד נתונים מוצפן';
    btnEl.onclick = () => promptVaultModal('unlock');
  } else {
    titleEl.textContent = 'הגדר סיסמה ל-SQLite';
    subEl.textContent = 'לחץ להצפנת כל מסד הנתונים בסיסמה';
    btnEl.textContent = '🔐 הגדר סיסמת הצפנה ל-SQLite';
    btnEl.onclick = () => promptVaultModal('setup');
  }
}

function promptVaultModal(mode) {
  const modeInput = document.getElementById('vaultModeInput');
  const title = document.getElementById('vaultModalTitle');
  const desc = document.getElementById('vaultModalDesc');
  const submitBtn = document.getElementById('btnVaultSubmit');
  const closeBtn = document.getElementById('btnCloseVaultModal');

  modeInput.value = mode;
  if (mode === 'unlock') {
    title.textContent = '🔒 מסד הנתונים מוצפן ונעול';
    desc.innerHTML = 'קובץ ה-SQLite שלך מוצפן ב-<strong>AES-256-GCM</strong>. הזן את הסיסמה שלך כדי לפענח ולטעון את הנתונים:';
    submitBtn.textContent = '🔓 פתח כספת נתונים';
    if (closeBtn) closeBtn.style.display = 'none';
  } else {
    title.textContent = '🔐 הגדרת סיסמה והצפנת SQLite';
    desc.innerHTML = 'בחר סיסמה להצפנת כל מסד הנתונים (<strong>money_tracker.db.enc</strong>). הקובץ הלא-מוצפן יימחק לחלוטין מהדיסק וכל המידע יישמר מוצפן בלבד:';
    submitBtn.textContent = '🔒 הצפן את מסד הנתונים בסיסמה זו';
    if (closeBtn) closeBtn.style.display = 'block';
  }

  openModal('modalVaultPassword');
  setTimeout(() => document.getElementById('vaultPasswordInput').focus(), 100);
}

async function loadMetadata() {
  const meta = await apiFetch('/api/meta');
  state.providers = meta.providers || [];
  state.members = meta.members || [];
  state.categories = meta.categories || [];
  state.accounts = meta.accounts || [];
  state.availableMonths = meta.availableMonths || [];
  state.rules = meta.rules || [];

  if (!state.selectedMonth) {
    state.selectedMonth = state.availableMonths[0] || new Date().toISOString().slice(0, 7);
  }

  renderGlobalFilters();
  renderMonthPills();
  populateModalSelects();
}

function renderMonthPills() {
  const bar = document.getElementById('monthPillsBar');
  if (!bar) return;

  const pillsHtml = state.availableMonths.map(ym => `
    <button class="month-pill ${state.selectedMonth === ym ? 'active' : ''}" onclick="selectDashboardMonth('${ym}')">
      📅 ${formatMonthLabel(ym)}
    </button>
  `).join('');

  bar.innerHTML = pillsHtml + `
    <button class="month-pill ${state.selectedMonth === 'all' ? 'active' : ''}" onclick="selectDashboardMonth('all')">
      🌟 כל התקופה במצטבר
    </button>
  `;
}

window.selectDashboardMonth = function (ym) {
  state.selectedMonth = ym;
  document.getElementById('globalMonthSelect').value = ym;
  renderMonthPills();
  refreshAllViews();
};

function renderGlobalFilters() {
  // Month Select
  const monthSel = document.getElementById('globalMonthSelect');
  monthSel.innerHTML = [
    `<option value="all" ${state.selectedMonth === 'all' ? 'selected' : ''}>🌟 כל החודשים (מצטבר)</option>`,
    `<option value="last6" ${state.selectedMonth === 'last6' ? 'selected' : ''}>📅 6 חודשים אחרונים</option>`,
    `<option value="last3" ${state.selectedMonth === 'last3' ? 'selected' : ''}>📅 3 חודשים אחרונים</option>`,
    ...state.availableMonths.map(
      ym => `<option value="${ym}" ${state.selectedMonth === ym ? 'selected' : ''}>${formatMonthLabel(ym)}</option>`
    )
  ].join('');

  // Member Select
  const memSel = document.getElementById('globalMemberSelect');
  memSel.innerHTML = [
    `<option value="">כל המשפחה (מאוחד)</option>`,
    ...state.members.map(
      m => `<option value="${m.id}" ${String(state.selectedMemberId) === String(m.id) ? 'selected' : ''}>${m.avatar} ${m.name}</option>`
    )
  ].join('');

  // Account Select
  const accSel = document.getElementById('globalAccountSelect');
  const filteredAccounts = state.accounts.filter(a => {
    if (state.selectedMemberId && String(a.member_id) !== String(state.selectedMemberId)) return false;
    if (state.selectedAccountType && a.account_type !== state.selectedAccountType) return false;
    return true;
  });

  accSel.innerHTML = [
    `<option value="">כל החשבונות והכרטיסים (${filteredAccounts.length})</option>`,
    ...filteredAccounts.map(
      a => `<option value="${a.id}" ${String(state.selectedAccountId) === String(a.id) ? 'selected' : ''}>${a.account_type === 'bank' ? '🏦' : '💳'} ${a.name}</option>`
    )
  ].join('');

  // Transaction Category Filter
  const catFilter = document.getElementById('txCategoryFilter');
  const currentCatVal = catFilter.value;
  catFilter.innerHTML = [
    `<option value="">כל הקטגוריות</option>`,
    ...state.categories.map(c => `<option value="${c.id}" ${currentCatVal === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`)
  ].join('');
}

function populateModalSelects() {
  // Providers in Add Account Modal
  const compSel = document.getElementById('accCompanySelect');
  compSel.innerHTML = state.providers.map(p => {
    const prefix = p.type === 'bank' ? '🏦 בנק:' : (p.type === 'credit_card' ? '💳 אשראי:' : (p.type === 'investment' ? '📈 גמל/מסחר:' : '💵'));
    return `<option value="${p.id}">${prefix} ${p.name}</option>`;
  }).join('');
  renderDynamicCredentialFields();

  // Member Select in Add Account Modal
  const accMemSel = document.getElementById('accMemberSelect');
  accMemSel.innerHTML = state.members.map(m => `<option value="${m.id}">${m.avatar} ${m.name}</option>`).join('');

  // Accounts in Import & Manual Tx Modals
  const accOptionsHtml = state.accounts.map(
    a => `<option value="${a.id}">${a.account_type === 'bank' ? '🏦' : '💳'} ${a.name}</option>`
  ).join('');
  document.getElementById('importAccountSelect').innerHTML = accOptionsHtml;
  document.getElementById('manualAccountSelect').innerHTML = accOptionsHtml;

  // Categories in Manual Tx Modal
  const manCatSel = document.getElementById('manualCategorySelect');
  manCatSel.innerHTML = [
    `<option value="">✨ זיהוי אוטומטי חכם לפי שם העסק</option>`,
    ...state.categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`)
  ].join('');

  document.getElementById('manualDate').value = new Date().toISOString().slice(0, 10);
}

function renderDynamicCredentialFields() {
  const companyId = document.getElementById('accCompanySelect').value;
  const provider = state.providers.find(p => p.id === companyId);
  const container = document.getElementById('dynamicCredentialsFields');

  if (!provider || !provider.fields || provider.fields.length === 0) {
    container.innerHTML = `<p class="text-xs text-muted">לסוג חשבון זה אין צורך בפרטי התחברות אוטומטיים.</p>`;
    return;
  }

  container.innerHTML = provider.fields.map(f => `
    <div class="form-row" style="margin-top:8px;">
      <label>${f.label}:</label>
      <input type="${f.type}" data-cred-key="${f.key}" class="form-input cred-input" placeholder="הזן ${f.label}..." />
    </div>
  `).join('');
}

async function refreshAllViews() {
  await Promise.all([
    loadDashboardData(),
    loadTransactionsData(),
    renderAccountsCards(),
    loadBudgetsData()
  ]);
}

// 1. Load & Render Dashboard
async function loadDashboardData() {
  const params = new URLSearchParams({
    month: state.selectedMonth,
    memberId: state.selectedMemberId,
    accountType: state.selectedAccountType,
    accountId: state.selectedAccountId
  });

  const data = await apiFetch(`/api/dashboard?${params.toString()}`);
  const { kpis, byCategory, byAccount, monthlyTrend, topMerchants } = data;

  // KPIs
  document.getElementById('kpiTotalIncome').textContent = formatCurrency(kpis.totalIncome);
  document.getElementById('kpiIncomeSub').textContent = `עבור ${formatMonthLabel(state.selectedMonth)}`;

  document.getElementById('kpiTotalExpense').textContent = formatCurrency(kpis.totalExpense);
  document.getElementById('kpiExpenseSub').textContent = `${kpis.txCount} תנועות מאומתות בתקופה`;

  const netEl = document.getElementById('kpiNetCashflow');
  netEl.textContent = formatCurrency(kpis.netCashflow);
  netEl.style.color = kpis.netCashflow >= 0 ? '#34d399' : '#f87171';
  document.getElementById('kpiSavingsRate').textContent = `שיעור חיסכון מהכנסה: ${kpis.savingsRate}%`;

  document.getElementById('kpiBankBalance').textContent = formatCurrency(kpis.bankBalance);
  document.getElementById('kpiPreventedDouble').textContent = kpis.invBalance > 0
    ? `📈 צבירה בגמל/מסחר: ${formatCurrency(kpis.invBalance)} | מניעת כפילות: ${formatCurrency(kpis.preventedDoubleCount)}`
    : `מניעת ספירה כפולה (חיובי אשראי בבנק): ${formatCurrency(kpis.preventedDoubleCount)}`;

  // Monthly Trend Chart
  renderMonthlyTrendChart(monthlyTrend);

  // Monthly Individual Dashboards Grid
  renderMonthlyDashboardsGrid(monthlyTrend);

  // Category Donut & Legend
  renderCategoryDonut(byCategory, kpis.totalExpense);

  // Accounts Breakdown List
  renderDashboardAccounts(byAccount);

  // Top Merchants
  renderTopMerchants(topMerchants);
}

function renderMonthlyTrendChart(trend) {
  const container = document.getElementById('monthlyTrendChart');
  if (!trend || trend.length === 0) {
    container.innerHTML = `<p class="text-muted" style="text-align:center;padding:40px;">אין נתונים להצגת מגמה</p>`;
    return;
  }

  const maxVal = Math.max(...trend.flatMap(t => [t.income, t.expense]), 1000);

  const colsHtml = trend.map(item => {
    const incHeight = Math.max(Math.round((item.income / maxVal) * 155), 4);
    const expHeight = Math.max(Math.round((item.expense / maxVal) * 155), 4);
    const [, m] = item.ym.split('-');
    const label = HEBREW_MONTHS[m] || item.ym;

    return `
      <div class="trend-month-col" style="cursor:pointer;" onclick="selectDashboardMonth('${item.ym}')" title="לחץ להצגת הדשבורד של ${formatMonthLabel(item.ym)}&#10;הכנסות: ${formatCurrency(item.income)}&#10;הוצאות: ${formatCurrency(item.expense)}">
        <div class="trend-bars-pair">
          <div class="trend-bar income-bar" style="height:${incHeight}px;"></div>
          <div class="trend-bar expense-bar" style="height:${expHeight}px;"></div>
        </div>
        <div class="trend-month-label" style="${state.selectedMonth === item.ym ? 'color:#60a5fa;text-decoration:underline;' : ''}">${label}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="trend-bars-wrapper">${colsHtml}</div>
    <div class="trend-legend">
      <span>🟢 הכנסות</span>
      <span>🔴 הוצאות (לחיצה על עמודת חודש פותחת את הדשבורד שלו)</span>
    </div>
  `;
}

function renderMonthlyDashboardsGrid(monthlyTrend) {
  const container = document.getElementById('monthlyDashboardsGrid');
  if (!container) return;
  if (!monthlyTrend || monthlyTrend.length === 0) {
    container.innerHTML = `<p class="text-muted">אין נתונים חודשיים</p>`;
    return;
  }

  const sortedDesc = [...monthlyTrend].reverse();
  container.innerHTML = sortedDesc.map(m => {
    const net = Number(m.income || 0) - Number(m.expense || 0);
    const isSelected = state.selectedMonth === m.ym;
    return `
      <div class="month-summary-card ${isSelected ? 'selected-month' : ''}" onclick="selectDashboardMonth('${m.ym}')">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <strong style="font-size:1.05rem;">📅 ${formatMonthLabel(m.ym)}</strong>
          <span class="badge ${isSelected ? 'badge-info' : 'badge-purple'}">${m.tx_count || 0} תנועות</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;font-size:0.88rem;">
          <div style="display:flex;justify-content:space-between;">
            <span class="text-muted">הכנסות החודש:</span>
            <strong class="amount-income">+${formatCurrency(m.income)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span class="text-muted">הוצאות החודש:</span>
            <strong class="amount-expense">-${formatCurrency(m.expense)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span class="text-muted">מתוכן הפקדה לחיסכון:</span>
            <strong style="color:#06b6d4;">🐷 ${formatCurrency(m.savings || 0)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding-top:6px;border-top:1px solid rgba(148,163,184,0.15);">
            <span>תזרים נטו בחודש:</span>
            <strong style="direction:ltr;color:${net >= 0 ? '#34d399' : '#f87171'};">${formatCurrency(net)}</strong>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderCategoryDonut(categories, totalExpense) {
  const donutContainer = document.getElementById('categoryDonutChart');
  const legendContainer = document.getElementById('categoryLegendList');
  document.getElementById('categoryCountBadge').textContent = `${categories.length} קטגוריות פעילות`;

  if (!categories || categories.length === 0 || totalExpense <= 0) {
    donutContainer.innerHTML = `<div class="text-muted">אין הוצאות בתקופה</div>`;
    legendContainer.innerHTML = '';
    return;
  }

  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  let accumulatedPercent = 0;

  const circlesSvg = categories.map(cat => {
    const pct = cat.total / totalExpense;
    const strokeDasharray = `${pct * circumference} ${circumference}`;
    const strokeDashoffset = -accumulatedPercent * circumference;
    accumulatedPercent += pct;

    return `<circle
      r="${radius}"
      cx="90"
      cy="90"
      fill="transparent"
      stroke="${cat.color}"
      stroke-width="24"
      stroke-dasharray="${strokeDasharray}"
      stroke-dashoffset="${strokeDashoffset}"
      transform="rotate(-90 90 90)"
    />`;
  }).join('');

  donutContainer.innerHTML = `
    <svg width="180" height="180" viewBox="0 0 180 180">
      ${circlesSvg}
      <text x="90" y="85" text-anchor="middle" fill="#94a3b8" font-size="11">סך הוצאות</text>
      <text x="90" y="105" text-anchor="middle" fill="#f8fafc" font-size="15" font-weight="bold">${formatCurrency(totalExpense)}</text>
    </svg>
  `;

  legendContainer.innerHTML = categories.map(cat => {
    const pct = Math.round((cat.total / totalExpense) * 100);
    return `
      <div class="cat-legend-item" style="cursor:pointer;" onclick="filterByCategoryFromDashboard('${cat.id}')">
        <div class="cat-legend-right">
          <span class="cat-color-dot" style="background:${cat.color};"></span>
          <span>${cat.icon} ${cat.name}</span>
        </div>
        <div>
          <strong>${formatCurrency(cat.total)}</strong>
          <span class="text-muted" style="margin-right:6px;">(${pct}%)</span>
        </div>
      </div>
    `;
  }).join('');
}

window.filterByCategoryFromDashboard = function (categoryId) {
  document.getElementById('txCategoryFilter').value = categoryId;
  switchView('transactions');
  loadTransactionsData();
};

function renderDashboardAccounts(byAccount) {
  const container = document.getElementById('dashboardAccountsList');
  if (!byAccount || byAccount.length === 0) {
    container.innerHTML = `<p class="text-muted">טרם הוגדרו חשבונות</p>`;
    return;
  }

  container.innerHTML = byAccount.map(acc => {
    const isBank = acc.account_type === 'bank';
    return `
      <div class="mini-item">
        <div class="mini-item-info">
          <div class="mini-badge-icon" style="border: 1px solid ${acc.color};">
            ${isBank ? '🏦' : '💳'}
          </div>
          <div>
            <div style="font-weight:700;">${acc.name}</div>
            <div class="text-xs text-muted">${acc.member_avatar || '👤'} ${acc.member_name || 'משותף'} • ${isBank ? 'יתרת עו"ש: ' + formatCurrency(acc.balance) : 'ניצול מסגרת: ' + formatCurrency(Math.abs(acc.balance))}</div>
          </div>
        </div>
        <div style="text-align:left;">
          ${acc.income > 0 ? `<div class="amount-income" style="font-size:0.85rem;font-weight:700;">+${formatCurrency(acc.income)}</div>` : ''}
          <div class="amount-expense" style="font-size:0.95rem;font-weight:700;">-${formatCurrency(acc.expense)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderTopMerchants(merchants) {
  const container = document.getElementById('dashboardTopMerchants');
  if (!merchants || merchants.length === 0) {
    container.innerHTML = `<p class="text-muted">אין תנועות להצגה</p>`;
    return;
  }

  container.innerHTML = merchants.map(m => `
    <div class="mini-item">
      <div class="mini-item-info">
        <div class="mini-badge-icon">${m.category_icon || '🏪'}</div>
        <div>
          <div style="font-weight:700;">${m.description}</div>
          <div class="text-xs text-muted">${m.category_name} • ${m.tx_count} חיובים</div>
        </div>
      </div>
      <div class="amount-expense" style="font-weight:800;">${formatCurrency(m.total_spent)}</div>
    </div>
  `).join('');
}

// 2. Load & Render Transactions Table
async function loadTransactionsData() {
  const search = document.getElementById('txSearchInput').value.trim();
  const categoryId = document.getElementById('txCategoryFilter').value;
  const flowType = document.getElementById('txFlowFilter').value;

  const params = new URLSearchParams({
    month: state.selectedMonth,
    memberId: state.selectedMemberId,
    accountId: state.selectedAccountId,
    categoryId,
    flowType,
    search
  });

  const data = await apiFetch(`/api/transactions?${params.toString()}`);
  state.lastTransactions = data.transactions || [];
  renderTransactionsTable(state.lastTransactions);
}

function renderTransactionsTable(txns) {
  const tbody = document.getElementById('transactionsTableBody');
  if (!txns || txns.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:36px;" class="text-muted">לא נמצאו תנועות התואמות לסינון הנוכחי</td></tr>`;
    return;
  }

  tbody.innerHTML = txns.map(tx => {
    const amountClass = tx.flow_type === 'income'
      ? 'amount-income'
      : (tx.is_duplicate_settlement ? 'amount-transfer' : 'amount-expense');

    const instBadge = tx.installment_total
      ? `<span class="badge badge-purple" style="margin-left:6px;">תשלום ${tx.installment_number}/${tx.installment_total}</span>`
      : '';

    const duplicateBadge = tx.is_duplicate_settlement
      ? `<span class="badge badge-warning" title="שורה זו מזוהה כחיוב חודשי של חברת אשראי בחשבון הבנק ולכן אינה נספרת פעמיים בהוצאות">מוחרג מכפילות אשראי</span>`
      : '';

    const catOptions = state.categories.map(c =>
      `<option value="${c.id}" ${c.id === tx.category_id ? 'selected' : ''}>${c.icon} ${c.name}</option>`
    ).join('');

    return `
      <tr>
        <td style="white-space:nowrap;">${tx.date}</td>
        <td>
          <div style="font-weight:700;">${tx.description}</div>
          ${duplicateBadge}
        </td>
        <td>
          <span class="badge" style="background:rgba(255,255,255,0.06);border-right:3px solid ${tx.account_color};">
            ${tx.account_type === 'bank' ? '🏦' : '💳'} ${tx.account_name}
          </span>
        </td>
        <td>${tx.member_avatar || '👤'} ${tx.member_name || 'משותף'}</td>
        <td>
          <select class="form-select" style="padding:5px 8px;font-size:0.82rem;" onchange="updateTxCategory(${tx.id}, this.value, '${ tx.description.replace(/'/g, "\\'") }')">
            ${catOptions}
          </select>
        </td>
        <td class="text-muted text-xs">${instBadge}${tx.memo || ''}</td>
        <td class="amount-cell ${amountClass}">${formatCurrencyExact(tx.charged_amount)}</td>
        <td>
          <button class="btn btn-xs btn-ghost text-danger" onclick="deleteTransaction(${tx.id})" title="מחק תנועה">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.updateTxCategory = async function (txId, newCategoryId, description) {
  const applyRule = confirm(`האם להחיל את הקטגוריה החדשה אוטומטית על כל העסקאות של "${description}" בעבר ובעתיד?`);
  try {
    const res = await apiFetch(`/api/transactions/${txId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        categoryId: newCategoryId,
        applyRuleToMerchant: applyRule
      })
    });
    showToast(res.message, '#10b981');
    await refreshAllViews();
  } catch (err) {
    showToast(err.message, '#ef4444');
  }
};

window.deleteTransaction = async function (txId) {
  if (!confirm('האם למחוק תנועה זו?')) return;
  try {
    await apiFetch(`/api/transactions/${txId}`, { method: 'DELETE' });
    showToast('התנועה נמחקה');
    await refreshAllViews();
  } catch (err) {
    showToast(err.message, '#ef4444');
  }
};

// 3. Render Accounts & Credit Cards View
function renderAccountsCards() {
  const container = document.getElementById('accountsCardsGrid');
  if (!state.accounts || state.accounts.length === 0) {
    container.innerHTML = `<div class="card"><p class="text-muted">אין חשבונות מוגדרים. לחץ על "הוספת חשבון בנק / כרטיס אשראי" כדי להתחיל.</p></div>`;
    return;
  }

  container.innerHTML = state.accounts.map(acc => {
    const isBank = acc.account_type === 'bank';
    const isInv = acc.account_type === 'investment';
    const icon = isBank ? '🏦' : (isInv ? '📈' : '💳');
    const balanceLabel = isBank ? 'יתרת עו"ש בבנק' : (isInv ? 'שווי צבירה / תיק נוכחי' : 'חיוב מצטבר בכרטיס');
    const limitLabel = isBank ? 'מסגרת אשראי בעו"ש' : (isInv ? 'הפקדה חודשית מתוכננת' : 'מסגרת כרטיס אשראי');

    return `
      <div class="account-card" style="border-top: 4px solid ${acc.color};">
        <div class="account-card-top">
          <div>
            <div class="account-card-title">${icon} ${acc.name}</div>
            <div class="account-card-meta">${acc.member_avatar || '👤'} ${acc.member_name || 'משותף'} • ${acc.account_number || (isInv ? 'קופת גמל / תיק מסחר' : 'ללא מספר')}</div>
          </div>
          <span class="badge ${acc.has_credentials ? 'badge-success' : (isInv ? 'badge-purple' : 'badge-info')}">
            ${acc.has_credentials ? '🔒 מחובר אוטומטית' : (acc.is_demo ? '✨ חשבון הדגמה' : (isInv ? '📈 גמל / מסחר' : 'ידני / CSV'))}
          </span>
        </div>

        <div class="account-metrics">
          <div>
            <div class="text-xs text-muted">${balanceLabel}</div>
            <div style="font-size:1.25rem;font-weight:800;direction:ltr;text-align:right;color:${acc.balance >= 0 ? '#34d399' : '#f87171'};">
              ${formatCurrencyExact(acc.balance)}
              <button class="btn btn-xs btn-ghost" onclick="promptUpdateAccountBalance(${acc.id}, '${acc.name.replace(/'/g, "\\'")}', ${acc.balance})" title="עדכן יתרה / צבירה">✏️</button>
            </div>
          </div>
          <div>
            <div class="text-xs text-muted">${limitLabel}</div>
            <div style="font-size:1.1rem;font-weight:700;">${formatCurrency(acc.credit_limit)}</div>
          </div>
        </div>

        <div class="account-sync-bar">
          <div>
            <div>סטטוס: <strong>${acc.last_sync_status || 'טרם סונכרן'}</strong></div>
            <div>עדכון אחרון: ${acc.last_sync_at ? acc.last_sync_at.slice(0, 16).replace('T', ' ') : '—'}</div>
          </div>
          <div class="flex-gap">
            <button class="btn btn-xs btn-primary" onclick="syncSingleAccount(${acc.id})">🔄 סנכרן</button>
            <button class="btn btn-xs btn-outline" onclick="openImportForAccount(${acc.id})">📥 ייבוא קובץ</button>
            <button class="btn btn-xs btn-ghost text-danger" onclick="deleteAccount(${acc.id})">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.promptUpdateAccountBalance = async function (accountId, name, currentBalance) {
  const input = prompt(`הזן יתרה / שווי צבירה עדכני עבור "${name}" (₪):`, currentBalance);
  if (input === null) return;
  const val = Number(input);
  if (!Number.isFinite(val)) return;

  await apiFetch(`/api/accounts/${accountId}`, {
    method: 'PATCH',
    body: JSON.stringify({ balance: val })
  });
  showToast('היתרה / הצבירה עודכנה בהצלחה!', '#10b981');
  await loadMetadata();
  await refreshAllViews();
};

window.syncSingleAccount = async function (accountId) {
  showToast('מתחיל סנכרון מול המוסד הפיננסי...');
  try {
    const res = await apiFetch('/api/accounts/sync', {
      method: 'POST',
      body: JSON.stringify({ accountId })
    });
    const item = (res.results && res.results[0]) || {};
    showToast(item.message || 'הסנכרון הושלם', item.success ? '#10b981' : '#f59e0b');
    await loadMetadata();
    await refreshAllViews();
  } catch (err) {
    showToast(err.message, '#ef4444');
  }
};

window.openImportForAccount = function (accountId) {
  document.getElementById('importAccountSelect').value = accountId;
  openModal('modalImportCsv');
};

window.deleteAccount = async function (accountId) {
  if (!confirm('האם למחוק חשבון זה ואת כל התנועות המשויכות אליו?')) return;
  try {
    const res = await apiFetch(`/api/accounts/${accountId}`, { method: 'DELETE' });
    showToast(res.message);
    await loadMetadata();
    await refreshAllViews();
  } catch (err) {
    showToast(err.message, '#ef4444');
  }
};

// 4. Budgets & Savings Goals
async function loadBudgetsData() {
  const month = state.selectedMonth === 'all'
    ? new Date().toISOString().slice(0, 7)
    : state.selectedMonth;

  const data = await apiFetch(`/api/budgets?month=${month}`);
  renderBudgetsList(data.categories || []);
  renderSavingsGoals(data.goals || []);
}

function renderBudgetsList(categories) {
  const container = document.getElementById('budgetsListContainer');
  const totalBudget = categories.reduce((s, c) => s + Number(c.monthly_budget || 0), 0);
  const totalSpent = categories.reduce((s, c) => s + Number(c.spent || 0), 0);

  document.getElementById('budgetTotalSummaryBadge').textContent =
    `נוצל ${formatCurrency(totalSpent)} מתוך ${formatCurrency(totalBudget)}`;

  container.innerHTML = categories.map(cat => {
    const budget = Number(cat.monthly_budget || 0);
    const spent = Number(cat.spent || 0);
    const pct = budget > 0 ? Math.min(Math.round((spent / budget) * 100), 100) : 0;
    const isOver = budget > 0 && spent > budget;
    const barColor = isOver ? '#ef4444' : (pct > 80 ? '#f59e0b' : '#10b981');

    return `
      <div class="budget-item">
        <div class="budget-top">
          <div>
            <strong>${cat.icon} ${cat.name}</strong>
            ${isOver ? `<span class="badge badge-warning" style="margin-right:8px;">חריגה של ${formatCurrency(spent - budget)}!</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span>בוצע: <strong>${formatCurrency(spent)}</strong> / תקציב:</span>
            <button class="btn btn-xs btn-outline" onclick="promptUpdateBudget('${cat.id}', '${cat.name}', ${budget})">
              ${formatCurrency(budget)} ✏️
            </button>
          </div>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${pct}%;background:${barColor};"></div>
        </div>
      </div>
    `;
  }).join('');
}

window.promptUpdateBudget = async function (categoryId, name, currentBudget) {
  const input = prompt(`הזן תקציב חודשי חדש עבור "${name}" (₪):`, currentBudget);
  if (input === null) return;
  const val = Number(input);
  if (!Number.isFinite(val) || val < 0) return;

  await apiFetch('/api/budgets/category', {
    method: 'PATCH',
    body: JSON.stringify({ categoryId, monthlyBudget: val })
  });
  showToast('התקציב החודשי עודכן בהצלחה', '#10b981');
  await loadBudgetsData();
};

function renderSavingsGoals(goals) {
  const container = document.getElementById('savingsGoalsContainer');
  if (!goals || goals.length === 0) {
    container.innerHTML = `<p class="text-muted">טרם הוגדרו יעדי חיסכון.</p>`;
    return;
  }

  container.innerHTML = goals.map(g => {
    const pct = g.target_amount > 0 ? Math.min(Math.round((g.current_amount / g.target_amount) * 100), 100) : 0;
    return `
      <div class="budget-item">
        <div class="budget-top">
          <div>
            <strong>${g.icon} ${g.name}</strong>
            <div class="text-xs text-muted">תאריך יעד: ${g.target_date || 'גמיש'}</div>
          </div>
          <div style="text-align:left;">
            <strong>${formatCurrency(g.current_amount)}</strong> מתוך ${formatCurrency(g.target_amount)} (${pct}%)
            <button class="btn btn-xs btn-outline" style="margin-right:6px;" onclick="promptUpdateGoal(${g.id}, '${g.name}', ${g.current_amount})">➕ הפקדה/עדכון</button>
          </div>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${pct}%;background:${g.color};"></div>
        </div>
      </div>
    `;
  }).join('');
}

window.promptUpdateGoal = async function (goalId, name, currentAmount) {
  const input = prompt(`עדכן את הסכום שנחסך עד כה עבור "${name}" (₪):`, currentAmount);
  if (input === null) return;
  const val = Number(input);
  if (!Number.isFinite(val) || val < 0) return;

  await apiFetch(`/api/budgets/goals/${goalId}`, {
    method: 'PATCH',
    body: JSON.stringify({ currentAmount: val })
  });
  showToast('סכום החיסכון עודכן!', '#10b981');
  await loadBudgetsData();
};

// Navigation & Modals
function switchView(viewName) {
  state.currentView = viewName;
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === `view-${viewName}`);
  });
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function bindEvents() {
  // Sidebar view switching
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.goto));
  });

  // Modal close buttons
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  // Global Filters
  document.getElementById('globalMonthSelect').addEventListener('change', e => {
    state.selectedMonth = e.target.value;
    renderMonthPills();
    refreshAllViews();
  });

  document.getElementById('globalMemberSelect').addEventListener('change', e => {
    state.selectedMemberId = e.target.value;
    state.selectedAccountId = '';
    renderGlobalFilters();
    refreshAllViews();
  });

  document.getElementById('globalAccountTypeSelect').addEventListener('change', e => {
    state.selectedAccountType = e.target.value;
    state.selectedAccountId = '';
    renderGlobalFilters();
    refreshAllViews();
  });

  document.getElementById('globalAccountSelect').addEventListener('change', e => {
    state.selectedAccountId = e.target.value;
    refreshAllViews();
  });

  // Transactions Filters
  document.getElementById('txSearchInput').addEventListener('input', () => loadTransactionsData());
  document.getElementById('txCategoryFilter').addEventListener('change', () => loadTransactionsData());
  document.getElementById('txFlowFilter').addEventListener('change', () => loadTransactionsData());

  // Open Modals
  document.getElementById('btnOpenAddAccountModal').addEventListener('click', () => openModal('modalAddAccount'));
  document.getElementById('btnOpenImportModal').addEventListener('click', () => openModal('modalImportCsv'));
  document.getElementById('btnOpenManualTxModal').addEventListener('click', () => openModal('modalManualTx'));
  document.getElementById('btnOpenAddMemberModal').addEventListener('click', () => openModal('modalAddMember'));
  document.getElementById('btnOpenAddGoalModal').addEventListener('click', () => openModal('modalAddGoal'));

  document.getElementById('accCompanySelect').addEventListener('change', renderDynamicCredentialFields);

  // Official GemelNet API Search inside Add Account Modal
  const btnSearchGemel = document.getElementById('btnSearchGemelApi');
  if (btnSearchGemel) {
    btnSearchGemel.addEventListener('click', async () => {
      const q = document.getElementById('accNumberInput').value.trim() || document.getElementById('accNameInput').value.trim() || 'אלטשולר';
      const box = document.getElementById('gemelApiResultsBox');
      box.style.display = 'block';
      box.innerHTML = `<div class="text-xs text-muted">שולף מסלולים מ-API הרשמי של משרד האוצר (data.gov.il)...</div>`;
      try {
        const res = await apiFetch(`/api/funds/search?q=${encodeURIComponent(q)}`);
        const funds = res.funds || [];
        if (funds.length === 0) {
          box.innerHTML = `<div class="text-xs text-muted">לא נמצאו מסלולים עבור "${q}". נסה שם בית השקעות או מספר קופה.</div>`;
          return;
        }
        box.innerHTML = funds.map(f => `
          <div style="padding:6px 8px;border-bottom:1px solid rgba(148,163,184,0.15);cursor:pointer;font-size:0.8rem;"
               onclick="selectGemelFund('${f.fundId}', '${f.fundName.replace(/'/g, "\\'")}', '${f.managingCompany.replace(/'/g, "\\'")}')">
            <div><strong>#${f.fundId} - ${f.fundName}</strong> (${f.classification})</div>
            <div class="text-xs text-muted">${f.managingCompany} | תשואה שנתית: <strong style="color:#34d399;">${f.ytdYield}%</strong> | 3 שנים: <strong>${f.yield3Yrs}%</strong> | דמי ניהול: ${f.avgManagementFee}%</div>
          </div>
        `).join('');
      } catch (err) {
        box.innerHTML = `<div class="text-xs text-danger">${err.message}</div>`;
      }
    });
  }

  // Sync All Button
  document.getElementById('btnSyncAllSidebar').addEventListener('click', async () => {
    showToast('מסנכרן את כל חשבונות הבנק וכרטיסי האשראי...');
    try {
      const res = await apiFetch('/api/accounts/sync', { method: 'POST', body: JSON.stringify({}) });
      const count = (res.results || []).length;
      showToast(`סנכרון הושלם עבור ${count} חשבונות וכרטיסים!`, '#10b981');
      await loadMetadata();
      await refreshAllViews();
    } catch (err) {
      showToast(err.message, '#ef4444');
    }
  });

  // Form: Add Account
  document.getElementById('formAddAccount').addEventListener('submit', async e => {
    e.preventDefault();
    const companyId = document.getElementById('accCompanySelect').value;
    const provider = state.providers.find(p => p.id === companyId);
    const credentials = {};
    document.querySelectorAll('.cred-input').forEach(inp => {
      if (inp.value.trim()) credentials[inp.dataset.credKey] = inp.value.trim();
    });

    await apiFetch('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        companyId,
        accountType: provider ? provider.type : 'bank',
        name: document.getElementById('accNameInput').value,
        memberId: document.getElementById('accMemberSelect').value,
        accountNumber: document.getElementById('accNumberInput').value,
        balance: document.getElementById('accBalanceInput').value,
        creditLimit: document.getElementById('accLimitInput').value,
        color: provider ? provider.color : '#3b82f6',
        credentials
      })
    });

    closeModal('modalAddAccount');
    e.target.reset();
    showToast('החשבון / כרטיס האשראי נוסף בהצלחה!', '#10b981');
    await loadMetadata();
    await refreshAllViews();
  });

  // File Input Reader for CSV Import
  document.getElementById('importFileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      document.getElementById('importTextContent').value = evt.target.result;
    };
    reader.readAsText(file, 'UTF-8');
  });

  // Form: Import CSV
  document.getElementById('formImportCsv').addEventListener('submit', async e => {
    e.preventDefault();
    const accountId = document.getElementById('importAccountSelect').value;
    const content = document.getElementById('importTextContent').value;
    if (!content.trim()) {
      return showToast('נא לבחור קובץ או להדביק תוכן לייבוא', '#f59e0b');
    }

    const res = await apiFetch('/api/accounts/import', {
      method: 'POST',
      body: JSON.stringify({ accountId, content })
    });

    closeModal('modalImportCsv');
    document.getElementById('importTextContent').value = '';
    showToast(res.message, '#10b981');
    await loadMetadata();
    await refreshAllViews();
  });

  // Form: Manual Transaction
  document.getElementById('formManualTx').addEventListener('submit', async e => {
    e.preventDefault();
    await apiFetch('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        flowType: document.getElementById('manualFlowType').value,
        date: document.getElementById('manualDate').value,
        accountId: document.getElementById('manualAccountSelect').value,
        description: document.getElementById('manualDesc').value,
        amount: document.getElementById('manualAmount').value,
        categoryId: document.getElementById('manualCategorySelect').value,
        memo: document.getElementById('manualMemo').value
      })
    });

    closeModal('modalManualTx');
    document.getElementById('manualDesc').value = '';
    document.getElementById('manualAmount').value = '';
    document.getElementById('manualMemo').value = '';
    showToast('התנועה נוספה וסווגה בהצלחה!', '#10b981');
    await loadMetadata();
    await refreshAllViews();
  });

  // Form: Add Member
  document.getElementById('formAddMember').addEventListener('submit', async e => {
    e.preventDefault();
    await apiFetch('/api/members', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('memberNameInput').value,
        role: document.getElementById('memberRoleInput').value,
        avatar: document.getElementById('memberAvatarSelect').value
      })
    });
    closeModal('modalAddMember');
    e.target.reset();
    showToast('בן/בת משפחה נוסף בהצלחה!', '#10b981');
    await loadMetadata();
    await refreshAllViews();
  });

  // Form: Add Goal
  document.getElementById('formAddGoal').addEventListener('submit', async e => {
    e.preventDefault();
    await apiFetch('/api/budgets/goals', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('goalNameInput').value,
        targetAmount: document.getElementById('goalTargetInput').value,
        currentAmount: document.getElementById('goalCurrentInput').value,
        targetDate: document.getElementById('goalDateInput').value
      })
    });
    closeModal('modalAddGoal');
    e.target.reset();
    showToast('יעד החיסכון נוסף בהצלחה!', '#10b981');
    await loadBudgetsData();
  });

  // Demo Seed & Clear
  document.getElementById('btnSeedDemo').addEventListener('click', async () => {
    const res = await apiFetch('/api/demo/seed', { method: 'POST' });
    showToast(res.message, '#10b981');
    await loadMetadata();
    await refreshAllViews();
  });

  document.getElementById('btnClearDemo').addEventListener('click', async () => {
    if (!confirm('האם למחוק את כל נתוני ההדגמה ולהשאיר רק את החשבונות האמיתיים שלך?')) return;
    const res = await apiFetch('/api/demo/clear', { method: 'POST' });
    showToast(res.message, '#f59e0b');
    await loadMetadata();
    await refreshAllViews();
  });

  // Export CSV
  document.getElementById('btnExportCsv').addEventListener('click', exportCurrentTransactionsCsv);

  // Vault Password Form Submit (Setup or Unlock)
  const vaultForm = document.getElementById('formVaultPassword');
  if (vaultForm) {
    vaultForm.addEventListener('submit', async e => {
      e.preventDefault();
      const mode = document.getElementById('vaultModeInput').value;
      const password = document.getElementById('vaultPasswordInput').value;
      const endpoint = mode === 'unlock' ? '/api/vault/unlock' : '/api/vault/setup';
      try {
        const res = await apiFetch(endpoint, {
          method: 'POST',
          body: JSON.stringify({ password })
        });
        document.getElementById('vaultPasswordInput').value = '';
        closeModal('modalVaultPassword');
        showToast(res.message, '#10b981');
        await checkVaultStatus();
        await loadMetadata();
        await refreshAllViews();
      } catch (err) {
        showToast(err.message, '#ef4444');
      }
    });
  }

  // OTP Modal Submit
  const otpForm = document.getElementById('formOtpPrompt');
  if (otpForm) {
    otpForm.addEventListener('submit', async e => {
      e.preventDefault();
      const accountId = document.getElementById('otpAccountIdInput').value;
      const code = document.getElementById('otpCodeInput').value.trim();
      if (!code) return;
      try {
        const res = await apiFetch('/api/otp/submit', {
          method: 'POST',
          body: JSON.stringify({ accountId, code })
        });
        closeModal('modalOtpPrompt');
        document.getElementById('otpCodeInput').value = '';
        showToast(res.message, '#10b981');
      } catch (err) {
        showToast(err.message, '#ef4444');
      }
    });
  }

  // Poll for pending OTP requests while syncing
  setInterval(async () => {
    try {
      const data = await apiFetch('/api/otp/pending');
      const pending = (data && data.pending) || [];
      const modal = document.getElementById('modalOtpPrompt');
      if (pending.length > 0 && modal && !modal.classList.contains('open')) {
        const req = pending[0];
        document.getElementById('otpAccountIdInput').value = req.accountId;
        document.getElementById('otpPromptText').textContent =
          `${req.accountName}: ${req.promptText}`;
        openModal('modalOtpPrompt');
        document.getElementById('otpCodeInput').focus();
      }
    } catch (_e) {
      // ignore polling errors
    }
  }, 1500);
}

function exportCurrentTransactionsCsv() {
  if (!state.lastTransactions || state.lastTransactions.length === 0) {
    return showToast('אין תנועות לייצוא', '#f59e0b');
  }

  const headers = ['תאריך', 'בית עסק / תיאור', 'חשבון / כרטיס', 'שיוך', 'קטגוריה', 'סוג', 'סכום חיוב', 'הערה'];
  const rows = state.lastTransactions.map(t => [
    t.date,
    `"${(t.description || '').replace(/"/g, '""')}"`,
    `"${(t.account_name || '').replace(/"/g, '""')}"`,
    `"${(t.member_name || '').replace(/"/g, '""')}"`,
    `"${(t.category_name || '').replace(/"/g, '""')}"`,
    t.flow_type,
    t.charged_amount,
    `"${(t.memo || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `money_tracker_${state.selectedMonth || 'export'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

window.selectGemelFund = function (fundId, fundName, managingCompany) {
  document.getElementById('accNumberInput').value = fundId;
  document.getElementById('accNameInput').value = `${fundName} (${managingCompany.split(' ')[0]})`;
  document.getElementById('gemelApiResultsBox').style.display = 'none';
  showToast(`נבחר מסלול #${fundId} מ-API גמל-נט!`, '#10b981');
};

document.addEventListener('DOMContentLoaded', initApp);
