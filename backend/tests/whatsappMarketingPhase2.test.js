const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const controller = require("../controllers/vendorWhatsappMarketingController");
const {
  buildMarketingMetaPayload,
  buildMarketingMetaTemplateName,
  buildMarketingSubmissionSnapshot,
  convertMarketingPlaceholders,
  mapMetaMarketingStatus,
  readMarketingTemplateStatus,
  submitMarketingTemplateToMeta,
} = require("../services/whatsappMarketingMetaService");
const {
  processMarketingTemplateStatusUpdate,
} = require("../services/metaWhatsappWebhookService");
const { uploadTemplateMediaSample } = require("../services/metaWhatsAppService");

const VENDOR_ID = "692403a24d4d3a1b6a7f0ae5";

function marketingTemplate(overrides = {}) {
  return {
    _id: "692403a24d4d3a1b6a7f0ae7",
    vendorId: VENDOR_ID,
    internalName: "Festive Facial Offer",
    purpose: "PROMOTIONAL_OFFER",
    messageBody: "Hi {{customer_name}}, {{offer_details}} at {{salon_name}}.",
    media: { images: [], brochure: null, primary: { type: "NONE", key: "" } },
    language: "en",
    draftVersion: 2,
    status: "DRAFT",
    metaTemplate: {},
    ...overrides,
  };
}

test("marketing placeholders become positional variables with Meta samples", () => {
  const converted = convertMarketingPlaceholders(
    "Hi {{customer_name}}, {{offer_details}} at {{salon_name}}. Bye {{customer_name}}."
  );
  assert.equal(converted.metaBody, "Hi {{1}}, {{2}} at {{3}}. Bye {{4}}.");
  assert.deepEqual(converted.variableOrder, [
    "customer_name",
    "offer_details",
    "salon_name",
    "customer_name",
  ]);
  assert.deepEqual(converted.sampleValues, [
    "Priya",
    "20% off this week",
    "Your Salon",
    "Priya",
  ]);
});

test("text, image, and PDF submissions use one selected Meta header", () => {
  const textSnapshot = buildMarketingSubmissionSnapshot(marketingTemplate());
  assert.equal(textSnapshot.headerType, "NONE");
  assert.deepEqual(
    buildMarketingMetaPayload({ name: "ynot_offer", snapshot: textSnapshot }).components,
    [
      {
        type: "BODY",
        text: "Hi {{1}}, {{2}} at {{3}}.",
        example: { body_text: [["Priya", "20% off this week", "Your Salon"]] },
      },
    ]
  );

  const image = {
    key: "marketing/offer.jpg",
    url: "https://example.test/offer.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1200,
    originalName: "offer.jpg",
  };
  const imageSnapshot = buildMarketingSubmissionSnapshot(marketingTemplate({
    media: {
      images: [image, { ...image, key: "marketing/not-selected.jpg" }],
      brochure: null,
      primary: { type: "IMAGE", key: image.key },
    },
  }));
  const imagePayload = buildMarketingMetaPayload({
    name: "ynot_image_offer",
    snapshot: imageSnapshot,
    headerHandle: "meta-image-handle",
  });
  assert.deepEqual(imagePayload.components[0], {
    type: "HEADER",
    format: "IMAGE",
    example: { header_handle: ["meta-image-handle"] },
  });

  const pdf = { ...image, key: "marketing/offer.pdf", mimeType: "application/pdf" };
  const documentSnapshot = buildMarketingSubmissionSnapshot(marketingTemplate({
    media: {
      images: [],
      brochure: pdf,
      primary: { type: "DOCUMENT", key: pdf.key },
    },
  }));
  assert.equal(
    buildMarketingMetaPayload({
      name: "ynot_pdf_offer",
      snapshot: documentSnapshot,
      headerHandle: "meta-pdf-handle",
    }).components[0].format,
    "DOCUMENT"
  );
});

test("submission uploads only selected media and reuses an existing deterministic Meta template", async () => {
  const media = {
    key: "marketing/offer.jpg",
    url: "https://example.test/offer.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1200,
    originalName: "offer.jpg",
  };
  const template = marketingTemplate({
    media: {
      images: [media, { ...media, key: "marketing/other.jpg" }],
      brochure: null,
      primary: { type: "IMAGE", key: media.key },
    },
  });
  const calls = [];
  const dependencies = {
    findTemplateByName: async () => null,
    getS3ObjectByKey: async (key) => {
      calls.push(["read", key]);
      return { buffer: Buffer.from("image"), contentType: "image/jpeg" };
    },
    uploadTemplateMediaSample: async (input) => {
      calls.push(["upload", input.fileName]);
      return { handle: "header-handle" };
    },
    createTemplate: async (input) => {
      calls.push(["create", input.payload.name]);
      return { id: "meta-template-1", status: "PENDING", category: "MARKETING" };
    },
  };
  const submitted = await submitMarketingTemplateToMeta({
    template,
    vendorId: VENDOR_ID,
    wabaId: "waba-1",
    accessToken: "secret",
    dependencies,
  });
  assert.deepEqual(calls.map((call) => call[0]), ["read", "upload", "create"]);
  assert.equal(submitted.payload.components[0].format, "IMAGE");
  assert.equal(submitted.reused, false);

  calls.length = 0;
  const reused = await submitMarketingTemplateToMeta({
    template,
    vendorId: VENDOR_ID,
    wabaId: "waba-1",
    accessToken: "secret",
    dependencies: {
      ...dependencies,
      findTemplateByName: async () => ({ id: "meta-template-1", status: "PENDING" }),
    },
  });
  assert.equal(reused.reused, true);
  assert.deepEqual(calls, []);
});

test("Meta media samples use the resumable upload handle required for template headers", async () => {
  const previousAppId = process.env.META_APP_ID;
  process.env.META_APP_ID = "meta-app-1";
  const calls = [];
  try {
    const result = await uploadTemplateMediaSample({
      accessToken: "secret",
      fileName: "offer.pdf",
      fileType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7 sample"),
      httpClient: {
        post: async (url, body, options) => {
          calls.push({ url, body, options });
          return calls.length === 1
            ? { data: { id: "upload-session-1" } }
            : { data: { h: "meta-header-handle" } };
        },
      },
    });
    assert.deepEqual(result, {
      handle: "meta-header-handle",
      sessionId: "upload-session-1",
    });
    assert.match(calls[0].url, /meta-app-1\/uploads$/);
    assert.equal(calls[0].options.params.file_type, "application/pdf");
    assert.equal(calls[1].options.headers.Authorization, "OAuth secret");
    assert.equal(calls[1].options.headers.file_offset, "0");
  } finally {
    if (previousAppId === undefined) delete process.env.META_APP_ID;
    else process.env.META_APP_ID = previousAppId;
  }
});

test("Meta media upload failures preserve sanitized provider details and exact stages", async () => {
  const previousAppId = process.env.META_APP_ID;
  process.env.META_APP_ID = "meta-app-1";
  const metaFailure = (message) => Object.assign(new Error(message), {
    response: {
      status: 400,
      data: {
        error: {
          code: 100,
          error_subcode: 2388001,
          message,
          fbtrace_id: "trace-1",
        },
      },
    },
  });
  try {
    await assert.rejects(
      uploadTemplateMediaSample({
        accessToken: "secret",
        fileName: "offer.jpg",
        fileType: "image/jpeg",
        buffer: Buffer.from("image"),
        httpClient: { post: async () => { throw metaFailure("session rejected"); } },
      }),
      (error) => {
        assert.equal(error.submissionStage, "MEDIA_SESSION_CREATE");
        assert.equal(error.metaError.status, 400);
        assert.equal(error.metaError.code, 100);
        assert.equal(error.metaError.subcode, 2388001);
        assert.equal(error.metaError.fbtraceId, "trace-1");
        return true;
      }
    );

    let calls = 0;
    await assert.rejects(
      uploadTemplateMediaSample({
        accessToken: "secret",
        fileName: "offer.jpg",
        fileType: "image/jpeg",
        buffer: Buffer.from("image"),
        httpClient: {
          post: async () => {
            calls += 1;
            if (calls === 1) return { status: 200, data: { id: "upload-session-1" } };
            throw metaFailure("binary upload rejected");
          },
        },
      }),
      (error) => error.submissionStage === "MEDIA_BINARY_UPLOAD" && error.metaError.code === 100
    );

    calls = 0;
    await assert.rejects(
      uploadTemplateMediaSample({
        accessToken: "secret",
        fileName: "offer.jpg",
        fileType: "image/jpeg",
        buffer: Buffer.from("image"),
        httpClient: {
          post: async () => {
            calls += 1;
            return calls === 1
              ? { status: 200, data: { id: "upload-session-1" } }
              : { status: 200, data: {} };
          },
        },
      }),
      (error) => (
        error.submissionStage === "HEADER_HANDLE_VALIDATE" &&
        error.code === "meta_template_media_handle_missing" &&
        error.metaError.status === 200
      )
    );
  } finally {
    if (previousAppId === undefined) delete process.env.META_APP_ID;
    else process.env.META_APP_ID = previousAppId;
  }
});

test("image submission identifies S3 and template creation failure stages", async () => {
  const media = {
    key: "marketing/offer.jpg",
    url: "https://example.test/offer.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1200,
    originalName: "offer.jpg",
  };
  const template = marketingTemplate({
    media: {
      images: [media],
      brochure: null,
      primary: { type: "IMAGE", key: media.key },
    },
  });
  const baseDependencies = {
    findTemplateByName: async () => null,
    uploadTemplateMediaSample: async () => ({ handle: "header-handle" }),
  };
  await assert.rejects(
    submitMarketingTemplateToMeta({
      template,
      vendorId: VENDOR_ID,
      wabaId: "waba-1",
      accessToken: "secret",
      dependencies: {
        ...baseDependencies,
        getS3ObjectByKey: async () => { throw new Error("object unavailable"); },
      },
    }),
    (error) => error.submissionStage === "S3_READ"
  );
  await assert.rejects(
    submitMarketingTemplateToMeta({
      template,
      vendorId: VENDOR_ID,
      wabaId: "waba-1",
      accessToken: "secret",
      dependencies: {
        ...baseDependencies,
        getS3ObjectByKey: async () => ({
          buffer: Buffer.from("image"),
          contentType: "image/jpeg",
        }),
        createTemplate: async () => { throw new Error("create failed"); },
      },
    }),
    (error) => error.submissionStage === "TEMPLATE_CREATE"
  );
});

test("template submission diagnostics are sanitized and retain provider identifiers", () => {
  const error = new Error("Bearer secret-token\nprovider failed");
  error.code = "meta_template_media_upload_failed";
  error.submissionStage = "MEDIA_BINARY_UPLOAD";
  error.metaError = {
    status: 400,
    code: 100,
    subcode: 2388001,
    fbtraceId: "trace-1",
    message: "Bearer secret-token\nprovider failed",
  };
  assert.deepEqual(controller.buildTemplateSubmissionDiagnostic(error, marketingTemplate()._id), {
    stage: "MEDIA_BINARY_UPLOAD",
    templateId: marketingTemplate()._id,
    code: "meta_template_media_upload_failed",
    httpStatus: 400,
    metaCode: "100",
    metaSubcode: "2388001",
    traceId: "trace-1",
    message: "[REDACTED] provider failed",
  });
  const source = fs.readFileSync(
    path.join(__dirname, "../controllers/vendorWhatsappMarketingController.js"),
    "utf8"
  );
  assert.match(source, /TEMPLATE_PERSIST/);
  assert.match(source, /WhatsApp Marketing Template Submission Error/);
});

test("submission retries retain a deterministic versioned Meta name", async () => {
  const template = marketingTemplate();
  const expected = buildMarketingMetaTemplateName({
    vendorId: VENDOR_ID,
    internalName: template.internalName,
    draftVersion: template.draftVersion,
  });
  let attempts = 0;
  const run = () => submitMarketingTemplateToMeta({
    template,
    vendorId: VENDOR_ID,
    wabaId: "waba-1",
    accessToken: "secret",
    dependencies: {
      findTemplateByName: async ({ name }) => {
        assert.equal(name, expected);
        return null;
      },
      createTemplate: async ({ payload }) => {
        attempts += 1;
        assert.equal(payload.name, expected);
        if (attempts === 1) throw new Error("provider unavailable");
        return { id: "meta-template-2", status: "PENDING" };
      },
    },
  });
  await assert.rejects(run, /provider unavailable/);
  assert.equal((await run()).name, expected);
});

test("Meta status mapping and lookup preserve actual approval outcomes", async () => {
  for (const status of ["PENDING", "APPROVED", "REJECTED", "PAUSED", "DISABLED"]) {
    assert.equal(mapMetaMarketingStatus(status), status);
  }
  assert.equal(mapMetaMarketingStatus("FLAGGED", ""), "");
  const byId = await readMarketingTemplateStatus({
    template: { metaTemplate: { templateId: "meta-1", templateName: "name" } },
    accessToken: "secret",
    wabaId: "waba-1",
    dependencies: { getTemplateById: async () => ({ status: "APPROVED" }) },
  });
  assert.equal(byId.status, "APPROVED");
});

test("Meta connection verification is vendor-owned and fails closed", async () => {
  const model = (whatsappBusiness) => ({
    findById: () => ({
      select: () => ({ lean: async () => ({ whatsappBusiness }) }),
    }),
  });
  const validConfig = {
    provider: "meta",
    connectionStatus: "ready",
    wabaId: "waba-1",
    metaAuth: { accessTokenEncrypted: "encrypted" },
  };
  assert.deepEqual(
    await controller.loadVendorMetaConnection(VENDOR_ID, {
      DummyVendorModel: model(validConfig),
      VendorModel: model(null),
      decryptMetaAccessToken: () => "secret",
      getWhatsAppBusinessAccount: async () => ({ id: "waba-1" }),
    }),
    { wabaId: "waba-1", accessToken: "secret", phoneNumberId: "" }
  );
  await assert.rejects(
    controller.loadVendorMetaConnection(VENDOR_ID, {
      DummyVendorModel: model({ ...validConfig, connectionStatus: "not_connected" }),
      VendorModel: model(null),
    }),
    (error) => error.code === "meta_whatsapp_not_connected"
  );
  await assert.rejects(
    controller.loadVendorMetaConnection(VENDOR_ID, {
      DummyVendorModel: model(validConfig),
      VendorModel: model(null),
      decryptMetaAccessToken: () => "secret",
      getWhatsAppBusinessAccount: async () => ({ id: "another-waba" }),
    }),
    (error) => error.code === "meta_waba_verification_failed"
  );
});

test("signed Meta webhooks synchronize recognized statuses without cross-vendor lookup", async () => {
  let update = null;
  const result = await processMarketingTemplateStatusUpdate(
    {
      field: "message_template_status_update",
      wabaId: "waba-1",
      value: {
        event: "REJECTED",
        message_template_id: "meta-1",
        message_template_name: "ynot_offer",
        reason: "Body policy issue",
      },
    },
    {
      findStandardVendor: async () => ({ vendor: { _id: VENDOR_ID } }),
      WhatsappMarketingTemplateModel: {
        updateOne: async (query, mutation) => {
          update = { query, mutation };
          return { matchedCount: 1 };
        },
      },
    }
  );
  assert.equal(result.status, "REJECTED");
  assert.equal(update.query.vendorId, VENDOR_ID);
  assert.equal(update.mutation.$set.status, "REJECTED");
  assert.equal(update.mutation.$set["metaTemplate.rejectionReason"], "Body policy issue");
});

test("routes preserve vendor authorization and atomic submission locking", () => {
  const root = path.resolve(__dirname, "..");
  const routes = fs.readFileSync(path.join(root, "routes/vendorWhatsappMarketingRoutes.js"), "utf8");
  const controllerSource = fs.readFileSync(
    path.join(root, "controllers/vendorWhatsappMarketingController.js"),
    "utf8"
  );
  assert.match(routes, /requireVendorAccessFromExistingAuth/);
  assert.match(routes, /requireWhatsappMarketingCapability/);
  assert.match(routes, /templates\/:templateId\/submit/);
  assert.match(routes, /templates\/:templateId\/refresh-status/);
  assert.match(routes, /templates\/:templateId\/revise/);
  assert.match(controllerSource, /findOneAndUpdate\([\s\S]*status: "DRAFT"/);
  assert.match(controllerSource, /status: "SUBMITTING"/);
  assert.doesNotMatch(routes, /campaigns[^\n]*send/);
});
