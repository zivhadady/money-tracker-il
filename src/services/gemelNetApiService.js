const https = require('node:https');

// Official Ministry of Finance / Capital Market Authority (רשות שוק ההון) CKAN Data.gov.il Resource IDs
const RESOURCES = {
  GEMEL_NET: 'a30dcbea-a1d2-482c-ae29-8f781f5025fb',      // גמל-נט (קופות גמל, קרנות השתלמות, גמל להשקעה, חיסכון לכל ילד)
  PENSIA_NET: '6d47d6b5-cb08-488b-b333-f1e717b1e1bd',     // פנסיה-נט (קרנות פנסיה חדשות ומקיפות)
  BITUACH_NET: 'c6c623a6-b5a2-4c0c-9a59-3a6157407740'     // ביטוח-נט (פוליסות חיסכון וביטוח חיים)
};

function queryDataGovApi(payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const req = https.request(
      'https://data.gov.il/api/3/action/datastore_search',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) MoneyTrackerIL/1.0'
        },
        timeout: 15000
      },
      res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (!json.success) {
              return reject(new Error('שגיאה בשליפת נתונים מ-API משרד האוצר (data.gov.il)'));
            }
            resolve(json.result.records || []);
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout מול שרת data.gov.il'));
    });
    req.write(postData);
    req.end();
  });
}

/**
 * Search official Israeli Provident Funds / Study Funds / Investment Gemel / Pension tracks
 * by name or fund number (מספר קופה / מסלול).
 */
async function searchOfficialFunds(queryText, limit = 25) {
  const q = String(queryText || '').trim();
  const payload = {
    resource_id: RESOURCES.GEMEL_NET,
    limit: 100,
    sort: 'REPORT_PERIOD desc'
  };

  if (/^\d+$/.test(q)) {
    payload.filters = { FUND_ID: Number(q) };
  } else if (q) {
    payload.q = q;
  }

  const records = await queryDataGovApi(payload);

  // Deduplicate by FUND_ID (keep the most recent REPORT_PERIOD for each fund)
  const latestByFundId = new Map();
  for (const r of records) {
    const existing = latestByFundId.get(r.FUND_ID);
    if (!existing || Number(r.REPORT_PERIOD) > Number(existing.REPORT_PERIOD)) {
      latestByFundId.set(r.FUND_ID, r);
    }
  }

  return Array.from(latestByFundId.values())
    .slice(0, limit)
    .map(formatFundRecord);
}

/**
 * Fetch the latest official API performance & yield metrics for a specific FUND_ID or search term
 */
async function fetchOfficialFundMetrics({ fundId, searchName }) {
  let records = [];
  if (fundId && /^\d+$/.test(String(fundId).trim())) {
    records = await queryDataGovApi({
      resource_id: RESOURCES.GEMEL_NET,
      filters: { FUND_ID: Number(String(fundId).trim()) },
      sort: 'REPORT_PERIOD desc',
      limit: 12
    });
  }

  if (records.length === 0 && searchName) {
    records = await queryDataGovApi({
      resource_id: RESOURCES.GEMEL_NET,
      q: searchName,
      sort: 'REPORT_PERIOD desc',
      limit: 20
    });
  }

  if (records.length === 0) {
    return null;
  }

  // Sort descending by REPORT_PERIOD
  records.sort((a, b) => Number(b.REPORT_PERIOD || 0) - Number(a.REPORT_PERIOD || 0));
  return formatFundRecord(records[0]);
}

function formatFundRecord(r) {
  return {
    fundId: r.FUND_ID,
    fundName: r.FUND_NAME,
    classification: r.FUND_CLASSIFICATION,
    managingCompany: r.MANAGING_CORPORATION,
    reportPeriod: r.REPORT_PERIOD,
    specialization: r.SPECIALIZATION,
    subSpecialization: r.SUB_SPECIALIZATION,
    monthlyYield: Number(r.MONTHLY_YIELD || 0),
    ytdYield: Number(r.YEAR_TO_DATE_YIELD || 0),
    yield3Yrs: Number(r.YIELD_TRAILING_3_YRS || 0),
    yield5Yrs: Number(r.YIELD_TRAILING_5_YRS || 0),
    avgAnnualYield3Yrs: Number(r.AVG_ANNUAL_YIELD_TRAILING_3YRS || 0),
    avgAnnualYield5Yrs: Number(r.AVG_ANNUAL_YIELD_TRAILING_5YRS || 0),
    avgManagementFee: Number(r.AVG_ANNUAL_MANAGEMENT_FEE || 0),
    avgDepositFee: Number(r.AVG_DEPOSIT_FEE || 0),
    sharpeRatio: Number(r.SHARPE_RATIO || 0),
    totalAssetsMillions: Number(r.TOTAL_ASSETS || 0),
    stockExposurePct: r.TOTAL_ASSETS > 0 ? Math.round((Number(r.STOCK_MARKET_EXPOSURE || 0) / Number(r.TOTAL_ASSETS)) * 1000) / 10 : 0,
    foreignExposurePct: r.TOTAL_ASSETS > 0 ? Math.round((Number(r.FOREIGN_EXPOSURE || 0) / Number(r.TOTAL_ASSETS)) * 1000) / 10 : 0
  };
}

module.exports = {
  searchOfficialFunds,
  fetchOfficialFundMetrics
};
