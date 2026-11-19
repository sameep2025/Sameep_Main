const express = require("express");
const PreviewTemplate = require("../models/PreviewTemplate");
const { requireAdminAuth } = require("../utils/adminAuthMiddleware");

const router = express.Router();

const SUPPORTED_PREVIEW_TEMPLATES = [
  {
    key: "classic",
    name: "Classic Black Gold",
    description: "Existing template with the current black and gold experience.",
    previewHint: "Best for the current Sameep preview rollout.",
    status: "Active",
    isDefault: true,
    sortOrder: 1,
  },
  {
    key: "modern",
    name: "Modern Light",
    description: "New editorial template with light surfaces and cleaner sectioning.",
    previewHint: "Best for vendors who want a softer premium layout.",
    status: "Active",
    isDefault: false,
    sortOrder: 2,
  },
  {
    key: "catalog",
    name: "Service Catalog",
    description: "Category-first browsing template with service tiles and detailed service rows.",
    previewHint: "Best for vendors who want an app-like service discovery experience.",
    status: "Active",
    isDefault: false,
    sortOrder: 3,
  },
  {
    key: "astrology",
    name: "Astrology Services",
    description: "Modern Light structure with darker mystical colours and astrology-inspired backgrounds.",
    previewHint: "Best for astrology, jyotish, vastu and spiritual guidance businesses.",
    status: "Active",
    isDefault: false,
    sortOrder: 4,
  },
  {
    key: "nurseries",
    name: "Nurseries",
    description: "Collection-led nursery template with green hero, auto-scrolling category cards and larger product tiles.",
    previewHint: "Best for nurseries, plant stores, garden centres and landscaping businesses.",
    status: "Active",
    isDefault: false,
    sortOrder: 5,
  },
  {
    key: "ecommerce",
    name: "Ecommerce Catalog",
    description: "Product-led commerce template with section tables, quantity controls and order summary.",
    previewHint: "Best for dynamic self-managed catalogs such as crackers, wholesale lists and fast-moving product menus.",
    status: "Active",
    isDefault: false,
    sortOrder: 6,
  },
  {
    key: "premium_light",
    name: "Premium Light",
    description: "Modern service-first template with airy premium layouts, dynamic service cards and integrated appointment flow.",
    previewHint: "Best for salons, clinics, studios and other service businesses that want a polished light experience.",
    status: "Active",
    isDefault: false,
    sortOrder: 7,
  },
];

async function syncSupportedTemplates() {
  for (const template of SUPPORTED_PREVIEW_TEMPLATES) {
    const existing = await PreviewTemplate.findOne({ key: template.key });
    if (!existing) {
      await PreviewTemplate.create(template);
      continue;
    }

    let changed = false;
    ["name", "description", "previewHint", "sortOrder"].forEach((field) => {
      if (!existing[field]) {
        existing[field] = template[field];
        changed = true;
      }
    });

    if (existing.isDefault && existing.status !== "Active") {
      existing.status = "Active";
      changed = true;
    }

    if (changed) {
      await existing.save();
    }
  }

  const hasDefault = await PreviewTemplate.exists({ isDefault: true });
  if (!hasDefault) {
    await PreviewTemplate.updateOne({ key: "classic" }, { $set: { isDefault: true } });
  }
}

async function readSupportedTemplates() {
  const stored = await PreviewTemplate.find({}).sort({ sortOrder: 1, name: 1 }).lean();
  const storedByKey = new Map(stored.map((template) => [template.key, template]));
  const supportedKeys = new Set(SUPPORTED_PREVIEW_TEMPLATES.map((template) => template.key));

  const supported = SUPPORTED_PREVIEW_TEMPLATES.map((template) => ({
    ...template,
    ...(storedByKey.get(template.key) || {}),
  }));
  const legacy = stored.filter((template) => !supportedKeys.has(template.key));

  return [...supported, ...legacy].sort((a, b) => {
    const order = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
    return order || String(a.name || "").localeCompare(String(b.name || ""));
  });
}

router.get("/", async (req, res) => {
  try {
    const activeOnly = String(req.query.activeOnly || "").trim().toLowerCase() === "true";
    const allTemplates = await readSupportedTemplates();
    const templates = activeOnly
      ? allTemplates.filter((template) => template.status === "Active")
      : allTemplates;
    return res.json(templates);
  } catch (error) {
    console.error("GET /api/preview-templates error:", error);
    return res.status(500).json({ message: "Failed to load preview templates" });
  }
});

router.get("/default", async (req, res) => {
  try {
    const templates = await readSupportedTemplates();
    const defaultTemplate =
      templates.find((template) => template.isDefault) ||
      templates.find((template) => template.key === "classic");

    return res.json(defaultTemplate || null);
  } catch (error) {
    console.error("GET /api/preview-templates/default error:", error);
    return res.status(500).json({ message: "Failed to load default preview template" });
  }
});

router.put("/:templateKey", requireAdminAuth, async (req, res) => {
  try {
    await syncSupportedTemplates();

    const templateKey = String(req.params.templateKey || "").trim().toLowerCase();
    const existing = await PreviewTemplate.findOne({ key: templateKey });
    if (!existing) {
      return res.status(404).json({ message: "Template not found" });
    }

    const payload = req.body || {};
    if (typeof payload.name === "string") existing.name = payload.name.trim() || existing.name;
    if (typeof payload.description === "string") existing.description = payload.description.trim();
    if (typeof payload.previewHint === "string") existing.previewHint = payload.previewHint.trim();
    if (payload.status === "Active" || payload.status === "Inactive") {
      existing.status = payload.status;
    }
    if (typeof payload.sortOrder === "number" && Number.isFinite(payload.sortOrder)) {
      existing.sortOrder = payload.sortOrder;
    }

    if (payload.isDefault === true) {
      await PreviewTemplate.updateMany({}, { $set: { isDefault: false } });
      existing.isDefault = true;
      existing.status = "Active";
    }

    await existing.save();

    if (existing.status !== "Active" && existing.isDefault) {
      const fallback =
        (await PreviewTemplate.findOne({ key: "classic" })) ||
        (await PreviewTemplate.findOne({ status: "Active" }).sort({ sortOrder: 1, name: 1 }));
      if (fallback) {
        await PreviewTemplate.updateMany({}, { $set: { isDefault: false } });
        fallback.isDefault = true;
        fallback.status = "Active";
        await fallback.save();
      }
    }

    const refreshed = await PreviewTemplate.findOne({ key: templateKey }).lean();
    return res.json(refreshed);
  } catch (error) {
    console.error("PUT /api/preview-templates/:templateKey error:", error);
    return res.status(500).json({ message: "Failed to update preview template" });
  }
});

module.exports = router;
