const crypto = require("crypto");
const DummyVendor = require("../models/DummyVendor");
const Vendor = require("../models/Vendor");
const MetaWhatsappAssetOwnership = require("../models/MetaWhatsappAssetOwnership");

function ownershipError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeIdentity(value) {
  return String(value || "").trim();
}

function normalizeOwner({ vendorId, vendorCollection }) {
  const ownerVendorId = normalizeIdentity(vendorId);
  const ownerCollection = normalizeIdentity(vendorCollection);
  if (!ownerVendorId || !["DummyVendor", "Vendor"].includes(ownerCollection)) {
    throw ownershipError(
      "meta_asset_owner_invalid",
      "A valid vendor owner is required for Meta asset reservation"
    );
  }
  return { ownerVendorId, ownerCollection };
}

function sameOwner(record, owner) {
  return (
    normalizeIdentity(record?.ownerVendorId || record?._id) === owner.ownerVendorId &&
    normalizeIdentity(record?.ownerCollection || record?.collection) === owner.ownerCollection
  );
}

function sameAssets(record, assets) {
  return (
    normalizeIdentity(record?.wabaId || record?.whatsappBusiness?.wabaId) === assets.wabaId &&
    normalizeIdentity(record?.phoneNumberId || record?.whatsappBusiness?.phoneNumberId) ===
      assets.phoneNumberId
  );
}

async function findLegacyOwners({ wabaId, phoneNumberId }, dependencies = {}) {
  const DummyVendorModel = dependencies.DummyVendorModel || DummyVendor;
  const VendorModel = dependencies.VendorModel || Vendor;
  const query = {
    $or: [
      { "whatsappBusiness.wabaId": wabaId },
      { "whatsappBusiness.phoneNumberId": phoneNumberId },
    ],
  };
  const projection = "_id whatsappBusiness.wabaId whatsappBusiness.phoneNumberId";
  const [dummyVendors, vendors] = await Promise.all([
    DummyVendorModel.find(query).select(projection).limit(2).lean(),
    VendorModel.find(query).select(projection).limit(2).lean(),
  ]);

  return [
    ...dummyVendors.map((vendor) => ({ ...vendor, collection: "DummyVendor" })),
    ...vendors.map((vendor) => ({ ...vendor, collection: "Vendor" })),
  ];
}

function assertLegacyOwnershipAvailable(records, owner, assets) {
  for (const record of records) {
    if (!sameOwner(record, owner) || !sameAssets(record, assets)) {
      throw ownershipError(
        "meta_asset_ownership_conflict",
        "The Meta WABA or phone number is already owned by another vendor"
      );
    }
  }
}

async function loadReservationConflicts(OwnershipModel, assets) {
  return OwnershipModel.find({
    $or: [{ wabaId: assets.wabaId }, { phoneNumberId: assets.phoneNumberId }],
  })
    .select("+leaseId")
    .limit(3)
    .lean();
}

function resolveExistingReservation(records, owner, assets) {
  if (!records.length) return null;
  if (
    records.length === 1 &&
    sameOwner(records[0], owner) &&
    sameAssets(records[0], assets)
  ) {
    if (records[0].state === "committed") {
      return { created: false, committed: true, reservation: records[0] };
    }
    throw ownershipError(
      "meta_asset_reservation_in_progress",
      "Meta asset onboarding is already in progress for this vendor"
    );
  }
  throw ownershipError(
    "meta_asset_ownership_conflict",
    "The Meta WABA or phone number is already reserved by another vendor"
  );
}

async function reserveMetaWhatsappAssets(input, dependencies = {}) {
  const OwnershipModel = dependencies.OwnershipModel || MetaWhatsappAssetOwnership;
  if (typeof OwnershipModel.init === "function") {
    await OwnershipModel.init();
  }
  const owner = normalizeOwner(input);
  const assets = {
    wabaId: normalizeIdentity(input.wabaId),
    phoneNumberId: normalizeIdentity(input.phoneNumberId),
  };
  if (!assets.wabaId || !assets.phoneNumberId) {
    throw ownershipError(
      "meta_asset_identity_invalid",
      "Verified WABA and phone number IDs are required for ownership reservation"
    );
  }

  const legacyOwners = await (dependencies.findLegacyOwners || findLegacyOwners)(
    assets,
    dependencies
  );
  assertLegacyOwnershipAvailable(legacyOwners, owner, assets);

  const existing = await loadReservationConflicts(OwnershipModel, assets);
  const resolved = resolveExistingReservation(existing, owner, assets);
  if (resolved) return resolved;

  const leaseId = crypto.randomUUID();
  const reservedAt = dependencies.now ? dependencies.now() : new Date();
  try {
    const reservation = await OwnershipModel.create({
      ...owner,
      ...assets,
      state: "pending",
      leaseId,
      reservedAt,
      committedAt: null,
    });
    return {
      created: true,
      committed: false,
      leaseId,
      reservationId: reservation._id,
      reservation,
    };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const concurrent = await loadReservationConflicts(OwnershipModel, assets);
    const concurrentResult = resolveExistingReservation(concurrent, owner, assets);
    if (concurrentResult) return concurrentResult;
    throw ownershipError(
      "meta_asset_ownership_conflict",
      "The Meta WABA or phone number was reserved concurrently"
    );
  }
}

async function commitMetaWhatsappAssetReservation(reservation, dependencies = {}) {
  if (!reservation?.created || !reservation?.leaseId) return { committed: true };
  const OwnershipModel = dependencies.OwnershipModel || MetaWhatsappAssetOwnership;
  const result = await OwnershipModel.updateOne(
    {
      _id: reservation.reservationId,
      leaseId: reservation.leaseId,
      state: "pending",
    },
    {
      $set: {
        state: "committed",
        committedAt: dependencies.now ? dependencies.now() : new Date(),
      },
    }
  );
  if (result?.matchedCount !== 1) {
    throw ownershipError(
      "meta_asset_reservation_commit_failed",
      "Meta asset reservation could not be committed"
    );
  }
  return { committed: true };
}

async function releasePendingMetaWhatsappAssetReservation(reservation, dependencies = {}) {
  if (!reservation?.created || !reservation?.leaseId) return { released: false };
  const OwnershipModel = dependencies.OwnershipModel || MetaWhatsappAssetOwnership;
  const result = await OwnershipModel.deleteOne({
    _id: reservation.reservationId,
    leaseId: reservation.leaseId,
    state: "pending",
  });
  return { released: result?.deletedCount === 1 };
}

module.exports = {
  assertLegacyOwnershipAvailable,
  commitMetaWhatsappAssetReservation,
  findLegacyOwners,
  releasePendingMetaWhatsappAssetReservation,
  reserveMetaWhatsappAssets,
};
