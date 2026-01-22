const AppConfig = require("../models/AppConfig");

async function getSessionValidityHours(defaultHours = 4) {
  const doc = await AppConfig.findOne({ key: "sessionValidity" }).lean();
  const selected = doc?.value?.selectedHour;
  if (typeof selected === "number" && selected > 0) {
    return selected;
  }
  return defaultHours;
}

module.exports = {
  getSessionValidityHours,
};
