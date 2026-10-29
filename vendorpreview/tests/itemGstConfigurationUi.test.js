const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const componentSource = fs.readFileSync(
  path.join(root, "app/PackagesPortal/ItemGstConfiguration.jsx"),
  "utf8"
);
const portalSource = fs.readFileSync(
  path.join(root, "app/PackagesPortal/PackagesPortal.jsx"),
  "utf8"
);
const cssSource = fs.readFileSync(
  path.join(root, "app/PackagesPortal/ItemGstConfiguration.css"),
  "utf8"
);

test("item GST editor supports inherited and custom service/product classifications", () => {
  assert.match(componentSource, /Use Default GST Settings/);
  assert.match(componentSource, /Custom GST Settings/);
  assert.match(componentSource, /value="SERVICE"/);
  assert.match(componentSource, /value="PRODUCT"/);
  assert.match(componentSource, /"HSN" : "SAC"/);
  assert.match(componentSource, /Effective GST/);
  assert.match(componentSource, /vendorDefaults\?\.defaultSac \|\| state\.vendorDefaults\?\.sac/);
  assert.match(componentSource, /itemType === "SERVICE"/);
  assert.match(componentSource, /setClassificationCode\(""\)/);
  assert.match(componentSource, /HSN \(Optional\)/);
  assert.match(componentSource, /SAC \(Optional\)/);
});

test("GST editor is hidden until a vendor GST draft is configured", () => {
  assert.match(componentSource, /if \(state\.loading \|\| !state\.configured\) return null/);
  assert.match(componentSource, /vendorGstConfigured === true/);
});

test("editor uses dedicated authenticated CRUD and never updates item prices", () => {
  assert.match(componentSource, /gst-item-overrides/);
  assert.match(componentSource, /method: "DELETE"/);
  assert.match(componentSource, /method: state\.override \? "PATCH" : "POST"/);
  assert.doesNotMatch(componentSource, /vendor-price-nodes\/update|price:/);
});

test("existing editors supply canonical item source and identity", () => {
  assert.match(portalSource, /itemId=\{editingService\._id\}/);
  assert.match(portalSource, /"vendor_menu_node" : "vendor_price_node"/);
  assert.match(portalSource, /itemSource="custom_package"/);
  assert.match(portalSource, /customModalMode === "edit"/);
  assert.match(portalSource, /itemId=\{variant\.id\}/);
});

test("item GST controls remain mobile usable", () => {
  assert.match(cssSource, /@media \(max-width: 640px\)/);
  assert.match(cssSource, /grid-template-columns: 1fr/);
  assert.match(cssSource, /width: 100%/);
});

test("radio labels are readable and item save wording is explicit", () => {
  assert.match(cssSource, /\.item-gst-choice\s*\{[\s\S]*?color:\s*#f5f1e7/);
  assert.match(cssSource, /\.item-gst-choice\s*\{[\s\S]*?font-weight:\s*600/);
  assert.match(componentSource, /Save Item GST Settings/);
});

test("success appears only after a successful API response", () => {
  const responseCheck = componentSource.indexOf("if (!response.ok || !payload.success)");
  const successMessage = componentSource.indexOf("Item GST Settings Saved Successfully");
  assert.ok(responseCheck >= 0);
  assert.ok(successMessage > responseCheck);
  assert.match(componentSource, /setMessageType\("success"\)/);
});
