function requireSecret(name, fallbackNames = [], env = process.env) {
  const names = [name, ...fallbackNames];
  for (const candidate of names) {
    const value = String(env[candidate] || "").trim();
    if (value) return value;
  }

  const error = new Error(`${name} is required`);
  error.code = "jwt_secret_missing";
  throw error;
}

function getJwtSecret(env = process.env) {
  return requireSecret("JWT_SECRET", [], env);
}

function getBillLinkSecret(env = process.env) {
  return requireSecret("BILL_LINK_SECRET", ["JWT_SECRET"], env);
}

function assertJwtConfiguration(env = process.env) {
  getJwtSecret(env);
  getBillLinkSecret(env);
}

module.exports = {
  assertJwtConfiguration,
  getBillLinkSecret,
  getJwtSecret,
};
