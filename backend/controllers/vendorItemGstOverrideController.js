const {
  ItemGstOverrideError,
  createItemGstOverride,
  deleteItemGstOverride,
  getItemGstOverride,
  listItemGstOverrides,
  updateItemGstOverride,
} = require("../services/vendorItemGstOverrides");

function vendorId(req) {
  return req.vendorWriteAuth?.vendorId || req.params.vendorId;
}

function handleError(res, error) {
  if (error instanceof ItemGstOverrideError) {
    return res.status(error.status).json({ success: false, code: error.code, message: error.message });
  }
  console.error("Vendor item GST override error:", error?.message || "unknown_error");
  return res.status(500).json({ success: false, message: "Unable to manage item GST settings" });
}

async function list(req, res) {
  try {
    return res.json({ success: true, data: await listItemGstOverrides(vendorId(req)) });
  } catch (error) {
    return handleError(res, error);
  }
}

async function get(req, res) {
  try {
    const data = await getItemGstOverride({
      vendorId: vendorId(req),
      itemSource: req.params.itemSource,
      itemId: req.params.itemId,
      itemType: req.query.itemType,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function create(req, res) {
  try {
    const override = await createItemGstOverride({ vendorId: vendorId(req), input: req.body });
    return res.status(201).json({ success: true, data: { override } });
  } catch (error) {
    return handleError(res, error);
  }
}

async function update(req, res) {
  try {
    const override = await updateItemGstOverride({
      vendorId: vendorId(req),
      overrideId: req.params.overrideId,
      input: req.body,
    });
    return res.json({ success: true, data: { override } });
  } catch (error) {
    return handleError(res, error);
  }
}

async function remove(req, res) {
  try {
    await deleteItemGstOverride({
      vendorId: vendorId(req),
      overrideId: req.params.overrideId,
    });
    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = { create, get, list, remove, update };
