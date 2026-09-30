# SDMS API – performance pass

## Run order (on your machine, API running with nodemon)
1. BEFORE (old code paths):  `PERF_LEGACY=1 npm start`, then
   `node scripts/perf/snapshot.js save before --token <access_token> --month 2026-09`
   `node scripts/perf/explain.js --email <user email> --month 2026-09 --label before`   (run before step 3)
2. AFTER (new code paths):   restart with `npm start` (no PERF_LEGACY), then
   `node scripts/perf/snapshot.js save after --token <same token> --month 2026-09`
3. Indexes:                  `node scripts/perf/create-indexes.js`   (creates missing ones, never drops)
   `node scripts/perf/explain.js --email <same user> --month 2026-09 --label after`
4. Proof:                    `node scripts/perf/snapshot.js diff before after`
Repeat 1–4 with another user (e.g. a super admin without office).

## Switches / revert
- `PERF_LEGACY=1` → old code for transfer inbox/sent (no lean) and home /new-documents (deep populate).
- Every change is marked `[perf]`; originals are in `scripts/perf/backup/`.
- Drop an index (mongosh): `db.documents.dropIndex("office_id_open_1_deleted_1_created_date_-1")`, etc.
