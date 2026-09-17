// /api/comments
//   GET                      -> { comments: [...], persistent }
//   POST   { slide, slideName, parentId?, author, text, anchor?, quote? } -> { comment }
//   PATCH  ?id=  { text }    -> { comment }        (only the browser that posted it)
//   DELETE ?id=              -> { removed | deleted } (only the browser that posted it)
// Ownership: the browser sends a random secret in the X-Owner header; the server
// stores only its SHA-256 on the comment and compares hashes. No accounts.
const crypto = require('crypto');
const store = require('../lib/store');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const cleanText = (v, max) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim().slice(0, max);
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const hash = (t) => (t ? crypto.createHash('sha256').update(String(t)).digest('hex') : null);

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}
function queryId(req) {
  if (req.query && req.query.id) return String(req.query.id);
  try { return new URL(req.url, 'http://x').searchParams.get('id') || ''; } catch (e) { return ''; }
}
// what a client may see: never the owner hash; a deleted comment keeps only its place in the thread
function pub(c, me) {
  const out = { id: c.id, slide: c.slide, slideName: c.slideName, parentId: c.parentId, ts: c.ts,
    author: c.deleted ? '' : c.author, text: c.deleted ? '' : c.text,
    anchor: c.deleted ? null : (c.anchor || null), quote: c.deleted ? null : (c.quote || null),
    edited: c.edited || null, deleted: !!c.deleted, mine: !c.deleted && !!c.owner && c.owner === me };
  return out;
}

module.exports = async function handler(req, res) {
  const me = hash(req.headers['x-owner']);
  try {
    if (req.method === 'GET') {
      const comments = (await store.list()).map((c) => pub(c, me));
      return json(res, 200, { comments, persistent: store.persistent });
    }
    if (req.method === 'POST') {
      let b; try { b = await readBody(req); } catch (e) { return json(res, 400, { error: 'Body must be JSON.' }); }
      const c = { id: rid(), slide: Number(b.slide), slideName: clean(b.slideName, 80),
        parentId: b.parentId ? clean(b.parentId, 40) : null, author: clean(b.author, 60),
        text: cleanText(b.text, 2000), anchor: null, quote: b.quote ? cleanText(b.quote, 240) : null,
        ts: Date.now(), owner: me };
      if (b.anchor && typeof b.anchor === 'object') {
        const x = Number(b.anchor.x), y = Number(b.anchor.y);
        if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100) c.anchor = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
      }
      if (!c.author || !c.text || !Number.isInteger(c.slide) || c.slide < 1) return json(res, 400, { error: 'A name, a comment and a slide are required.' });
      if (c.parentId) {
        const parent = (await store.list()).find((p) => p.id === c.parentId);
        if (!parent || parent.parentId) return json(res, 400, { error: 'The comment you are replying to no longer exists.' });
        c.slide = parent.slide; c.slideName = parent.slideName; c.anchor = null; c.quote = null;
      }
      await store.put(c);
      return json(res, 201, { comment: pub(c, me) });
    }
    if (req.method === 'PATCH' || req.method === 'DELETE') {
      const id = queryId(req);
      const all = await store.list();
      const c = all.find((x) => x.id === id);
      if (!c) return json(res, 404, { error: 'That comment no longer exists.' });
      if (c.deleted) return json(res, 410, { error: 'That comment was deleted.' });
      if (!me || !c.owner || c.owner !== me) return json(res, 403, { error: 'You can only change your own comments.' });
      if (req.method === 'PATCH') {
        let b; try { b = await readBody(req); } catch (e) { return json(res, 400, { error: 'Body must be JSON.' }); }
        const text = cleanText(b.text, 2000);
        if (!text) return json(res, 400, { error: 'The comment cannot be empty.' });
        c.text = text; c.edited = Date.now();
        await store.put(c);
        return json(res, 200, { comment: pub(c, me) });
      }
      const hasReplies = all.some((x) => x.parentId === c.id && !x.deleted);
      if (hasReplies) {                                  // keep the thread readable
        c.deleted = true; c.text = ''; c.anchor = null; c.quote = null; c.owner = null;
        await store.put(c);
        return json(res, 200, { deleted: true, comment: pub(c, me) });
      }
      await store.remove(c.id);
      return json(res, 200, { removed: true, id: c.id });
    }
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return json(res, 405, { error: 'Method not allowed.' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Comments are unavailable right now.' });
  }
};
