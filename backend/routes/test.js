const express = require("express");

const router = express.Router();

router.all("/whatsapp-test", (req, res) => {
  return res.status(410).json({ success: false, message: "Diagnostic messaging endpoint disabled" });
});

module.exports = router;
