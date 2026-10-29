const {
  GstBillPreviewError,
  buildGstBillPreview,
  buildGstTestInvoice,
  listGstTestInvoiceItems,
} = require("../services/gstBillPreviewService");

function handlePreviewError(error, res) {
  if (error instanceof GstBillPreviewError) {
    return res.status(error.status).json({ success: false, code: error.code, message: error.message });
  }
  console.error("GST preview error:", error?.message || "unknown_error");
  return res.status(500).json({ success: false, message: "Unable to calculate GST preview" });
}

async function previewGstBill(req, res) {
  try {
    const data = await buildGstBillPreview({
      vendorId: req.vendorWriteAuth?.vendorId || req.params.vendorId,
      input: req.body || {},
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handlePreviewError(error, res);
  }
}

async function getGstTestInvoiceItems(req, res) {
  try {
    const data = await listGstTestInvoiceItems(
      req.vendorWriteAuth?.vendorId || req.params.vendorId
    );
    return res.json({ success: true, data: { items: data } });
  } catch (error) {
    return handlePreviewError(error, res);
  }
}

async function previewGstTestInvoice(req, res) {
  try {
    const data = await buildGstTestInvoice({
      vendorId: req.vendorWriteAuth?.vendorId || req.params.vendorId,
      input: req.body || {},
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handlePreviewError(error, res);
  }
}

module.exports = { getGstTestInvoiceItems, previewGstBill, previewGstTestInvoice };
