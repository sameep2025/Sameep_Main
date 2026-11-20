import fs from "node:fs";
import path from "node:path";

const readPage = (name) => fs.readFileSync(path.join(__dirname, name), "utf8");

test.each(["DummyVendorStatusListPage.jsx", "VendorStatusListPage.jsx"])(
  "%s keeps the existing vendor Actions toolbar sticky and responsive",
  (name) => {
    const source = readPage(name);
    expect(source).toMatch(/position: 'sticky'/);
    expect(source).toMatch(/top: 0/);
    expect(source).toMatch(/zIndex: 20/);
    expect(source).toMatch(/flexWrap: 'wrap'/);
    expect(source).toMatch(/checked=\{selectedVendorId === v\._id\}/);
  }
);
