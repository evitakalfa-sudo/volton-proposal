// /api/comments  GET -> { comments: [...], persistent }
//                POST { slide, slideName, parentId?, author, text } -> { comment }
const store = require('../lib/store');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max); }
function cleanText(v, max) { return String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim().slice(0, max); }
function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;          // Vercel parses JSON
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const comments = await store.list();
      return json(res, 200, { comments, persistent: store.persistent });
    }
    if (req.method === 'POST') {
      let b;
      try { b = await readBody(req); } catch (e) { return json(res, 400, { error: 'Body must be JSON.' }); }
      const comment = {
        id: rid(),
        slide: Number(b.slide),
        slideName: clean(b.slideName, 80),
        parentId: b.parentId ? clean(b.parentId, 40) : null,
        author: clean(b.author, 60),
        text: cleanText(b.text, 2000),
        anchor: null,                          // { x, y } in % of the slide, PowerPoint-style pin
        quote: b.quote ? cleanText(b.quote, 240) : null,   // the sentence the comment is about, if selected
        ts: Date.now(),
      };
      if (b.anchor && typeof b.anchor === 'object') {
        const x = Number(b.anchor.x), y = Number(b.anchor.y);
        if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100) {
          comment.anchor = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
        }
      }
      if (!comment.author || !comment.text || !Number.isInteger(comment.slide) || comment.slide < 1) {
        return json(res, 400, { error: 'A name, a comment and a slide are required.' });
      }
      if (comment.parentId) {
        const all = await store.list();
        const parent = all.find((c) => c.id === comment.parentId);
        if (!parent) return json(res, 400, { error: 'The comment you are replying to no longer exists.' });
        comment.slide = parent.slide;           // replies live on the parent's slide and share its pin
        comment.slideName = parent.slideName;
        comment.anchor = null; comment.quote = null;
      }
      await store.add(comment);
      return json(res, 201, { comment });
    }
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Method not allowed.' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Comments are unavailable right now.' });
  }
};
