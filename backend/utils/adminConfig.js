const AppConfig = require("../models/AppConfig");

async function getAdminPasscode(defaultCode = "1234") {
  const doc = await AppConfig.findOne({ key: "adminPasscode" }).lean();
  const raw = doc?.value;
  if (raw == null) return defaultCode;

  const str = String(raw).trim();
  if (/^\d{4}$/.test(str)) {
    return str;
  }
  return defaultCode;
}

module.exports = {
  getAdminPasscode,
};
