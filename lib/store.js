// Comment storage. On Vercel with a KV (Upstash Redis) store linked, comments
// persist in Redis as a hash keyed by comment id. Anywhere else they go to a
// JSON file: dev/data locally, /tmp on a Vercel deploy without KV (kept only
// until the next deploy).
const fs = require('fs');
const path = require('path');

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const HAS_KV = Boolean(KV_URL && KV_TOKEN);
const HKEY = 'volton:comments:v2';
const FILE = process.env.VERCEL
  ? '/tmp/volton-comments.json'
  : path.join(__dirname, '..', 'dev', 'data', 'comments.json');

const persistent = HAS_KV || !process.env.VERCEL;

async function kv(command) {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error('kv ' + r.status + ' ' + (await r.text()));
  return (await r.json()).result;
}
function fileRead() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return []; } }
function fileWrite(list) { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(list, null, 2)); }

async function list() {
  if (HAS_KV) {
    const flat = await kv(['HGETALL', HKEY]);            // [field, value, field, value, ...]
    const out = [];
    for (let i = 1; i < flat.length; i += 2) out.push(JSON.parse(flat[i]));
    return out.sort((a, b) => a.ts - b.ts);
  }
  return fileRead().sort((a, b) => a.ts - b.ts);
}
async function put(comment) {                             // create or replace, by id
  if (HAS_KV) { await kv(['HSET', HKEY, comment.id, JSON.stringify(comment)]); return comment; }
  const all = fileRead().filter((c) => c.id !== comment.id);
  all.push(comment); fileWrite(all); return comment;
}
async function remove(id) {
  if (HAS_KV) { await kv(['HDEL', HKEY, id]); return; }
  fileWrite(fileRead().filter((c) => c.id !== id));
}

module.exports = { list, put, add: put, remove, persistent };
