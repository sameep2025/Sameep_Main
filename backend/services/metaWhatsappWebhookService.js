const crypto = require("crypto");
const DummyVendor = require("../models/DummyVendor");
const Vendor = require("../models/Vendor");
const MetaWhatsappCoexistenceEvent = require("../models/MetaWhatsappCoexistenceEvent");
const { getMetaWhatsAppConfig } = require("../config/metaWhatsAppConfig");

const COEXISTENCE_EVENT_FIELDS = new Set([
  "history",
  "smb_app_state_sync",
  "smb_message_echoes",
]);
const PHONE_IDENTIFIER_KEYS = new Set(["phone_number_id", "phoneNumberId"]);
const WABA_IDENTIFIER_KEYS = new Set([
  "waba_id",
  "wabaId",
  "whatsapp_business_account_id",
  "whatsappBusinessAccountId",
]);

function verifyWebhookSignature({ rawBody, signature }) {
  const { appSecret } = getMetaWhatsAppConfig();
  const header = String(signature || "");

  if (!appSecret || !header) {
    return { verified: false, enforceable: false };
  }

  const expected = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(rawBody || "")
    .digest("hex")}`;

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(header);
  if (expectedBuffer.length !== actualBuffer.length) {
    return { verified: false, enforceable: true };
  }

  return {
    verified: crypto.timingSafeEqual(expectedBuffer, actualBuffer),
    enforceable: true,
  };
}

function extractWebhookMetadata(payload) {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  const metadata = [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};
      metadata.push({
        object: payload?.object || "",
        entryId: entry?.id || "",
        field: change?.field || "",
        wabaId: entry?.id || "",
        phoneNumberId: value?.metadata?.phone_number_id || "",
        statusCount: Array.isArray(value?.statuses) ? value.statuses.length : 0,
        messageCount: Array.isArray(value?.messages) ? value.messages.length : 0,
        value,
      });
    }
  }

  return metadata;
}

function hasCoexistenceWebhookEvents(payload) {
  return extractWebhookMetadata(payload).some((item) =>
    COEXISTENCE_EVENT_FIELDS.has(item.field)
  );
}

function sanitizeWebhookLogValue(value, maxLength = 200) {
  return String(value ?? "")
    .replace(/[\r\n\t\0]/g, " ")
    .trim()
    .slice(0, maxLength);
}

function extractDeliveryStatusLogs(item) {
  const statuses = Array.isArray(item?.value?.statuses) ? item.value.statuses : [];
  return statuses.map((status) => {
    const normalizedStatus = sanitizeWebhookLogValue(status?.status, 32).toLowerCase();
    const entry = {
      wamid: sanitizeWebhookLogValue(status?.id, 256),
      status: normalizedStatus,
      phoneNumberId: sanitizeWebhookLogValue(item?.phoneNumberId, 64),
    };

    if (normalizedStatus === "failed") {
      const error = Array.isArray(status?.errors) ? status.errors[0] : null;
      entry.errorCode = sanitizeWebhookLogValue(error?.code, 64);
      entry.errorTitle = sanitizeWebhookLogValue(error?.title, 200);
    }

    return entry;
  });
}

function collectIdentifiers(value, phoneIds, wabaIds, depth = 0) {
  if (!value || typeof value !== "object" || depth > 8) return;

  if (Array.isArray(value)) {
    for (const item of value) collectIdentifiers(item, phoneIds, wabaIds, depth + 1);
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (PHONE_IDENTIFIER_KEYS.has(key) && nestedValue != null) {
      const id = String(nestedValue).trim();
      if (id) phoneIds.add(id);
    }
    if (WABA_IDENTIFIER_KEYS.has(key) && nestedValue != null) {
      const id = String(nestedValue).trim();
      if (id) wabaIds.add(id);
    }
    collectIdentifiers(nestedValue, phoneIds, wabaIds, depth + 1);
  }
}

function extractCoexistenceIdentity(item) {
  const phoneIds = new Set();
  const wabaIds = new Set();
  const entryWabaId = String(item?.wabaId || item?.entryId || "").trim();
  if (entryWabaId) wabaIds.add(entryWabaId);
  collectIdentifiers(item?.value, phoneIds, wabaIds);

  return {
    wabaIds: [...wabaIds],
    phoneNumberIds: [...phoneIds],
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;

  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = canonicalize(value[key]);
      return result;
    }, {});
}

function buildCoexistenceDeduplicationKey({ item, wabaId, phoneNumberId, secret }) {
  const hmacSecret = String(secret || "");
  if (!hmacSecret) {
    const error = new Error("Meta app secret is required for Coexistence event deduplication");
    error.code = "meta_webhook_signature_secret_missing";
    throw error;
  }

  const canonicalPayload = JSON.stringify(
    canonicalize({
      field: item.field,
      wabaId,
      phoneNumberId,
      value: item.value || {},
    })
  );
  return crypto.createHmac("sha256", hmacSecret).update(canonicalPayload).digest("hex");
}

function buildVerifiedCoexistenceQuery({ wabaId, phoneNumberId }) {
  return {
    "whatsappBusiness.connectionMode": "coexistence",
    "whatsappBusiness.wabaId": wabaId,
    "whatsappBusiness.coexistenceEvidence.wabaId": wabaId,
    "whatsappBusiness.coexistenceEvidence.isOnBizApp": true,
    "whatsappBusiness.coexistenceEvidence.appSubscriptionVerified": true,
    ...(phoneNumberId
      ? {
          "whatsappBusiness.phoneNumberId": phoneNumberId,
          "whatsappBusiness.coexistenceEvidence.phoneNumberId": phoneNumberId,
        }
      : {}),
  };
}

async function loadCoexistenceCandidates({ wabaId, phoneNumberId }) {
  const query = buildVerifiedCoexistenceQuery({ wabaId, phoneNumberId });
  const projection = "_id whatsappBusiness.wabaId whatsappBusiness.phoneNumberId";
  const [dummyVendors, vendors] = await Promise.all([
    DummyVendor.find(query).select(projection).limit(2).lean(),
    Vendor.find(query).select(projection).limit(2).lean(),
  ]);

  return [
    ...dummyVendors.map((vendor) => ({ vendor, collection: "DummyVendor" })),
    ...vendors.map((vendor) => ({ vendor, collection: "Vendor" })),
  ];
}

async function resolveVerifiedCoexistenceVendor(identity, dependencies = {}) {
  const loadCandidates = dependencies.loadCandidates || loadCoexistenceCandidates;
  if (identity.wabaIds.length !== 1 || identity.phoneNumberIds.length > 1) {
    return { matched: false, reason: "meta_coexistence_identity_ambiguous" };
  }

  const wabaId = identity.wabaIds[0];
  const phoneNumberId = identity.phoneNumberIds[0] || "";
  const candidates = await loadCandidates({ wabaId, phoneNumberId });
  if (candidates.length !== 1) {
    return {
      matched: false,
      reason:
        candidates.length > 1
          ? "meta_coexistence_vendor_ambiguous"
          : "meta_coexistence_vendor_not_found",
    };
  }

  const match = candidates[0];
  const configuredPhoneNumberId = String(
    match.vendor?.whatsappBusiness?.phoneNumberId || ""
  ).trim();
  if (!configuredPhoneNumberId || (phoneNumberId && configuredPhoneNumberId !== phoneNumberId)) {
    return { matched: false, reason: "meta_coexistence_phone_mismatch" };
  }

  return {
    matched: true,
    vendor: match.vendor,
    collection: match.collection,
    wabaId,
    phoneNumberId: configuredPhoneNumberId,
  };
}

async function recordCoexistenceEvent(event, dependencies = {}) {
  const EventModel = dependencies.EventModel || MetaWhatsappCoexistenceEvent;
  try {
    const result = await EventModel.updateOne(
      { deduplicationKey: event.deduplicationKey },
      { $setOnInsert: event },
      { upsert: true }
    );
    return { duplicate: result?.upsertedCount !== 1 };
  } catch (error) {
    if (error?.code === 11000) return { duplicate: true };
    throw error;
  }
}

async function processCoexistenceWebhookItem(item, dependencies = {}) {
  const now = dependencies.now || (() => new Date());
  const config = dependencies.config || getMetaWhatsAppConfig();
  const identity = extractCoexistenceIdentity(item);
  const match = await resolveVerifiedCoexistenceVendor(identity, dependencies);
  if (!match.matched) return { processed: false, reason: match.reason };

  const timestamp = now();
  const deduplicationKey = buildCoexistenceDeduplicationKey({
    item,
    wabaId: match.wabaId,
    phoneNumberId: match.phoneNumberId,
    secret: config.appSecret,
  });
  const result = await recordCoexistenceEvent(
    {
      vendorId: match.vendor._id,
      vendorCollection: match.collection,
      wabaId: match.wabaId,
      phoneNumberId: match.phoneNumberId,
      eventType: item.field,
      deduplicationKey,
      processingStatus: "synchronization_deferred",
      receivedAt: timestamp,
      processedAt: timestamp,
    },
    dependencies
  );

  return {
    processed: !result.duplicate,
    duplicate: result.duplicate,
    reason: result.duplicate ? "duplicate" : "recorded",
  };
}

async function findVendorByMetaIdentifiers({ wabaId, phoneNumberId }) {
  const query = {
    $or: [
      ...(wabaId ? [{ "whatsappBusiness.wabaId": String(wabaId) }] : []),
      ...(phoneNumberId ? [{ "whatsappBusiness.phoneNumberId": String(phoneNumberId) }] : []),
    ],
  };

  if (!query.$or.length) return null;

  const dummyVendor = await DummyVendor.findOne(query).select("_id businessName").lean();
  if (dummyVendor) return { collection: "DummyVendor", vendor: dummyVendor };

  const vendor = await Vendor.findOne(query).select("_id businessName").lean();
  if (vendor) return { collection: "Vendor", vendor };

  return null;
}

async function processMetaWhatsappWebhook(payload, options = {}) {
  const metadata = extractWebhookMetadata(payload);
  const logger = options.logger || console;
  const findStandardVendor = options.findStandardVendor || findVendorByMetaIdentifiers;
  const results = [];

  for (const item of metadata) {
    if (COEXISTENCE_EVENT_FIELDS.has(item.field)) {
      if (options.signatureVerified !== true) {
        results.push({ field: item.field, processed: false, reason: "signature_unverified" });
        continue;
      }
      results.push({
        field: item.field,
        ...(await processCoexistenceWebhookItem(item, options)),
      });
      continue;
    }

    const vendorMatch = await findStandardVendor({
      wabaId: item.wabaId,
      phoneNumberId: item.phoneNumberId,
    });
    if (!vendorMatch) {
      logger.warn("Meta WhatsApp webhook has no vendor match", {
        wabaId: item.wabaId,
        phoneNumberId: item.phoneNumberId,
        field: item.field,
      });
      continue;
    }

    for (const deliveryStatus of extractDeliveryStatusLogs(item)) {
      logger.info("Meta WhatsApp delivery status", deliveryStatus);
    }

    if (process.env.NODE_ENV !== "production") {
      logger.info("Meta WhatsApp webhook received", {
        vendorId: String(vendorMatch.vendor._id),
        collection: vendorMatch.collection,
        field: item.field,
        statusCount: item.statusCount,
        messageCount: item.messageCount,
      });
    }
  }

  return { processed: metadata.length, coexistence: results };
}

module.exports = {
  COEXISTENCE_EVENT_FIELDS,
  buildCoexistenceDeduplicationKey,
  extractCoexistenceIdentity,
  extractDeliveryStatusLogs,
  extractWebhookMetadata,
  findVendorByMetaIdentifiers,
  hasCoexistenceWebhookEvents,
  processCoexistenceWebhookItem,
  processMetaWhatsappWebhook,
  recordCoexistenceEvent,
  resolveVerifiedCoexistenceVendor,
  verifyWebhookSignature,
};
