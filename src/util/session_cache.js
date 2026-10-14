// Short in-memory cache of "token → session", shared by request_user and role_guard.
// Before: every API call asked MongoDB for the session twice. Now once per 15 seconds per token.
// A sign-out on the same server instance is seen at once (forget); on another instance within 15 seconds.
const Session = require("../v1/admin/session/session.model");

const TTL_MS = 15 * 1000;
const cache = new Map(); // token -> { at, session }

async function getSession(token) {
  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.session;

  const session = await Session.findOne({ access_token: token }).lean();
  if (session) {
    if (cache.size > 1000) cache.clear();
    cache.set(token, { at: Date.now(), session });
  }
  return session; // a missing session is never cached, so a new login works at once
}

function forget(token) {
  cache.delete(token);
}

module.exports = { getSession, forget };
