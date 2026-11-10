import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const analytics = fs.readFileSync(path.join(root, "app/components/dashboard/CustomerAnalyticsDashboard.jsx"), "utf8");
const composer = fs.readFileSync(path.join(root, "app/components/dashboard/WhatsappCampaignComposer.jsx"), "utf8");
const marketing = fs.readFileSync(path.join(root, "app/components/dashboard/WhatsappMarketingDashboard.jsx"), "utf8");
const css = fs.readFileSync(path.join(root, "app/components/dashboard/WhatsappCampaignComposer.css"), "utf8");

test("Customer Analytics supports explicit selection and bounded Select All Matching", () => {
  assert.match(analytics, /type="checkbox"/);
  assert.match(analytics, /Select All Matching/);
  assert.match(analytics, /Deselect All/);
  assert.match(analytics, /excludedCustomerIds/);
  assert.match(analytics, /campaign-recipient-preview/);
  assert.match(analytics, /Create Marketing Campaign/);
});

test("campaign composer permits only approved template selection and frozen previews", () => {
  assert.match(composer, /campaign-templates/);
  assert.match(composer, /Approved WhatsApp template/);
  assert.match(composer, /Customer preview/);
  assert.match(composer, /Consent not recorded/);
  assert.match(composer, /Save Campaign Draft/);
  assert.match(composer, /Attach an approved template later/);
  assert.match(composer, /Your campaign can be saved as a draft\. Select an approved WhatsApp template when it becomes available\./);
  assert.doesNotMatch(composer, /Send Campaign|Schedule Campaign|Send Test/);
});

test("saved campaign drafts reopen from WhatsApp Marketing without a send action", () => {
  assert.match(marketing, /Campaign Drafts/);
  assert.match(marketing, /setEditingCampaignId/);
  assert.match(marketing, /Sending is not enabled/);
  assert.doesNotMatch(marketing, /Send Campaign/);
});

test("campaign builder remains opaque and mobile responsive", () => {
  assert.match(css, /background:\s*#050505/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /grid-template-columns:\s*1fr/);
  assert.match(css, /min-height:\s*100dvh/);
});

