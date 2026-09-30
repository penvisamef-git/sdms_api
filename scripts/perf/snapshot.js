/**
 * Save the JSON of the main endpoints, then diff two runs.
 *   node scripts/perf/snapshot.js save before --token <access_token> [--base http://localhost:8085] [--month 2026-09] [--doc <document_id>]
 *   node scripts/perf/snapshot.js save after  --token <access_token> ...
 *   node scripts/perf/snapshot.js diff before after
 * Volatile fields (computed from "now") are ignored in the diff.
 */
const fs = require("fs");
const path = require("path");
const arg = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d);
const OUT = path.join(__dirname, "out");
const VOLATILE = new Set(["waiting_hours", "holding_hours", "total_hours"]);

async function save(label) {
  const base = arg("base", "http://localhost:8085") + "/api/admin";
  const token = arg("token");
  if (!token) throw new Error("--token is required (data.access_token from login)");
  const month = arg("month", new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 7));
  const get = async (p) => {
    const r = await fetch(base + p, { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, body: await r.json() };
  };
  let doc = arg("doc");
  if (!doc) doc = (await get("/document?box=all&limit=1")).body?.data?.[0]?._id;
  const endpoints = {
    "home-summary": `/home/summary?month=${month}`,
    "home-summary-prev": `/home/summary?month=${prevMonth(month)}`,
    "home-new-documents": `/home/new-documents?month=${month}&limit=50`,
    "home-new-documents-all": `/home/new-documents?all_time=true&limit=50`,
    "home-my-office": `/home/my-office`,
    "document-in": `/document?box=in&limit=50`,
    "document-out": `/document?box=out&limit=50`,
    "transfer-inbox": `/document-transfer/inbox?limit=50`,
    "transfer-inbox-open": `/document-transfer/inbox?status=pending,received&limit=50`,
    "transfer-sent": `/document-transfer/sent?limit=50`,
    "transfer-sent-me": `/document-transfer/sent?scope=me&limit=50`,
    ...(doc ? { tracking: `/document/${doc}/tracking` } : {}),
  };
  const dir = path.join(OUT, label);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, p] of Object.entries(endpoints)) {
    const t = Date.now();
    const res = await get(p);
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(res, null, 2));
    console.log(`${res.status}  ${String(Date.now() - t).padStart(5)} ms  ${p}`);
  }
  console.log(`saved in scripts/perf/out/${label}/`);
}

function prevMonth(m) {
  const [y, mo] = m.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
}

function diff(a, b, p = "", out = []) {
  if (VOLATILE.has(p.split(".").pop())) return out;
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) {
    out.push(`${p}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  } else if (a && typeof a === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!(k in a)) out.push(`${p}.${k}: (missing) → ${JSON.stringify(b[k]).slice(0, 80)}`);
      else if (!(k in b)) out.push(`${p}.${k}: ${JSON.stringify(a[k]).slice(0, 80)} → (missing)`);
      else diff(a[k], b[k], `${p}.${k}`, out);
    }
  } else if (a !== b) out.push(`${p}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  return out;
}

function compare(l1, l2) {
  const d1 = path.join(OUT, l1);
  const d2 = path.join(OUT, l2);
  let bad = 0;
  for (const f of fs.readdirSync(d1)) {
    if (!fs.existsSync(path.join(d2, f))) {
      console.log(`✗ ${f}: missing in ${l2}`);
      bad++;
      continue;
    }
    const d = diff(JSON.parse(fs.readFileSync(path.join(d1, f))), JSON.parse(fs.readFileSync(path.join(d2, f))));
    if (d.length) {
      bad++;
      console.log(`✗ ${f}: ${d.length} difference(s)`);
      d.slice(0, 20).forEach((x) => console.log("    " + x));
    } else console.log(`✓ ${f}: identical`);
  }
  console.log(bad ? `\n${bad} endpoint(s) differ` : "\nAll responses identical ✔");
  process.exit(bad ? 1 : 0);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "save" && a) save(a).catch((e) => (console.error(e), process.exit(1)));
else if (cmd === "diff" && a && b) compare(a, b);
else console.log("usage: save <label> --token <t> | diff <before> <after>");
