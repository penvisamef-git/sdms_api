// Role guard — one place that decides which user role may call which API.
// Mirrors the web menu rules (sdms/src/page/util/permission.js) so the rules are enforced on the SERVER too,
// not only by hiding buttons in the UI.
//
//   ROLE_GUARD=on   (default) block calls the role may not make
//   ROLE_GUARD=log  only print what WOULD be blocked (use this first if you are unsure)
//   ROLE_GUARD=off  disabled
//
// It runs before every /api/admin route. Calls without a token are left alone here:
// the route's own jwt_auth / request_user answers them with 401, exactly as before.
const { getSession } = require("./session_cache");
const User = require("../v1/admin/user/user.model");
const { USER_ROLES } = require("./user_roles");

const [R_SUPER, R_IN, R_OUT, R_BOTH] = USER_ROLES;

// access levels
const ALL = "all"; // any signed-in user
const DOC = "doc"; // any document role (in / out / both)
const DOC_IN = "doc_in";
const DOC_OUT = "doc_out";
const SUPER = "super";

const CACHE_MS = 20 * 1000; // a role / status change is seen within ~20 seconds
const cache = new Map(); // token -> { at, actor }

const denyText = "អ្នកមិនមានសិទ្ធិប្រើប្រាស់មុខងារនេះទេ!";

function tokenOf(req) {
  let token = req.headers["x-access-token"] || req.headers["authorization"];
  if (!token || typeof token !== "string") return null;
  if (token.startsWith("Bearer ")) token = token.slice(7).trim();
  return token || null;
}

async function actorOf(token) {
  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.actor;

  const session = await getSession(token);
  if (!session) return null;

  const user = await User.findById(session.user_id).select("role is_super_admin status deleted").lean();
  const role = typeof user?.role === "string" ? user.role : "";
  const actor = user
    ? {
        userId: String(user._id),
        role,
        isSuper: user.is_super_admin === true || role === R_SUPER,
        active: user.status !== false && user.deleted !== true,
      }
    : { userId: null, role: "", isSuper: false, active: false };

  if (cache.size > 500) cache.clear();
  cache.set(token, { at: Date.now(), actor });
  return actor;
}

function allowed(actor, level) {
  if (actor.isSuper) return true;
  switch (level) {
    case ALL:
      return true;
    case DOC:
      return actor.role === R_IN || actor.role === R_OUT || actor.role === R_BOTH;
    case DOC_IN:
      return actor.role === R_IN || actor.role === R_BOTH;
    case DOC_OUT:
      return actor.role === R_OUT || actor.role === R_BOTH;
    default:
      return false; // SUPER (and anything unknown)
  }
}

const startsWith = (p, base) => p === base || p.startsWith(`${base}/`);

// path is relative to /api/admin (e.g. "/document/123/send")
function levelFor(method, rawPath, query) {
  const p = rawPath.replace(/\/+$/, "") || "/";
  const read = method === "GET" || method === "HEAD";

  // sign in / sign out / token test: each route handles itself
  if (startsWith(p, "/auth")) return null;

  // everybody who is signed in
  if (startsWith(p, "/home")) return ALL;
  if (p === "/users-app/profile" || p === "/users-roles") return ALL;

  // my own password
  if (p === "/users/change-password") return ALL;
  if (startsWith(p, "/users/update-password-no-token")) return ALL; // the route checks "self + first login"
  if (startsWith(p, "/users/reset-password")) return SUPER;

  // users, groups, master data: anyone may READ (document forms need the lists), only the super admin may change
  if (startsWith(p, "/users") || p === "/users-all") return read ? ALL : SUPER;
  if (p.startsWith("/group-user-permission")) return read ? ALL : SUPER; // also "-all"
  if (startsWith(p, "/master-data")) return read ? ALL : SUPER;

  // files
  if (startsWith(p, "/upload")) return DOC;

  // documents
  if (startsWith(p, "/document-transfer")) {
    if (p === "/document-transfer/inbox") return DOC_IN;
    if (p === "/document-transfer/sent") return DOC_OUT;
    return DOC;
  }
  if (startsWith(p, "/document")) {
    if (p === "/document") {
      if (method === "POST") return DOC_OUT; // create = outgoing document
      if (read) {
        if (query?.box === "in") return DOC_IN;
        if (query?.box === "out") return DOC_OUT;
      }
      return DOC;
    }
    if (method === "POST" && /^\/document\/[^/]+\/send$/.test(p)) return DOC_OUT;
    return DOC;
  }

  // sessions, activity log, summaries and anything unknown: super admin only
  return SUPER;
}

async function role_guard(req, res, next) {
  const mode = (process.env.ROLE_GUARD || "on").toLowerCase();
  if (mode === "off" || req.method === "OPTIONS") return next();

  try {
    const level = levelFor(req.method, req.path, req.query);
    if (level === null) return next();

    const token = tokenOf(req);
    if (!token) return next(); // jwt_auth will answer 401

    const actor = await actorOf(token);
    if (!actor) return next(); // request_user will answer 401

    if (!actor.active) {
      cache.delete(token);
      return res.status(401).json({ success: false, message: "គណនីត្រូវបានផ្អាក ឬលុបចេញ!" });
    }

    if (!allowed(actor, level)) {
      if (mode === "log") {
        console.warn(`[role_guard] would block ${req.method} ${req.originalUrl} role="${actor.role}" needs=${level}`);
        return next();
      }
      return res.status(403).json({ success: false, message: denyText });
    }

    // a one-sided document role never sees the other side by leaving "box" out
    if (req.method === "GET" && req.path.replace(/\/+$/, "") === "/document" && !actor.isSuper) {
      const box = req.query?.box;
      if (box !== "in" && box !== "out") {
        if (actor.role === R_IN) req.query.box = "in";
        else if (actor.role === R_OUT) req.query.box = "out";
      }
    }

    return next();
  } catch (err) {
    console.error("[role_guard]", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
}

module.exports = { role_guard, levelFor, ALL, DOC, DOC_IN, DOC_OUT, SUPER };
