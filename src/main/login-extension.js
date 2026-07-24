const fs = require("node:fs");
const path = require("node:path");

const LOGIN_EXTENSION_INTERVAL = 60 * 60 * 1000;
const LOGIN_EXTENSION_SCRIPT = fs.readFileSync(
  path.join(__dirname, "../renderer/login-extension.js"),
  "utf8",
);

function shouldExtendLogin(slot) {
  return slot?.enabled === true && slot?.loginExtension === true;
}

module.exports = {
  LOGIN_EXTENSION_INTERVAL,
  LOGIN_EXTENSION_SCRIPT,
  shouldExtendLogin,
};
