// Shared: connect with the project's .env and load the models
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const mongoose = require("mongoose");
const dns = require("dns");
dns.setServers(["1.1.1.1", "1.0.0.1"]);
const root = "../../src/v1/admin";
const models = {
  Document: require(`${root}/dashboard/document/model`),
  DocumentTransfer: require(`${root}/dashboard/document/transfer.model`),
  Session: require(`${root}/session/session.model`),
  User: require(`${root}/user/user.model`),
};
async function connect() {
  const uri = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@cluster0.iklaoyw.mongodb.net/${process.env.MONGO_DB}?retryWrites=true&w=majority`;
  await mongoose.connect(uri, { autoIndex: false }); // scripts never build indexes implicitly
}
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
module.exports = { mongoose, models, connect, arg };
