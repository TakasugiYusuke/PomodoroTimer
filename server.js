'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = 4173;
const ROOT = __dirname;

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, `http://${HOST}:${PORT}`).pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.resolve(ROOT, relativePath);
  return filePath.startsWith(`${ROOT}${path.sep}`) ? filePath : null;
}

const server = http.createServer((request, response) => {
  const filePath = resolveRequestPath(request.url);
  if (!filePath) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }

    response.statusCode = 200;
    response.setHeader('Content-Type', CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (path.basename(filePath) === 'sw.js') response.setHeader('Cache-Control', 'no-cache');
    response.end(content);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Focus Flow: http://localhost:${PORT}`);
  console.log('終了するには Ctrl+C を押してください。');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`ポート ${PORT} は既に使用されています。既に起動中なら http://localhost:${PORT} を開いてください。`);
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
});
