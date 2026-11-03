const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const { getDb, isVaultConfigured } = require('./db/database');
const { seedDemoData } = require('./db/seedService');
const { handleApi } = require('./routes/apiRouter');
const { sendJson } = require('./routes/httpHelpers');
const { persistVault } = require('./services/vaultService');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, '../public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function serveStaticFile(res, filePath) {
  const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(PUBLIC_DIR, safePath);

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(fullPath, (err, stats) => {
    const target = !err && stats.isFile() ? fullPath : path.join(PUBLIC_DIR, 'index.html');
    const ext = path.extname(target).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(target, (readErr, content) => {
      if (readErr) {
        res.writeHead(404);
        return res.end('Not found');
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (parsedUrl.pathname.startsWith('/api/')) {
    const isMutating = ['POST', 'PATCH', 'DELETE', 'PUT'].includes(req.method) &&
      !parsedUrl.pathname.startsWith('/api/vault/');

    res.on('finish', () => {
      if (isMutating && res.statusCode >= 200 && res.statusCode < 300) {
        persistVault();
      }
    });

    try {
      await handleApi(req, res, parsedUrl);
    } catch (err) {
      if (err.code === 'VAULT_LOCKED') {
        return sendJson(res, 423, { error: err.message, vaultLocked: true });
      }
      const statusCode = err.statusCode || (err.message && err.message.includes('לא נמצא') ? 404 : 500);
      if (statusCode >= 500) {
        console.error('API Error:', err);
      }
      return sendJson(res, statusCode, { error: err.message || 'שגיאת שרת פנימית' });
    }
    return;
  }

  const reqPath = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname;
  serveStaticFile(res, reqPath);
});

// Initialize DB & auto-seed demo data if DB is not yet encrypted and completely empty on first launch
function initializeStartupData() {
  if (!isVaultConfigured()) {
    try {
      const db = getDb();
      const totalAcc = db.prepare('SELECT COUNT(*) as c FROM accounts').get().c;
      if (totalAcc === 0) {
        seedDemoData();
      }
    } catch (err) {
      console.warn('Startup initialization notice:', err.message);
    }
  }
}

initializeStartupData();

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`🚀 Money Tracker IL running at http://localhost:${PORT}`);
  });
}

module.exports = { server, initializeStartupData };
