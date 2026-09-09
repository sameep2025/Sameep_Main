const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizeWhatsappRecipientPhone } = require("../utils/whatsappRecipientPhone");

const canonicalIndianNumber = "919381520396";

test("10-digit India number normalizes to international digits", () => {
  assert.equal(normalizeWhatsappRecipientPhone("9381520396").value, canonicalIndianNumber);
});

test("E.164 India number normalizes to international digits", () => {
  assert.equal(normalizeWhatsappRecipientPhone("+919381520396").value, canonicalIndianNumber);
});

test("already international India digits remain unchanged", () => {
  assert.equal(normalizeWhatsappRecipientPhone("919381520396").value, canonicalIndianNumber);
});

test("spaced India number normalizes to international digits", () => {
  assert.equal(normalizeWhatsappRecipientPhone("91 93815 20396").value, canonicalIndianNumber);
});

test("hyphenated E.164 India number normalizes to international digits", () => {
  assert.equal(normalizeWhatsappRecipientPhone("+91-93815-20396").value, canonicalIndianNumber);
});

test("empty recipient number is invalid", () => {
  assert.equal(normalizeWhatsappRecipientPhone("").valid, false);
});

test("too-short recipient number is invalid", () => {
  assert.equal(normalizeWhatsappRecipientPhone("12345").valid, false);
});

test("malformed recipient number is invalid", () => {
  assert.equal(normalizeWhatsappRecipientPhone("abc123").valid, false);
});
