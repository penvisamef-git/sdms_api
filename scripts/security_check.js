// Security check for the SDMS database (read-only unless you add --fix)
//
//   node scripts/security_check.js          → report only
//   node scripts/security_check.js --fix    → also remove password hashes saved inside old sessions
//
// It shows:
//   1. users that have NO role (they can only open the dashboard + my account)
//   2. users whose password is not a bcrypt hash
//   3. sessions that still hold a password hash in user_data
const { mongoose, models, connect } = require("./perf/_common");

const FIX = process.argv.includes("--fix");

(async () => {
  await connect();
  const { User, Session } = models;

  const users = await User.find({ deleted: { $ne: true } })
    .select("firstname lastname email role is_super_admin status password")
    .lean();

  const noRole = users.filter((u) => !u.role && !u.is_super_admin);
  const plain = users.filter((u) => typeof u.password !== "string" || !/^\$2[aby]\$/.test(u.password));

  console.log(`\nUsers (not deleted): ${users.length}`);
  console.log(`\n1) Users with NO role — set one in the Users page: ${noRole.length}`);
  noRole.forEach((u) => console.log(`   - ${u.email}  (${`${u.firstname || ""} ${u.lastname || ""}`.trim()})`));

  console.log(`\n2) Users whose password is NOT a bcrypt hash: ${plain.length}`);
  plain.forEach((u) => console.log(`   - ${u.email}  → reset their password in the Users page`));

  const withHash = await Session.countDocuments({ "user_data.password": { $exists: true } });
  console.log(`\n3) Sessions holding a password hash: ${withHash}`);
  if (withHash && FIX) {
    const r = await Session.updateMany({}, { $unset: { "user_data.password": "" } });
    console.log(`   cleaned ${r.modifiedCount} session(s)`);
  } else if (withHash) {
    console.log("   run again with --fix to clean them");
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
