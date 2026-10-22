const express = require("express");
const {
  hasCoexistenceWebhookEvents,
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

router.post(
  "/whatsapp",
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
  async (req, res) => {
    const signatureResult = verifyWebhookSignature({
      rawBody: req.rawBody,
      signature: req.headers["x-hub-signature-256"],
    });

    const hasCoexistenceEvents = hasCoexistenceWebhookEvents(req.body || {});
    if (
      (signatureResult.enforceable && !signatureResult.verified) ||
      (hasCoexistenceEvents && !signatureResult.verified)
    ) {
      return res.sendStatus(403);
    }

    if (hasCoexistenceEvents) {
      try {
        await processMetaWhatsappWebhook(req.body || {}, {
          signatureVerified: true,
        });
        return res.sendStatus(200);
      } catch (error) {
        console.error("Meta WhatsApp Coexistence webhook processing failed:", {
          code: error.code || "meta_coexistence_webhook_processing_failed",
        });
        return res.sendStatus(500);
      }
    }

    res.sendStatus(200);

    try {
      await processMetaWhatsappWebhook(req.body || {}, {
        signatureVerified: signatureResult.verified,
      });
    } catch (error) {
      console.error("Meta WhatsApp webhook processing failed:", error.message || error);
    }
  }
);

module.exports = router;
