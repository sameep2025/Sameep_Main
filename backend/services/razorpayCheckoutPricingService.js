const crypto = require("crypto");
const mongoose = require("mongoose");
const VendorMenuNode = require("../models/VendorMenuNode");
const VendorPriceNode = require("../models/VendorPriceNode");
const VendorCustomPackage = require("../models/VendorCustomPackage");
const { isOfferCurrentlyValid } = require("../utils/offerValidity");

const MAX_CART_LINES = 50;
const MAX_LINE_QUANTITY = 1000;

function checkoutError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function toPaise(amount) {
  const numeric = Number(amount);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

function resolveUnitAmountPaise(item) {
  const price = Number(item?.price || 0) || 0;
  const mrp = Number(item?.mrp || 0) || price;
  const discountPercent = Math.max(0, Math.min(100, Number(item?.discountPercent || 0) || 0));
  let resolved = price;

  if (discountPercent > 0) {
    resolved = mrp > 0 && price > 0 && price < mrp
      ? price
      : mrp - (mrp * discountPercent) / 100;
  } else if (resolved <= 0 && mrp > 0) {
    resolved = mrp;
  }

  return toPaise(Math.max(0, resolved));
}

function isCurrentOffer(item) {
  if (!item?.offerStartDate && !item?.offerEndDate) return true;
  return isOfferCurrentlyValid(item);
}

async function resolveBySource({ source, itemId, vendorId, categoryId }) {
  if (source === "vendor_menu_node") {
    return VendorMenuNode.findOne({
      _id: itemId,
      vendorId,
      datasetStatus: "active",
      isLeaf: true,
      pricingStatus: "Active",
      visibleToUser: { $ne: false },
      isOrderable: { $ne: false },
    }).lean();
  }

  if (source === "custom_package") {
    return VendorCustomPackage.findOne({
      _id: itemId,
      vendorId,
      rootCategoryId: categoryId,
      isDeleted: { $ne: true },
      isLeaf: true,
      pricingStatus: "Active",
      visibleToUser: { $ne: false },
    }).lean();
  }

  if (source === "vendor_price_node") {
    return VendorPriceNode.findOne({
      vendorId,
      rootCategoryId: categoryId,
      $or: [{ _id: itemId }, { categoryId: itemId }],
      isLeaf: true,
      pricingStatus: "Active",
      visibleToUser: { $ne: false },
    }).lean();
  }

  return null;
}

async function resolveCatalogItem(params) {
  const requestedSource = String(params.source || "").trim();
  const supported = ["vendor_menu_node", "vendor_price_node", "custom_package"];
  if (requestedSource && !supported.includes(requestedSource)) {
    throw checkoutError("Unsupported checkout item source", "unsupported_item_source");
  }

  if (requestedSource) {
    const item = await resolveBySource({ ...params, source: requestedSource });
    return item ? { item, source: requestedSource } : null;
  }

  const matches = [];
  for (const source of supported) {
    const item = await resolveBySource({ ...params, source });
    if (item) matches.push({ item, source });
  }
  if (matches.length > 1) {
    throw checkoutError("Checkout item identity is ambiguous", "ambiguous_item_identity");
  }
  return matches[0] || null;
}

async function resolveAuthoritativeCheckout({
  vendorId,
  categoryId,
  cartItems,
  claimedTotal,
  resolveItem = resolveCatalogItem,
}) {
  if (!Array.isArray(cartItems) || cartItems.length === 0 || cartItems.length > MAX_CART_LINES) {
    throw checkoutError("A valid checkout cart is required", "invalid_checkout_cart");
  }

  const authoritativeItems = [];
  let amountInPaise = 0;

  for (const line of cartItems) {
    const itemId = String(line?.itemId || line?.categoryId || "").trim();
    const quantity = Number(line?.qty);
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      throw checkoutError("Checkout item identity is invalid", "invalid_item_identity");
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      throw checkoutError("Checkout item quantity is invalid", "invalid_item_quantity");
    }

    const resolved = await resolveItem({
      source: line?.itemSource,
      itemId,
      vendorId,
      categoryId,
    });
    if (!resolved?.item || !isCurrentOffer(resolved.item)) {
      throw checkoutError("Checkout item is unavailable", "checkout_item_unavailable", 409);
    }

    const minQty = Math.max(1, Number(resolved.item.minQty || 1) || 1);
    const stepQty = Math.max(1, Number(resolved.item.stepQty || 1) || 1);
    if (quantity < minQty || (quantity - minQty) % stepQty !== 0) {
      throw checkoutError("Checkout item quantity is not allowed", "invalid_item_quantity");
    }

    const unitAmountPaise = resolveUnitAmountPaise(resolved.item);
    if (unitAmountPaise <= 0) {
      throw checkoutError("Checkout item does not have a valid price", "invalid_catalog_price", 409);
    }
    const lineAmountPaise = unitAmountPaise * quantity;

    if (line?.price !== undefined && toPaise(line.price) !== unitAmountPaise) {
      throw checkoutError("Checkout price changed. Refresh the cart and try again", "checkout_price_mismatch", 409);
    }
    if (line?.total !== undefined && toPaise(line.total) !== lineAmountPaise) {
      throw checkoutError("Checkout total changed. Refresh the cart and try again", "checkout_total_mismatch", 409);
    }

    amountInPaise += lineAmountPaise;
    authoritativeItems.push({
      itemId,
      itemSource: resolved.source,
      name: String(resolved.item.name || line?.name || "Item"),
      qty: quantity,
      price: unitAmountPaise / 100,
      total: lineAmountPaise / 100,
      categoryPath: Array.isArray(line?.categoryPath) ? line.categoryPath.map(String) : [],
      categoryPathIds: Array.isArray(line?.categoryPathIds) ? line.categoryPathIds.map(String) : [],
    });
  }

  if (claimedTotal !== undefined && claimedTotal !== null && claimedTotal !== "" && toPaise(claimedTotal) !== amountInPaise) {
    throw checkoutError("Checkout amount changed. Refresh the cart and try again", "checkout_amount_mismatch", 409);
  }

  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(authoritativeItems.map(({ itemSource, itemId, qty, price }) => ({ itemSource, itemId, qty, price }))))
    .digest("hex");

  return { amountInPaise, authoritativeItems, fingerprint };
}

module.exports = {
  resolveAuthoritativeCheckout,
  resolveCatalogItem,
  resolveUnitAmountPaise,
  toPaise,
};
