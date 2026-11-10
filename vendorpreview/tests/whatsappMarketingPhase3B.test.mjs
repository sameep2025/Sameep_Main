import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testSend = fs.readFileSync(path.join(root, "app/components/dashboard/WhatsappMarketingTestSend.jsx"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "app/components/dashboard/WhatsappMarketingDashboard.jsx"), "utf8");
const css = fs.readFileSync(path.join(root, "app/components/dashboard/WhatsappMarketingTestSend.css"), "utf8");

test("test sending uses one manually entered authorized number and explicit confirmation", () => {
  assert.match(testSend, /Authorized test number/);
  assert.match(testSend, /confirmedAuthorized:\s*true/);
  assert.match(testSend, /window\.confirm/);
  assert.match(testSend, /marketing-test-sends/);
  assert.match(testSend, /Recent test delivery/);
  assert.match(testSend, /loadRecentSends/);
  assert.doesNotMatch(testSend, /selectedCustomerIds|campaign-recipient-preview|Select All Matching/);
});

test("test sender renders approved text, image, and PDF previews", () => {
  assert.match(testSend, /campaign-templates/);
  assert.match(testSend, /headerType === "IMAGE"/);
  assert.match(testSend, /headerType === "DOCUMENT"/);
  assert.match(testSend, /Personalized preview/);
  assert.match(testSend, /data\.vendorDisplayName/);
  assert.match(testSend, /customer_name/);
  assert.match(testSend, /offer_details/);
});

test("WhatsApp Marketing dashboard opens a dedicated controlled test modal", () => {
  assert.match(dashboard, /WhatsappMarketingTestSend/);
  assert.match(dashboard, /Send Test Message/);
  assert.doesNotMatch(dashboard, /Send Campaign/);
});

test("test-send modal is opaque and mobile responsive", () => {
  assert.match(css, /background:\s*#050505/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /min-height:\s*100dvh/);
  assert.match(css, /grid-template-columns:\s*1fr/);
});
