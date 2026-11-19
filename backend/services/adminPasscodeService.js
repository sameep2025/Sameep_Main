const crypto = require("crypto");
const bcrypt = require("bcrypt");
const AppConfig = require("../models/AppConfig");

const CONFIG_KEY = "adminPasscode";
const BCRYPT_ROUNDS = 12;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

function normalizeCredential(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const passcodeHash = String(value.passcodeHash || "").trim();
  const credentialVersion = String(value.credentialVersion || "").trim();
  if (!BCRYPT_HASH_PATTERN.test(passcodeHash) || !credentialVersion) return null;
  return { passcodeHash, credentialVersion };
}

function createCredentialValue(passcodeHash) {
  return {
    passcodeHash,
    credentialVersion: crypto.randomBytes(24).toString("base64url"),
  };
}

async function getStoredValue() {
  const doc = await AppConfig.findOne({ key: CONFIG_KEY }).lean();
  return doc?.value ?? null;
}

async function upgradeLegacyCredential(storedValue) {
  const legacyValue = typeof storedValue === "string" ? storedValue.trim() : "";
  if (!/^\d{4}$/.test(legacyValue)) return null;

  const passcodeHash = await bcrypt.hash(legacyValue, BCRYPT_ROUNDS);
  const upgradedValue = createCredentialValue(passcodeHash);
  const upgraded = await AppConfig.findOneAndUpdate(
    { key: CONFIG_KEY, value: storedValue },
    { $set: { value: upgradedValue } },
    { new: true }
  ).lean();
  if (upgraded) return upgradedValue;
  return normalizeCredential(await getStoredValue());
}

async function getAdminPasscodeStatus() {
  const value = await getStoredValue();
  const credential = normalizeCredential(value) || await upgradeLegacyCredential(value);
  return { configured: Boolean(credential) };
}

async function setAdminPasscode(passcode) {
  const code = String(passcode || "").trim();
  if (!/^\d{4}$/.test(code)) {
    const error = new Error("adminPasscode must be a 4-digit numeric code");
    error.code = "invalid_admin_passcode";
    throw error;
  }

  const passcodeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
  const value = createCredentialValue(passcodeHash);
  await AppConfig.findOneAndUpdate(
    { key: CONFIG_KEY },
    { $set: { key: CONFIG_KEY, value } },
    { new: true, upsert: true }
  ).lean();
  return { configured: true, credentialVersion: value.credentialVersion };
}

async function verifyCurrentCredential(code, value) {
  const credential = normalizeCredential(value);
  if (!credential) return null;
  return (await bcrypt.compare(code, credential.passcodeHash)) ? credential : null;
}

async function verifyAdminPasscode(passcode) {
  const code = String(passcode || "").trim();
  if (!/^\d{4}$/.test(code)) return null;

  const storedValue = await getStoredValue();
  const credential = await verifyCurrentCredential(code, storedValue);
  if (credential) return credential;

  // Upgrade the prior plaintext AppConfig value only after proving knowledge of it.
  const legacyValue = typeof storedValue === "string" ? storedValue.trim() : "";
  if (!/^\d{4}$/.test(legacyValue) || legacyValue !== code) return null;

  const upgraded = await upgradeLegacyCredential(storedValue);
  return upgraded && (await bcrypt.compare(code, upgraded.passcodeHash)) ? upgraded : null;
}

async function getAdminPasscodeCredentialVersion() {
  const credential = normalizeCredential(await getStoredValue());
  return credential?.credentialVersion || "";
}

module.exports = {
  getAdminPasscodeCredentialVersion,
  getAdminPasscodeStatus,
  normalizeCredential,
  setAdminPasscode,
  verifyAdminPasscode,
};
