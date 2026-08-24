const fs = require('fs');
const path = require('path');

const PUBLIC_FILES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
]);

function resolveStaticAsset(urlPath, config) {
  const relative = PUBLIC_FILES.get(urlPath);
  if (!relative) return null;
  const root = path.resolve(config.root);
  const file = path.resolve(root, relative);
  const rootWithSeparator = root.endsWith(path.sep) ? root : root + path.sep;
  if (!file.startsWith(rootWithSeparator) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return null;
  return file;
}

function securityHeaders() {
  return {
    'Content-Security-Policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
}

function isAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === req.headers.host;
  } catch {
    return false;
  }
}

function isJsonRequest(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  return contentType === 'application/json' || contentType.startsWith('application/json;');
}

module.exports = { resolveStaticAsset, securityHeaders, isAllowedOrigin, isJsonRequest };
