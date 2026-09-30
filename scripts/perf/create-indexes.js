/**
 * Create the schema indexes in production WITHOUT dropping anything.
 *   node scripts/perf/create-indexes.js
 * (Uses Model.createIndexes(): only creates missing indexes. Never use syncIndexes() — it drops indexes not in the schema.)
 */
const { mongoose, models, connect } = require("./_common");
(async () => {
  await connect();
  for (const name of ["Document", "DocumentTransfer", "Session"]) {
    const M = models[name];
    await M.createIndexes();
    const idx = await M.collection.indexes();
    console.log(`${name} (${M.collection.collectionName}): ${idx.map((i) => JSON.stringify(i.key)).join("  ")}`);
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
