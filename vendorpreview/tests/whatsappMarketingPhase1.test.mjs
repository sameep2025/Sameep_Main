import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  getMarketingPurposeLabel,
  renderMarketingTemplatePreview,
  validateMarketingDraft,
} from "../app/components/dashboard/whatsappMarketingTemplate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(
  path.join(root, "app/components/dashboard/WhatsappMarketingDashboard.jsx"),
  "utf8"
);
const css = fs.readFileSync(
  path.join(root, "app/components/dashboard/WhatsappMarketingDashboard.css"),
  "utf8"
);
const explore = fs.readFileSync(path.join(root, "app/_Explore/Explore.jsx"), "utf8");

test("marketing preview substitutes only the supported customer samples", () => {
  assert.equal(
    renderMarketingTemplatePreview("Hi {{customer_name}}, {{offer_details}} at {{salon_name}}."),
    "Hi Priya, 20% off this week at Your Salon."
  );
  assert.equal(renderMarketingTemplatePreview("Keep {{unknown_value}}"), "Keep {{unknown_value}}");
  assert.equal(getMarketingPurposeLabel("EXCLUSIVE_OFFER"), "Exclusive Offer");
});

test("draft validation rejects unsupported and incomplete placeholders", () => {
  const valid = {
    internalName: "Festive Offer",
    purpose: "PROMOTIONAL_OFFER",
    messageBody: "Hi {{customer_name}}, {{offer_details}}",
  };
  assert.equal(validateMarketingDraft(valid), "");
  assert.match(
    validateMarketingDraft({ ...valid, messageBody: "Hi {{phone}}" }),
    /supported personalization/
  );
  assert.match(
    validateMarketingDraft({ ...valid, messageBody: "Hi {{customer_name" }),
    /unfinished placeholder/
  );
});

test("template builder preserves draft CRUD and adds Meta approval lifecycle actions", () => {
  assert.match(source, /Create Template/);
  assert.match(source, /Save Draft/);
  assert.match(source, /Delete/);
  assert.match(source, /Preview/);
  assert.match(source, /MARKETING_PLACEHOLDERS\.map/);
  assert.match(source, /renderMarketingTemplatePreview/);
  assert.match(source, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(source, /accept="application\/pdf"/);
  assert.match(source, /multiple/);
  assert.match(source, /Offer Images &amp; Brochures/);
  assert.match(source, /Primary WhatsApp media/);
  assert.match(source, /type: "IMAGE"/);
  assert.match(source, /type: "DOCUMENT"/);
  assert.match(source, /type: "NONE"/);
  assert.match(source, /Open PDF/);
  assert.match(source, /deleteTemporaryMedia/);
  assert.match(source, /getVendorAuthHeaders\(vendorId\)/);
  assert.match(source, /Submit to Meta/);
  assert.match(source, /Refresh Status/);
  assert.match(source, /Revise/);
  assert.match(source, /Meta feedback:/);
  assert.match(source, /status-\$\{String\(template.status/);
  assert.doesNotMatch(source, /Send Campaign|Send Test/);
});

test("marketing builder uses opaque responsive modal and accessible mobile controls", () => {
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-label="Close template editor"/);
  assert.match(css, /\.wa-marketing-modal[\s\S]*background:\s*#050505/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /min-height:\s*42px/);
  assert.match(css, /overflow-y:\s*auto/);
  assert.match(css, /\.wa-marketing-media-tile[\s\S]*object-fit:\s*cover/);
  assert.match(css, /\.wa-marketing-document-row/);
});

test("VendorPreview navigation opens the dedicated marketing dashboard", () => {
  assert.match(explore, /import WhatsappMarketingDashboard/);
  assert.match(explore, /title: "WhatsApp Marketing"/);
  assert.match(explore, /setViewMode\("whatsapp-marketing-dashboard"\)/);
  assert.match(explore, /<WhatsappMarketingDashboard vendorId=\{vendorId\}/);
});

test("Beta access messaging depends on the feature flag and active subscription, not Growth", () => {
  assert.match(source, /Marketing is not enabled yet/);
  assert.match(source, /Active subscription required/);
  assert.doesNotMatch(source, /Growth plan required|active Growth plan/);
});
