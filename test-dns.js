const dns = require("dns");

dns.setServers(["1.1.1.1", "1.0.0.1"]);

dns.resolveSrv(
  "_mongodb._tcp.cluster0.iklaoyw.mongodb.net",
  (err, addresses) => {
    if (err) {
      console.error("❌ DNS Error:", err);
    } else {
      console.log("✅ SRV Records:");
      console.log(addresses);
    }
  }
);