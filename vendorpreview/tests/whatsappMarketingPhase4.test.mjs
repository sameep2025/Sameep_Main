import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const composer = fs.readFileSync(
  path.join(root, "app/components/dashboard/WhatsappCampaignComposer.jsx"),
  "utf8"
);
const dashboard = fs.readFileSync(
  path.join(root, "app/components/dashboard/WhatsappMarketingDashboard.jsx"),
  "utf8"
);

test("saved drafts expose a confirmed Run Campaign action and cancellation", () => {
  assert.match(composer, /\/campaigns\/\$\{encodeURIComponent\(campaignId\)\}\/run/);
  assert.match(composer, /JSON\.stringify\(\{ confirmed: true \}\)/);
  assert.match(composer, /Run Campaign/);
  assert.match(composer, /Cancel Campaign/);
  assert.match(composer, /window\.confirm/);
});

test("campaign reporting displays required delivery counts and failure details", () => {
  for (const label of ["Total", "Queued", "Sent", "Delivered", "Read", "Failed"]) {
    assert.match(composer, new RegExp(label));
  }
  assert.match(composer, /View recent exclusions and failures/);
  assert.match(composer, /setInterval\(refresh, 3000\)/);
  assert.match(dashboard, /campaign\.deliveryCounts\.sent/);
});

test("non-draft campaigns are read-only and preserve Customer Analytics recipients", () => {
  assert.match(composer, /const editable = campaignStatus === "DRAFT"/);
  assert.match(composer, /disabled=\{!editable\}/);
  assert.match(composer, /resolveRecipients\(\)/);
  assert.match(composer, /counts\.eligible/);
});

test("opening a saved draft refreshes eligibility once with its saved inputs", () => {
  assert.match(composer, /if \(savedStatus === "DRAFT"\)/);
  assert.match(composer, /selection: savedSelection/);
  assert.match(composer, /templateId: savedTemplateId \|\| undefined/);
  assert.match(composer, /offerDetails: savedOfferDetails/);
  assert.match(composer, /excludedCustomerIds: campaign\.selection\.excludedCustomerIds/);
  assert.match(composer, /if \(!loading && !campaignId && selection\)/);
  assert.match(composer, /setCounts\(\(current\) => \(\{ \.\.\.current, eligible: 0 \}\)\)/);
});

test("vendor-recorded permission refreshes eligibility without changing the campaign draft", () => {
  assert.match(composer, /MARKETING_CONSENT_REQUIRED/);
  assert.match(composer, /\/marketing-consents\/\$\{encodeURIComponent\(recipient\.customerId\)\}/);
  assert.match(composer, /JSON\.stringify\(\{ permissionConfirmed: true \}\)/);
  assert.match(composer, /await resolveRecipients\(\)/);
  assert.match(composer, /Record permission/);
});
