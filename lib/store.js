// Comment storage. On Vercel with a KV (Upstash Redis) store linked, comments
// persist in Redis. Anywhere else they go to a JSON file: dev/data locally,
// /tmp on a Vercel deploy without KV (kept only until the next deploy).
const fs = require('fs');
const path = require('path');

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'volton:comments';
const FILE = process.env.VERCEL
  ? '/tmp/volton-comments.json'
  : path.join(__dirname, '..', 'dev', 'data', 'comments.json');

const persistent = Boolean(KV_URL && KV_TOKEN) || !process.env.VERCEL;

async function kv(command) {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error('kv ' + r.status + ' ' + (await r.text()));
  return (await r.json()).result;
}

function fileRead() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return []; }
}
function fileWrite(list) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

async function list() {
  if (KV_URL && KV_TOKEN) return (await kv(['LRANGE', KEY, 0, -1])).map((s) => JSON.parse(s));
  return fileRead();
}

async function add(comment) {
  if (KV_URL && KV_TOKEN) { await kv(['RPUSH', KEY, JSON.stringify(comment)]); return comment; }
  const all = fileRead();
  all.push(comment);
  fileWrite(all);
  return comment;
}

module.exports = { list, add, persistent };
