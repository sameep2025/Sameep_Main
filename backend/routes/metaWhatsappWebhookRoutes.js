const express = require("express");
const {
  processMetaWhatsappWebhook,
  verifyWebhookSignature,
} = require("../services/metaWhatsappWebhookService");

const router = express.Router();

router.get("/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token &&
    token === process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN
  ) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

async function handleMetaWhatsappWebhookPost(req, res, dependencies = {}) {
  const verifySignature = dependencies.verifySignature || verifyWebhookSignature;
  const processWebhook = dependencies.processWebhook || processMetaWhatsappWebhook;
  const logger = dependencies.logger || console;
  const signatureResult = verifySignature({
    rawBody: req.rawBody,
    signature: req.headers["x-hub-signature-256"],
  });

  // A missing secret or header is not a reason to accept an unauthenticated event.
  if (!signatureResult.verified) return res.sendStatus(403);

  try {
    await processWebhook(req.body || {}, { signatureVerified: true });
    return res.sendStatus(200);
  } catch (error) {
    logger.error("Meta WhatsApp webhook processing failed", {
      code: error.code || "meta_whatsapp_webhook_processing_failed",
    });
    return res.sendStatus(500);
  }
}

router.post(
  "/whatsapp",
  express.json({
    limit: "8mb",
    verify: (req, res, buf) => {
      req.rawBody = Buffer.from(buf);
    },
  }),
  (req, res) => handleMetaWhatsappWebhookPost(req, res)
);

module.exports = router;
module.exports.handleMetaWhatsappWebhookPost = handleMetaWhatsappWebhookPost;
