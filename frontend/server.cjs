// server.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;
const BACKEND_URL = 'http://127.0.0.1:8001';
const DIST_DIR = path.join(__dirname, 'dist');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  // Proxy API requests
  if (req.url.startsWith('/api')) {
    const targetUrl = new URL(req.url, BACKEND_URL);
    const proxyReq = http.request(targetUrl, {
      method: req.method,
      headers: req.headers,
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err);
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway');
    });

    req.pipe(proxyReq);
    return;
  }

  // Serve static files
  let filePath = path.join(DIST_DIR, req.url.split('?')[0]);
  
  // If request doesn't have an extension (SPA route), fallback to index.html
  const ext = path.extname(filePath);
  if (!ext) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback for SPA routing
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const contentType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Production frontend server running at http://localhost:${PORT}`);
  console.log(`Proxying /api to ${BACKEND_URL}`);
});
