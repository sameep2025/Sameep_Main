const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const MetaWhatsappAssetOwnership = require("../models/MetaWhatsappAssetOwnership");
const {
  releasePendingMetaWhatsappAssetReservation,
  reserveMetaWhatsappAssets,
} = require("../services/metaWhatsappAssetOwnership");
const { getSafeMongoTarget } = require("../config/db");
const {
  isSameVerifiedCoexistenceConnection,
} = require("../controllers/vendorWhatsappBusinessController");

const VENDOR_A = "69d3a74c7f444571dd02ae3d";
const VENDOR_B = "69b96b8eada277fb26fa6447";

function legacyRecord({ vendorId, collection, wabaId, phoneNumberId }) {
  return {
    _id: vendorId,
    collection,
    whatsappBusiness: { wabaId, phoneNumberId },
  };
}

function makeOwnershipModel(initial = []) {
  const records = initial.map((record, index) => ({
    _id: record._id || `reservation-${index + 1}`,
    ...record,
  }));
  let nextId = records.length + 1;

  function conflicts(query, record) {
    return query.$or.some((condition) =>
      Object.entries(condition).every(([key, value]) => String(record[key]) === String(value))
    );
  }

  return {
    records,
    async init() {
      return this;
    },
    find(query) {
      return {
        select() {
          return this;
        },
        limit() {
          return this;
        },
        async lean() {
          return records.filter((record) => conflicts(query, record)).map((record) => ({ ...record }));
        },
      };
    },
    async create(document) {
      await new Promise((resolve) => setImmediate(resolve));
      if (
        records.some(
          (record) =>
            record.wabaId === document.wabaId ||
            record.phoneNumberId === document.phoneNumberId ||
            (record.ownerCollection === document.ownerCollection &&
              String(record.ownerVendorId) === String(document.ownerVendorId))
        )
      ) {
        const error = new Error("duplicate key");
        error.code = 11000;
        throw error;
      }
      const created = { _id: `reservation-${nextId++}`, ...document };
      records.push(created);
      return created;
    },
    async updateOne(filter, update) {
      const record = records.find(
        (item) =>
          item._id === filter._id &&
          item.leaseId === filter.leaseId &&
          item.state === filter.state
      );
      if (!record) return { matchedCount: 0 };
      Object.assign(record, update.$set);
      return { matchedCount: 1 };
    },
    async deleteOne(filter) {
      const index = records.findIndex(
        (item) =>
          item._id === filter._id &&
          item.leaseId === filter.leaseId &&
          item.state === filter.state
      );
      if (index === -1) return { deletedCount: 0 };
      records.splice(index, 1);
      return { deletedCount: 1 };
    },
  };
}

function input(overrides = {}) {
  return {
    vendorId: VENDOR_A,
    vendorCollection: "DummyVendor",
    wabaId: "waba-1",
    phoneNumberId: "phone-1",
    ...overrides,
  };
}

test("duplicate WABA owned by a different vendor is rejected", async () => {
  const legacy = [
    legacyRecord({
      vendorId: VENDOR_B,
      collection: "DummyVendor",
      wabaId: "waba-1",
      phoneNumberId: "phone-other",
    }),
  ];
  await assert.rejects(
    reserveMetaWhatsappAssets(input(), {
      OwnershipModel: makeOwnershipModel(),
      findLegacyOwners: async () => legacy,
    }),
    { code: "meta_asset_ownership_conflict" }
  );
});

test("duplicate phone ID across Vendor and DummyVendor is rejected", async () => {
  const legacy = [
    legacyRecord({
      vendorId: VENDOR_B,
      collection: "Vendor",
      wabaId: "waba-other",
      phoneNumberId: "phone-1",
    }),
  ];
  await assert.rejects(
    reserveMetaWhatsappAssets(input(), {
      OwnershipModel: makeOwnershipModel(),
      findLegacyOwners: async () => legacy,
    }),
    { code: "meta_asset_ownership_conflict" }
  );
});

test("reservation ownership conflicts are enforced across vendor collections", async () => {
  const OwnershipModel = makeOwnershipModel([
    {
      ownerVendorId: VENDOR_B,
      ownerCollection: "Vendor",
      wabaId: "waba-1",
      phoneNumberId: "phone-1",
      state: "committed",
      leaseId: "existing-lease",
    },
  ]);
  await assert.rejects(
    reserveMetaWhatsappAssets(input(), {
      OwnershipModel,
      findLegacyOwners: async () => [],
    }),
    { code: "meta_asset_ownership_conflict" }
  );
});

test("concurrent onboarding allows only one vendor to reserve the Meta assets", async () => {
  const OwnershipModel = makeOwnershipModel();
  const deps = { OwnershipModel, findLegacyOwners: async () => [] };
  const results = await Promise.allSettled([
    reserveMetaWhatsappAssets(input(), deps),
    reserveMetaWhatsappAssets(
      input({ vendorId: VENDOR_B, vendorCollection: "Vendor" }),
      deps
    ),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.code,
    "meta_asset_ownership_conflict");
  assert.equal(OwnershipModel.records.length, 1);
});

test("reservation waits for database unique indexes before checking or writing ownership", async () => {
  const calls = [];
  const OwnershipModel = makeOwnershipModel();
  OwnershipModel.init = async () => {
    calls.push("init");
  };
  const originalFind = OwnershipModel.find.bind(OwnershipModel);
  OwnershipModel.find = (query) => {
    calls.push("find");
    return originalFind(query);
  };
  const originalCreate = OwnershipModel.create.bind(OwnershipModel);
  OwnershipModel.create = async (document) => {
    calls.push("create");
    return originalCreate(document);
  };

  await reserveMetaWhatsappAssets(input(), {
    OwnershipModel,
    findLegacyOwners: async () => [],
  });
  assert.equal(calls[0], "init");
  assert.ok(calls.indexOf("init") < calls.indexOf("find"));
  assert.ok(calls.indexOf("init") < calls.indexOf("create"));
});

test("a committed reservation is idempotent for the same vendor and exact assets", async () => {
  const OwnershipModel = makeOwnershipModel([
    {
      ownerVendorId: VENDOR_A,
      ownerCollection: "DummyVendor",
      wabaId: "waba-1",
      phoneNumberId: "phone-1",
      state: "committed",
      leaseId: "existing-lease",
    },
  ]);
  const result = await reserveMetaWhatsappAssets(input(), {
    OwnershipModel,
    findLegacyOwners: async () => [
      legacyRecord({
        vendorId: VENDOR_A,
        collection: "DummyVendor",
        wabaId: "waba-1",
        phoneNumberId: "phone-1",
      }),
    ],
  });

  assert.equal(result.created, false);
  assert.equal(result.committed, true);
  assert.equal(OwnershipModel.records.length, 1);
});

test("same-vendor completion retry accepts only the exact verified Coexistence identity", () => {
  const config = {
    connectionMode: "coexistence",
    connectionStatus: "connected",
    enabled: false,
    wabaId: "waba-1",
    phoneNumberId: "phone-1",
    coexistenceEvidence: {
      wabaId: "waba-1",
      phoneNumberId: "phone-1",
      isOnBizApp: true,
      appSubscriptionVerified: true,
    },
  };

  assert.equal(
    isSameVerifiedCoexistenceConnection(config, {
      wabaId: "waba-1",
      phoneNumberId: "phone-1",
    }),
    true
  );
  assert.equal(
    isSameVerifiedCoexistenceConnection(config, {
      wabaId: "waba-1",
      phoneNumberId: "phone-other",
    }),
    false
  );
  assert.equal(
    isSameVerifiedCoexistenceConnection(
      { ...config, coexistenceEvidence: { ...config.coexistenceEvidence, isOnBizApp: false } },
      { wabaId: "waba-1", phoneNumberId: "phone-1" }
    ),
    false
  );
});

test("failed onboarding cleanup releases only its pending lease and permits retry", async () => {
  const OwnershipModel = makeOwnershipModel();
  const deps = { OwnershipModel, findLegacyOwners: async () => [] };
  const first = await reserveMetaWhatsappAssets(input(), deps);
  assert.equal((await releasePendingMetaWhatsappAssetReservation(first, deps)).released, true);
  const retry = await reserveMetaWhatsappAssets(input(), deps);

  assert.equal(retry.created, true);
  assert.notEqual(retry.leaseId, first.leaseId);
  assert.equal(OwnershipModel.records.length, 1);
});

test("legacy conflict checks are read-only and credentials are not persisted after rejection", async () => {
  const legacy = [
    legacyRecord({
      vendorId: VENDOR_B,
      collection: "Vendor",
      wabaId: "waba-1",
      phoneNumberId: "phone-1",
    }),
  ];
  const before = structuredClone(legacy);
  const OwnershipModel = makeOwnershipModel();
  await assert.rejects(
    reserveMetaWhatsappAssets(input(), {
      OwnershipModel,
      findLegacyOwners: async () => legacy,
    }),
    { code: "meta_asset_ownership_conflict" }
  );
  assert.deepEqual(legacy, before);
  assert.equal(OwnershipModel.records.length, 0);

  const controller = fs.readFileSync(
    path.resolve(__dirname, "../controllers/vendorWhatsappBusinessController.js"),
    "utf8"
  );
  const start = controller.indexOf("async function completeMetaWhatsappCoexistenceConnection");
  const end = controller.indexOf("async function diagnoseMetaCoexistenceSignup", start);
  const completion = controller.slice(start, end);
  assert.ok(completion.indexOf("reserveMetaWhatsappAssets") < completion.indexOf("record.Model.updateOne"));
  assert.match(completion, /releasePendingMetaWhatsappAssetReservation/);
});

test("ownership model defines unique WABA, phone and vendor-owner indexes", () => {
  const indexes = MetaWhatsappAssetOwnership.schema.indexes();
  for (const name of [
    "uniq_meta_whatsapp_waba",
    "uniq_meta_whatsapp_phone",
    "uniq_meta_whatsapp_vendor_owner",
  ]) {
    const index = indexes.find(([, options]) => options.name === name);
    assert.ok(index, `missing index ${name}`);
    assert.equal(index[1].unique, true);
  }
});

test("safe MongoDB diagnostics never include URI credentials or parameters", () => {
  const uri = "mongodb+srv://secret-user:secret-password@example.mongodb.net/categoryApp?authSource=admin&token=secret";
  const diagnostic = getSafeMongoTarget(uri, "categoryApp");
  const serialized = JSON.stringify(diagnostic);

  assert.deepEqual(diagnostic, {
    database: "categoryApp",
    host: "example.mongodb.net",
    protocol: "mongodb+srv",
  });
  for (const secret of ["secret-user", "secret-password", "authSource", "token=secret", uri]) {
    assert.equal(serialized.includes(secret), false);
  }

  const dbSource = fs.readFileSync(path.resolve(__dirname, "../config/db.js"), "utf8");
  assert.doesNotMatch(dbSource, /console\.(?:log|warn|error)\([^\n]*,\s*uri\s*\)/);
  assert.doesNotMatch(dbSource, /console\.error\([^\n]*err\.message/);
});
