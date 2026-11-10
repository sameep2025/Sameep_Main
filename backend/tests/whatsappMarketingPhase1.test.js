const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const Plan = require("../models/Plan");
const VendorSubscription = require("../models/VendorSubscription");
const WhatsappMarketingTemplate = require("../models/WhatsappMarketingTemplate");
const controller = require("../controllers/vendorWhatsappMarketingController");
const {
  extractMarketingVariables,
  renderMarketingTemplatePreview,
  validateMarketingTemplateInput,
} = require("../services/whatsappMarketingTemplateService");
const {
  getWhatsappMarketingCapability,
  isWhatsappMarketingEnabled,
} = require("../services/whatsappMarketingCapability");
const {
  createMarketingImageUploadToken,
  hasValidMarketingDocumentSignature,
  hasValidMarketingImageSignature,
  hasValidMarketingMediaSignature,
  verifyMarketingImageUpload,
} = require("../services/whatsappMarketingImageService");

const VENDOR_ID = "692403a24d4d3a1b6a7f0ae5";
const OTHER_VENDOR_ID = "692403a24d4d3a1b6a7f0ae6";
const TEMPLATE_ID = "692403a24d4d3a1b6a7f0ae7";

function mockRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function draft(overrides = {}) {
  return {
    _id: TEMPLATE_ID,
    vendorId: VENDOR_ID,
    internalName: "Festive Offer",
    normalizedName: "festive offer",
    purpose: "PROMOTIONAL_OFFER",
    messageBody: "Hi {{customer_name}}, {{offer_details}} at {{salon_name}}.",
    variables: ["customer_name", "offer_details", "salon_name"],
    image: null,
    media: { images: [], brochure: null, primary: { type: "NONE", key: "" } },
    language: "en",
    draftVersion: 1,
    status: "DRAFT",
    createdAt: new Date("2026-11-09T10:00:00.000Z"),
    updatedAt: new Date("2026-11-09T10:00:00.000Z"),
    ...overrides,
  };
}

test("marketing placeholders are allow-listed, ordered, and previewed safely", () => {
  assert.deepEqual(
    extractMarketingVariables("Hi {{customer_name}}, {{offer_details}} from {{salon_name}} {{customer_name}}"),
    ["customer_name", "offer_details", "salon_name"]
  );
  assert.equal(
    renderMarketingTemplatePreview("Hi {{customer_name}} — {{offer_details}} at {{salon_name}}"),
    "Hi Priya — 20% off this week at Your Salon"
  );
  assert.throws(
    () => extractMarketingVariables("Hi {{customer_phone}}"),
    (error) => error.code === "unsupported_marketing_placeholder"
  );
  assert.throws(
    () => extractMarketingVariables("Hi {{ customer_name }}"),
    (error) => error.code === "invalid_marketing_placeholder_format"
  );
  assert.throws(
    () => extractMarketingVariables("Hi {{customer_name"),
    (error) => error.code === "invalid_marketing_placeholder_format"
  );
});

test("template input rejects unknown fields and normalizes draft data", () => {
  const value = validateMarketingTemplateInput({
    internalName: "  Festive   Offer  ",
    purpose: "promotional_offer",
    messageBody: "Hi {{customer_name}}",
    language: "EN",
  });
  assert.equal(value.internalName, "Festive Offer");
  assert.equal(value.normalizedName, "festive offer");
  assert.equal(value.purpose, "PROMOTIONAL_OFFER");
  assert.deepEqual(value.variables, ["customer_name"]);
  assert.equal(value.language, "en");
  assert.throws(
    () => validateMarketingTemplateInput({ internalName: "Offer", purpose: "PROMOTIONAL_OFFER", messageBody: "Hello", status: "APPROVED" }),
    (error) => error.code === "unsupported_marketing_template_field"
  );
});

test("WhatsApp Marketing Beta requires the server flag and an active unexpired subscription", async () => {
  assert.equal(isWhatsappMarketingEnabled({}), false);
  assert.deepEqual(await getWhatsappMarketingCapability(VENDOR_ID, { env: {} }), {
    enabled: false,
    eligible: false,
    reason: "feature_disabled",
  });

  const originalFindOne = VendorSubscription.findOne;
  let subscription = {
    active: true,
    expiryDate: new Date("2030-01-01T00:00:00.000Z"),
    planId: { active: true, features: {} },
  };
  VendorSubscription.findOne = () => ({
    populate: async () => subscription,
  });
  try {
    const options = {
      env: { WHATSAPP_MARKETING_ENABLED: "true" },
      now: new Date("2026-11-09T00:00:00.000Z"),
    };
    const eligible = await getWhatsappMarketingCapability(VENDOR_ID, options);
    assert.deepEqual(eligible, { enabled: true, eligible: true, reason: "eligible" });

    subscription = { ...subscription, planId: { active: true, features: { whatsappMarketing: false } } };
    assert.deepEqual(await getWhatsappMarketingCapability(VENDOR_ID, options), eligible);

    subscription = { ...subscription, active: false };
    assert.deepEqual(await getWhatsappMarketingCapability(VENDOR_ID, options), {
      enabled: true,
      eligible: false,
      reason: "subscription_inactive",
    });

    subscription = {
      ...subscription,
      active: true,
      expiryDate: new Date("2026-11-08T23:59:59.999Z"),
    };
    assert.deepEqual(await getWhatsappMarketingCapability(VENDOR_ID, options), {
      enabled: true,
      eligible: false,
      reason: "subscription_expired",
    });

    subscription = null;
    assert.deepEqual(await getWhatsappMarketingCapability(VENDOR_ID, options), {
      enabled: true,
      eligible: false,
      reason: "subscription_missing",
    });
  } finally {
    VendorSubscription.findOne = originalFindOne;
  }
});

test("plan schema contains an explicit default-off WhatsApp Marketing capability", () => {
  const plan = new Plan({ name: "Basic", price: 3600 });
  assert.equal(plan.features.whatsappMarketing, false);
});

test("marketing image ownership token is vendor-bound and magic bytes are checked", () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "marketing-test-secret";
  const image = {
    key: `newvendor/whatsapp-marketing/${VENDOR_ID}/offer.jpg`,
    url: "https://example-bucket.s3.ap-south-1.amazonaws.com/offer.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1200,
    originalName: "offer.jpg",
  };
  try {
    const uploadToken = createMarketingImageUploadToken({ vendorId: VENDOR_ID, image });
    assert.deepEqual(
      verifyMarketingImageUpload({ vendorId: VENDOR_ID, image: { ...image, uploadToken } }),
      image
    );
    assert.equal(
      verifyMarketingImageUpload({ vendorId: OTHER_VENDOR_ID, image: { ...image, uploadToken } }),
      null
    );
    assert.equal(hasValidMarketingImageSignature(Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]), "image/jpeg"), true);
    assert.equal(hasValidMarketingImageSignature(Buffer.alloc(12), "image/jpeg"), false);
    const pdf = Buffer.from("%PDF-1.7\nmarketing brochure\n%%EOF");
    assert.equal(hasValidMarketingDocumentSignature(pdf, "application/pdf"), true);
    assert.equal(hasValidMarketingMediaSignature(pdf, "application/pdf"), true);
    assert.equal(hasValidMarketingDocumentSignature(Buffer.from("%PDF-broken"), "application/pdf"), false);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("media library validates limits, primary selection, persistence, and vendor ownership", () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "marketing-test-secret";
  const upload = (name, mimeType = "image/jpeg") => {
    const media = {
      key: `newvendor/whatsapp-marketing/${VENDOR_ID}/${name}`,
      url: `https://example.test/${name}`,
      mimeType,
      sizeBytes: 1200,
      originalName: name,
    };
    return {
      ...media,
      uploadToken: createMarketingImageUploadToken({ vendorId: VENDOR_ID, image: media }),
    };
  };
  try {
    const images = [1, 2, 3, 4, 5].map((number) => upload(`offer-${number}.jpg`));
    const brochure = upload("offer.pdf", "application/pdf");
    const resolved = controller.resolveMediaForWrite({
      vendorId: VENDOR_ID,
      incomingMedia: {
        images,
        brochure,
        primary: { type: "DOCUMENT", key: brochure.key },
      },
    });
    assert.equal(resolved.images.length, 5);
    assert.equal(resolved.brochure.mimeType, "application/pdf");
    assert.deepEqual(resolved.primary, { type: "DOCUMENT", key: brochure.key });
    assert.equal(Object.hasOwn(resolved.images[0], "uploadToken"), false);

    assert.throws(
      () => controller.resolveMediaForWrite({
        vendorId: VENDOR_ID,
        incomingMedia: { images: [...images, upload("offer-6.jpg")], primary: { type: "NONE", key: "" } },
      }),
      (error) => error.code === "marketing_image_limit_exceeded"
    );
    assert.throws(
      () => controller.resolveMediaForWrite({
        vendorId: VENDOR_ID,
        incomingMedia: { images: [images[0]], primary: { type: "IMAGE", key: images[1].key } },
      }),
      (error) => error.code === "invalid_primary_media"
    );
    assert.throws(
      () => controller.resolveMediaForWrite({
        vendorId: OTHER_VENDOR_ID,
        incomingMedia: { images: [images[0]], primary: { type: "NONE", key: "" } },
      }),
      (error) => error.code === "invalid_marketing_media_ownership"
    );
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("legacy single-image drafts remain selected after media schema defaults are introduced", () => {
  const legacyImage = {
    key: `newvendor/whatsapp-marketing/${VENDOR_ID}/legacy.jpg`,
    url: "https://example.test/legacy.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1200,
    originalName: "legacy.jpg",
  };
  const serialized = controller.serializeTemplate(draft({
    image: legacyImage,
    media: { images: [], brochure: null, primary: { type: "NONE", key: "" } },
  }));
  assert.deepEqual(serialized.media.images, [legacyImage]);
  assert.deepEqual(serialized.media.primary, { type: "IMAGE", key: legacyImage.key });
  assert.deepEqual(serialized.image, legacyImage);
});

test("create draft derives protected fields and ignores no client approval state", async () => {
  const originalCreate = WhatsappMarketingTemplate.create;
  let created;
  WhatsappMarketingTemplate.create = async (payload) => {
    created = payload;
    return draft(payload);
  };
  try {
    const res = mockRes();
    await controller.createTemplate(
      {
        params: { vendorId: VENDOR_ID },
        vendorWriteAuth: { vendorId: VENDOR_ID },
        body: {
          internalName: "Festive Offer",
          purpose: "PROMOTIONAL_OFFER",
          messageBody: "Hi {{customer_name}}",
        },
      },
      res
    );
    assert.equal(res.statusCode, 201);
    assert.equal(created.vendorId, VENDOR_ID);
    assert.equal(created.status, "DRAFT");
    assert.equal(created.draftVersion, 1);
    assert.deepEqual(created.variables, ["customer_name"]);
    assert.deepEqual(created.media, {
      images: [],
      brochure: null,
      primary: { type: "NONE", key: "" },
    });
  } finally {
    WhatsappMarketingTemplate.create = originalCreate;
  }
});

test("template detail lookup is vendor-scoped and does not expose cross-vendor records", async () => {
  const originalFindOne = WhatsappMarketingTemplate.findOne;
  let query;
  WhatsappMarketingTemplate.findOne = (value) => {
    query = value;
    return { lean: async () => null };
  };
  try {
    const res = mockRes();
    await controller.getTemplate(
      {
        params: { vendorId: VENDOR_ID, templateId: TEMPLATE_ID },
        vendorWriteAuth: { vendorId: VENDOR_ID },
      },
      res
    );
    assert.deepEqual(query, { _id: TEMPLATE_ID, vendorId: VENDOR_ID });
    assert.equal(res.statusCode, 404);
  } finally {
    WhatsappMarketingTemplate.findOne = originalFindOne;
  }
});

test("draft update increments version and non-drafts cannot be edited or deleted", async () => {
  const originalFindOne = WhatsappMarketingTemplate.findOne;
  const editable = draft({
    save: async function save() { return this; },
  });
  WhatsappMarketingTemplate.findOne = async () => editable;
  try {
    const updateRes = mockRes();
    await controller.updateTemplate(
      {
        params: { vendorId: VENDOR_ID, templateId: TEMPLATE_ID },
        vendorWriteAuth: { vendorId: VENDOR_ID },
        body: { messageBody: "Hello {{customer_name}}" },
      },
      updateRes
    );
    assert.equal(updateRes.statusCode, 200);
    assert.equal(editable.draftVersion, 2);
    assert.deepEqual(editable.variables, ["customer_name"]);

    WhatsappMarketingTemplate.findOne = async () => draft({ status: "APPROVED" });
    const blockedEdit = mockRes();
    await controller.updateTemplate(
      {
        params: { vendorId: VENDOR_ID, templateId: TEMPLATE_ID },
        vendorWriteAuth: { vendorId: VENDOR_ID },
        body: { messageBody: "Changed" },
      },
      blockedEdit
    );
    assert.equal(blockedEdit.statusCode, 409);

    const blockedDelete = mockRes();
    await controller.deleteTemplate(
      {
        params: { vendorId: VENDOR_ID, templateId: TEMPLATE_ID },
        vendorWriteAuth: { vendorId: VENDOR_ID },
      },
      blockedDelete
    );
    assert.equal(blockedDelete.statusCode, 409);
  } finally {
    WhatsappMarketingTemplate.findOne = originalFindOne;
  }
});

test("marketing routes enforce vendor ownership and capability before CRUD and uploads", () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, "../routes/vendorWhatsappMarketingRoutes.js"),
    "utf8"
  );
  const serverSource = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  assert.match(routeSource, /requireVendorAccessFromExistingAuth/);
  assert.match(routeSource, /requireWhatsappMarketingCapability/);
  assert.match(routeSource, /upload\.fields/);
  assert.match(routeSource, /application\/pdf|MARKETING_MEDIA_MIME_TYPES/);
  assert.match(routeSource, /router\.post\("\/:vendorId\/media"/);
  assert.match(routeSource, /router\.delete\("\/:vendorId\/media"/);
  assert.match(serverSource, /app\.use\("\/api\/vendor\/whatsapp-marketing"/);
});
