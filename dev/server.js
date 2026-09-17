// Local preview of the deck with working comments. Serves the repo root as
// static files and routes /api/comments to the same handler Vercel will run.
const http = require('http');
const fs = require('fs');
const path = require('path');
const handler = require('../api/comments');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3456;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
  '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png', '.css': 'text/css' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/comments') {
    req.query = Object.fromEntries(url.searchParams);
    return handler(req, res);
  }
  let file = path.normalize(path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(ROOT) || file.includes(path.sep + '.git')) { res.statusCode = 403; return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(data);
  });
}).listen(PORT, () => console.log('Volton deck with comments: http://localhost:' + PORT));
