// Creates / refreshes the login session. One session per user PER CLIENT ("web", "app"),
// so signing in on the phone no longer signs the user out of the web (and the other way round).
const helper = require("./helper");
const Session = require("../v1/admin/session/session.model");

const CLIENTS = ["web", "app"];

async function createLoginSession(prop, user, req, client = "web") {
  const kind = CLIENTS.includes(client) ? client : "web";
  const device = helper.extractDeviceInfo(req);

  // token holds NO password (the old token carried the plain password)
  const access_token = prop.jwt.sign(
    { uid: String(user._id), userName: user.email, client: kind },
    process.env.JWT_SECRET,
    { expiresIn: "720h" },
  );

  // the user saved in the session never holds the password hash
  const safeUser = user.toObject();
  delete safeUser.password;

  // old sessions have no `client` yet → they count as "web"
  const filter =
    kind === "web"
      ? { user_id: user._id, $or: [{ client: "web" }, { client: { $exists: false } }] }
      : { user_id: user._id, client: kind };

  const existing = await Session.findOne(filter);
  if (existing) {
    existing.time = helper.cambodiaDate();
    existing.access_token = access_token;
    existing.device = device;
    existing.client = kind;
    existing.user_data = safeUser;
    await existing.save();
  } else {
    await new Session({
      user_id: user._id,
      client: kind,
      device,
      create_by: user._id,
      time: helper.cambodiaDate(),
      access_token,
      user_data: safeUser,
    }).save();
  }

  return { access_token, device, safeUser };
}

module.exports = { createLoginSession };
