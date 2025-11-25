const DummyCategory = require("../models/dummyCategory");
const DummySubcategory = require("../models/dummySubcategory");
const fs = require("fs");
const { uploadBufferToS3, uploadBufferToS3WithLabel, deleteS3ObjectByUrl } = require("../utils/s3Upload");
const { v4: uuidv4 } = require("uuid");

// Fallback to avoid ReferenceError in any legacy path that might still reference profileFiles
// before a local declaration. Current functions declare const profileFiles where needed.
let profileFiles = [];

function parseNumber(value, defaultNull = true) {
  if (value === undefined || value === null) return defaultNull ? null : 0;
  if (value === "") return defaultNull ? null : 0;
  const n = Number(value);
  return Number.isNaN(n) ? (defaultNull ? null : 0) : n;
}

async function buildDummySegmentsForCreate(parentId, name) {
  const segs = [];
  if (!parentId) {
    segs.push(String(name));
    return segs;
  }
  const parentCat = await DummyCategory.findById(parentId).lean();
  if (parentCat) {
    segs.push(parentCat.name, String(name));
    return segs;
  }
  const parentSub = await DummySubcategory.findById(parentId).lean();
  if (parentSub) {
    const names = [];
    let cur = parentSub;
    while (cur) {
      names.unshift(cur.name);
      if (!cur.parentSubcategory) break;
      cur = await DummySubcategory.findById(cur.parentSubcategory).lean();
    }
    const top = await DummyCategory.findById(parentSub.category).lean();
    if (top) segs.push(top.name);
    segs.push(...names, String(name));
  }
  return segs;
}

async function buildDummySegmentsForExisting(doc, overrideName) {
  const leaf = String(overrideName || doc.name || "");
  const segs = [];
  // If doc has category field, it's a subcategory; otherwise top-level category
  if (doc && (doc.category || doc.parentSubcategory)) {
    try {
      const names = [];
      let cursor = doc;
      while (cursor && cursor.parentSubcategory) {
        const parent = await DummySubcategory.findById(cursor.parentSubcategory).lean();
        if (!parent) break;
        names.unshift(parent.name);
        cursor = parent;
      }
      const top = await DummyCategory.findById(doc.category || (cursor && cursor.category)).lean();
      if (top) segs.push(top.name);
      segs.push(...names, leaf);
      return segs;
    } catch {
      return [leaf];
    }
  }
  return [leaf];
}

// GET dummy categories (top-level if no parentId, else subcategories of given category)
exports.getCategories = async (req, res) => {
  try {
    const parentId = req.query.parentId || null;
    if (!parentId || parentId === "null") {
      const cats = await DummyCategory.find({}).sort({ sequence: 1, createdAt: -1 });
      return res.json(cats);
    }
    // If parentId is a category id, return its direct children (no parentSubcategory)
    const parentCat = await DummyCategory.findById(parentId).lean();
    if (parentCat) {
      const subcats = await DummySubcategory.find({ category: parentId, parentSubcategory: null }).sort({ sequence: 1, createdAt: -1 });
      return res.json(subcats);
    }
    // If parentId is a subcategory id, return its children by parentSubcategory
    const parentSub = await DummySubcategory.findById(parentId).lean();
    if (parentSub) {
      const children = await DummySubcategory.find({ parentSubcategory: parentId }).sort({ sequence: 1, createdAt: -1 });
      return res.json(children);
    }
    return res.status(404).json({ message: "Parent not found" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// CREATE dummy category or subcategory depending on presence of parentId
exports.createCategory = async (req, res) => {
  try {
    const { name, parentId, price, terms, visibleToUser, visibleToVendor } = req.body;
    if (!name) return res.status(400).json({ message: "Name required" });

    const parsedPrice = parseNumber(price, true);
    const parsedSequence = parseNumber(req.body.sequence, false);

    // handle files from multer.single or multer.fields
    const imageFile = req.file || (req.files && Array.isArray(req.files.image) && req.files.image[0]);
    const iconFile = req.files && Array.isArray(req.files.icon) && req.files.icon[0];
    const homeBtn1File = req.files && Array.isArray(req.files.homeButton1Icon) && req.files.homeButton1Icon[0];
    const homeBtn2File = req.files && Array.isArray(req.files.homeButton2Icon) && req.files.homeButton2Icon[0];
    const aboutCardFile = req.files && Array.isArray(req.files.aboutCardIcon) && req.files.aboutCardIcon[0];
    const profileFiles = (req.files && Array.isArray(req.files.profilePictures)) ? req.files.profilePictures : [];
    const whyUsCardFiles = [];
    for (let i = 1; i <= 6; i++) {
      const key = `whyUsCard${i}Icon`;
      const file = req.files && Array.isArray(req.files[key]) && req.files[key][0];
      whyUsCardFiles.push(file || null);
    }

    let imageUrl = undefined;
    let iconUrl = undefined;
    let homeButton1IconUrl = undefined;
    let homeButton2IconUrl = undefined;
    let aboutCardIconUrl = undefined;
    const whyUsCardIconUrls = Array(6).fill("");
    if (
      (imageFile && imageFile.buffer && imageFile.mimetype) ||
      (iconFile && iconFile.buffer && iconFile.mimetype) ||
      (homeBtn1File && homeBtn1File.buffer && homeBtn1File.mimetype) ||
      (homeBtn2File && homeBtn2File.buffer && homeBtn2File.mimetype) ||
      whyUsCardFiles.some((f) => f && f.buffer && f.mimetype) ||
      (aboutCardFile && aboutCardFile.buffer && aboutCardFile.mimetype) ||
      profileFiles.some((f) => f && f.buffer && f.mimetype)
    ) {
      try {
        if (imageFile && imageFile.buffer && imageFile.mimetype) {
          if (imageUrl) { try { await deleteS3ObjectByUrl(imageUrl); } catch {} }
          const segs = await buildDummySegmentsForCreate(parentId, name);
          const { url } = await uploadBufferToS3WithLabel(imageFile.buffer, imageFile.mimetype, "newcategory", uuidv4(), { segments: segs });
          imageUrl = url;
        }
        if (iconFile && iconFile.buffer && iconFile.mimetype) {
          if (iconUrl) { try { await deleteS3ObjectByUrl(iconUrl); } catch {} }
          const segs = await buildDummySegmentsForCreate(parentId, name);
          const { url } = await uploadBufferToS3WithLabel(iconFile.buffer, iconFile.mimetype, "newcategory", uuidv4(), { segments: segs });
          iconUrl = url;
        }
        if (homeBtn1File && homeBtn1File.buffer && homeBtn1File.mimetype) {
          if (homeButton1IconUrl) { try { await deleteS3ObjectByUrl(homeButton1IconUrl); } catch {} }
          const segs = await buildDummySegmentsForCreate(parentId, name);
          const { url } = await uploadBufferToS3WithLabel(homeBtn1File.buffer, homeBtn1File.mimetype, "newcategory", uuidv4(), { segments: segs });
          homeButton1IconUrl = url;
        }
        if (homeBtn2File && homeBtn2File.buffer && homeBtn2File.mimetype) {
          if (homeButton2IconUrl) { try { await deleteS3ObjectByUrl(homeButton2IconUrl); } catch {} }
          const segs = await buildDummySegmentsForCreate(parentId, name);
          const { url } = await uploadBufferToS3WithLabel(homeBtn2File.buffer, homeBtn2File.mimetype, "newcategory", uuidv4(), { segments: segs });
          homeButton2IconUrl = url;
        }
        if (aboutCardFile && aboutCardFile.buffer && aboutCardFile.mimetype) {
          if (aboutCardIconUrl) { try { await deleteS3ObjectByUrl(aboutCardIconUrl); } catch {} }
          const segs = await buildDummySegmentsForCreate(parentId, name);
          const { url } = await uploadBufferToS3WithLabel(aboutCardFile.buffer, aboutCardFile.mimetype, "newcategory", uuidv4(), { segments: segs });
          aboutCardIconUrl = url;
        }
        // Upload up to 5 profile pictures for top-level categories on create
        let profilePictureUrls = [];
        if (!parentId && profileFiles.length) {
          const segs = await buildDummySegmentsForCreate(parentId, name);
          for (const f of profileFiles.slice(0, 5)) {
            if (f && f.buffer && f.mimetype) {
              const { url } = await uploadBufferToS3WithLabel(f.buffer, f.mimetype, "newcategory", uuidv4(), { segments: segs });
              profilePictureUrls.push(url);
            }
          }
        }
        for (let i = 0; i < whyUsCardFiles.length; i++) {
          const f = whyUsCardFiles[i];
          if (f && f.buffer && f.mimetype) {
            const segs = await buildDummySegmentsForCreate(parentId, name);
            const { url } = await uploadBufferToS3WithLabel(f.buffer, f.mimetype, "newcategory", uuidv4(), { segments: segs });
            whyUsCardIconUrls[i] = url;
          }
        }
      } catch (e) {
        return res.status(500).json({ message: "Failed to upload files to S3", error: e.message });
      }
    }

    if (!parentId) {
      // Create top-level category
      const exists = await DummyCategory.findOne({ name });
      if (exists) return res.status(400).json({ message: "Category already exists" });

      const categoryData = {
        name,
        imageUrl,
        iconUrl,
        price: parsedPrice,
        terms,
        visibleToUser: String(visibleToUser) === "true" || visibleToUser === true,
        visibleToVendor: String(visibleToVendor) === "true" || visibleToVendor === true,
        sequence: parsedSequence,
        inventoryLabelName: req.body.inventoryLabelName || "",
        attributesHeading: req.body.attributesHeading || "",
        parentSelectorLabel: req.body.parentSelectorLabel || "",
        enableFreeText: req.body.enableFreeText === "true" || req.body.enableFreeText === true,
        categoryType: req.body.categoryType || "Products",
        availableForCart: req.body.availableForCart === "true" || req.body.availableForCart === true || req.body.availableForCart === "on",
        seoKeywords: req.body.seoKeywords || "",
        postRequestsDeals: req.body.postRequestsDeals === "true",
        loyaltyPoints: req.body.loyaltyPoints === "true",
        linkAttributesPricing: req.body.linkAttributesPricing === "true",
      };

      // Attach uploaded profile picture URLs (if any)
      if (Array.isArray(profileFiles) && profileFiles.length) {
        try {
          const segs = await buildDummySegmentsForCreate(parentId, name);
          const urls = [];
          for (const f of profileFiles.slice(0, 5)) {
            if (f && f.buffer && f.mimetype) {
              const { url } = await uploadBufferToS3WithLabel(f.buffer, f.mimetype, "newcategory", uuidv4(), { segments: segs });
              urls.push(url);
            }
          }
          if (urls.length) categoryData.profilePictures = urls;
        } catch (e) {
          return res.status(500).json({ message: "Failed to upload profilePictures to S3", error: e.message });
        }
      }

      categoryData.homePopup = {
        tagline: req.body.homeTagline || "",
        description: req.body.homeDescription || "",
        button1Label: req.body.homeButton1Label || "",
        button1IconUrl: homeButton1IconUrl || "",
        button2Label: req.body.homeButton2Label || "",
        button2IconUrl: homeButton2IconUrl || "",
      };

      categoryData.whyUs = {
        heading: req.body.whyUsHeading || "",
        subHeading: req.body.whyUsSubHeading || "",
        cards: Array.from({ length: 6 }, (_, idx) => ({
          title: req.body[`whyUsCard${idx + 1}Title`] || "",
          description: req.body[`whyUsCard${idx + 1}Description`] || "",
          iconUrl: whyUsCardIconUrls[idx] || "",
        })),
      };

      categoryData.about = {
        heading: req.body.aboutHeading || "",
        mainText: req.body.aboutMainText || "",
        mission: req.body.aboutMission || "",
        vision: req.body.aboutVision || "",
        card: {
          title: req.body.aboutCardTitle || "",
          description: req.body.aboutCardDescription || "",
          buttonLabel: req.body.aboutCardButtonLabel || "",
          iconUrl: aboutCardIconUrl || "",
        },
      };

      categoryData.contact = {
        heading: req.body.contactHeading || "",
        description: req.body.contactDescription || "",
        footerHeading: req.body.contactFooterHeading || "",
        footerDescription: req.body.contactFooterDescription || "",
        footerHeading1: req.body.contactFooterHeading1 || "",
        footerHeading2: req.body.contactFooterHeading2 || "",
        footerHeading3: req.body.contactFooterHeading3 || "",
        footerHeading4: req.body.contactFooterHeading4 || "",
      };

      // arrays may arrive as JSON or string
      [
        "categoryVisibility",
        "categoryModel",
        "categoryPricing",
        "socialHandle",
        "displayType",
        "webMenu",
      ].forEach((key) => {
        if (req.body[key] !== undefined) {
          try {
            const parsed = JSON.parse(req.body[key]);
            categoryData[key] = Array.isArray(parsed) ? parsed : (parsed != null ? [String(parsed)] : []);
          } catch {
            categoryData[key] = req.body[key] ? [String(req.body[key])] : [];
          }
        }
      });

      if (req.body.freeTexts) {
        try { categoryData.freeTexts = JSON.parse(req.body.freeTexts); } catch {}
      } else {
        categoryData.freeTexts = Array.from({ length: 10 }, (_, i) => req.body[`freeText${i}`] || "");
      }

      if (req.body.linkedAttributes) {
        try { const obj = JSON.parse(req.body.linkedAttributes); if (obj && typeof obj === 'object') categoryData.linkedAttributes = obj; } catch {}
      }

      if (req.body.colorSchemes) {
        try { categoryData.colorSchemes = JSON.parse(req.body.colorSchemes); } catch {}
      }

      if (req.body.signupLevels) {
        try { const levels = JSON.parse(req.body.signupLevels); if (Array.isArray(levels)) categoryData.signupLevels = levels; } catch {}
      }

      const category = new DummyCategory(categoryData);
      await category.save();
      return res.json(category);
    }
    // Create subcategory under given parent (category or subcategory)
    const parentCat = await DummyCategory.findById(parentId);
    if (parentCat) {
      const subcategory = new DummySubcategory({
        name,
        imageUrl,
        iconUrl,
        category: parentId,
        parentSubcategory: null,
        price: parsedPrice,
        terms,
        freeText: req.body.freeText || "",
        visibleToUser: String(visibleToUser) === "true" || visibleToUser === true,
        visibleToVendor: String(visibleToVendor) === "true" || visibleToVendor === true,
        sequence: parsedSequence,
        inventoryLabelName: req.body.inventoryLabelName || "",
      });
      await subcategory.save();
      return res.json(subcategory);
    }
    const parentSub = await DummySubcategory.findById(parentId);
    if (parentSub) {
      // Nested child under a subcategory: inherit top-level category id
      const topCategoryId = parentSub.category;
      const subcategory = new DummySubcategory({
        name,
        imageUrl,
        iconUrl,
        category: topCategoryId,
        parentSubcategory: parentId,
        price: parsedPrice,
        terms,
        freeText: req.body.freeText || "",
        visibleToUser: String(visibleToUser) === "true" || visibleToUser === true,
        visibleToVendor: String(visibleToVendor) === "true" || visibleToVendor === true,
        sequence: parsedSequence,
        inventoryLabelName: req.body.inventoryLabelName || "",
      });
      await subcategory.save();
      return res.json(subcategory);
    }
    return res.status(404).json({ message: "Parent not found" });
  } catch (err) {
    console.error("Create dummy category error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, terms, visibleToUser, visibleToVendor, inventoryLabelName } = req.body;

    let doc = await DummyCategory.findById(id);
    let modelType = "category";
    if (!doc) {
      doc = await DummySubcategory.findById(id);
      modelType = doc ? "subcategory" : null;
    }
    if (!doc) return res.status(404).json({ message: "Item not found" });

    if (name !== undefined) doc.name = name;
    doc.price = parseNumber(price, true);
    if (terms !== undefined) doc.terms = terms;
    if (req.body.freeText !== undefined) doc.freeText = req.body.freeText;
    if (visibleToUser !== undefined) doc.visibleToUser = String(visibleToUser) === "true" || visibleToUser === true;
    if (visibleToVendor !== undefined) doc.visibleToVendor = String(visibleToVendor) === "true" || visibleToVendor === true;
    if (req.body.sequence !== undefined) doc.sequence = parseNumber(req.body.sequence, false);

    const imageFile = req.file || (req.files && Array.isArray(req.files.image) && req.files.image[0]);
    const iconFile = req.files && Array.isArray(req.files.icon) && req.files.icon[0];
    const homeBtn1File = req.files && Array.isArray(req.files.homeButton1Icon) && req.files.homeButton1Icon[0];
    const homeBtn2File = req.files && Array.isArray(req.files.homeButton2Icon) && req.files.homeButton2Icon[0];
    const aboutCardFile = req.files && Array.isArray(req.files.aboutCardIcon) && req.files.aboutCardIcon[0];
    const profileFiles = (req.files && Array.isArray(req.files.profilePictures)) ? req.files.profilePictures : [];
    const whyUsCardFiles = [];
    for (let i = 1; i <= 6; i++) {
      const key = `whyUsCard${i}Icon`;
      const file = req.files && Array.isArray(req.files[key]) && req.files[key][0];
      whyUsCardFiles.push(file || null);
    }

    if (imageFile && imageFile.buffer && imageFile.mimetype) {
      try {
        if (doc.imageUrl) { try { await deleteS3ObjectByUrl(doc.imageUrl); } catch {} }
        const segs = await buildDummySegmentsForExisting(doc, name);
        const { url } = await uploadBufferToS3WithLabel(imageFile.buffer, imageFile.mimetype, "newcategory", uuidv4(), { segments: segs });
        doc.imageUrl = url;
      } catch (e) { return res.status(500).json({ message: "Failed to upload image to S3", error: e.message }); }
    }

    if (iconFile && iconFile.buffer && iconFile.mimetype) {
      try {
        if (doc.iconUrl) { try { await deleteS3ObjectByUrl(doc.iconUrl); } catch {} }
        const segs = await buildDummySegmentsForExisting(doc, name);
        const { url } = await uploadBufferToS3WithLabel(iconFile.buffer, iconFile.mimetype, "newcategory", uuidv4(), { segments: segs });
        doc.iconUrl = url;
      } catch (e) { return res.status(500).json({ message: "Failed to upload icon to S3", error: e.message }); }
    }

    // Handle home popup button icons for top-level dummy categories
    const isTopLevelDummy = !doc.category && !doc.parent;
    if (isTopLevelDummy && homeBtn1File && homeBtn1File.buffer && homeBtn1File.mimetype) {
      try {
        if (doc.homePopup && doc.homePopup.button1IconUrl) {
          try { await deleteS3ObjectByUrl(doc.homePopup.button1IconUrl); } catch {}
        }
        const segs = await buildDummySegmentsForExisting(doc, name);
        const { url } = await uploadBufferToS3WithLabel(homeBtn1File.buffer, homeBtn1File.mimetype, "newcategory", uuidv4(), { segments: segs });
        if (!doc.homePopup) doc.homePopup = {};
        doc.homePopup.button1IconUrl = url;
      } catch (e) {
        return res.status(500).json({ message: "Failed to upload homeButton1Icon to S3", error: e.message });
      }
    }

    if (isTopLevelDummy && homeBtn2File && homeBtn2File.buffer && homeBtn2File.mimetype) {
      try {
        if (doc.homePopup && doc.homePopup.button2IconUrl) {
          try { await deleteS3ObjectByUrl(doc.homePopup.button2IconUrl); } catch {}
        }
        const segs = await buildDummySegmentsForExisting(doc, name);
        const { url } = await uploadBufferToS3WithLabel(homeBtn2File.buffer, homeBtn2File.mimetype, "newcategory", uuidv4(), { segments: segs });
        if (!doc.homePopup) doc.homePopup = {};
        doc.homePopup.button2IconUrl = url;
      } catch (e) {
        return res.status(500).json({ message: "Failed to upload homeButton2Icon to S3", error: e.message });
      }
    }

    if (isTopLevelDummy && aboutCardFile && aboutCardFile.buffer && aboutCardFile.mimetype) {
      try {
        if (doc.about && doc.about.card && doc.about.card.iconUrl) {
          try { await deleteS3ObjectByUrl(doc.about.card.iconUrl); } catch {}
        }
        const segs = await buildDummySegmentsForExisting(doc, name);
        const { url } = await uploadBufferToS3WithLabel(aboutCardFile.buffer, aboutCardFile.mimetype, "newcategory", uuidv4(), { segments: segs });
        if (!doc.about) doc.about = { heading: "", mainText: "", mission: "", vision: "", card: { title: "", description: "", buttonLabel: "", iconUrl: "" } };
        if (!doc.about.card) doc.about.card = { title: "", description: "", buttonLabel: "", iconUrl: "" };
        doc.about.card.iconUrl = url;
      } catch (e) {
        return res.status(500).json({ message: "Failed to upload aboutCardIcon to S3", error: e.message });
      }
    }

    // Replace profile pictures if new ones are provided for top-level dummy categories
    if (isTopLevelDummy && profileFiles.length) {
      try {
        if (Array.isArray(doc.profilePictures)) {
          for (const url of doc.profilePictures) {
            try { await deleteS3ObjectByUrl(url); } catch {}
          }
        }
        const segs = await buildDummySegmentsForExisting(doc, name);
        const urls = [];
        for (const f of profileFiles) {
          if (f && f.buffer && f.mimetype) {
            const { url } = await uploadBufferToS3WithLabel(f.buffer, f.mimetype, "newcategory", uuidv4(), { segments: segs });
            urls.push(url);
          }
        }
        doc.profilePictures = urls;
      } catch (e) {
        return res.status(500).json({ message: "Failed to upload profilePictures to S3", error: e.message });
      }
    }

    if (inventoryLabelName !== undefined) doc.inventoryLabelName = inventoryLabelName;
    // Allow updating parentSelectorLabel for both top-level dummy categories and subcategories
    if (req.body.parentSelectorLabel !== undefined) {
      doc.parentSelectorLabel = req.body.parentSelectorLabel;
    }

    // top-level specific updates
    if (!doc.category && !doc.parent) {
      if (req.body.enableFreeText !== undefined) doc.enableFreeText = req.body.enableFreeText === "true" || req.body.enableFreeText === true;
      if (req.body.categoryType !== undefined) doc.categoryType = req.body.categoryType;
      if (req.body.availableForCart !== undefined) doc.availableForCart = req.body.availableForCart === "true" || req.body.availableForCart === true || req.body.availableForCart === "on";
      if (req.body.seoKeywords !== undefined) doc.seoKeywords = req.body.seoKeywords;
      if (req.body.attributesHeading !== undefined) doc.attributesHeading = req.body.attributesHeading;
      if (req.body.postRequestsDeals !== undefined) doc.postRequestsDeals = req.body.postRequestsDeals === "true";
      if (req.body.loyaltyPoints !== undefined) doc.loyaltyPoints = req.body.loyaltyPoints === "true";
      if (req.body.linkAttributesPricing !== undefined) doc.linkAttributesPricing = req.body.linkAttributesPricing === "true";

      if (!doc.homePopup) doc.homePopup = {};
      if (req.body.homeTagline !== undefined) doc.homePopup.tagline = req.body.homeTagline;
      if (req.body.homeDescription !== undefined) doc.homePopup.description = req.body.homeDescription;
      if (req.body.homeButton1Label !== undefined) doc.homePopup.button1Label = req.body.homeButton1Label;
      if (req.body.homeButton2Label !== undefined) doc.homePopup.button2Label = req.body.homeButton2Label;

      if (!doc.whyUs) {
        doc.whyUs = { heading: "", subHeading: "", cards: [] };
      }
      if (req.body.whyUsHeading !== undefined) doc.whyUs.heading = req.body.whyUsHeading;
      if (req.body.whyUsSubHeading !== undefined) doc.whyUs.subHeading = req.body.whyUsSubHeading;
      if (!Array.isArray(doc.whyUs.cards)) doc.whyUs.cards = [];
      for (let i = 0; i < 6; i++) {
        if (!doc.whyUs.cards[i]) {
          doc.whyUs.cards[i] = { title: "", description: "", iconUrl: "" };
        }
        const tKey = `whyUsCard${i + 1}Title`;
        const dKey = `whyUsCard${i + 1}Description`;
        if (req.body[tKey] !== undefined) doc.whyUs.cards[i].title = req.body[tKey];
        if (req.body[dKey] !== undefined) doc.whyUs.cards[i].description = req.body[dKey];
      }
      for (let i = 0; i < whyUsCardFiles.length; i++) {
        const f = whyUsCardFiles[i];
        if (isTopLevelDummy && f && f.buffer && f.mimetype) {
          try {
            if (doc.whyUs && Array.isArray(doc.whyUs.cards) && doc.whyUs.cards[i] && doc.whyUs.cards[i].iconUrl) {
              try { await deleteS3ObjectByUrl(doc.whyUs.cards[i].iconUrl); } catch {}
            }
            const segs = await buildDummySegmentsForExisting(doc, name);
            const { url } = await uploadBufferToS3WithLabel(f.buffer, f.mimetype, "newcategory", uuidv4(), { segments: segs });
            if (!doc.whyUs.cards[i]) doc.whyUs.cards[i] = { title: "", description: "", iconUrl: "" };
            doc.whyUs.cards[i].iconUrl = url;
          } catch (e) {
            return res.status(500).json({ message: `Failed to upload whyUsCard${i + 1}Icon to S3`, error: e.message });
          }
        }
      }

      if (!doc.about) {
        doc.about = { heading: "", mainText: "", mission: "", vision: "", card: { title: "", description: "", buttonLabel: "", iconUrl: "" } };
      }
      if (!doc.about.card) {
        doc.about.card = { title: "", description: "", buttonLabel: "", iconUrl: "" };
      }
      if (req.body.aboutHeading !== undefined) doc.about.heading = req.body.aboutHeading;
      if (req.body.aboutMainText !== undefined) doc.about.mainText = req.body.aboutMainText;
      if (req.body.aboutMission !== undefined) doc.about.mission = req.body.aboutMission;
      if (req.body.aboutVision !== undefined) doc.about.vision = req.body.aboutVision;
      if (req.body.aboutCardTitle !== undefined) doc.about.card.title = req.body.aboutCardTitle;
      if (req.body.aboutCardDescription !== undefined) doc.about.card.description = req.body.aboutCardDescription;
      if (req.body.aboutCardButtonLabel !== undefined) doc.about.card.buttonLabel = req.body.aboutCardButtonLabel;

      if (!doc.contact) {
        doc.contact = { heading: "", description: "", footerHeading: "", footerDescription: "", footerHeading1: "", footerHeading2: "", footerHeading3: "", footerHeading4: "" };
      }
      if (req.body.contactHeading !== undefined) doc.contact.heading = req.body.contactHeading;
      if (req.body.contactDescription !== undefined) doc.contact.description = req.body.contactDescription;
      if (req.body.contactFooterHeading !== undefined) doc.contact.footerHeading = req.body.contactFooterHeading;
      if (req.body.contactFooterDescription !== undefined) doc.contact.footerDescription = req.body.contactFooterDescription;
      if (req.body.contactFooterHeading1 !== undefined) doc.contact.footerHeading1 = req.body.contactFooterHeading1;
      if (req.body.contactFooterHeading2 !== undefined) doc.contact.footerHeading2 = req.body.contactFooterHeading2;
      if (req.body.contactFooterHeading3 !== undefined) doc.contact.footerHeading3 = req.body.contactFooterHeading3;
      if (req.body.contactFooterHeading4 !== undefined) doc.contact.footerHeading4 = req.body.contactFooterHeading4;

      // Add-on texts for first-level subcategory page (Individual / Packages)
      if (!doc.individualAddon) {
        doc.individualAddon = { heading: "", description: "", buttonLabel: "" };
      }
      if (!doc.packagesAddon) {
        doc.packagesAddon = { heading: "", description: "", buttonLabel: "" };
      }
      if (req.body.individualAddonHeading !== undefined) {
        doc.individualAddon.heading = req.body.individualAddonHeading;
      }
      if (req.body.individualAddonDescription !== undefined) {
        doc.individualAddon.description = req.body.individualAddonDescription;
      }
      if (req.body.individualAddonButtonLabel !== undefined) {
        doc.individualAddon.buttonLabel = req.body.individualAddonButtonLabel;
      }
      if (req.body.packagesAddonHeading !== undefined) {
        doc.packagesAddon.heading = req.body.packagesAddonHeading;
      }
      if (req.body.packagesAddonDescription !== undefined) {
        doc.packagesAddon.description = req.body.packagesAddonDescription;
      }
      if (req.body.packagesAddonButtonLabel !== undefined) {
        doc.packagesAddon.buttonLabel = req.body.packagesAddonButtonLabel;
      }

      [
        "categoryVisibility",
        "categoryModel",
        "categoryPricing",
        "socialHandle",
        "displayType",
        "webMenu",
      ].forEach((key) => {
        if (req.body[key] !== undefined) {
          try {
            const parsed = JSON.parse(req.body[key]);
            doc[key] = Array.isArray(parsed) ? parsed : (parsed != null ? [String(parsed)] : []);
          } catch {
            doc[key] = req.body[key] ? [String(req.body[key])] : [];
          }
        }
      });

      if (req.body.colorSchemes) {
        try { doc.colorSchemes = JSON.parse(req.body.colorSchemes); } catch {}
      }
      if (req.body.signupLevels) {
        try { const v = JSON.parse(req.body.signupLevels); if (Array.isArray(v)) doc.signupLevels = v; } catch {}
      }
      if (req.body.linkedAttributes) {
        try { const v = JSON.parse(req.body.linkedAttributes); if (v && typeof v === 'object') doc.linkedAttributes = v; } catch {}
      }
      if (req.body.freeTexts) {
        try { doc.freeTexts = JSON.parse(req.body.freeTexts); } catch {}
      } else {
        const arr = Array.from({ length: 10 }, (_, i) => req.body[`freeText${i}`] || "");
        if (arr.some((x) => x !== undefined)) doc.freeTexts = arr;
      }
    }

    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error("Update dummy category error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
};

async function deleteImageIfLocal(imageUrl) {
  // For backward compatibility: delete from local uploads if needed
  if (imageUrl && imageUrl.startsWith("/uploads/")) {
    const localPath = imageUrl.slice(1);
    try { if (fs.existsSync(localPath)) fs.unlinkSync(localPath); } catch {}
    return;
  }
  // Delete from S3 when url is S3
  if (imageUrl && imageUrl.startsWith("http")) {
    try { await deleteS3ObjectByUrl(imageUrl); } catch {}
  }
}

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await DummyCategory.findById(id);
    if (category) {
      // Delete all subcategories under it
      const subs = await DummySubcategory.find({ category: id });
      for (const s of subs) {
        await deleteImageIfLocal(s.imageUrl);
        await deleteImageIfLocal(s.iconUrl);
      }
      await DummySubcategory.deleteMany({ category: id });
      await deleteImageIfLocal(category.imageUrl);
      await deleteImageIfLocal(category.iconUrl);
      await DummyCategory.findByIdAndDelete(id);
      return res.json({ message: "Deleted category and its subcategories" });
    }
    const subcategory = await DummySubcategory.findById(id);
    if (!subcategory) return res.status(404).json({ message: "Item not found" });
    // delete descendants recursively
    const stack = [subcategory._id];
    while (stack.length) {
      const current = stack.pop();
      const children = await DummySubcategory.find({ parentSubcategory: current });
      for (const ch of children) {
        await deleteImageIfLocal(ch.imageUrl);
        await deleteImageIfLocal(ch.iconUrl);
        stack.push(ch._id);
      }
      await DummySubcategory.deleteMany({ parentSubcategory: current });
    }
    await deleteImageIfLocal(subcategory.imageUrl);
    await DummySubcategory.findByIdAndDelete(id);
    return res.json({ message: "Deleted subcategory" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET single by id (search both collections) and normalize parent field
exports.getCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await DummyCategory.findById(id);
    if (category) {
      return res.json({ ...category.toObject(), parent: null });
    }
    const subcategory = await DummySubcategory.findById(id);
    if (!subcategory) return res.status(404).json({ message: "Item not found" });
    return res.json({ ...subcategory.toObject(), parent: subcategory.parentSubcategory || subcategory.category });
  } catch (err) {
    console.error("Get dummy category error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
};