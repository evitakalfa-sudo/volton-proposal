# Volton proposal deck

Single-file HTML deck (`index.html`) deployed on Vercel at
https://volton-proposal.reborrn.works. Deploys happen on push to `main`;
commits must be authored as `makersV0-1` or the shared Vercel account does
not deploy them.

## Comments

Anyone with the link can comment on a slide, pin a comment to a spot or a
selected sentence, reply, and edit or delete their own comments.

- `api/comments.js`: Vercel function. `GET` all, `POST` comment or reply,
  `PATCH ?id=` edit own, `DELETE ?id=` delete own. Ownership is a random
  per-browser secret sent as `X-Owner`; only its SHA-256 is stored.
- `lib/store.js`: storage. Uses the Upstash Redis store `volton-comments`
  linked to the Vercel project (`KV_REST_API_URL`, `KV_REST_API_TOKEN`);
  falls back to a JSON file when those are absent.
- `dev/server.js`: local preview with the same API against
  `dev/data/comments.json` (git-ignored). Run `node dev/server.js` and open
  http://localhost:3456.
