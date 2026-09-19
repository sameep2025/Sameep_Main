"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useRef } from "react";
import { useVendor } from "../context/VendorContext";
import "./Explore.css";
import "./ExploreInline.css";
import HeroSection from "../Hero/Hero";
import { API_BASE_URL } from "../../config";
// adjust path if needed: ../config or ../../config
import { Suspense } from "react";
import ResourceButton from "./components/ResourceButton";
import ProfileDashboard from "../components/dashboard/ProfileDashboard";
import MyStylists from "../components/dashboard/MyStylist";
import PackagesPortal from "../PackagesPortal/PackagesPortal";
import VendorGalleryModal from "../components/gallery/VendorGalleryModal";
import TodayRevenue from "../components/dashboard/TodayRevenue";
import MonthRevenue from "../components/dashboard/MonthRevenue";
import YearRevenue from "../components/dashboard/YearRevenue";
import CustomerSearch from "../components/dashboard/CustomerSearch";
import LoyaltySettings from "../components/dashboard/LoyaltySettings";
import SubscriptionDashboard from "../components/dashboard/SubscriptionDashboard";
import EnquiriesDashboard from "../components/dashboard/EnquiriesDashboard";
import WebsiteAnalyticsDashboard from "../components/dashboard/WebsiteAnalyticsDashboard";
import WhatsappBusinessDashboard from "../components/dashboard/WhatsappBusinessDashboard";
import { useSearchParams } from "next/navigation";
import { useSessionGuard } from "../Login/useSessionGuard";
import ModernPreviewTemplate from "./templates/ModernPreviewTemplate";
import CatalogPreviewTemplate from "./templates/CatalogPreviewTemplate";
import NurseriesPreviewTemplate from "./templates/NurseriesPreviewTemplate";
import EcommercePreviewTemplate from "./templates/EcommercePreviewTemplate";
import PremiumLightPreviewTemplate from "./templates/PremiumLightPreviewTemplate";
import { CART_UPDATED_EVENT, ENQUIRY_OPEN_EVENT } from "../utils/enquiryFlow";
import {
  ADMIN_OPEN_DASHBOARD_EVENT,
  ADMIN_OPEN_MENU_EVENT,
} from "../utils/adminQuickActions";
const FOOTER_GALLERY_OPEN_EVENT = "ynot-footer-open-gallery";

function normalizePreviewTemplateKey(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["classic", "modern", "catalog", "astrology", "nurseries", "ecommerce", "premium_light"].includes(normalized) ? normalized : "";
}
// import { useLoginPopup } from "./LoginPopupContext";

const toAnchor = (label) =>
  label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");

function safeClone(value) {
  if (typeof globalThis !== "undefined" && typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    if (Array.isArray(value)) {
      return value.map((item) => safeClone(item));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, entryValue]) => [key, safeClone(entryValue)])
      );
    }

    return value;
  }
}

function getSafeDeviceId() {
  if (typeof globalThis !== "undefined") {
    const randomUuid = globalThis.crypto?.randomUUID;
    if (typeof randomUuid === "function") {
      return randomUuid.call(globalThis.crypto);
    }
  }

  return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildFreeTextMapFromTree(nodes) {
  const map = {};

  function walk(node) {
    if (node.id) {
      const raw = node.enableFreeText;
      map[node.id] =
        raw === true ||
        raw === "true" ||
        raw === 1 ||
        raw === "1";
    }
    node.children?.forEach(walk);
  }

  nodes.forEach(walk);
  return map;
}
function buildPackagesMapFromTree(nodes) {
  const map = {};

  function walk(node) {
    if (node.id && node.packagesIncludes) {
      map[node.id] = node.packagesIncludes;
    }
    node.children?.forEach(walk);
  }

  nodes.forEach(walk);
  return map;
}

function buildNameMapFromTree(nodes) {
  const map = {};

  function walk(node) {
    // ⭐ YOUR CATEGORY API USES _id
    if (node.id && node.name) {
      map[node.id] = node.name.trim();

    }
    node.children?.forEach(walk);
  }

  nodes.forEach(walk);
  return map;
}


function buildImageMapFromTree(nodes) {
  const map = {};

  function walk(node, inheritedImage = null) {
    const currentImage = node.imageUrl || inheritedImage;

    if (node.id && currentImage) {
      map[node.id] = currentImage;
    }

    node.children?.forEach(child =>
      walk(child, currentImage)
    );
  }

  nodes.forEach(n => walk(n));
  return map;
}

const SUBSCRIPTION_WARNING_WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function singularizeHumanResourceLabel(label) {
  const cleaned = String(label || "").trim();
  if (!cleaned) return "Resource";

  const parts = cleaned.split(/\s+/);
  const last = parts[parts.length - 1];
  let singular = last;

  if (/ies$/i.test(last)) singular = last.replace(/ies$/i, "y");
  else if (/(ches|shes|sses|xes|zes)$/i.test(last)) singular = last.replace(/es$/i, "");
  else if (/s$/i.test(last) && !/ss$/i.test(last)) singular = last.replace(/s$/i, "");

  parts[parts.length - 1] = singular;
  return parts.join(" ");
}

function cloneCustomPackageNode(node) {
  return {
    _id: node._id,
    id: node._id,
    vendorCustomPackageId: node._id,
    name: node.name || "",
    imageUrl: node.imageUrl || "",
    packagesIncludes: node.packagesIncludes || "",
    terms: node.terms || "",
    offerText: node.offerText || "",
    pricingStatus: node.pricingStatus || "Active",
    isLeaf: node.isLeaf !== false,
    price: node.isLeaf === false ? null : Number(node.price) || 0,
    sequence: Number.isFinite(Number(node.sequence)) ? Number(node.sequence) : 0,
    sourceType: "custom_package",
    children: Array.isArray(node.children)
      ? node.children.map(cloneCustomPackageNode)
      : [],
  };
}

function mergeCustomPackagesIntoPricingTree(pricingTree, customTree, nameMap, rootCategoryId) {
  const clonedTree = Array.isArray(pricingTree)
    ? safeClone(pricingTree)
    : [];

  const packagesTargets = new Map();
  const standardTargets = new Map();

  const getEffectiveCustomType = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "service_item" || normalized === "offer") return normalized;
    return "package";
  };

  const ensureCustomMergeContainer = (targetNode) => {
    if (!targetNode || targetNode.isLeaf !== true) {
      return targetNode;
    }

    const existingChildren = Array.isArray(targetNode.children)
      ? targetNode.children
      : [];
    const originalLeafId = String(
      targetNode._id || targetNode.id || targetNode.categoryId || `leaf-${Date.now()}`
    );
    const originalLeafNode = {
      ...safeClone(targetNode),
      _id: `${originalLeafId}-base`,
      id: `${originalLeafId}-base`,
      children: [],
    };

    targetNode.isLeaf = false;
    targetNode.price = null;
    targetNode.children = [originalLeafNode, ...existingChildren];
    return targetNode;
  };

  function walkStandard(nodes, parentNode = null) {
    (nodes || []).forEach((node) => {
      const standardKey = node?.categoryId || node?._id
        ? `standard:${String(node.categoryId || node._id)}`
        : null;
      if (standardKey) {
        standardTargets.set(standardKey, node);
      }

      const resolvedName = nameMap?.[node?.categoryId] || node?.name || "";
      if (resolvedName.trim().toLowerCase() === "packages") {
        const key = parentNode?.categoryId || parentNode?._id
          ? `standard:${String(parentNode.categoryId || parentNode._id)}`
          : `root:${String(rootCategoryId)}`;
        packagesTargets.set(key, node);
      }

      if (Array.isArray(node.children) && node.children.length > 0) {
        walkStandard(node.children, node);
      }
    });
  }

  walkStandard(clonedTree, null);

  (customTree || []).forEach((customNode) => {
    if (!customNode || customNode.parentNodeType === "custom_package") return;

    let targetKey = null;
    const effectiveCustomType = getEffectiveCustomType(customNode.customType);

    if (customNode.parentNodeType === "root") {
      targetKey = `root:${String(rootCategoryId)}`;
    } else if (
      (customNode.parentNodeType === "standard_subcategory" ||
        customNode.parentNodeType === "standard_category") &&
      customNode.parentNodeId
    ) {
      targetKey = `standard:${String(customNode.parentNodeId)}`;
    }

    if (!targetKey) return;

    let targetNode = null;
    if (effectiveCustomType === "package") {
      targetNode =
        standardTargets.get(targetKey) ||
        packagesTargets.get(targetKey);
    } else {
      targetNode = standardTargets.get(targetKey);
    }
    if (!targetNode) return;

    if (targetNode.isLeaf === true) {
      targetNode = ensureCustomMergeContainer(targetNode);
    }

    if (!Array.isArray(targetNode.children)) {
      targetNode.children = [];
    }

    targetNode.children.push(cloneCustomPackageNode(customNode));
  });

  return clonedTree;
}

function normalizePreviewPricingTree(nodes = []) {
  return (Array.isArray(nodes) ? nodes : []).map((node) => {
    const normalizedId = node?.categoryId || node?.id || node?._id || null;
    return {
      ...node,
      _id: node?._id || normalizedId,
      id: node?.id || normalizedId,
      categoryId: normalizedId,
      children: normalizePreviewPricingTree(node?.children || []),
    };
  });
}

// --------------------------------------------------
// CHIP
// --------------------------------------------------
function Chip({ active, onClick, children }) {
  return (
    <button className={`chip ${active ? "active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function TermsList({ terms }) {
  if (!terms || terms.length === 0) return null;

  return (
    <ul className="ws-terms">
      {terms.map((t, i) => (
        <li key={i}>
          <span className="ws-check">✓</span>
          {t}
        </li>
      ))}
    </ul>
  );
}



function ServiceCard({ data, sectionName, openLogin, addToCart }) {

  const [selectedSubSub, setSelectedSubSub] = useState(null);
  const [selectedMain, setSelectedMain] = useState(
    data.defaultMain || data.options?.[0]?.label || null
  );
  const [selectedSub, setSelectedSub] = useState(data.defaultSub || null);

  const showTitle =
    !!data.title &&
    (!sectionName ||
      data.title.trim().toLowerCase() !== sectionName.trim().toLowerCase());

  const formatPrice = (n) => {
    const price = Number(n || 0);
    if (price <= 0) return "Contact for price";
    return `₹${price.toLocaleString("en-IN")}`;
  };

  const buildCartPath = (...segments) => {
    const normalized = segments
      .map((segment) => String(segment || "").trim())
      .filter(Boolean);

    return normalized.filter((segment, index) => {
      if (index === 0) return true;
      return segment.toLowerCase() !== normalized[index - 1].toLowerCase();
    });
  };

useEffect(() => {
  if (!selectedMain || !selectedSub) {
    setSelectedSubSub(null);
    return;
  }

  const main = data.options?.find(o => o.label === selectedMain);
  if (!main) return;

  const sub = main.subOptions?.find(s => s.label === selectedSub);
  if (!sub) return;

  // ✅ IF LEVEL 5 EXISTS → pick cheapest
  if (sub.subSubOptions?.length) {
    const cheapest = sub.subSubOptions.reduce((a, b) =>
      (b.price || 0) < (a.price || 0) ? b : a
    );

    setSelectedSubSub(cheapest.label);
  } else {
    setSelectedSubSub(null);
  }
}, [selectedSub, selectedMain, data.options]);
  useEffect(() => {
    setSelectedMain(data.defaultMain || data.options?.[0]?.label || null);
    setSelectedSub(data.defaultSub || null);
  }, [data.defaultMain, data.defaultSub, data.options]);

  useEffect(() => {
  if (!selectedMain) return;

  const main = data.options?.find(o => o.label === selectedMain);
  if (!main) return;

  if (main.subOptions?.length) {
    const cheapestSub = main.subOptions.reduce((a, b) =>
      (b.price || 0) < (a.price || 0) ? b : a
    );

    setSelectedSub(cheapestSub.label);

    // ⭐ LEVEL 5 handling
    if (cheapestSub.subSubOptions?.length) {
      const cheapestSubSub = cheapestSub.subSubOptions.reduce((a, b) =>
        (b.price || 0) < (a.price || 0) ? b : a
      );

      setSelectedSubSub(cheapestSubSub.label);
    } else {
      setSelectedSubSub(null);
    }

    return;
  }

  setSelectedSub(null);
  setSelectedSubSub(null);
}, [selectedMain, data.options]);

const total = useMemo(() => {
  let sum = 0;

  const main = data.options?.find(o => o.label === selectedMain);
  if (!main) return data.base;

  // LEVEL 2 price
  sum += main.price || 0;

  const sub = main.subOptions?.find(s => s.label === selectedSub);

  // LEVEL 3 price
  if (sub && !sub.subSubOptions) {
    sum += sub.price || 0;
  }

  // LEVEL 4 + LEVEL 5
  if (sub?.subSubOptions?.length) {
    const subSub = sub.subSubOptions.find(s => s.label === selectedSubSub);

    if (subSub) {
      sum += subSub.price || 0;
    }
  }

  return sum || data.base;
}, [data, selectedMain, selectedSub, selectedSubSub]);

  const selectedPackagesIncludes = useMemo(() => {
    if (!selectedMain) return "";

    const main = data.options?.find((option) => option.label === selectedMain);
    if (!main) return "";

    if (selectedSub && main.subOptions?.length) {
      const sub = main.subOptions.find((option) => option.label === selectedSub);
      return sub?.packagesIncludes || "";
    }

    return main.packagesIncludes || "";
  }, [data.options, selectedMain, selectedSub]);

  const dynamicImg = useMemo(() => {
    if (!selectedMain) return data.img || null;

    const main = data.options?.find((option) => option.label === selectedMain);
    if (selectedSub && main?.subOptions?.length) {
      const sub = main.subOptions.find((option) => option.label === selectedSub);
      if (sub?.imageUrl) return sub.imageUrl;
    }

    return main?.imageUrl || data.img || null;
  }, [data, selectedMain, selectedSub, selectedSubSub]);

  const selectedOfferText = useMemo(() => {
    if (!selectedMain) return data.offerText || "";

    const main = data.options?.find((option) => option.label === selectedMain);
    if (!main) return data.offerText || "";

    if (selectedSub && main.subOptions?.length) {
      const sub = main.subOptions.find((option) => option.label === selectedSub);
      return sub?.offerText || main.offerText || data.offerText || "";
    }

    return main.offerText || data.offerText || "";
  }, [data, selectedMain, selectedSub, selectedSubSub]);

  const selectedTerms = useMemo(() => {
    if (!selectedMain) return [];

    const main = data.options?.find((option) => option.label === selectedMain);
    if (!main) return [];

    if (selectedSub && main.subOptions?.length) {
      const sub = main.subOptions.find((option) => option.label === selectedSub);
      if (!sub) return main.terms || [];

      if (selectedSubSub && Array.isArray(sub.subSubOptions) && sub.subSubOptions.length > 0) {
        const subSub = sub.subSubOptions.find((option) => option.label === selectedSubSub);
        return subSub?.terms || sub?.terms || main.terms || [];
      }

      return sub?.terms || main.terms || [];
    }

    return main.terms || [];
  }, [data.options, selectedMain, selectedSub, selectedSubSub]);

  const handleSimpleAddToCart = () => {
    const categoryPath = buildCartPath(sectionName, data.title);
    const serviceId = data.id || data._id || data.categoryId || data.title;
    const serviceName = data.title;

    addToCart(
      {
        _id: serviceId,
        categoryId: serviceId,
        name: serviceName,
        price: Number(data.base) || 0,
      },
      categoryPath,
      []
    );
  };

const handleConfiguredAddToCart = () => {
  const categoryPath = buildCartPath(
    sectionName,
    data.title,
    selectedMain,
    selectedSub,
    selectedSubSub
  );

const serviceId = data.id || data._id || data.categoryId;
const cartKey = [
  serviceId,
  selectedMain,
  selectedSub,
  selectedSubSub
].filter(Boolean).join("_");

  const serviceName =
    selectedSubSub ||   // ✅ PRIORITY LEVEL 5
    selectedSub ||
    selectedMain ||
    data.title;

  addToCart(
    {
      _id: serviceId,
      categoryId: serviceId,
      cartKey,
      name: serviceName,
      price: Number(total) || 0,
    },
    categoryPath,
    []
  );
};

  if (data.simple) {
    return (
      <div className="ws-card">
        {showTitle && <h3 className="ws-title">{data.title}</h3>}
        <div className="ws-media">
          {data.offerText ? (
            <div className="offer-banner offer-blast">
              {data.offerText}
            </div>
          ) : (
            data.img && (
              <img
                className="ws-media-img ws-media-img-standard"
                src={data.img}
                alt={data.title}
              />
            )
          )}
        </div>

        <div className="ws-price">
          {!data.offerText && formatPrice(data.base)}
        </div>

        <TermsList terms={data.terms} />

        {data.packagesIncludes && (
          <div className="ws-package-box">
            <div className="ws-package-title">Package Includes</div>
            <ul className="ws-package-list">
              {String(data.packagesIncludes || "")
                .split(",")
                .filter(Boolean)
                .map((pkg, i) => (
                  <li key={i}>
                    <span className="ws-check">✓</span>
                    {pkg.trim()}
                  </li>
                ))}
            </ul>
          </div>
        )}

        <div className="ws-actions">
          <button className="btn-primary" onClick={handleSimpleAddToCart}>
            Add to Cart
          </button>
        </div>
      </div>
    );
  }


  return (
    <div className="ws-card">
      {showTitle && <h3 className="ws-title">{data.title}</h3>}

      {sectionName &&
        data.title?.trim().toLowerCase() !==
        sectionName.trim().toLowerCase() && (
          <h4 className="ws-mobile-category">{sectionName}</h4>
        )}

      <div className="ws-media" key={selectedOfferText || dynamicImg}>
        <div className="ws-media">
  {selectedOfferText ? (
    <div className="offer-full">
      {selectedOfferText}
    </div>
  ) : (
    dynamicImg && (
      <img
        className="ws-media-img ws-media-img-standard"
        src={dynamicImg}
        alt={data.title}
      />
    )
  )}


          {selectedOfferText && (
            <div className="offer-banner offer-confetti">
              {selectedOfferText}
            </div>
          )}
        </div>
      </div>

      {!selectedOfferText && (
        <div className="ws-price">{formatPrice(total)}</div>
      )}

      <div className="ws-subhead">Select Service</div>

      <div className="ws-chips">
        {data.options?.map((opt) => (
          <Chip
            key={opt.label}
            active={selectedMain === opt.label}
            onClick={() =>
              setSelectedMain(selectedMain === opt.label ? null : opt.label)
            }
          >
            {opt.label}
          </Chip>
        ))}
      </div>

      {selectedMain &&
        data.options?.find((option) => option.label === selectedMain)?.subOptions
          ?.length > 0 && (
          <div className="ws-subsection">
            <div className="ws-subhead small">Choose {selectedMain} Type</div>
            <div className="ws-chips">
              {data.options
                .find((option) => option.label === selectedMain)
                .subOptions.map((subOption) => (
                  <Chip
                    key={subOption.label}
                    active={selectedSub === subOption.label}
                    onClick={() =>
                      setSelectedSub(
                        selectedSub === subOption.label ? null : subOption.label
                      )
                    }
                  >
                    {subOption.label}
                  </Chip>
                ))}
            </div>
          </div>
        )}
      {selectedMain &&
        data.options
          ?.find((opt) => opt.label === selectedMain)
          ?.subOptions?.find((sub) => sub.label === selectedSub)
          ?.subOptions?.length > 0 && (

          <div className="ws-subsection">
            <div className="ws-subhead small">
              Choose {selectedSub} Type
            </div>

            <div className="ws-chips">
              {data.options
                .find((opt) => opt.label === selectedMain)
                .subOptions.find((sub) => sub.label === selectedSub)
                .subSubOptions.map((subSub) => (
                  <Chip
                    key={subSub.label}
                    active={selectedSubSub === subSub.label}
                    onClick={() =>
                      setSelectedSubSub(
                        selectedSubSub === subSub.label ? null : subSub.label
                      )
                    }
                  >
                    {subSub.label}
                  </Chip>
                ))}
            </div>
          </div>
        )}
        {selectedMain &&
  data.options
    ?.find((opt) => opt.label === selectedMain)
    ?.subOptions?.find((sub) => sub.label === selectedSub)
    ?.subSubOptions?.length > 0 && (

    <div className="ws-subsection">
      <div className="ws-subhead small">
        Choose {selectedSub} Option
      </div>

      <div className="ws-chips">
        {data.options
          .find((opt) => opt.label === selectedMain)
          .subOptions.find((sub) => sub.label === selectedSub)
          .subSubOptions.map((subSub) => (
            <Chip
              key={subSub.label}
              active={selectedSubSub === subSub.label}
              onClick={() =>
                setSelectedSubSub(
                  selectedSubSub === subSub.label ? null : subSub.label
                )
              }
            >
              {subSub.label}
            </Chip>
          ))}
      </div>
    </div>
)}

      <TermsList terms={selectedTerms} />

      {selectedPackagesIncludes && (
        <div className="ws-package-box">
          <div className="ws-package-title">Package Includes</div>
          <ul className="ws-package-list">
            {String(selectedPackagesIncludes || "")
              .split(",")
              .filter(Boolean)
              .map((pkg, i) => (
                <li key={i}>
                  <span className="ws-check">✓</span>
                  {pkg.trim()}
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="ws-actions">
        <button className="btn-primary" onClick={handleConfiguredAddToCart}>
          Add to Cart
        </button>
      </div>
    </div>
  );
}


// --------------------------------------------------
// API → UI Converter with min price detection
// --------------------------------------------------

function normalizeTerms(terms) {
  if (!terms) return [];

  return terms
    .split(/[.,]/)
    .map(t => t.trim())
    .filter(Boolean);
}

function collectLeafTerms(node) {
  const terms = [];

  function walk(n) {
    if (
      n.isLeaf &&
      n.pricingStatus === "Active" &&
      n.terms
    ) {
      terms.push(...normalizeTerms(n.terms));
    }
    n.children?.forEach(walk);
  }

  walk(node);

  // Keep summaries concise when rolling up leaf-level terms.
  return [...new Set(terms)].slice(0, 3);
}

function convertFromTree(tree, imageMap, nameMap, freeTextMap, packagesMap) {
  const getName = (node) =>
    node?.name || nameMap?.[node?.categoryId] || "";
  const getImage = (node) =>
    node?.imageUrl || imageMap?.[node?.categoryId] || null;
  const getPackagesIncludes = (node) =>
    node?.packagesIncludes || packagesMap?.[node?.categoryId] || "";

  const result = tree.map(level0 => {
    const children = level0.children || [];


    /* =====================================================
   ✅ CASE — LEVEL0 ITSELF IS A LEAF (ROOT SIMPLE CARD)
===================================================== */
    if (
      level0.isLeaf &&
      level0.pricingStatus === "Active"
    ) {
      return {
        sectionName: getName(level0),
        cards: [{
          id: level0.categoryId,
          title: getName(level0),
          img: getImage(level0),
          base: Number(level0.price) || 0,
          options: [],
          simple: true,
          terms: normalizeTerms(level0.terms || ""),
          offerText: level0.offerText || "",
          packagesIncludes: getPackagesIncludes(level0)
        }]
      };
    }

    /* =====================================================
       ✅ CASE 0 — LEVEL0 ITSELF IS A LEAF
       ===================================================== */

    /* =====================================================
       🟡 LOGIC 1 — GROUP ONLY IF ALL CHILDREN ARE LEAVES
       (Salon / Zero Trim / Size Based)
       ===================================================== */
    const activeLeaves = children.filter(c =>
      c.isLeaf &&
      c.pricingStatus === "Active"
    );
    const allChildrenAreLeaves =
      children.length &&
      children.every(c => c.isLeaf);

    if (activeLeaves.length > 1 && allChildrenAreLeaves) {

      let minPrice = Infinity;

      const options = activeLeaves.map(c => {
        const price = Number(c.price) || 0;
        minPrice = Math.min(minPrice, price);

        return {
          label: getName(c).trim(),

          price,
          imageUrl: getImage(c),
          terms: normalizeTerms(c.terms || ""),
          offerText: c.offerText || "",
          packagesIncludes: getPackagesIncludes(c),
          subOptions: []
        };
      });

      return {
        sectionName: getName(level0),
        cards: [{
          id: level0.categoryId,
          title: getName(level0),
          img: getImage(level0),
          options,
          base: minPrice === Infinity ? 0 : minPrice,
          defaultMain: options[0]?.label || null,
          defaultSub: null,
          simple: false
        }]
      };
    }

    /* =====================================================
       🔵 LOGIC 2 — NORMAL HIERARCHY (Tuition Flow)
       ===================================================== */
    const cards = children.map(level1 => {

      /* ---------- LEVEL1 IS DIRECT LEAF ---------- */
      if (
        level1.isLeaf &&
        level1.pricingStatus === "Active"
      ) {
        return {
          id: level1.categoryId,
          title: getName(level1),
          img: getImage(level1),
          base: Number(level1.price) || 0,
          options: [],
          simple: true,
          terms: normalizeTerms(level1.terms || ""),
          offerText: level1.offerText || "",
          packagesIncludes: getPackagesIncludes(level1)
        };
      }
      let minPrice = Infinity;
      let defaultMain = null;
      let defaultSub = null;
      const options = [];
      let cardOfferText =
        typeof level1.offerText === "string" && level1.offerText.trim() !== ""
          ? level1.offerText.trim()
          : "";
      (level1.children || []).forEach(level2 => {

        /* ---------- LEVEL2 IS LEAF ---------- */
        if (level2.isLeaf && level2.pricingStatus === "Active") {
          const price = Number(level2.price) || 0;
          // ⭐ IF THIS NODE IS OFFER ONLY (NO PRICE)
          // ⭐ OFFER ONLY NODE → still create an option
          if (
            level2.offerText &&
            !level2.price
          ) {
            options.push({
              label: getName(level2).trim(),

              price: 0,
              imageUrl: getImage(level2),
              terms: normalizeTerms(level2.terms || ""),
              offerText: level2.offerText || "",
              packagesIncludes: getPackagesIncludes(level2),
              subOptions: []
            });

            return;
          }
          options.push({
            label: getName(level2).trim(),

            price,
            imageUrl: getImage(level2),
            terms: normalizeTerms(level2.terms || ""),
            offerText: level2.offerText || "",
            packagesIncludes: getPackagesIncludes(level2),
            subOptions: []
          });

          if (price < minPrice) {
            minPrice = price;
            defaultMain = getName(level2).trim();
          }
        }

        /* ---------- LEVEL2 HAS SUBOPTIONS ---------- */
        else if (level2.children?.length) {

  const subOptions = (level2.children || []).map(level3 => {

    // 🔹 LEVEL 3 = leaf
    if (level3.isLeaf && level3.pricingStatus === "Active") {
      const price = Number(level3.price) || 0;

      if (price < minPrice) {
        minPrice = price;
        defaultMain = getName(level2).trim();
        defaultSub = getName(level3).trim();
      }

      return {
        label: getName(level3).trim(),
        price,
        imageUrl: getImage(level3),
        terms: normalizeTerms(level3.terms || ""),
        offerText: level3.offerText || "",
        packagesIncludes: getPackagesIncludes(level3)
      };
    }

    // 🔹 LEVEL 4 → LEVEL 5 exists
    if (level3.children?.length) {
      return {
        label: getName(level3).trim(),
        price: 0,
        imageUrl: getImage(level3),

        subSubOptions: level3.children
          .filter(c => c.isLeaf && c.pricingStatus === "Active")
          .map(c => ({
            label: getName(c).trim(),
            price: Number(c.price) || 0,
            imageUrl: getImage(c),
            terms: normalizeTerms(c.terms || ""),
            offerText: c.offerText || "",
            packagesIncludes: getPackagesIncludes(c)
          }))
          .filter(option => {
            const price = Number(option.price) || 0;

            if (price < minPrice) {
              minPrice = price;
              defaultMain = getName(level2).trim();
              defaultSub = getName(level3).trim();
            }

            return true;
          })
      };
    }

    return null;
  }).filter(Boolean).filter(option => {
    if (option.subSubOptions) {
      return option.subSubOptions.length > 0;
    }

    return true;
  });

  if (subOptions.length) {
    options.push({
      label: getName(level2).trim(),
      price: 0,
      imageUrl: getImage(level2),
      subOptions
    });
  }
}

      });

      if (!options.length && !cardOfferText) return null;
      if (!defaultMain && options.length) {
        defaultMain = options[0].label;
      }

      return {
        id: level1.categoryId,
        title: getName(level1),
        img: getImage(level1),
        options,
        base: minPrice === Infinity ? 0 : minPrice,
        defaultMain,
        defaultSub,
        simple: false,
        terms: collectLeafTerms(level1),
        offerText: cardOfferText || ""
      };

    }).filter(Boolean);

    return {
      sectionName: getName(level0),
      cards
    };

  }).filter(section => section?.cards?.length);

  // ✅ NOW reorder properly
  return result;
}

// --------------------------------------------------
// MAIN Explore Page
// --------------------------------------------------
function ExploreContent({ onReady, onOpenServices }) {
  useSessionGuard();



  // ================= CART + BILLING STATES =================
  const [cartItems, setCartItems] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const cartTotal = cartItems.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0),
    0
  );

  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountMode, setDiscountMode] = useState(null); // "amount" | "percent"
  const [appliedDiscount, setAppliedDiscount] = useState(0);
  const [showDiscountPopup, setShowDiscountPopup] = useState(false);


  const [resources, setResources] = useState([]);
  const [percentPer100, setPercentPer100] = useState(0);
  const [expiryDays, setExpiryDays] = useState(0);
  const [ruleLoaded, setRuleLoaded] = useState(false);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);


  const [customerMobile, setCustomerMobile] = useState("");
  const [availablePoints, setAvailablePoints] = useState(0);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [earnPoints, setEarnPoints] = useState(0);

  const [customerId, setCustomerId] = useState(null);
  const [billingId, setBillingId] = useState(null);

  const [showOtpInput, setShowOtpInput] = useState(false);
  const [verifyingCustomer, setVerifyingCustomer] = useState(false);
  const [checkingCustomer, setCheckingCustomer] = useState(false);
  const [customerValidated, setCustomerValidated] = useState(false);
  const [loyaltyLoaded, setLoyaltyLoaded] = useState(true);
  const [processingBill, setProcessingBill] = useState(false);
  const [showBillSuccess, setShowBillSuccess] = useState(false);
  const [billType, setBillType] = useState("customer");
  const [billSuccessMessage, setBillSuccessMessage] = useState("");


  const [vendorLoaded, setVendorLoaded] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [category, setCategory] = useState(null);
  const [hrCategory, setHrCategory] = useState(null);
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [otpAttemptToken, setOtpAttemptToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loadingOtp, setLoadingOtp] = useState(false);

  const [showLogin, setShowLogin] = useState(false);
  const [isCustomerLoggedIn, setIsCustomerLoggedIn] = useState(false);
  const [showSessionExpiredPopup, setShowSessionExpiredPopup] = useState(false);
  const vendorLogout = () => {
    if (typeof window === "undefined") return;

    const sessionVendorId = localStorage.getItem("vendorSessionVendorId");
    if (sessionVendorId) {
      localStorage.removeItem(`vendorToken:${sessionVendorId}`);
    }

    localStorage.removeItem("vendorSessionVendorId");
    localStorage.removeItem("vendorLoginTime");
    localStorage.removeItem("sessionDeviceId");

    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("vendorToken:")) {
        localStorage.removeItem(key);
      }
    });

    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("auth-changed"));
  };
  const getStoredViewMode = () => {
    if (typeof window === "undefined") return "preview";
    const stored = localStorage.getItem("viewMode");
    if (stored === "new-dashboard") return "preview";
    return stored || "preview";
  };
  const [viewMode, setViewMode] = useState("preview");

  useEffect(() => {
    const stored = localStorage.getItem("viewMode");

    if (stored && stored !== "new-dashboard") {
      setViewMode(stored);
    }
  }, []); const persistViewMode = (nextMode) => {
    if (typeof window !== "undefined") {
      if (nextMode === "new-dashboard") {
        localStorage.removeItem("viewMode");
      } else {
        localStorage.setItem("viewMode", nextMode);
      }
    }
    setViewMode(nextMode);
  };

  useEffect(() => {
    const handleSessionExpired = () => {
      vendorLogout();
      setShowSessionExpiredPopup(true);
      setShowVendorLogin(false);
      setShowLogin(false);
      setOpenServices(false);
      setServiceType(null);
      setServiceLoading(false);
      persistViewMode("preview");
    };

    window.addEventListener("session-expired", handleSessionExpired);
    return () =>
      window.removeEventListener("session-expired", handleSessionExpired);
  }, []);
  const vendorIdRef = useRef(null);
  const [activeRevenueTab, setActiveRevenueTab] = useState("today");
  const [showOptions, setShowOptions] = useState(false);
  const [openServices, setOpenServices] = useState(false);
  const [serviceType, setServiceType] = useState(null);
  const [galleryReadOnly, setGalleryReadOnly] = useState(true);
  const [serviceLoading, setServiceLoading] = useState(false);

  const [showVendorLogin, setShowVendorLogin] = useState(false);
  const [vendorMobile, setVendorMobile] = useState("");
  const [vendorOtp, setVendorOtp] = useState("");
  const [vendorOtpAttemptToken, setVendorOtpAttemptToken] = useState("");
  const [showVendorOtp, setShowVendorOtp] = useState(false);
  const [loginAsAdmin, setLoginAsAdmin] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [hasActiveVendorSession, setHasActiveVendorSession] = useState(false);

  const finalTotal = Math.max(cartTotal - appliedDiscount, 0);

  const [showAdminPasscode, setShowAdminPasscode] = useState(false);
  const [adminPasscode, setAdminPasscode] = useState("");

  const getWhatsAppBillingWarning = (response) => {
    const whatsapp = response?.whatsapp || {};
    if (
      whatsapp.provider === "ynot_msg91" &&
      whatsapp.sendExpected === false &&
      whatsapp.reason === "insufficient_balance"
    ) {
      return "Bill generated successfully. WhatsApp message was not sent because your WhatsApp balance is 0. Please recharge to continue sending bills on WhatsApp.";
    }
    return "";
  };


  const handleVendorLogin = async () => {

    const pageVendorPhone =
      vendorInfo?.phone ||
      vendorInfo?.mobile ||
      vendorInfo?.businessPhone;

    const clean = (num) => num?.replace(/\D/g, "").slice(-10);
    if (clean(vendorMobile) !== clean(pageVendorPhone)) {
      alert("This number is not the vendor phone");
      return;
    }

    try {
      const payload = {
        countryCode: "91",
        phone: vendorMobile,
        vendorId,
        categoryId: rootCategoryId,
      };

      const res = await fetch(`${API_BASE_URL}/api/customers/request-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        alert(data?.message || "Something went wrong");
        return;
      }

      setVendorOtpAttemptToken(data?.otpAttemptToken || "");
      setShowVendorOtp(true);
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    }
  };
  const verifyVendorOtp = async () => {
    try {
      const deviceId =
        localStorage.getItem("deviceId") || getSafeDeviceId();

      localStorage.setItem("deviceId", deviceId);

      const res = await fetch(`${API_BASE_URL}/api/customers/verify-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          countryCode: "91",
          phone: vendorMobile,
          otp: vendorOtp,
          vendorId,
          categoryId: rootCategoryId,
          otpAttemptToken: vendorOtpAttemptToken,
          deviceId,
        }),
      });

      const data = await res.json().catch(() => ({}));
      console.log("VERIFY OTP RESPONSE:", data);

      if (!res.ok || data?.success === false) {
        alert(data?.message || "Something went wrong");
        return;
      }

      const alreadyVerified =
        typeof data?.message === "string" &&
        data.message.toLowerCase().includes("already verified");

      const otpSuccess = data?.success || data?.token || alreadyVerified;
      if (otpSuccess) {
        localStorage.setItem("sessionDeviceId", deviceId);

        if (data?.token) {
          localStorage.setItem(`vendorToken:${vendorId}`, data.token);
        }
        localStorage.setItem("vendorLoginTime", String(Date.now()));
        localStorage.setItem("userType", "vendor");
        if (vendorId) {
          localStorage.setItem("vendorSessionVendorId", String(vendorId));
        }
        localStorage.removeItem("isAdminLogin");
        window.dispatchEvent(new Event("storage"));
        window.dispatchEvent(new Event("auth-changed"));

        setShowVendorLogin(false);
        setShowVendorOtp(false);
        setLoginAsAdmin(false);
        setShowAdminPasscode(false);
        setAdminPasscode("");

        if (pendingAction === "GENERATE_BILL") {
          await handleGenerateBill();
          setPendingAction(null);
        } else {
          persistViewMode("new-dashboard");
        }
        return;
      }

      alert(data?.message || "Something went wrong");
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    }
  };
  const applyDiscount = () => {
    let nextDiscount = 0;

    if (discountMode === "amount") {
      const safeAmount = Math.min(
        Math.max(Number(discountAmount) || 0, 0),
        cartTotal
      );
      if (safeAmount !== discountAmount) {
        setDiscountAmount(safeAmount);
      }
      nextDiscount = safeAmount;
    } else if (discountMode === "percent") {
      const safePercent = Math.min(
        Math.max(Number(discountPercent) || 0, 0),
        100
      );
      if (safePercent !== discountPercent) {
        setDiscountPercent(safePercent);
      }
      nextDiscount = Math.floor((cartTotal * safePercent) / 100);
    }

    setAppliedDiscount(nextDiscount);
  };
  // ================= MENU TREE (TEMP SAFE STATE) =================
  const [menuTree, setMenuTree] = useState([]);
  const [expandedMenuNodes, setExpandedMenuNodes] = useState({});


  const [selectedServiceName, setSelectedServiceName] = useState("");
  const [selectedPrice, setSelectedPrice] = useState(null);
  const [selectedTerms, setSelectedTerms] = useState("");
  const [selectedAttributes, setSelectedAttributes] = useState({});
  const [selectedCategoryPath, setSelectedCategoryPath] = useState([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);
  const [activeClassicCategory, setActiveClassicCategory] = useState("");
  const [menuSearch, setMenuSearch] = useState("");
  const [pricingRefreshNonce, setPricingRefreshNonce] = useState(0);
  // ================= MOBILE DETECTION =================
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("viewMode", viewMode);
  }, [viewMode]);
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile(); // run once
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  const checkLogin = () => {
    const token = localStorage.getItem("authToken");
    setIsCustomerLoggedIn(Boolean(token));
  };

  useEffect(() => {
    checkLogin();

    window.addEventListener("storage", checkLogin);
    return () => window.removeEventListener("storage", checkLogin);
  }, []);

  const openLogin = (serviceData) => {
    if (serviceData) {
      setSelectedServiceName(serviceData.serviceName || "");
      setSelectedPrice(serviceData.price ?? null);
      setSelectedTerms(serviceData.terms || "");
      setSelectedAttributes(serviceData.attributes || {});
      setSelectedCategoryPath(serviceData.categoryPath || []);
      setSelectedCategoryIds(serviceData.categoryIds || []);
    }

    setShowLogin(true);
  };

  const closeLogin = () => {
    setShowLogin(false);
    checkLogin();
  };

  const customerLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("token");
    localStorage.removeItem("loginTime");
    localStorage.removeItem("sessionHour");
    setIsCustomerLoggedIn(false);
    setCustomerId(null);
    setCustomerMobile("");
    setMobile("");
    setAvailablePoints(0);
    setRedeemPoints(0);
    setEarnPoints(0);
  };

  const [showInvalidMobilePopup, setShowInvalidMobilePopup] = useState(false);
  const { vendorInfo, setVendorInfo } = useVendor();

  const [countryCode, setCountryCode] = useState("91");

  const [verifyingPasscode, setVerifyingPasscode] = useState(false);

  const searchParams = useSearchParams();
  const queryRootCategoryId = searchParams.get("rootCategoryId");
  const queryVendorId = searchParams.get("vendorId");
  const queryTemplate = String(searchParams.get("template") || "").trim().toLowerCase();
  const [defaultTemplateKey, setDefaultTemplateKey] = useState("classic");
  const activeTemplateKey =
    normalizePreviewTemplateKey(queryTemplate) ||
    normalizePreviewTemplateKey(vendorInfo?.selectedTemplateKey) ||
    normalizePreviewTemplateKey(defaultTemplateKey) ||
    "classic";
  const [subscriptionPopup, setSubscriptionPopup] = useState(null);
  const [dismissedSubscriptionPopupKey, setDismissedSubscriptionPopupKey] =
    useState(null);
  const vendorId =
    queryVendorId ||
    vendorInfo?._id ||
    vendorInfo?.vendor?._id ||
    null;
  const galleryRowId =
    vendorInfo?.galleryRowId ||
    vendorInfo?.rowId ||
    vendorInfo?.rows?.[0]?._id ||
    "default";
  const rootCategoryId =
    queryRootCategoryId ||
    vendorInfo?.categoryId ||
    vendorInfo?.category?._id ||
    vendorInfo?.rootCategoryId ||
    null;
  const hrEnabled = Boolean(hrCategory?.enableHumanResources);
  const hrPluralLabel = useMemo(() => {
    const raw = String(hrCategory?.humanResourceLabel || "").trim();
    if (!raw) return "Resources";
    return raw.replace(/^manage\s+/i, "").trim() || "Resources";
  }, [hrCategory?.humanResourceLabel]);
  const hrSingularLabel = useMemo(
    () => singularizeHumanResourceLabel(hrPluralLabel),
    [hrPluralLabel]
  );
  const hrDashboardTitle = `My ${hrPluralLabel}`;
  const hrDashboardDescription = `View and manage ${resources.length} ${hrPluralLabel.toLowerCase()} records.`;
  const hrSelectorLabel = hrSingularLabel;
  const hrSelectorPlaceholder = `Select ${hrSingularLabel}`;
  const hrPerformanceTitle = `${hrSingularLabel} Performance`;
  useEffect(() => {
    if (!hrEnabled && viewMode === "stylists-dashboard") {
      setViewMode("new-dashboard");
    }
  }, [hrEnabled, viewMode]);
  const canGenerateBill =
    cartItems.length > 0 &&
    !!vendorId &&
    !showOtpInput &&
    !processingBill;
  useEffect(() => {
    if (pendingAction === "GENERATE_BILL") return;

    const isAdmin = localStorage.getItem("isAdminLogin");
    if (isAdmin === "true") {
      setLoginAsAdmin(true);
    }
  }, [vendorId, pendingAction]);
  const handleOpenServices = (type) => {
    if (typeof onOpenServices === "function") {
      onOpenServices(type);
      return;
    }

    if (type !== "packages" && type !== "gallery") {
      console.warn("Unsupported local dashboard service action", { type });
      return;
    }

    setServiceLoading(type === "packages");
    setGalleryReadOnly(type === "gallery" ? false : true);
    setServiceType(type);
    setOpenServices(true);
  };
  const renderDashboardHeader = (title, onBack) => (
    <div className="new-dashboard-header">
      <button
        className="new-dashboard-nav-btn"
        type="button"
        onClick={onBack}
      >
        <span aria-hidden="true">←</span>
        <span>Back</span>
      </button>
      <div className="new-dashboard-title">
        {title}
      </div>
    </div>
  );
  const verifyOtp = async () => {
    if (!otp || otp.length < 4) {
      alert("Enter valid OTP");
      return;
    }

    try {
      setLoadingOtp(true);

      const res = await fetch(
        `${API_BASE_URL}/api/customers/verify-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            categoryId: rootCategoryId,
            vendorId: vendorId,
            countryCode: "91",
            phone: mobile,
            otp: otp,
            otpAttemptToken,
          }),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.success === false) {
        alert(data.message || "OTP verification failed");
        return;
      }

      // ⭐ Save token
      if (data?.token) {
        localStorage.setItem("authToken", data.token);
        localStorage.setItem("loginTime", String(Date.now())); // ⏱ save login time
        setIsCustomerLoggedIn(true);
      }
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new Event("auth-changed"));

      // ⭐ CUSTOMER ID FROM BACKEND
      const customerId =
        data?.customerId ||
        data?.customer?._id ||
        data?.user?._id;

      // ⭐ CALL ENQUIRY API AFTER LOGIN
      await createEnquiry(customerId);

      closeLogin();
    } catch (err) {
      console.error(err);
      alert("Server error");
    } finally {
      setLoadingOtp(false);
    }
  };
  const createEnquiry = async (customerId) => {
    try {
      const enquiryPhone = mobile;

      const payload = {
        vendorId: String(vendorId),
        categoryId: String(rootCategoryId),
        customerId,
        phone: enquiryPhone,

        serviceName: selectedServiceName || "",
        source: selectedCategoryPath?.[0] || "",   // ⭐ FIXED

        price:
          selectedPrice == null || selectedPrice === ""
            ? null
            : Number(selectedPrice),

        terms: selectedTerms || "",
        categoryPath: selectedCategoryPath || [],
        categoryIds: selectedCategoryIds || [],
        attributes: selectedAttributes || {},
      };

      const res = await fetch(
        `${API_BASE_URL}/api/enquiries`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        console.error("Enquiry error:", data);
        return;
      }

      console.log("✅ Enquiry created", data);
    } catch (err) {
      console.error("Enquiry API error", err);
    }
  };



  const requestOtp = async () => {
    if (!mobile || mobile.length !== 10) {
      setShowInvalidMobilePopup(true);
      return;
    }

    try {
      setLoadingOtp(true);

      const otpUrl = `${API_BASE_URL.replace(/\/api\/?$/, "")}/api/customers/request-otp`;
      const payload = {
        countryCode: "91",
        phone: mobile,
        vendorId,
        categoryId: rootCategoryId,
      };
      const res = await fetch(otpUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      console.log("[OTP] response:", {
        status: res.status,
        ok: res.ok,
        data,
      });

      if (!res.ok || data?.success === false) {
        alert(data?.message || "OTP request failed");
        return;
      }

      setOtpAttemptToken(data?.otpAttemptToken || "");
      setOtpSent(true);
    } catch (err) {
      console.error(err);
      alert("Server error");
    } finally {
      setLoadingOtp(false);
    }
  };

  useEffect(() => {
    if (!queryVendorId) {
      setVendorLoaded(true);
      return;
    }

    async function fetchVendor() {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/dummy-vendors/${queryVendorId}`,
          { cache: "no-store" }
        );

        if (!res.ok) throw new Error("Vendor API failed");

        const data = await res.json();
        setVendorInfo(data);

        setVendorLoaded(true); // ✅ MARK DONE
      } catch (err) {
        console.error("Vendor fetch error", err);
        setVendorLoaded(true); // still unblock UI
      }
    }

    fetchVendor();
  }, [queryVendorId, setVendorInfo]);

  useEffect(() => {
    let cancelled = false;

    async function loadDefaultTemplate() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/preview-templates/default`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (!cancelled) {
          setDefaultTemplateKey(normalizePreviewTemplateKey(data?.key) || "classic");
        }
      } catch (error) {
        console.error("Default template fetch failed", error);
        if (!cancelled) {
          setDefaultTemplateKey("classic");
        }
      }
    }

    loadDefaultTemplate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!vendorId) {
      setSubscriptionPopup(null);
      return;
    }

    let cancelled = false;

    async function loadSubscriptionPopup() {
      try {
        const [subscriptionRes, contactRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/admin/vendor-subscriptions/${vendorId}`, {
            cache: "no-store",
          }),
          fetch(`${API_BASE_URL}/api/app-config/public-site-contact`, {
            cache: "no-store",
          }),
        ]);

        const subscriptionJson = await subscriptionRes.json().catch(() => null);
        const contactJson = await contactRes.json().catch(() => null);

        if (cancelled) return;

        const supportPhone = String(contactJson?.phone || "").trim();
        const expiryValue = subscriptionJson?.data?.subscription?.expiryDate;

        if (!subscriptionRes.ok || !subscriptionJson?.success) {
          setSubscriptionPopup({
            key: "expired:no-subscription",
            type: "expired",
            supportPhone,
          });
          return;
        }

        if (!expiryValue) {
          setSubscriptionPopup({
            key: "expired:missing-expiry",
            type: "expired",
            supportPhone,
          });
          return;
        }

        const expiryDate = new Date(expiryValue);
        if (Number.isNaN(expiryDate.getTime())) {
          setSubscriptionPopup(null);
          return;
        }

        const now = new Date();

        if (expiryDate.getTime() < now.getTime()) {
          setSubscriptionPopup({
            key: `expired:${expiryDate.toISOString()}`,
            type: "expired",
            supportPhone,
          });
          return;
        }

        const daysRemaining = Math.ceil(
          (expiryDate.getTime() - now.getTime()) / MS_PER_DAY
        );

        if (daysRemaining <= SUBSCRIPTION_WARNING_WINDOW_DAYS) {
          const nextPopup = {
            key: `warning:${expiryDate.toISOString()}`,
            type: "warning",
            supportPhone,
            daysRemaining,
          };

          if (dismissedSubscriptionPopupKey === nextPopup.key) {
            setSubscriptionPopup(null);
            return;
          }

          setSubscriptionPopup(nextPopup);
          return;
        }

        setSubscriptionPopup(null);
      } catch (error) {
        if (!cancelled) {
          console.error("Subscription popup fetch failed", error);
          setSubscriptionPopup(null);
        }
      }
    }

    loadSubscriptionPopup();

    return () => {
      cancelled = true;
    };
  }, [vendorId, dismissedSubscriptionPopupKey]);

  const closeSubscriptionPopup = () => {
    if (!subscriptionPopup || subscriptionPopup.type !== "warning") return;
    setDismissedSubscriptionPopupKey(subscriptionPopup.key);
    setSubscriptionPopup(null);
  };

  const subscriptionPopupMessage = useMemo(() => {
    if (!subscriptionPopup) return "";

    const contactLine = subscriptionPopup.supportPhone
      ? ` Please contact ${subscriptionPopup.supportPhone}.`
      : " Please contact support.";

    if (subscriptionPopup.type === "expired") {
      return `Your subscription has expired.${contactLine}`;
    }

    const dayLabel =
      subscriptionPopup.daysRemaining === 1 ? "day" : "days";

    return `Your subscription will expire in ${subscriptionPopup.daysRemaining} ${dayLabel}.${contactLine}`;
  }, [subscriptionPopup]);


  const handleVerifyOtp = async () => {
    if (!billingId || !otp) return;

    const vendorToken =
      typeof window !== "undefined"
        ? localStorage.getItem(`vendorToken:${vendorId}`)
        : null;

    if (!vendorToken) {
      setShowVendorLogin(true);
      return;
    }

    const storedVendorId =
      typeof window !== "undefined"
        ? localStorage.getItem("vendorSessionVendorId")
        : null;

    if (storedVendorId !== String(vendorId)) {
      // Different vendor → force login
      setShowVendorLogin(true);
      return;
    }

    try {
      setVerifyingOtp(true);

      const verifyRes = await fetch(`${API_BASE_URL}/api/billing/verify-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(vendorToken ? { Authorization: `Bearer ${vendorToken}` } : {}),
        },
        body: JSON.stringify({
          billingId,
          otp,
        }),
      });

      const verifyData = await verifyRes.json().catch(() => null);
      if (!verifyRes.ok || !verifyData?.success) {
        alert(verifyData?.message || "OTP verification failed");
        return;
      }

      const completeRes = await fetch(`${API_BASE_URL}/api/billing/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(vendorToken ? { Authorization: `Bearer ${vendorToken}` } : {}),
        },
        body: JSON.stringify({
          billingId,
          paymentMode: "CASH",
        }),
      });

      const completeData = await completeRes.json().catch(() => null);
      if (!completeRes.ok || !completeData?.success) {
        alert(completeData?.message || "Billing completion failed");
        return;
      }

      if (completeData?.success) {
        setBillSuccessMessage(
          getWhatsAppBillingWarning(completeData) ||
            "OTP verified successfully and the bill generated."
        );
        setShowBillSuccess(true);
        setCartItems([]);
        setCustomerMobile("");
        setAvailablePoints(0);
        setRedeemPoints(0);
        setCustomerId(null);
        setBillingId(null);
        setEarnPoints(0);
        setMenuSearch("");
        resetBillingState();
      }

      setShowOtpInput(false);
      setRedeemPoints(0);
      setOtp("");
    } catch (err) {
      console.error(err);
    }
    finally {
      setVerifyingOtp(false); // ✅ stop loader
    }
  };






  function extractSelfManagedHeroImages(pricingTree) {
    const images = [];

    function walk(nodes, inheritedActive = false) {
      (nodes || []).forEach((node) => {
        const isActive =
          String(node?.pricingStatus || "Active").trim().toLowerCase() !== "inactive";
        const hasActiveDescendant = (node?.children || []).some((child) => {
          if (String(child?.pricingStatus || "Active").trim().toLowerCase() !== "inactive") {
            return true;
          }
          return (child?.children || []).length ? hasActiveDescendantInTree([child]) : false;
        });
        const shouldUseNodeImage = isActive || inheritedActive || hasActiveDescendant;

        if (shouldUseNodeImage && node?.imageUrl) {
          images.push(node.imageUrl);
        }

        if (node?.children?.length) {
          walk(node.children, isActive || inheritedActive);
        }
      });
    }

    function hasActiveDescendantInTree(nodes) {
      return (nodes || []).some((node) => {
        if (String(node?.pricingStatus || "Active").trim().toLowerCase() !== "inactive") {
          return true;
        }
        return hasActiveDescendantInTree(node?.children || []);
      });
    }

    walk(pricingTree || []);

    return [...new Set(images.filter(Boolean))].slice(0, 5);
  }

  function extractHeroImages(categoryTree, pricingTree) {
    const images = [];

    // 👉 Build set of ACTIVE categoryIds
    const activeIds = new Set();

    function collectActive(nodes) {
      nodes.forEach(n => {
        if (n.pricingStatus === "Active") {
          activeIds.add(n.categoryId);
        }
        if (n.children?.length) collectActive(n.children);
      });
    }

    collectActive(pricingTree || []);

    // 👉 Walk category tree & pick only active images
    function walk(nodes) {
      nodes.forEach(n => {
        if (activeIds.has(n.id) && n.imageUrl) {
          images.push(n.imageUrl);
        }
        if (n.children?.length) walk(n.children);
      });
    }

    walk(categoryTree || []);

    return images.slice(0, 5);
  }
  const [heroImages, setHeroImages] = useState([]);
  const [vendorGalleryImages, setVendorGalleryImages] = useState([]);
  const mergedHeroImages = useMemo(
    () => [...new Set([...vendorGalleryImages, ...heroImages])],
    [heroImages, vendorGalleryImages]
  );

  const verifyAdminPasscode = async () => {
    if (!adminPasscode) {
      alert("Enter admin passcode");
      return;
    }

    try {
      setVerifyingPasscode(true);
      const deviceId =
        localStorage.getItem("deviceId") || getSafeDeviceId();

      localStorage.setItem("deviceId", deviceId);

      const res = await fetch(
        `${API_BASE_URL}/api/customers/admin-impersonate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            passcode: adminPasscode,
            vendorId: vendorId, // ✅ FIXED
            deviceId,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      console.log("ADMIN RESPONSE:", data);

      if (!res.ok) {
        alert(data?.message || "Something went wrong");
        return;
      }

      // ✅ SUCCESS
      localStorage.setItem("isAdminLogin", "true");
      localStorage.setItem("sessionDeviceId", deviceId);

      if (data?.token) {
        localStorage.setItem(`vendorToken:${vendorId}`, data.token);
      }
      localStorage.setItem("vendorLoginTime", Date.now());
      if (vendorId) {
        localStorage.setItem("vendorSessionVendorId", String(vendorId));
      }

      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new Event("auth-changed"));

      setLoginAsAdmin(false);
      setShowAdminPasscode(false);
      setShowVendorLogin(false);
      setAdminPasscode("");

      if (pendingAction === "GENERATE_BILL") {
        await handleGenerateBill();
        setPendingAction(null);
      } else {
        persistViewMode("new-dashboard");
      }

    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    } finally {
      setVerifyingPasscode(false);
    }
  };
  const [finalCategories, setFinalCategories] = useState([]);
  const orderedCategories = useMemo(() => {
    const offers = [];
    const normal = [];

    finalCategories.forEach(sec => {
      const isOffer =
        sec.sectionName?.toLowerCase() === "offers";

      if (isOffer) {
        offers.push(sec);
      } else {
        normal.push(sec);
      }
    });

    return [...normal, ...offers]; // ✅ Offers always last
  }, [finalCategories]);



  useEffect(() => {


    if (!vendorId || !rootCategoryId) {
      setDataLoaded(true);
      return;
    }

    async function load() {
      try {
        const isSelfManagedVendor = vendorInfo?.pricingSource === "self_managed";
        const PRICING_API =
          isSelfManagedVendor
            ? `${API_BASE_URL}/api/vendor-menu/${vendorId}/tree`
            : `${API_BASE_URL}/api/vendor-price-nodes/tree` +
              `?vendorId=${vendorId}` +
              `&rootCategoryId=${rootCategoryId}`;

        const customPackagesApi =
          `${API_BASE_URL}/api/vendor-custom-packages` +
          `?vendorId=${vendorId}` +
          `&rootCategoryId=${rootCategoryId}`;

        const [pricingRes, categoryRes, customPackagesRes] = await Promise.all([
          fetch(PRICING_API, { cache: "no-store" }),
          fetch(
            `${API_BASE_URL}/api/categories/tree?rootCategoryId=${rootCategoryId}`,
            { cache: "no-store" }
          ),
          fetch(customPackagesApi, { cache: "no-store" }),
        ]);

        if (!pricingRes.ok) {
          const text = await pricingRes.text();
          console.error("Pricing API returned non-JSON:", text);
          throw new Error("Pricing API failed");
        }

        if (!categoryRes.ok) {
          throw new Error("Category tree API failed");
        }

        if (!customPackagesRes.ok) {
          const text = await customPackagesRes.text();
          console.error("Custom packages API returned non-JSON:", text);
          throw new Error("Custom packages API failed");
        }

        const pricingData = await pricingRes.json();
        const treeData = await categoryRes.json();
        const customPackagesData = await customPackagesRes.json();

        // Always normalize to array
        const categoryTree = Array.isArray(treeData)
          ? treeData
          : [treeData];
        const categoryObj = categoryTree[0] || null;
        setCategory(categoryObj);
        const imageMap = buildImageMapFromTree(categoryTree);
        const nameMap = buildNameMapFromTree(categoryTree);
        const packagesMap = buildPackagesMapFromTree(categoryTree);
        const freeTextMap = buildFreeTextMapFromTree(categoryTree);
        const masterIdSet = new Set(Object.keys(nameMap));
        const normalizedPricingTree = normalizePreviewPricingTree(
          isSelfManagedVendor ? pricingData?.children || [] : pricingData?.tree || []
        );
        const mergedPricingTree = isSelfManagedVendor
          ? normalizedPricingTree
          : mergeCustomPackagesIntoPricingTree(
              normalizedPricingTree,
              customPackagesData?.data || [],
              nameMap,
              rootCategoryId
            );

        // ⭐ FIND INVALID NODES
        function collectInvalidNodes(nodes, invalid = []) {
          nodes.forEach(node => {
            if (isSelfManagedVendor) {
              if (node.children?.length) {
                collectInvalidNodes(node.children, invalid);
              }
              return invalid;
            }
            if (!masterIdSet.has(node.categoryId)) {
              invalid.push(node);
            }

            if (node.children?.length) {
              collectInvalidNodes(node.children, invalid);
            }
          });

          return invalid;
        }

        const invalidNodes = collectInvalidNodes(mergedPricingTree);




        setHeroImages(
          isSelfManagedVendor
            ? extractSelfManagedHeroImages(mergedPricingTree)
            : extractHeroImages(categoryTree, mergedPricingTree)
        );

        const activeMenuTree = filterActiveMenuTree(mergedPricingTree);
        setMenuTree(activeMenuTree);

        const converted = convertFromTree(
          mergedPricingTree,
          imageMap,
          nameMap,
          freeTextMap,
          packagesMap
        ).filter(Boolean);
        // ✅ Always push "Offers" section to bottom
        setFinalCategories(converted);
        setVendorInfo(prev => ({
          ...prev,
          categoryData: categoryObj,
          previewSeoData: buildPreviewSeoData(activeMenuTree, converted, categoryObj)
        }));
        setDataLoaded(true);

      } catch (e) {
        console.error("API Error:", e);
        setDataLoaded(true);
      }
    }
    load();
  }, [vendorId, rootCategoryId, pricingRefreshNonce, vendorInfo?.pricingSource]);

  useEffect(() => {
    if (!rootCategoryId) return;

    fetch(`${API_BASE_URL}/api/dummy-categories/${rootCategoryId}`)
      .then((res) => res.json())
      .then((data) => {
        setHrCategory(data);
        console.log("CATEGORY STATE:", data);
      })
      .catch((err) => {
        console.error("Failed to load category", err);
      });
  }, [rootCategoryId]);

  useEffect(() => {
    if (!vendorId) return;

    fetch(`${API_BASE_URL}/api/vendor-resources?vendorId=${vendorId}`)
      .then((res) => res.json())
      .then((data) => {
        setResources(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error("Failed loading resources", err);
      });
  }, [vendorId]);

  useEffect(() => {
    if (!vendorInfo?.resources) return;
    setResources(Array.isArray(vendorInfo.resources) ? vendorInfo.resources : []);
  }, [vendorInfo?.resources]);

  useEffect(() => {
    if (!vendorId) return;

    fetch(`${API_BASE_URL}/api/vendor-gallery/${vendorId}/featured?limit=5`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Featured gallery API failed");
        return res.json();
      })
      .then((data) => {
        const images = Array.isArray(data?.images)
          ? data.images
              .map((image) => image?.imageUrl || image?.url || "")
              .map((imageUrl) => String(imageUrl || "").trim())
              .filter(Boolean)
          : [];

        if (images.length > 0) {
          setVendorGalleryImages([...new Set(images)]);
          return;
        }

        return fetch(`${API_BASE_URL}/api/dummy-vendors/${vendorId}`, {
          cache: "no-store",
        })
          .then((res) => res.json())
          .then((vendor) => {
            if (!vendor?.rowImages) {
              setVendorGalleryImages([]);
              return;
            }

            const fallbackImages = Object.values(vendor.rowImages)
              .flat()
              .map((imageUrl) => String(imageUrl || "").trim())
              .filter(Boolean);
            setVendorGalleryImages([...new Set(fallbackImages)].slice(0, 5));
          });
      })
      .catch((err) => {
        console.error("Vendor gallery fetch failed", err);
        setVendorGalleryImages([]);
      });
  }, [vendorId]);

  useEffect(() => {
    if (vendorLoaded && dataLoaded) {
      onReady?.();
    }
  }, [vendorLoaded, dataLoaded, onReady]);


  const { cardsWithoutHeading, sectionsWithHeading } = useMemo(() => {
    const cards = [];
    const sections = [];

    orderedCategories.forEach(section => {
      // ✅ FORCE OFFERS ALWAYS WITH HEADING
      const isOfferSection =
        section.sectionName?.toLowerCase() === "offers";

      if (isOfferSection) {
        sections.push(section);
        return;
      }
      const hasSingleCard = section.cards.length === 1;
      const singleCard = section.cards[0];

      const hideHeading =
        hasSingleCard &&
        section.sectionName.toLowerCase() !== "offers" &&
        !singleCard.offerText?.trim() &&
        singleCard.title?.trim().toLowerCase() ===
        section.sectionName.trim().toLowerCase();

      if (hideHeading) {
        cards.push(singleCard);
      } else {
        sections.push(section);
      }
    });

    return { cardsWithoutHeading: cards, sectionsWithHeading: sections };
  }, [orderedCategories]);


  useEffect(() => {
    const compute = () => setIsMobile(window.innerWidth < 1024);
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);



  useEffect(() => {
    if (!vendorId) return;
    if (ruleLoaded) return; // 🔥 prevents refetch

    const fetchVendorRule = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/loyalty/vendor-rule/${encodeURIComponent(vendorId)}`
        );

        if (!res.ok) {
          console.warn("No loyalty rule found for vendor yet");
          setExpiryDays(0);
          setPercentPer100(0);
          setEarnPoints(0);
          setLoyaltyEnabled(false);
          return;
        }

        const data = await res.json();


        if (data?.success && data?.data) {
          const enabled = data?.data?.isEnabled === true;
          setLoyaltyEnabled(enabled);

          if (enabled) {
            setPercentPer100(data?.data?.earn?.percentPer100 ?? 0);
            setExpiryDays(data?.data?.expiry?.expiryDays ?? 0);
          } else {
            setPercentPer100(0);
            setEarnPoints(0);
          }
        } else {
          setPercentPer100(0);
          setEarnPoints(0);
          setLoyaltyEnabled(false);
        }
      } catch (err) {
        console.error("Failed to load vendor rule", err);
        setPercentPer100(0);
        setEarnPoints(0);
        setLoyaltyEnabled(false);
      } finally {
        setRuleLoaded(true);
      }
    };

    fetchVendorRule();
  }, [vendorId, ruleLoaded]);

  useEffect(() => {
    // 🛑 DO NOT calculate until rule is loaded
    if (!ruleLoaded) {
      setEarnPoints(0);
      return;
    }

    if (!loyaltyEnabled || !percentPer100 || !cartTotal) {
      setEarnPoints(0);
      return;
    }

    const pts = Math.floor((cartTotal / 100) * percentPer100);
    setEarnPoints(pts);
  }, [cartTotal, percentPer100, ruleLoaded, loyaltyEnabled]);

  useEffect(() => {
    if (!customerMobile || customerMobile.length !== 10) return;
    if (!vendorId) return; // ✅ FIX

    const handle = setTimeout(() => {
      verifyCustomer(customerMobile);
    }, 500);

    return () => clearTimeout(handle);
  }, [customerMobile, vendorId]);

  /*
  const saveLoyaltyRule = async () => {
    if (!vendorId) return;

    try {
      setSavingRule(true);
      setSaveMessage("");
      const payload = {
        vendorId,
        categoryId: rootCategoryId,
        isEnabled,
        earn: {
          percentPer100,
        },
        expiry: {
          expiryDays,
        },
      };


      const res = await fetch(
        `${API_BASE_URL}/api/loyalty/vendor-rule`, {

        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("🔥 Loyalty save API error:", text);
        throw new Error("Failed to save loyalty rule");
      }

      setSaveMessage("Saved ✓");
    } catch (err) {
      console.error("Failed to save loyalty rule", err);
    } finally {
      setSavingRule(false);
    }
  };
  */

  async function fetchWallet(cId) {
    if (!cId || !vendorId) return;

    try {
      setLoyaltyLoaded(false);
      const res = await fetch(
        `${API_BASE_URL}/api/loyalty/wallet?vendorId=${vendorId}&customerId=${cId}`
      );

      const wallet = await res.json();
      if (wallet?.success) {
        setAvailablePoints(wallet?.availablePoints || 0);
        setLoyaltyLoaded(true);
      }
    } catch (err) {
      console.error("Wallet fetch failed", err);
      setLoyaltyLoaded(false);
    }
  }

  async function verifyCustomer(mobile) {
    if (!mobile || mobile.length !== 10) return;

    try {
      setVerifyingCustomer(true);
      setCheckingCustomer(true);
      setCustomerValidated(false);

      const bypassPayload = {
        countryCode: "91",
        phone: mobile,
      };

      const bypassRes = await fetch(
        `${API_BASE_URL}/api/customers/bypass-otp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bypassPayload),
        }
      );

      const bypassData = await bypassRes.json();
      const id = bypassData?.customer?._id || null;

      setCustomerId(id);
      setCustomerValidated(Boolean(id));
      if (id) {
        fetchWallet(id);
      }
    } catch (err) {
      console.error("Customer verification failed", err);
      setCustomerValidated(false);
    }

    setVerifyingCustomer(false);
    setCheckingCustomer(false);
  }

  const addToCart = (node, nodePath = [], categoryPathIds = []) => {
    setCartItems(prev => {
      const safePathIds = (categoryPathIds || []).filter(Boolean);
      const itemId = node._id || node.id || node.categoryId;
      const cartKey = node.cartKey || itemId;
      const categoryId = node.categoryId || node._id || node.id;
      const safeNodePath = Array.isArray(nodePath) && nodePath.length > 0
        ? nodePath
        : Array.isArray(node.nodePath)
          ? node.nodePath
          : [];
      const minQty = Math.max(1, Number(node.minQty) || 1);
      const stepQty = Math.max(1, Number(node.stepQty) || 1);
      const existing = prev.find(i => (i.cartKey || i.itemId) === cartKey);
      if (existing) {
        return prev.map(i => {
          if ((i.cartKey || i.itemId) !== cartKey) return i;
          const incrementBy = Math.max(1, Number(i.stepQty) || 1);
          const qty = i.qty + incrementBy;
          return { ...i, qty, total: i.price * qty };
        });
      }
      return [
        ...prev,
        {
          cartKey,
          itemId,
          categoryId,

          name: node.displayName || node.name,
          subtitle: node.subtitle || "",
          price: node.price,
          mrp: node.mrp ?? null,
          discountPercent: node.discountPercent ?? null,
          itemCode: node.itemCode || "",
          unitLabel: node.unitLabel || "",
          minQty,
          stepQty,
          isOrderable: node.isOrderable !== false,
          imageUrl: node.imageUrl || "",
          qty: minQty,
          total: (Number(node.price) || 0) * minQty,
          resourceId: null,
          resourceName: "",

          parentId: node.parentId || null,
          rootCategoryId: rootCategoryId || node.rootCategoryId || null,
          nodePath: safeNodePath,
          categoryPathIds: safePathIds.length ? safePathIds : [categoryId],
        },
      ];
    });
  };
  const clearCart = () => {
    setCartItems([]);
    setRedeemPoints(0);
    setDiscountAmount(0);
    setDiscountPercent(0);
    setAppliedDiscount(0);
    setDiscountMode(null);
  };

  const resetBillingState = () => {
    setCartItems([]);
    setCustomerId(null);
    setCustomerMobile("");
    setMobile("");
    setAvailablePoints(0);
    setRedeemPoints(0);
    setEarnPoints(0);
    setBillingId(null);
    setShowOtpInput(false);
    setOtp("");
    setDiscountAmount(0);
    setDiscountPercent(0);
    setAppliedDiscount(0);
    setDiscountMode(null);

    // optional safety
    localStorage.removeItem("ynot_cart");
  };

  useEffect(() => {
    // ONLY reset when switching vendor AND NOT in dashboard
    const prevVendorId = vendorIdRef.current;
    vendorIdRef.current = vendorId;

    if (!vendorId || prevVendorId === vendorId) return;

    const storedView = localStorage.getItem("viewMode");

    if (viewMode === "new-dashboard" || storedView === "new-dashboard") return;

    resetBillingState();
  }, [vendorId, viewMode]);
  useEffect(() => {
    console.log("VIEW MODE:", viewMode);
  }, [viewMode]);

  async function handleGenerateBill() {
    if (!vendorId || !cartItems.length) {
      alert("Cart is empty. Please add items.");
      return;
    }

    const vendorToken =
      typeof window !== "undefined"
        ? localStorage.getItem(`vendorToken:${vendorId}`)
        : null;

    if (!vendorToken) {
      setPendingAction("GENERATE_BILL");
      setShowVendorLogin(true);
      return;
    }

    const storedVendorId =
      typeof window !== "undefined"
        ? localStorage.getItem("vendorSessionVendorId")
        : null;

    if (storedVendorId !== String(vendorId)) {
      // Different vendor → force login
      setPendingAction("GENERATE_BILL");
      setShowVendorLogin(true);
      return;
    }

    try {
      setProcessingBill(true);

      // STEP 1 - Create billing session
      const createRes = await fetch(`${API_BASE_URL}/api/billing/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(vendorToken ? { Authorization: `Bearer ${vendorToken}` } : {}),
        },
        body: JSON.stringify({
          vendorId,
          customerId: customerId || null,
        }),
      });

      const createData = await createRes.json();
      if (!createData?.success) {
        alert(createData?.message || "Billing failed");
        return;
      }
      const newBillingId = createData?.data?._id;
      if (!newBillingId) {
        alert("Billing session failed");
        return;
      }
      setBillingId(newBillingId);

      // STEP 2 - Update cart with hierarchy fields
      const discountFactor =
        cartTotal > 0 ? (cartTotal - appliedDiscount) / cartTotal : 1;
      const billingCartItems = cartItems.map((item) => {
        const originalTotal =
          Number(item.total) ||
          Number(item.price) * Number(item.qty || 1);
        const discountedPrice = Math.round((item.price || 0) * discountFactor);


        return {
          itemId: item.itemId,
          categoryId: item.categoryId,
          name: item.name,
          price: discountedPrice,
          qty: Number(item.qty) || 1,
          total: discountedPrice * (item.qty || 1),
          resourceId: item.resourceId || null,
          resourceName: item.resourceName || "",
          parentId: item.parentId || null,
          rootCategoryId: item.rootCategoryId || null,
          nodePath: item.nodePath || [],
          categoryPathIds: item.categoryPathIds || [],
        };
      });
      const billingSubtotal = cartTotal;
      const billingDiscount = appliedDiscount;
      const billingFinalTotal = Math.max(billingSubtotal - billingDiscount, 0);
      const updateRes = await fetch(`${API_BASE_URL}/api/billing/update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(vendorToken ? { Authorization: `Bearer ${vendorToken}` } : {}),
        },
        body: JSON.stringify({
          billingId: newBillingId,
          cartItems: billingCartItems,
          grossAmount: billingSubtotal,
          discountAmount: billingDiscount,
        }),
      });

      const updateData = await updateRes.json().catch(() => null);
      if (!updateData?.success) {
        alert(updateData?.message || "Billing update failed");
        return;
      }

      if (redeemPoints > 0) {
        // STEP 3 - Request OTP for redemption
        const otpRes = await fetch(`${API_BASE_URL}/api/billing/request-otp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(vendorToken ? { Authorization: `Bearer ${vendorToken}` } : {}),
          },
          body: JSON.stringify({
            billingId: newBillingId,
            redeemPoints,
          }),
        });

        const otpData = await otpRes.json().catch(() => null);
        if (!otpRes.ok || !otpData?.success) {
          alert(otpData?.message || "OTP request failed");
          return;
        }

        setShowOtpInput(true);
        return;
      }

      // STEP 3 - Complete billing
      const completeRes = await fetch(`${API_BASE_URL}/api/billing/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(vendorToken ? { Authorization: `Bearer ${vendorToken}` } : {}),
        },
        body: JSON.stringify({
          billingId: newBillingId,
          paymentMode: "CASH",
        }),
      });

      const completeData = await completeRes.json().catch(() => null);
      if (!completeRes.ok || !completeData?.success) {
        alert(completeData?.message || "Billing completion failed");
        return;
      }

      const isWalkIn = !customerMobile;
      setBillType(isWalkIn ? "walkin" : "customer");
      setBillSuccessMessage(getWhatsAppBillingWarning(completeData));
      setMenuSearch("");
      setShowBillSuccess(true);
      resetBillingState();
    } catch (err) {
      console.error(err);
      alert("Server error while billing");
    } finally {
      setProcessingBill(false);
    }
  }



  const increaseQty = (cartKey) => {
    setCartItems(prev =>
      prev.map(i => {
        if ((i.cartKey || i.itemId) !== cartKey) return i;
        const incrementBy = Math.max(1, Number(i.stepQty) || 1);
        const qty = i.qty + incrementBy;
        return { ...i, qty, total: i.price * qty };
      })
    );
  };

  const openQuickActionMenu = () => {
    setViewMode("menu");
    setShowOptions(false);
  };

  const openQuickActionDashboard = () => {
    setShowOptions(false);
    const vendorToken =
      typeof window !== "undefined"
        ? localStorage.getItem(`vendorToken:${vendorId}`)
        : null;

    if (!vendorToken) {
      setPendingAction(null);
      setLoginAsAdmin(false);
      setShowAdminPasscode(false);
      setAdminPasscode("");
      setShowVendorOtp(false);
      setShowVendorLogin(true);
      return;
    }

    const storedVendorId =
      typeof window !== "undefined"
        ? localStorage.getItem("vendorSessionVendorId")
        : null;

    if (storedVendorId !== String(vendorId)) {
      setPendingAction(null);
      setLoginAsAdmin(false);
      setShowAdminPasscode(false);
      setAdminPasscode("");
      setShowVendorOtp(false);
      setShowVendorLogin(true);
      return;
    }

    setViewMode("new-dashboard");
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleAdminOpenMenu = () => openQuickActionMenu();
    const handleAdminOpenDashboard = () => openQuickActionDashboard();

    window.addEventListener(ADMIN_OPEN_MENU_EVENT, handleAdminOpenMenu);
    window.addEventListener(ADMIN_OPEN_DASHBOARD_EVENT, handleAdminOpenDashboard);

    return () => {
      window.removeEventListener(ADMIN_OPEN_MENU_EVENT, handleAdminOpenMenu);
      window.removeEventListener(ADMIN_OPEN_DASHBOARD_EVENT, handleAdminOpenDashboard);
    };
  }, [vendorId]);

  const decreaseQty = (cartKey) => {
    setCartItems(prev => {
      const item = prev.find(i => (i.cartKey || i.itemId) === cartKey);
      if (!item) return prev;
      const minQty = Math.max(1, Number(item.minQty) || 1);
      const stepQty = Math.max(1, Number(item.stepQty) || 1);
      if (item.qty > minQty) {
        return prev.map(i => {
          if ((i.cartKey || i.itemId) !== cartKey) return i;
          const qty = Math.max(minQty, i.qty - stepQty);
          return { ...i, qty, total: i.price * qty };
        });
      }
      return prev.filter(i => (i.cartKey || i.itemId) !== cartKey);
    });
  };

  const removeItem = (cartKey) => {
    setCartItems(prev => prev.filter(i => (i.cartKey || i.itemId) !== cartKey));
  };

  const updateItemStylist = (cartKey, resourceId) => {
    const resource = resources.find(r => String(r._id) === String(resourceId));

    setCartItems(prev =>
      prev.map(item =>
        (item.cartKey || item.itemId) === cartKey
          ? {
            ...item,
            resourceId: resourceId || null,
            resourceName: resource?.name || "",
          }
          : item
      )
    );
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const cartState = {
      vendorId: String(vendorId || ""),
      rootCategoryId: String(rootCategoryId || ""),
      cartItems,
      cartTotal,
    };

    window.__ynotCartState = cartState;
    window.dispatchEvent(
      new CustomEvent(CART_UPDATED_EVENT, {
        detail: cartState,
      })
    );
  }, [cartItems, cartTotal, rootCategoryId, vendorId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncVendorSessionState = () => {
      const resolvedVendorId = String(vendorId || "");
      const sessionVendorId = localStorage.getItem("vendorSessionVendorId");
      const vendorToken = resolvedVendorId
        ? localStorage.getItem(`vendorToken:${resolvedVendorId}`)
        : null;
      const isActive =
        Boolean(vendorToken) &&
        (!sessionVendorId || String(sessionVendorId) === resolvedVendorId);

      setHasActiveVendorSession(isActive);
    };

    syncVendorSessionState();
    window.addEventListener("storage", syncVendorSessionState);
    window.addEventListener("auth-changed", syncVendorSessionState);
    window.addEventListener("session-expired", syncVendorSessionState);
    window.addEventListener("focus", syncVendorSessionState);

    return () => {
      window.removeEventListener("storage", syncVendorSessionState);
      window.removeEventListener("auth-changed", syncVendorSessionState);
      window.removeEventListener("session-expired", syncVendorSessionState);
      window.removeEventListener("focus", syncVendorSessionState);
    };
  }, [vendorId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleFooterGalleryOpen = () => {
      setGalleryReadOnly(true);
      setServiceType("gallery");
      setOpenServices(true);
    };

    window.addEventListener(FOOTER_GALLERY_OPEN_EVENT, handleFooterGalleryOpen);
    return () => {
      window.removeEventListener(FOOTER_GALLERY_OPEN_EVENT, handleFooterGalleryOpen);
    };
  }, []);

  const handleClassicEnquiryAction = () => {
    if (typeof window === "undefined") return;

    setViewMode("preview");
    window.dispatchEvent(
      new CustomEvent(ENQUIRY_OPEN_EVENT, {
        detail: { source: "classic-cart" },
      })
    );

    const contactSection = document.getElementById("contact");
    contactSection?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (!Array.isArray(orderedCategories) || orderedCategories.length === 0) return;
    if (
      activeClassicCategory &&
      orderedCategories.some((section) => section?.sectionName === activeClassicCategory)
    ) {
      return;
    }
    setActiveClassicCategory(orderedCategories[0]?.sectionName || "");
  }, [activeClassicCategory, orderedCategories]);

  const menuClassForDepth = (depth, isLeaf = false) => {
    if (isLeaf) return "menu-leaf";
    if (depth === 0) return "menu-root";
    if (depth === 1) return "menu-category";
    return "menu-sub";
  };

  const filterActiveMenuTree = (nodes) => {
    if (!Array.isArray(nodes)) return [];

    return nodes.reduce((acc, node) => {
      if (!node || typeof node !== "object") return acc;

      const children = Array.isArray(node.children) ? node.children : [];
      const filteredChildren = filterActiveMenuTree(children);
      const isActiveLeaf =
        node.isLeaf &&
        node.pricingStatus === "Active" &&
        node.price !== undefined &&
        node.price !== null;

      if (isActiveLeaf) {
        acc.push({
          ...node,
          children: [],
        });
        return acc;
      }

      if (filteredChildren.length > 0) {
        acc.push({
          ...node,
          children: filteredChildren,
        });
      }

      return acc;
    }, []);
  };

  const collectPreviewSeoItemNames = (nodes, names = []) => {
    if (!Array.isArray(nodes)) return names;

    nodes.forEach((node) => {
      if (!node || typeof node !== "object") return;

      if (node.isLeaf) {
        const itemName = String(
          node.displayName ||
            node.title ||
            node.name ||
            node.label ||
            ""
        ).trim();
        if (itemName) names.push(itemName);
        return;
      }

      if (Array.isArray(node.children) && node.children.length > 0) {
        collectPreviewSeoItemNames(node.children, names);
      }
    });

    return names;
  };

  const collectPreviewSeoPathPhrases = (nodes, phrases = [], ancestors = []) => {
    if (!Array.isArray(nodes)) return phrases;

    nodes.forEach((node) => {
      if (!node || typeof node !== "object") return;

      const label = String(
        node.displayName ||
          node.title ||
          node.name ||
          node.label ||
          ""
      ).trim();
      const nextAncestors = label ? [...ancestors, label] : ancestors;
      const children = Array.isArray(node.children) ? node.children : [];

      if (node.isLeaf) {
        const parts = nextAncestors.filter(Boolean);
        if (parts.length > 0) {
          phrases.push(parts.join(" "));
        }
        return;
      }

      if (children.length > 0) {
        collectPreviewSeoPathPhrases(children, phrases, nextAncestors);
      }
    });

    return phrases;
  };

  const buildSectionSeoPhrase = (parts) => {
    const rawParts = Array.isArray(parts)
      ? parts
          .map((part) => String(part || "").trim())
          .filter(Boolean)
      : [];

    if (rawParts.length === 0) return "";

    const genericRoots = new Set([
      "packages",
      "package",
      "offers",
      "offer",
      "services",
      "service",
      "products",
      "product",
      "menu",
    ]);

    const deduped = [];
    const seen = new Set();

    rawParts.forEach((part, index) => {
      const key = part.toLowerCase();
      if (index === 0 && rawParts.length > 1 && genericRoots.has(key)) {
        return;
      }
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(part);
    });

    return deduped.join(" ");
  };

  const collectPreviewSeoPhrasesFromSections = (sections = [], phrases = []) => {
    if (!Array.isArray(sections)) return phrases;

    sections.forEach((section) => {
      const sectionName = String(section?.sectionName || "").trim();
      const cards = Array.isArray(section?.cards) ? section.cards : [];

      cards.forEach((card) => {
        const cardTitle = String(card?.title || "").trim();
        const options = Array.isArray(card?.options) ? card.options : [];

        if (card?.simple || options.length === 0) {
          const phrase = buildSectionSeoPhrase([sectionName, cardTitle]);
          if (phrase) phrases.push(phrase);
          return;
        }

        options.forEach((option) => {
          const optionLabel = String(option?.label || "").trim();
          const subOptions = Array.isArray(option?.subOptions) ? option.subOptions : [];

          if (subOptions.length === 0) {
            const phrase = buildSectionSeoPhrase([sectionName, cardTitle, optionLabel]);
            if (phrase) phrases.push(phrase);
            return;
          }

          subOptions.forEach((subOption) => {
            const subLabel = String(subOption?.label || "").trim();
            const subSubOptions = Array.isArray(subOption?.subSubOptions)
              ? subOption.subSubOptions
              : [];

            if (subSubOptions.length === 0) {
              const phrase = buildSectionSeoPhrase([
                sectionName,
                cardTitle,
                optionLabel,
                subLabel,
              ]);
              if (phrase) phrases.push(phrase);
              return;
            }

            subSubOptions.forEach((subSubOption) => {
              const subSubLabel = String(subSubOption?.label || "").trim();
              const phrase = buildSectionSeoPhrase([
                sectionName,
                cardTitle,
                optionLabel,
                subLabel,
                subSubLabel,
              ]);
              if (phrase) phrases.push(phrase);
            });
          });
        });
      });
    });

    return phrases;
  };

  const collectPreviewSeoGroupNames = (nodes, names = []) => {
    if (!Array.isArray(nodes)) return names;

    nodes.forEach((node) => {
      if (!node || typeof node !== "object") return;

      const children = Array.isArray(node.children) ? node.children : [];
      if (children.length > 0) {
        const groupName = String(
          node.displayName ||
            node.title ||
            node.name ||
            node.label ||
            ""
        ).trim();
        if (groupName) names.push(groupName);
        collectPreviewSeoGroupNames(children, names);
      }
    });

    return names;
  };

  const buildPreviewSeoData = (activeMenuTree, convertedSections, categoryObj) => {
    const sectionTitles = Array.isArray(convertedSections)
      ? convertedSections
          .map((section) => String(section?.sectionName || "").trim())
          .filter(Boolean)
      : [];
    const phraseNames = [
      ...collectPreviewSeoPhrasesFromSections(convertedSections, []),
      ...collectPreviewSeoPathPhrases(activeMenuTree, []),
    ];
    const groupNames = collectPreviewSeoGroupNames(activeMenuTree, []);
    const itemNames = collectPreviewSeoItemNames(activeMenuTree, []);

    return {
      categoryName: String(categoryObj?.name || "").trim(),
      phraseNames: Array.from(new Set(phraseNames)).slice(0, 60),
      groupNames: Array.from(new Set(groupNames)),
      sectionTitles: Array.from(new Set(sectionTitles)),
      itemNames: Array.from(new Set(itemNames)).slice(0, 40),
    };
  };

  const filterMenuNodes = (nodes, query) => {
    if (!Array.isArray(nodes)) return [];

    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return nodes;

    return nodes.reduce((acc, node) => {
      if (!node || typeof node !== "object") return acc;

      const name = String(node.name || node.title || "").toLowerCase();
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;

      const matchesSelf = name.includes(normalizedQuery);

      // 🔥 If parent matches → return FULL subtree (no filtering)
      if (matchesSelf) {
        acc.push(node);
        return acc;
      }

      // 🔍 Otherwise check children
      if (hasChildren) {
        const filteredChildren = filterMenuNodes(node.children, normalizedQuery);

        if (filteredChildren.length > 0) {
          acc.push({
            ...node,
            children: filteredChildren,
          });
        }
      }

      return acc;
    }, []);
  };

  const filteredMenuTree = useMemo(
    () => filterMenuNodes(menuTree, menuSearch),
    [menuTree, menuSearch]
  );

  const countLeafNodes = (nodes) => {
    if (!Array.isArray(nodes) || nodes.length === 0) return 0;

    return nodes.reduce((count, node) => {
      if (!node || typeof node !== "object") return count;
      const children = Array.isArray(node.children) ? node.children : [];

      if (children.length === 0 && node.price !== undefined && node.price !== null) {
        return count + 1;
      }

      return count + countLeafNodes(children);
    }, 0);
  };

  const isMenuNodeExpanded = (nodeKey, depth) => {
    if (menuSearch.trim()) return true;
    if (expandedMenuNodes[nodeKey] !== undefined) return expandedMenuNodes[nodeKey];
    return depth < 2;
  };

  const toggleMenuNode = (nodeKey, depth) => {
    setExpandedMenuNodes((prev) => ({
      ...prev,
      [nodeKey]: !(prev[nodeKey] ?? (depth < 2)),
    }));
  };

  const renderMenuNodes = (nodes, depth = 0, path = [], pathIds = []) => {
    if (!Array.isArray(nodes) || nodes.length === 0) return null;

    return nodes.map((node, idx) => {
      if (!node || typeof node !== "object") return null;

      const name = node.name || node.title || "Untitled";
      const newPath = [...path, name];
      const newPathIds = [...pathIds, node.categoryId || node._id];
      const nodeKey = newPathIds.filter(Boolean).join("_") || `${depth}-${name}-${idx}`;

      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const hasPrice = node.price !== undefined && node.price !== null;

      // Only render prices on leaf nodes
      if (!hasChildren && hasPrice) {
        const cls = menuClassForDepth(depth, true);
        return (
          <div
            key={`${depth}-leaf-${name}-${idx}`}
            className={`menu-tree-leaf-row menu-depth-indent-${Math.min(depth, 6)} ${cls}`}
          >
            <div className="menu-tree-leaf-copy">
              <div className="menu-tree-leaf-name">{name}</div>
              <div className="menu-tree-leaf-meta">
                {newPath.slice(0, -1).join(" / ")}
              </div>
            </div>
            <span className="menu-tree-leaf-price">₹ {node.price}</span>
            <button
              className="menu-tree-add-btn"
              type="button"
              onClick={() => addToCart(node, newPath, newPathIds)}
            >
              Add
            </button>
          </div>
        );
      }

      // Skip non-leaf nodes with no children
      if (!hasChildren) return null;

      const cls = menuClassForDepth(depth, false);
      const leafCount = countLeafNodes(node.children);
      const isExpanded = isMenuNodeExpanded(nodeKey, depth);

      return (
        <div
          key={`${depth}-node-${name}-${idx}`}
          className="menu-tree-node-block"
        >
          <button
            type="button"
            className={`menu-tree-heading menu-depth-heading-${Math.min(depth, 6)} ${cls} ${isExpanded ? "expanded" : "collapsed"}`}
            onClick={() => toggleMenuNode(nodeKey, depth)}
          >
            <span className="menu-tree-heading-copy">
              <span className="menu-tree-heading-title">{name}</span>
              <span className="menu-tree-heading-meta">
                {leafCount} service{leafCount === 1 ? "" : "s"}
              </span>
            </span>
            <span className="menu-tree-heading-toggle">{isExpanded ? "−" : "+"}</span>
          </button>
          {isExpanded ? (
            <div>{renderMenuNodes(node.children, depth + 1, newPath, newPathIds)}</div>
          ) : null}
        </div>
      );
    });
  };
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const previewCategory = useMemo(() => {
    if (!category && !hrCategory) return null;
    if (!category) return hrCategory;
    if (!hrCategory) return category;

    const categoryWebMenu = Array.isArray(category?.webMenu) ? category.webMenu : [];
    const hrWebMenu = Array.isArray(hrCategory?.webMenu) ? hrCategory.webMenu : [];

    return {
      ...hrCategory,
      ...category,
      webMenu: categoryWebMenu.length > 0 ? categoryWebMenu : hrWebMenu,
      enquiryConfig: category?.enquiryConfig || hrCategory?.enquiryConfig,
      homePopup: category?.homePopup || hrCategory?.homePopup,
    };
  }, [category, hrCategory]);
  const categoryHome = previewCategory?.homePopup || {};

  const heroTagline =
    vendorInfo?.customFields?.freeText1?.trim() ||
    categoryHome?.tagline?.trim() ||
    vendorInfo?.businessName ||
    previewCategory?.name ||
    "Premium Services";

  const heroDescription =
    vendorInfo?.customFields?.freeText2?.trim() ||
    categoryHome?.description?.trim() ||
    "We deliver quality services tailored for every customer.";

  const heroButton1 =
    categoryHome?.button1Label?.trim() || "Contact Us";

  const heroButton2 =
    categoryHome?.button2Label?.trim() || "";

  const vendorContactNumber = (() => {
    const raw =
      vendorInfo?.phone ||
      vendorInfo?.mobile ||
      vendorInfo?.businessPhone ||
      vendorInfo?.contactPhone ||
      "";
    const digits = String(raw).replace(/\D/g, "");
    if (!digits) return "";
    return digits.length === 10 ? `+91${digits}` : `+${digits}`;
  })();

  const handleHeroButton1Click = () => {
    if (heroButton1.trim().toLowerCase() !== "contact us") return;
    if (!vendorContactNumber) {
      window.alert("Vendor contact number is not available");
      return;
    }
    window.location.href = `tel:${vendorContactNumber}`;
  };

  useEffect(() => {
    const rule = vendorInfo?.loyaltyRule;
    if (!rule) return;

    const enabled = rule?.isEnabled === true;
    setLoyaltyEnabled(enabled);

    if (enabled) {
      setPercentPer100(rule?.earn?.percentPer100 ?? 0);
      setExpiryDays(rule?.expiry?.expiryDays ?? 0);
    } else {
      setPercentPer100(0);
      setEarnPoints(0);
    }

    setRuleLoaded(true);
  }, [vendorInfo?.loyaltyRule]);
  useEffect(() => {
    if (!discountMode) return;

    if (discountMode === "amount") {
      const safeAmount = Math.min(discountAmount, cartTotal);
      setAppliedDiscount(safeAmount);
    }

    if (discountMode === "percent") {
      const safePercent = Math.min(discountPercent, 100);
      const discount = Math.floor((cartTotal * safePercent) / 100);
      setAppliedDiscount(discount);
    }
  }, [cartTotal]);

  return (
    <>

      {
        showLogin && (
          <div className="login-overlay" onClick={closeLogin}>
            <div
              className="login-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="login-small">Log in</p>

              <h2 className="login-title">
                Welcome to {
                  vendorInfo?.businessName ||
                  vendorInfo?.name ||
                  "Our Service"
                }
              </h2>

              <p className="login-desc">
                {otpSent
                  ? "Enter the OTP sent to your phone"
                  : "Explore our services with a quick login."}
              </p>

              {/* ================= MOBILE INPUT ================= */}
              {!otpSent && (
                <div className="login-input-row">
                  <select
                    className="login-code"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                  >
                    <option value="91">IN +91</option>
                  </select>


                  <input
                    className="login-input"
                    placeholder="Mobile number"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                  />
                </div>
              )}

              {/* ================= OTP INPUT ================= */}
              {otpSent && (
                <input
                  className="login-input"
                  placeholder="Enter OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
              )}

              {/* ================= BUTTON ================= */}
              <button
                className="login-btn-main"
                onClick={!otpSent ? requestOtp : verifyOtp}
                disabled={loadingOtp}
              >
                {loadingOtp
                  ? "Please wait..."
                  : otpSent
                    ? "Verify OTP"
                    : "Continue"}
              </button>

              <button className="login-cancel" onClick={closeLogin}>
                Cancel
              </button>
            </div>
          </div>
        )

      }
      {/* ✅ HERO SECTION */}
      {showDiscountPopup && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3000,
          }}
          onClick={() => setShowDiscountPopup(false)}
        >
          <div
            style={{
              width: "min(90vw, 420px)",
              background: "#111",
              border: "1px solid #333",
              borderRadius: 10,
              padding: 16,
              color: "#fff",
              boxShadow: "0 12px 40px rgba(0, 0, 0, 0.4)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, marginBottom: 10, color: "#F5D97A" }}>
              Apply Discount
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="radio"
                  name="discountType"
                  value="amount"
                  checked={discountMode === "amount"}
                  onChange={() => {
                    setDiscountMode("amount");
                    setDiscountPercent(0);
                    setAppliedDiscount(0);
                  }}
                />
                Discount Amount
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="radio"
                  name="discountType"
                  value="percent"
                  checked={discountMode === "percent"}
                  onChange={() => {
                    setDiscountMode("percent");
                    setDiscountAmount(0);
                    setAppliedDiscount(0);
                  }}
                />
                Discount %
              </label>
            </div>
            {discountMode === "amount" && (
              <input
                type="number"
                placeholder="Enter discount amount"
                value={discountAmount || ""}
                min={0}
                max={cartTotal}
                onChange={(e) =>
                  setDiscountAmount(Math.max(Number(e.target.value) || 0, 0))
                }
                style={{
                  width: "100%",
                  background: "#111",
                  border: "1px solid #444",
                  padding: "10px",
                  borderRadius: "8px",
                  color: "#fff",
                  marginTop: "10px",
                }}
              />
            )}
            {discountMode === "percent" && (
              <input
                type="number"
                placeholder="Enter discount %"
                value={discountPercent || ""}
                min={0}
                max={100}
                onChange={(e) =>
                  setDiscountPercent(
                    Math.min(Math.max(Number(e.target.value) || 0, 0), 100)
                  )
                }
                style={{
                  width: "100%",
                  background: "#111",
                  border: "1px solid #444",
                  padding: "10px",
                  borderRadius: "8px",
                  color: "#fff",
                  marginTop: "10px",
                }}
              />
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                onClick={() => setShowDiscountPopup(false)}
                style={{
                  flex: 1,
                  background: "#222",
                  border: "1px solid #555",
                  padding: "10px",
                  borderRadius: "8px",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!discountMode) return;
                  applyDiscount();
                  setShowDiscountPopup(false);
                }}
                disabled={!discountMode}
                style={{
                  flex: 1,
                  background: discountMode ? "#222" : "#1a1a1a",
                  border: "1px solid #555",
                  padding: "10px",
                  borderRadius: "8px",
                  color: "#fff",
                  cursor: discountMode ? "pointer" : "not-allowed",
                  opacity: discountMode ? 1 : 0.6,
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
      {activeTemplateKey === "modern" || activeTemplateKey === "astrology" ? (
        <ModernPreviewTemplate
          vendorInfo={vendorInfo}
          category={previewCategory}
          enquiryConfig={previewCategory?.enquiryConfig || null}
          orderedCategories={orderedCategories}
          sectionsWithHeading={sectionsWithHeading}
          cardsWithoutHeading={cardsWithoutHeading}
          mergedHeroImages={mergedHeroImages}
          vendorGalleryImages={vendorGalleryImages}
          heroTagline={heroTagline}
          heroDescription={heroDescription}
          heroButton1={heroButton1}
          heroButton2={heroButton2}
          onPrimaryAction={handleHeroButton1Click}
          onOpenMenu={() => setViewMode("menu")}
          onOpenGallery={() => {
            setGalleryReadOnly(true);
            setServiceType("gallery");
            setOpenServices(true);
          }}
          cartItems={cartItems}
          cartTotal={cartTotal}
          onAddToCart={addToCart}
          onIncreaseQty={increaseQty}
          onDecreaseQty={decreaseQty}
          templateVariant={activeTemplateKey === "astrology" ? "astrology" : "modern"}
          colorScheme={vendorInfo?.modernColorScheme || "ivory"}
        />
      ) : activeTemplateKey === "catalog" ? (
        <CatalogPreviewTemplate
          vendorInfo={vendorInfo}
          category={previewCategory}
          orderedCategories={orderedCategories}
          sectionsWithHeading={sectionsWithHeading}
          cardsWithoutHeading={cardsWithoutHeading}
          mergedHeroImages={mergedHeroImages}
          heroTagline={heroTagline}
          heroDescription={heroDescription}
          onOpenMenu={() => setViewMode("menu")}
          onOpenGallery={() => {
            setGalleryReadOnly(true);
            setServiceType("gallery");
            setOpenServices(true);
          }}
          cartItems={cartItems}
          cartTotal={cartTotal}
          onAddToCart={addToCart}
          onIncreaseQty={increaseQty}
          onDecreaseQty={decreaseQty}
        />
      ) : activeTemplateKey === "nurseries" ? (
        <NurseriesPreviewTemplate
          vendorInfo={vendorInfo}
          category={previewCategory}
          orderedCategories={orderedCategories}
          sectionsWithHeading={sectionsWithHeading}
          cardsWithoutHeading={cardsWithoutHeading}
          mergedHeroImages={mergedHeroImages}
          heroTagline={heroTagline}
          heroDescription={heroDescription}
          cartItems={cartItems}
          cartTotal={cartTotal}
          onAddToCart={addToCart}
          onIncreaseQty={increaseQty}
          onDecreaseQty={decreaseQty}
          onOpenMenu={() => setViewMode("menu")}
          onOpenGallery={() => {
            setGalleryReadOnly(true);
            setServiceType("gallery");
            setOpenServices(true);
          }}
          hasVendorSession={hasActiveVendorSession}
          onLogout={vendorLogout}
          colorScheme={vendorInfo?.nurseryColorScheme || "forest"}
        />
      ) : activeTemplateKey === "ecommerce" ? (
        <EcommercePreviewTemplate
          vendorInfo={vendorInfo}
          category={previewCategory}
          menuTree={menuTree}
          mergedHeroImages={mergedHeroImages}
          heroTagline={heroTagline}
          heroDescription={heroDescription}
          cartItems={cartItems}
          cartTotal={cartTotal}
          onAddToCart={addToCart}
          onIncreaseQty={increaseQty}
          onDecreaseQty={decreaseQty}
          onClearCart={clearCart}
          showAdminMenu={showOptions}
          onToggleAdminMenu={() => setShowOptions((prev) => !prev)}
          onOpenAdminMenu={openQuickActionMenu}
          onOpenAdminDashboard={openQuickActionDashboard}
          onOpenAdmin={() => setShowOptions((prev) => !prev)}
        />
      ) : activeTemplateKey === "premium_light" ? (
        <PremiumLightPreviewTemplate
          vendorInfo={vendorInfo}
          category={previewCategory}
          orderedCategories={orderedCategories}
          sectionsWithHeading={sectionsWithHeading}
          cardsWithoutHeading={cardsWithoutHeading}
          mergedHeroImages={mergedHeroImages}
          heroTagline={heroTagline}
          heroDescription={heroDescription}
          onOpenGallery={() => {
            setGalleryReadOnly(true);
            setServiceType("gallery");
            setOpenServices(true);
          }}
          cartItems={cartItems}
          cartTotal={cartTotal}
          onAddToCart={addToCart}
          onIncreaseQty={increaseQty}
          onDecreaseQty={decreaseQty}
        />
      ) : (
        <>
          <HeroSection
            images={mergedHeroImages}

            // ⭐ GOOGLE (vendor API)
            googleRating={vendorInfo?.googlePlace?.rating}
            googleReviews={vendorInfo?.googlePlace?.userRatingsTotal}
            googleMapsUrl={vendorInfo?.googlePlace?.mapsUrl}

            // ⭐ TRUST
            trustSummary={vendorInfo?.trustSummary || vendorInfo?.trust}
            trustCategoryId={vendorInfo?.categoryId}


            // 🟢 CATEGORY (category API)
            tagline={heroTagline}
            description={heroDescription}
            button1Label={heroButton1}
            button2Label={heroButton2}
            onButton1Click={handleHeroButton1Click}
          />



          {/* ✅ EXISTING EXPLORE CONTENT */}
          <section
            id="categories"
            className={`women-styling theme-${String(vendorInfo?.classicColorScheme || "blackgold").trim().toLowerCase() || "blackgold"}`}
          >
            {/* CATEGORY NAVIGATION */}
            <div className="category-nav">
              {orderedCategories.map((section) => (
                <button
                  key={section.sectionName}
                  className={`category-nav-btn ${
                    activeClassicCategory === section.sectionName ? "is-active" : ""
                  }`}
                  onClick={() => {
                    setActiveClassicCategory(section.sectionName);
                    const el = document.getElementById(
                      `cat-${toAnchor(section.sectionName)}`
                    );
                    if (el) {
                      el.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }
                  }}
                >
                  {section.sectionName}
                </button>
              ))}
            </div>
            <div
              className={`explore-preview-layout ${!isMobile && cartItems.length > 0 ? "has-cart" : "no-cart"
                }`}
            >
              <div className="explore-preview-main">

                {/* 🔹 NORMAL SECTIONS */}
                {sectionsWithHeading.map(section => (
                  <div
                    key={section.sectionName}
                    id={`cat-${toAnchor(section.sectionName)}`}
                  >
                    <h2
                      id={`cat-${toAnchor(section.sectionName)}`}
                      className="ws-heading"
                    >
                      {section.sectionName}
                    </h2>

                    <div className="ws-grid">
                      {section.cards.map((c, index) => (
                        <ServiceCard
                          key={`${section.sectionName}-${c.id || c.title}-${index}`}
                          data={c}
                          sectionName={section.sectionName}
                          openLogin={openLogin}
                          addToCart={addToCart}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {/* 🔹 FLAT GRID (NO HEADINGS) */}
                {cardsWithoutHeading.length > 0 && (
                  <div className="ws-grid">
                    {cardsWithoutHeading.map((c, index) => (
                      <div key={`flat-${c.id || c.title}-${index}`} className="ws-card-wrapper">
                        <h2
                          id={`cat-${toAnchor(c.title)}`}
                          className="ws-heading small"
                        >
                          {c.title}
                        </h2>
                        <ServiceCard
                          key={c.id}
                          data={c}
                          sectionName={c.title}
                          openLogin={openLogin}
                          addToCart={addToCart}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {!isMobile && cartItems.length > 0 && (
                <aside className="explore-cart-sidebar">
                  <div className="explore-cart-widget">
                    <div className="explore-cart-widget-title">Selected Items</div>

                    {cartItems.map((item, index) => (
                      <div
                        key={`${item.cartKey || item.itemId || item.name}-${index}`}
                        className="explore-cart-widget-item"
                      >
                        <div className="explore-cart-widget-head">
                          <div className="explore-cart-widget-name">{item.name}</div>
                          <div className="explore-cart-widget-price">₹ {item.total}</div>
                        </div>

                        <div className="explore-cart-widget-controls">
                          <button
                            type="button"
                            className="explore-cart-widget-btn"
                            onClick={() => decreaseQty(item.cartKey || item.itemId)}
                          >
                            -
                          </button>
                          <span className="explore-cart-widget-qty">{item.qty}</span>
                          <button
                            type="button"
                            className="explore-cart-widget-btn"
                            onClick={() => increaseQty(item.cartKey || item.itemId)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}

                    {cartItems.length > 0 && (
                      <div className="explore-cart-cashback-card">
                        <div className="explore-cart-cashback-left">
                          <div className="explore-cart-cashback-icon">🛒</div>

                          <div className="explore-cart-cashback-text">
                            <div className="explore-cart-cashback-title">
                              Items added to cart
                            </div>

                            <div className="explore-cart-cashback-copy">
                              You have {cartItems.length} item(s)
                            </div>
                          </div>
                        </div>

                        <div className="explore-cart-cashback-actions">
                          {hasActiveVendorSession ? (
                            <button
                              className="explore-cart-go-btn"
                              onClick={() => setViewMode("menu")}
                            >
                              Go to Cart
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="explore-cart-login-btn"
                              onClick={handleClassicEnquiryAction}
                            >
                              Service Enquiry
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {cartItems.length > 0 && loyaltyEnabled && earnPoints > 0 && (
                      <div className="explore-cart-cashback-card">
                        🎉 You will earn {earnPoints} points
                      </div>
                    )}

                    <div className="explore-cart-widget-total">
                      <span>Total</span>
                      <span>₹ {cartTotal}</span>
                    </div>
                  </div>
                </aside>
              )}
            </div>
          </section>
          {isMobile && viewMode !== "menu" && cartItems.length > 0 && (
            <div
              className={`explore-mobile-cart-fab theme-${String(vendorInfo?.classicColorScheme || "blackgold").trim().toLowerCase() || "blackgold"}`}
            >
              <div className="explore-mobile-cart-summary">
                <span className="explore-mobile-cart-count">{cartItems.length}</span>
                <span className="explore-mobile-cart-label">Cart</span>
                <span className="explore-mobile-cart-total">₹ {cartTotal}</span>
              </div>
              <div className="explore-mobile-cart-items">
                {cartItems.map((item, index) => (
                  <div
                    key={`${item.cartKey || item.itemId || item.name}-${index}`}
                    className="explore-mobile-cart-pill"
                  >
                    <span className="explore-mobile-cart-pill-name">{item.name}</span>
                    <div className="explore-mobile-cart-pill-controls">
                      <button
                        type="button"
                        onClick={() => decreaseQty(item.cartKey || item.itemId)}
                        aria-label={`Decrease ${item.name}`}
                      >
                        -
                      </button>
                      <span>{item.qty}</span>
                      <button
                        type="button"
                        onClick={() => increaseQty(item.cartKey || item.itemId)}
                        aria-label={`Increase ${item.name}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {hasActiveVendorSession ? (
                <button
                  type="button"
                  className="explore-mobile-cart-action explore-mobile-cart-action-primary"
                  onClick={() => setViewMode("menu")}
                >
                  Go to Cart
                </button>
              ) : (
                <button
                  type="button"
                  className="explore-mobile-cart-action explore-mobile-cart-action-secondary"
                  onClick={handleClassicEnquiryAction}
                >
                  Service Enquiry
                </button>
              )}
            </div>
          )}
        </>
      )}
      {viewMode === "menu" && (
        <div>
          <div className="menuContainer">
            <div className="menu-overlay-shell">
              <div className="menu-overlay-header">
                <div className="menu-overlay-title">Menu</div>
                <div className="menu-overlay-actions">
                  {/* {hrCategory && hrCategory.enableHumanResources && (
                <ResourceButton
                  vendorId={vendorId}
                  label={hrCategory.humanResourceLabel || "Manage Resources"}
                  floating={false}
                  className="menu-overlay-resource-btn"
                />
              )} */}
                  <button
                    className="menu-overlay-close-btn"
                    type="button"
                    onClick={() => {
                      setMenuSearch("");
                      resetBillingState();
                      setViewMode("preview");
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="menu-overlay-layout">
                <div className={`menu-overlay-main ${isMobile ? "mobile" : "desktop"}`}>
                  <div className="menu-search-wrap">
                    <input
                      className="menu-search-input"
                      type="text"
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      placeholder="Search services..."
                    />
                  </div>
                  <div className="menu-toolbar">
                    <div className="menu-toolbar-copy">
                      <div className="menu-toolbar-title">Quick Billing Menu</div>
                      <div className="menu-toolbar-subtitle">
                        Search a service, open the matching section, and add it directly to cart.
                      </div>
                    </div>
                    <div className="menu-toolbar-summary">
                      <span>{countLeafNodes(filteredMenuTree)} services</span>
                      <span>{cartItems.length} in cart</span>
                    </div>
                  </div>
                  {filteredMenuTree.length === 0 ? (
                    <div className="menu-empty-search">
                      {menuSearch ? "No matching services found." : "No services available"}
                    </div>
                  ) : (
                    <div className="menu-tree-wrap">
                      {renderMenuNodes(
                        filteredMenuTree,
                        0,
                        [],
                        rootCategoryId ? [rootCategoryId] : []
                      )}
                    </div>
                  )}
                </div>
                {!isMobile && (
                  <div className="menu-cart-rail">
                    <div
                      className="menu-cart-panel"
                      style={{
                        width: "100%",
                        maxHeight: "75vh",
                        overflowY: "auto",
                        background: "rgba(12, 10, 8, 0.95)",
                        border: "1px solid rgba(245, 217, 122, 0.35)",
                        borderRadius: 10,
                        padding: "12px",
                        color: "#f3f3f3",
                      }}
                    >
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#F5D97A", marginBottom: 10 }}>
                        Cart
                      </div>
                      {cartItems.length === 0 ? (
                        <div style={{ color: "rgba(255,255,255,0.6)" }}>Empty</div>
                      ) : (
                        <>
                          {cartItems.map((item, index) => (
                            <div
                              key={`${item.cartKey || item.itemId || item.name}-${index}`}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 6,
                                marginBottom: 12,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                <span style={{ flex: 1 }}>
                                  {item.nodePath && item.nodePath.length
                                    ? item.nodePath.join(" - ")
                                    : item.name}
                                </span>
                                <span style={{ minWidth: 80, textAlign: "right" }}>
                                  ₹ {item.total}
                                </span>
                              </div>
                              {hrEnabled && item.resourceName ? (
                                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                                  {hrSelectorLabel}: {item.resourceName}
                                </div>
                              ) : null}
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ minWidth: 40, color: "rgba(255,255,255,0.8)" }}>
                                  x{item.qty}
                                </span>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button
                                    type="button"
                                    onClick={() => increaseQty(item.cartKey || item.itemId)}
                                    style={{
                                      width: 26,
                                      height: 26,
                                      borderRadius: 4,
                                      border: "1px solid rgba(245, 217, 122, 0.35)",
                                      background: "transparent",
                                      color: "#F5D97A",
                                      cursor: "pointer",
                                    }}
                                  >
                                    +
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => decreaseQty(item.cartKey || item.itemId)}
                                    style={{
                                      width: 26,
                                      height: 26,
                                      borderRadius: 4,
                                      border: "1px solid rgba(245, 217, 122, 0.35)",
                                      background: "transparent",
                                      color: "#F5D97A",
                                      cursor: "pointer",
                                    }}
                                  >
                                    -
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeItem(item.cartKey || item.itemId)}
                                    style={{
                                      width: 26,
                                      height: 26,
                                      borderRadius: 4,
                                      border: "1px solid rgba(245, 217, 122, 0.35)",
                                      background: "transparent",
                                      color: "#F5D97A",
                                      cursor: "pointer",
                                    }}
                                  >
                                    🗑
                                  </button>
                                </div>
                              </div>
                              {hrEnabled ? (
                              <div style={{ marginTop: 8 }}>
                                <div
                                  style={{
                                    fontSize: 13,
                                    color: "#F5D97A",
                                    fontWeight: 500,
                                    marginBottom: 4,
                                  }}
                                >
                                  {hrSelectorLabel}
                                </div>
                                <select
                                  value={item.resourceId || ""}
                                  onChange={(e) => updateItemStylist(item.cartKey || item.itemId, e.target.value)}
                                  style={{
                                    width: "100%",
                                    marginTop: 6,
                                    background: "#111",
                                    border: "1px solid #444",
                                    color: "#fff",
                                    padding: "8px",
                                    borderRadius: 6,
                                  }}
                                >
                                  <option value="">{hrSelectorPlaceholder}</option>
                                  {resources
                                    .filter((r) => r.status === "Active")
                                    .map((r) => (
                                      <option key={r._id} value={r._id}>
                                        {r.name}
                                      </option>
                                    ))}
                                </select>
                              </div>
                              ) : null}
                            </div>
                          ))}
                          <div
                            className="cart-total"
                            style={{
                              borderTop: "1px solid rgba(245, 217, 122, 0.25)",
                              paddingTop: 10,
                              marginTop: 8,
                              color: "#F5D97A",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                              <span>Subtotal</span>
                              <span>₹ {cartTotal}</span>
                            </div>
                            {appliedDiscount > 0 && (
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  fontWeight: 600,
                                  color: "rgba(245, 217, 122, 0.75)",
                                  marginTop: 4,
                                }}
                              >
                                <span>Discount</span>
                                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  -₹ {appliedDiscount}

                                </span>
                              </div>
                            )}
                            {appliedDiscount > 0 && (
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  fontWeight: 700,
                                  marginTop: 6,
                                }}
                              >
                                <span>Final Total</span>
                                <span>₹ {finalTotal}</span>
                              </div>
                            )}
                          </div>
                          {loyaltyEnabled && earnPoints > 0 && (
                            <div style={{ marginTop: 6 }}>
                              You will earn: {earnPoints} points
                            </div>
                          )}
                          {hasActiveVendorSession ? (
                            <>
                              <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
                                <button
                                  onClick={clearCart}
                                  style={{
                                    flex: 1,
                                    background: "#222",
                                    border: "1px solid #555",
                                    padding: "10px",
                                    borderRadius: "8px",
                                    color: "#fff",
                                    cursor: "pointer",
                                  }}
                                >
                                  Clear Cart
                                </button>
                                <button
                                  onClick={() => {
                                    if (appliedDiscount > 0) {
                                      setDiscountAmount(0);
                                      setDiscountPercent(0);
                                      setAppliedDiscount(0);
                                      setDiscountMode(null);
                                    } else {
                                      setShowDiscountPopup(true);
                                    }
                                  }}
                                  style={{
                                    flex: 1,
                                    background: appliedDiscount > 0 ? "#4a1a1a" : "#222",
                                    border: "1px solid #555",
                                    padding: "10px",
                                    borderRadius: "8px",
                                    color: "#fff",
                                    cursor: "pointer",
                                  }}
                                >
                                  {appliedDiscount > 0 ? "Clear Discount" : "Discount"}
                                </button>
                              </div>
                              <div
                                style={{
                                  borderTop: "1px solid #333",
                                  marginTop: "20px",
                                  paddingTop: "15px",
                                }}
                              >
                                <label style={{ color: "#e6c37a", fontSize: "14px" }}>
                                  Customer Mobile
                                </label>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    background: "#111",
                                    border: "1px solid #444",
                                    borderRadius: "8px",
                                    overflow: "hidden",
                                    marginTop: "6px",
                                    marginBottom: "10px",
                                  }}
                                >
                                  <div
                                    style={{
                                      padding: "10px 12px",
                                      borderRight: "1px solid #333",
                                      color: "#aaa",
                                      fontWeight: 500,
                                    }}
                                  >
                                    +91
                                  </div>
                                  <input
                                    value={customerMobile}
                                    onChange={(e) => setCustomerMobile(e.target.value)}
                                    placeholder="Enter mobile"
                                    style={{
                                      flex: 1,
                                      background: "transparent",
                                      border: "none",
                                      outline: "none",
                                      color: "#fff",
                                      padding: "10px",
                                    }}
                                  />
                                </div>
                                {loyaltyEnabled && (
                                  <>
                                    <div style={{ fontSize: "13px", color: "#aaa", marginTop: 6 }}>
                                      Available Points: {availablePoints}
                                    </div>
                                    {!customerMobile && (
                                      <div style={{ fontSize: "12px", color: "#facc15", marginTop: 6 }}>
                                        Walk-in billing — no loyalty points will be applied
                                      </div>
                                    )}
                                    {verifyingCustomer && (
                                      <div style={{ fontSize: "12px", color: "#999", marginTop: 6 }}>
                                        Checking customer...
                                      </div>
                                    )}
                                    {availablePoints > 0 && (
                                      <div style={{ marginTop: 8 }}>
                                        <div style={{ fontSize: "12px", color: "#aaa" }}>
                                          Redeem Points
                                        </div>
                                        <input
                                          type="number"
                                          value={redeemPoints}
                                          min={0}
                                          max={availablePoints}
                                          onChange={(e) => {
                                            const value = Number(e.target.value) || 0;
                                            const safeValue = Math.min(Math.max(value, 0), availablePoints);
                                            setRedeemPoints(safeValue);
                                          }}
                                          style={{
                                            width: "100%",
                                            background: "#111",
                                            border: "1px solid #444",
                                            padding: "10px",
                                            borderRadius: "8px",
                                            color: "#fff",
                                            marginTop: "6px",
                                          }}
                                        />
                                      </div>
                                    )}
                                    {showOtpInput && (
                                      <div style={{ marginTop: 10 }}>
                                        <input
                                          placeholder="Enter OTP"
                                          value={otp}
                                          onChange={(e) => setOtp(e.target.value)}
                                          style={{
                                            width: "100%",
                                            background: "#111",
                                            border: "1px solid #444",
                                            padding: "10px",
                                            borderRadius: "8px",
                                            color: "#fff",
                                          }}
                                        />
                                      </div>
                                    )}
                                    {showOtpInput && (
                                      <button
                                        onClick={handleVerifyOtp}
                                        disabled={verifyingOtp}
                                        style={{
                                          marginTop: "10px",
                                          width: "100%",
                                          background: "#222",
                                          border: "1px solid #555",
                                          padding: "10px",
                                          borderRadius: "8px",
                                          color: "#fff",
                                          cursor: verifyingOtp ? "not-allowed" : "pointer",
                                          opacity: verifyingOtp ? 0.7 : 1,
                                        }}
                                      >
                                        {verifyingOtp ? "Verifying..." : "Verify OTP"}
                                      </button>
                                    )}
                                  </>
                                )}
                                <button
                                  onClick={() => {
                                    const vendorToken =
                                      typeof window !== "undefined"
                                        ? localStorage.getItem(`vendorToken:${vendorId}`)
                                        : null;

                                    if (!vendorToken) {
                                      setPendingAction("GENERATE_BILL");
                                      setShowVendorLogin(true);
                                      return;
                                    }

                                    const storedVendorId =
                                      typeof window !== "undefined"
                                        ? localStorage.getItem("vendorSessionVendorId")
                                        : null;

                                    if (storedVendorId !== String(vendorId)) {
                                      setPendingAction("GENERATE_BILL");
                                      setShowVendorLogin(true);
                                      return;
                                    }

                                    handleGenerateBill();
                                  }}
                                  style={{
                                    marginTop: "14px",
                                    width: "100%",
                                    background: "#e6c37a",
                                    color: "#000",
                                    padding: "12px",
                                    borderRadius: "10px",
                                    fontWeight: "600",
                                    opacity: canGenerateBill ? 1 : 0.6,
                                    cursor:
                                      canGenerateBill ? "pointer" : "not-allowed",
                                  }}
                                  disabled={!canGenerateBill}
                                >
                                  {processingBill ? "Generating..." : "Generate Bill"}
                                </button>
                              </div>
                            </>
                          ) : (
                            <div
                              style={{
                                borderTop: "1px solid #333",
                                marginTop: "20px",
                                paddingTop: "15px",
                                display: "flex",
                                gap: "10px",
                              }}
                            >
                              <button
                                onClick={clearCart}
                                style={{
                                  flex: 1,
                                  background: "#222",
                                  border: "1px solid #555",
                                  padding: "10px",
                                  borderRadius: "8px",
                                  color: "#fff",
                                  cursor: "pointer",
                                }}
                              >
                                Clear Cart
                              </button>
                              <button
                                onClick={handleClassicEnquiryAction}
                                style={{
                                  flex: 1,
                                  background: "#e6c37a",
                                  border: "none",
                                  padding: "10px",
                                  borderRadius: "8px",
                                  color: "#000",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                Service Enquiry
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {isMobile && (
                <>
                  <div
                    className="menu-mobile-cart-pill"
                    onClick={() => setCartOpen(true)}
                    style={{
                      position: "fixed",
                      bottom: "20px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "#e6c37a",
                      color: "#000",
                      padding: "12px 20px",
                      borderRadius: "30px",
                      fontWeight: "600",
                      zIndex: 3000,
                      cursor: "pointer",
                    }}
                  >
                    Cart ({cartItems.length}) ₹{cartTotal}
                  </div>

                  {cartOpen && (
                    <div
                      className="menu-mobile-cart-sheet"
                      style={{
                        position: "fixed",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: "#0a0a0a",
                        borderTopLeftRadius: "20px",
                        borderTopRightRadius: "20px",
                        maxHeight: "70vh",
                        overflowY: "auto",
                        padding: "20px",
                        zIndex: 4000,
                      }}
                    >
                      <div className="menu-mobile-cart-head" style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                        <div className="menu-cart-title" style={{ fontSize: 16, fontWeight: 700, color: "#F5D97A" }}>
                          Cart
                        </div>
                        <button
                          className="menu-overlay-close-btn"
                          type="button"
                          onClick={() => {
                            setCartOpen(false);
                            setMenuSearch("");
                          }}
                          style={{
                            marginLeft: "auto",

                            border: "1px solid rgba(255,255,255,0.2)",
                            background: " linear-gradient(135deg, #e6bf6a, #cfa94e)",
                            color: " #0b0b0d",
                            padding: "6px 10px",
                            borderRadius: 6,
                            cursor: "pointer",
                          }}
                        >
                          Close
                        </button>
                      </div>
                      <div
                        style={{
                          background: "rgba(12, 10, 8, 0.95)",
                          border: "1px solid rgba(245, 217, 122, 0.35)",
                          borderRadius: 10,
                          padding: "12px",
                          color: "#f3f3f3",
                        }}
                      >
                        {cartItems.length === 0 ? (
                          <div style={{ color: "rgba(255,255,255,0.6)" }}>Empty</div>
                        ) : (
                          <>
                            {cartItems.map((item, index) => (
                              <div
                                key={`${item.cartKey || item.itemId || item.name}-${index}`}
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 6,
                                  marginBottom: 12,
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                  <span style={{ flex: 1 }}>
                                    {item.nodePath && item.nodePath.length
                                      ? item.nodePath.join(" - ")
                                      : item.name}
                                  </span>
                                  <span style={{ minWidth: 80, textAlign: "right" }}>
                                    ₹ {item.total}
                                  </span>
                                </div>
                                {hrEnabled && item.resourceName ? (
                                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                                    {hrSelectorLabel}: {item.resourceName}
                                  </div>
                                ) : null}
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ minWidth: 40, color: "rgba(255,255,255,0.8)" }}>
                                    x{item.qty}
                                  </span>
                                  <div style={{ display: "flex", gap: 6 }}>
                                    <button
                                      type="button"
                                      onClick={() => increaseQty(item.cartKey || item.itemId)}
                                      style={{
                                        width: 26,
                                        height: 26,
                                        borderRadius: 4,
                                        border: "1px solid rgba(245, 217, 122, 0.35)",
                                        background: "transparent",
                                        color: "#F5D97A",
                                        cursor: "pointer",
                                      }}
                                    >
                                      +
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => decreaseQty(item.cartKey || item.itemId)}
                                      style={{
                                        width: 26,
                                        height: 26,
                                        borderRadius: 4,
                                        border: "1px solid rgba(245, 217, 122, 0.35)",
                                        background: "transparent",
                                        color: "#F5D97A",
                                        cursor: "pointer",
                                      }}
                                    >
                                      -
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeItem(item.cartKey || item.itemId)}
                                      style={{
                                        width: 26,
                                        height: 26,
                                        borderRadius: 4,
                                        border: "1px solid rgba(245, 217, 122, 0.35)",
                                        background: "transparent",
                                        color: "#F5D97A",
                                        cursor: "pointer",
                                      }}
                                    >
                                      🗑
                                    </button>
                                  </div>
                                </div>
                                {hrEnabled ? (
                                <div style={{ marginTop: 8 }}>
                                  <div
                                    style={{
                                      fontSize: 13,
                                      color: "#F5D97A",
                                      fontWeight: 500,
                                      marginBottom: 4,
                                    }}
                                  >
                                    {hrSelectorLabel}
                                  </div>
                                  <select
                                    value={item.resourceId || ""}
                                    onChange={(e) => updateItemStylist(item.cartKey || item.itemId, e.target.value)}
                                    style={{
                                      width: "100%",
                                      marginTop: 6,
                                      background: "#111",
                                      border: "1px solid #444",
                                      color: "#fff",
                                      padding: "8px",
                                      borderRadius: 6,
                                    }}
                                  >
                                    <option value="">{hrSelectorPlaceholder}</option>
                                    {resources
                                      .filter((r) => r.status === "Active")
                                      .map((r) => (
                                        <option key={r._id} value={r._id}>
                                          {r.name}
                                        </option>
                                      ))}
                                  </select>
                                </div>
                                ) : null}
                              </div>
                            ))}
                            <div
                              className="cart-total"
                              style={{
                                borderTop: "1px solid rgba(245, 217, 122, 0.25)",
                                paddingTop: 10,
                                marginTop: 8,
                                color: "#F5D97A",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                                <span>Subtotal</span>
                                <span>₹ {cartTotal}</span>
                              </div>
                              {appliedDiscount > 0 && (
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    fontWeight: 600,
                                    color: "rgba(245, 217, 122, 0.75)",
                                    marginTop: 4,
                                  }}
                                >
                                  <span>Discount</span>
                                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    -₹ {appliedDiscount}

                                  </span>
                                </div>
                              )}
                              {appliedDiscount > 0 && (
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    fontWeight: 700,
                                    marginTop: 6,
                                  }}
                                >
                                  <span>Final Total</span>
                                  <span>₹ {finalTotal}</span>
                                </div>
                              )}
                            </div>
                            {loyaltyEnabled && earnPoints > 0 && (
                              <div style={{ marginTop: 6 }}>
                                You will earn: {earnPoints} points
                              </div>
                            )}
                            {hasActiveVendorSession ? (
                              <>
                                <div style={{ marginTop: "10px", display: "flex", gap: 10 }}>
                                  <button
                                    onClick={clearCart}
                                    style={{
                                      flex: 1,
                                      background: "#222",
                                      border: "1px solid #555",
                                      padding: "10px",
                                      borderRadius: "8px",
                                      color: "#fff",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Clear Cart
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (appliedDiscount > 0) {
                                        setDiscountAmount(0);
                                        setDiscountPercent(0);
                                        setAppliedDiscount(0);
                                        setDiscountMode(null);
                                      } else {
                                        setShowDiscountPopup(true);
                                      }
                                    }}
                                    style={{
                                      flex: 1,
                                      background: appliedDiscount > 0 ? "#4a1a1a" : "#222",
                                      border: "1px solid #555",
                                      padding: "10px",
                                      borderRadius: "8px",
                                      color: "#fff",
                                      cursor: "pointer",
                                    }}
                                  >
                                    {appliedDiscount > 0 ? "Clear Discount" : "Discount"}
                                  </button>
                                </div>
                                <div
                                  style={{
                                    borderTop: "1px solid #333",
                                    marginTop: "20px",
                                    paddingTop: "15px",
                                  }}
                                >
                                  <label style={{ color: "#e6c37a", fontSize: "14px" }}>
                                    Customer Mobile
                                  </label>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      background: "#111",
                                      border: "1px solid #444",
                                      borderRadius: "8px",
                                      overflow: "hidden",
                                      marginTop: "6px",
                                      marginBottom: "10px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        padding: "10px 12px",
                                        borderRight: "1px solid #333",
                                        color: "#aaa",
                                        fontWeight: 500,
                                      }}
                                    >
                                      +91
                                    </div>
                                    <input
                                      value={customerMobile}
                                      onChange={(e) => setCustomerMobile(e.target.value)}
                                      placeholder="Enter mobile"
                                      style={{
                                        flex: 1,
                                        background: "transparent",
                                        border: "none",
                                        outline: "none",
                                        color: "#fff",
                                        padding: "10px",
                                      }}
                                    />
                                  </div>
                                  {loyaltyEnabled && (
                                    <>
                                      <div style={{ fontSize: "13px", color: "#aaa" }}>
                                        Available Points: {availablePoints}
                                      </div>
                                      {!customerMobile && (
                                        <div style={{ fontSize: "12px", color: "#facc15", marginTop: 6 }}>
                                          Walk-in billing — no loyalty points will be applied
                                        </div>
                                      )}
                                      {verifyingCustomer && (
                                        <div style={{ fontSize: "12px", color: "#999", marginTop: 6 }}>
                                          Checking customer...
                                        </div>
                                      )}
                                      {availablePoints > 0 && (
                                        <div style={{ marginTop: 8 }}>
                                          <div style={{ fontSize: "12px", color: "#aaa" }}>
                                            Redeem Points
                                          </div>
                                          <input
                                            type="number"
                                            value={redeemPoints}
                                            min={0}
                                            max={availablePoints}
                                            onChange={(e) => setRedeemPoints(Number(e.target.value))}
                                            style={{
                                              width: "100%",
                                              background: "#111",
                                              border: "1px solid #444",
                                              padding: "10px",
                                              borderRadius: "8px",
                                              color: "#fff",
                                              marginTop: "6px",
                                            }}
                                          />
                                        </div>
                                      )}
                                      {showOtpInput && (
                                        <div style={{ marginTop: 10 }}>
                                          <input
                                            placeholder="Enter OTP"
                                            value={otp}
                                            onChange={(e) => setOtp(e.target.value)}
                                            style={{
                                              width: "100%",
                                              background: "#111",
                                              border: "1px solid #444",
                                              padding: "10px",
                                              borderRadius: "8px",
                                              color: "#fff",
                                            }}
                                          />
                                        </div>
                                      )}
                                      {showOtpInput && (
                                        <button
                                          onClick={handleVerifyOtp}
                                          disabled={verifyingOtp}
                                          style={{
                                            marginTop: "10px",
                                            width: "100%",
                                            background: "#222",
                                            border: "1px solid #555",
                                            padding: "10px",
                                            borderRadius: "8px",
                                            color: "#fff",
                                            cursor: verifyingOtp ? "not-allowed" : "pointer",
                                            opacity: verifyingOtp ? 0.7 : 1,
                                          }}
                                        >
                                          {verifyingOtp ? "Verifying..." : "Verify OTP"}
                                        </button>
                                      )}
                                    </>
                                  )}
                                  <button
                                    onClick={() => {
                                      const vendorToken =
                                        typeof window !== "undefined"
                                          ? localStorage.getItem(`vendorToken:${vendorId}`)
                                          : null;

                                      if (!vendorToken) {
                                        setPendingAction("GENERATE_BILL");
                                        setShowVendorLogin(true);
                                        return;
                                      }

                                      const storedVendorId =
                                        typeof window !== "undefined"
                                          ? localStorage.getItem("vendorSessionVendorId")
                                          : null;

                                      if (storedVendorId !== String(vendorId)) {
                                        setPendingAction("GENERATE_BILL");
                                        setShowVendorLogin(true);
                                        return;
                                      }

                                      handleGenerateBill();
                                    }}
                                    style={{
                                      marginTop: "14px",
                                      width: "100%",
                                      background: "#e6c37a",
                                      color: "#000",
                                      padding: "12px",
                                      borderRadius: "10px",
                                      fontWeight: "600",
                                      opacity: canGenerateBill ? 1 : 0.6,
                                      cursor: canGenerateBill ? "pointer" : "not-allowed",
                                    }}
                                    disabled={!canGenerateBill}
                                  >
                                    {processingBill ? "Generating..." : "Generate Bill"}
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div style={{ marginTop: "10px", display: "flex", gap: 10 }}>
                                <button
                                  onClick={clearCart}
                                  style={{
                                    flex: 1,
                                    background: "#222",
                                    border: "1px solid #555",
                                    padding: "10px",
                                    borderRadius: "8px",
                                    color: "#fff",
                                    cursor: "pointer",
                                  }}
                                >
                                  Clear Cart
                                </button>
                                <button
                                  onClick={handleClassicEnquiryAction}
                                  style={{
                                    flex: 1,
                                    background: "#e6c37a",
                                    border: "1px solid #e6c37a",
                                    padding: "10px",
                                    borderRadius: "8px",
                                    color: "#000",
                                    fontWeight: "600",
                                    cursor: "pointer",
                                  }}
                                >
                                  Service Enquiry
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {viewMode === "loyalty" && (
        <LoyaltySettings
          vendorId={vendorId}
          rootCategoryId={rootCategoryId}
          onBack={() => setViewMode("new-dashboard")}
        />
      )}

      {false && viewMode === "loyalty" && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "#111",
            color: "#fff",
            padding: 16,
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            maxHeight: "85vh",
            overflowY: "auto",
            zIndex: 9999,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
            Loyalty Program Settings
          </div>

          {loadingRule ? (
            <div style={{ fontSize: 14, color: "#ccc", marginBottom: 12 }}>
              Loading...
            </div>
          ) : null}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <label style={{ fontWeight: 600 }}>Enabled</label>
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>Earn Percentage</div>
            <input
              type="number"
              value={percentPer100}
              onChange={(e) => setPercentPer100(Number(e.target.value))}
              style={{
                width: "100%",
                background: "#0b0b0b",
                border: "1px solid #333",
                color: "#fff",
                padding: "10px",
                borderRadius: 8,
              }}
            />
            <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>
              % points per ₹100 spent
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>Expiry Days</div>
            <input
              type="number"
              value={expiryDays}
              onChange={(e) => setExpiryDays(Number(e.target.value))}
              style={{
                width: "100%",
                background: "#0b0b0b",
                border: "1px solid #333",
                color: "#fff",
                padding: "10px",
                borderRadius: 8,
              }}
            />
            <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>
              Points expiry (days)
            </div>
          </div>

          {saveMessage && (
            <div style={{ fontSize: 12, color: "#7fe3a2", marginBottom: 8 }}>
              {saveMessage}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={saveLoyaltyRule}
              disabled={savingRule}
              style={{
                flex: 1,
                background: "#e6c37a",
                color: "#000",
                padding: "10px",
                borderRadius: 10,
                fontWeight: 600,
                border: "none",
                cursor: savingRule ? "not-allowed" : "pointer",
                opacity: savingRule ? 0.7 : 1,
              }}
            >
              {savingRule ? "Saving..." : "Save Settings"}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("menu")}
              style={{
                flex: 1,
                background: "#222",
                color: "#fff",
                padding: "10px",
                borderRadius: 10,
                fontWeight: 600,
                border: "1px solid #333",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {viewMode === "new-dashboard" && (
        <div className="new-dashboard-overlay">
          <div className="new-dashboard-shell">
            {renderDashboardHeader("Dashboard", () => setViewMode("preview"))}

            <div className="new-dashboard-grid">
              <div
                className="new-dashboard-card new-dashboard-card-action"
                onClick={() => {
                  setViewMode("profile-dashboard");
                }}
              >
                <div className="new-dashboard-card-title">
                  Profile
                </div>
                <div className="new-dashboard-card-desc">
                  Open profile management cards.
                </div>
              </div>
              {[
                {
                  title: "Prices",
                  description:
                    vendorInfo?.pricingSource === "self_managed"
                      ? "Review your uploaded menu hierarchy and active pricing."
                      : "Review service rates and pricing updates.",
                  onClick: () => handleOpenServices("packages"),
                },
                {
                  title: "Revenues",
                  description: "Track sales, billing totals, and earnings.",
                  onClick: () => {
                    setActiveRevenueTab("today");
                    setViewMode("revenue-dashboard");
                  },
                },
                ...(hrEnabled
                  ? [{
                      title: hrDashboardTitle,
                      description: hrDashboardDescription,
                      onClick: () => {
                        setViewMode("stylists-dashboard");
                      },
                    }]
                  : []),
                {
                  title: "Loyalty",
                  description: "Configure loyalty rules, earning, and expiry settings.",
                  onClick: () => {
                    setViewMode("loyalty");
                  },
                },
                {
                  title: "Enquiries",
                  description: "Review recent and past enquiries, inspect details, and call customers back.",
                  onClick: () => {
                    setViewMode("enquiries-dashboard");
                  },
                },
                {
                  title: "Manage My WhatsApp Business",
                  description: "Manage WhatsApp Business setup, messaging, and customer communication.",
                  onClick: () => {
                    setViewMode("whatsapp-business-dashboard");
                  },
                },
                {
                  title: "Website Analytics",
                  description: "Check visitors, CTA clicks, enquiries, and traffic sources.",
                  onClick: () => {
                    setViewMode("website-analytics-dashboard");
                  },
                },
                {
                  title: "Subscription",
                  description: "Manage your subscription plan and billing.",
                  onClick: () => {
                    setViewMode("subscription-dashboard");
                  },
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className={`new-dashboard-card ${card.onClick ? "new-dashboard-card-action" : ""}`}
                  onClick={card.onClick}
                  role={card.onClick ? "button" : undefined}
                  tabIndex={card.onClick ? 0 : undefined}
                  onKeyDown={
                    card.onClick
                      ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          card.onClick();
                        }
                      }
                      : undefined
                  }
                >
                  <div className="new-dashboard-card-title">
                    {card.title}
                  </div>
                  <div className="new-dashboard-card-desc">
                    {card.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {showInvalidMobilePopup && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setShowInvalidMobilePopup(false)}
        >
          <div
            style={{
              background: "#111",
              color: "#fff",
              padding: "20px",
              borderRadius: "12px",
              width: "90%",
              maxWidth: "360px",
              textAlign: "center",
              border: "1px solid #444",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: "18px", fontWeight: 600, marginBottom: "10px" }}>
              Invalid Mobile Number
            </div>

            <div style={{ fontSize: "14px", color: "#ccc", marginBottom: "20px" }}>
              Please enter a valid 10-digit mobile number.
            </div>

            <button
              onClick={() => setShowInvalidMobilePopup(false)}
              style={{
                width: "100%",
                padding: "10px",
                background: "#e6c37a",
                color: "#000",
                borderRadius: "8px",
                border: "none",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {viewMode === "profile-dashboard" && (
        <div className="new-dashboard-overlay">
          <div className="new-dashboard-shell">
            {renderDashboardHeader("Profile Dashboard", () => setViewMode("new-dashboard"))}

            <ProfileDashboard
              vendorInfo={vendorInfo}
              categorySocials={hrCategory?.socialHandle ?? null}
              onOpenServices={handleOpenServices}
            />
          </div>
        </div>
      )}

      {viewMode === "revenue-dashboard" && (
        <div className="new-dashboard-overlay">
          <div className="new-dashboard-shell">
            {renderDashboardHeader("Revenue Dashboard", () => setViewMode("new-dashboard"))}

            <div className="new-dashboard-grid">
              {[
                {
                  title: "Today's Revenue",
                  description: "Check the total revenue collected for today.",
                  key: "today",
                },
                {
                  title: "This Month Revenue",
                  description: "Review the running revenue total for this month.",
                  key: "month",
                },
                {
                  title: "Last 12 Months Revenue",
                  description: "Track rolling monthly revenue trends.",
                  key: "year",
                },
                {
                  title: "Customer Search",
                  description: "Find customers and inspect their billing history.",
                  key: "customer",
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className={`new-dashboard-card new-dashboard-card-action ${activeRevenueTab === card.key ? "active" : ""
                    }`}
                  onClick={() => setActiveRevenueTab(card.key)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setActiveRevenueTab(card.key);
                    }
                  }}
                >
                  <div className="new-dashboard-card-title">
                    {card.title}
                  </div>
                  <div className="new-dashboard-card-desc">
                    {card.description}
                  </div>
                </div>
              ))}
            </div>

            {activeRevenueTab && (
              <div className="revenue-data-container">
                {activeRevenueTab === "today" && (
                  <TodayRevenue
                    vendorId={vendorId}
                    embedded
                    hrEnabled={hrEnabled}
                    hrLabelSingular={hrSingularLabel}
                    hrPerformanceTitle={hrPerformanceTitle}
                  />
                )}

                {activeRevenueTab === "month" && (
                  <MonthRevenue
                    vendorId={vendorId}
                    hrEnabled={hrEnabled}
                    hrLabelSingular={hrSingularLabel}
                    hrPerformanceTitle={hrPerformanceTitle}
                  />
                )}

                {activeRevenueTab === "year" && (
                  <YearRevenue
                    vendorId={vendorId}
                    hrEnabled={hrEnabled}
                    hrLabelSingular={hrSingularLabel}
                    hrPerformanceTitle={hrPerformanceTitle}
                  />
                )}

                {activeRevenueTab === "customer" && (
                  <CustomerSearch vendorId={vendorId} />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {viewMode === "stylists-dashboard" && hrEnabled && (
        <div className="new-dashboard-overlay">
          <div className="new-dashboard-shell">
            {renderDashboardHeader(hrDashboardTitle, () => setViewMode("new-dashboard"))}

            <MyStylists
              vendorId={vendorId}
              resourceLabelPlural={hrPluralLabel}
              resourceLabelSingular={hrSingularLabel}
            />
          </div>
        </div>
      )}
      {viewMode === "website-analytics-dashboard" && (
        <div className="new-dashboard-overlay">
          <div className="new-dashboard-shell">
            {renderDashboardHeader("Website Analytics", () => setViewMode("new-dashboard"))}

            <WebsiteAnalyticsDashboard vendorId={vendorId} />
          </div>
        </div>
      )}
      {viewMode === "subscription-dashboard" && (
        <div className="new-dashboard-overlay">
          <div className="new-dashboard-shell">
            {renderDashboardHeader("Subscription", () => setViewMode("new-dashboard"))}

            <SubscriptionDashboard
              vendorId={vendorId}
            />

          </div>
        </div>
      )}

      {viewMode === "whatsapp-business-dashboard" && (
        <div className="new-dashboard-overlay">
          <div className="new-dashboard-shell">
            {renderDashboardHeader("Manage My WhatsApp Business", () => setViewMode("new-dashboard"))}

            <WhatsappBusinessDashboard vendorId={vendorId} />
          </div>
        </div>
      )}

      {viewMode === "enquiries-dashboard" && (
        <div className="new-dashboard-overlay">
          <div className="new-dashboard-shell">
            {renderDashboardHeader("Enquiries", () => setViewMode("new-dashboard"))}

            <EnquiriesDashboard
              vendorId={vendorId}
              categoryId={rootCategoryId}
            />
          </div>
        </div>
      )}

      {openServices && serviceType === "packages" && (
        <PackagesPortal
          onLoaded={() => setServiceLoading(false)}
          onPricingUpdated={() => setPricingRefreshNonce((prev) => prev + 1)}
          onClose={() => {
            setOpenServices(false);
            setServiceType(null);
            setServiceLoading(false);
          }}
        />
      )}

      {openServices && serviceType === "gallery" && (
        <VendorGalleryModal
          vendorId={vendorId}
          rowId={galleryRowId}
          readOnly={galleryReadOnly}
          onClose={() => {
            setOpenServices(false);
            setServiceType(null);
            setServiceLoading(false);
            setGalleryReadOnly(true);
          }}
        />
      )}

      {serviceLoading && (
        <div className="profile-loader-overlay">
          <div className="profile-loader-spinner" />
        </div>
      )}

      {subscriptionPopup && (
        <div className="subscription-expiry-overlay">
          <div className="subscription-expiry-modal">
            <div className="subscription-expiry-badge">
              {subscriptionPopup.type === "expired" ? "Expired" : "Reminder"}
            </div>
            <h3 className="subscription-expiry-title">
              {subscriptionPopup.type === "expired"
                ? "Subscription expired"
                : "Subscription expiring soon"}
            </h3>
            <p className="subscription-expiry-text">
              {subscriptionPopupMessage}
            </p>
            {subscriptionPopup.type === "warning" && (
              <button
                type="button"
                className="subscription-expiry-close"
                onClick={closeSubscriptionPopup}
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}

      {showVendorLogin && (
        <div
          className="login-overlay vendor-login-overlay"
          onClick={() => {
            setShowVendorLogin(false);
            setLoginAsAdmin(false);   // ✅ reset
            setShowAdminPasscode(false);
            setAdminPasscode("");
            setPendingAction(null);
          }}
        >


          <div
            className="login-modal vendor-login-modal"
            onClick={(e) => e.stopPropagation()}
          >

            <h3 className="vendor-login-title">Vendor Login</h3>

            {/* ADMIN PASSCODE SCREEN */}
            {showAdminPasscode ? (
              <>
                <input
                  className="login-input vendor-login-input"
                  placeholder="Enter Admin Passcode"
                  value={adminPasscode}
                  onChange={(e) => setAdminPasscode(e.target.value)}
                />

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <button
                    className="login-btn-secondary vendor-login-btn vendor-login-btn-secondary"
                    onClick={() => {
                      setShowAdminPasscode(false);
                      setLoginAsAdmin(false);
                      setAdminPasscode("");
                    }}
                  >
                    Back
                  </button>

                  <button
                    className="login-btn-main vendor-login-btn vendor-login-btn-primary"
                    onClick={verifyAdminPasscode}
                  >
                    Next
                  </button>
                </div>
              </>
            ) : !showVendorOtp ? (

              <>

                <div className="login-input-row">
                  <select
                    className="login-code"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                  >
                    <option value="91">IN +91</option>
                  </select>

                  <input
                    placeholder="Enter mobile number"
                    value={vendorMobile}
                    onChange={(e) => setVendorMobile(e.target.value)}
                    className="login-input vendor-login-input"
                  />
                </div>

                <label className="vendor-login-checkbox">
                  <input
                    type="checkbox"
                    checked={loginAsAdmin}
                    onChange={(e) => {
                      const checked = e.target.checked;

                      setLoginAsAdmin(checked);

                      if (checked) {
                        setVendorMobile("");       // clear mobile
                        setShowAdminPasscode(true);
                        setShowVendorOtp(false);
                      } else {
                        setShowAdminPasscode(false);
                        setAdminPasscode("");
                        setShowVendorOtp(false);
                      }
                    }}
                  />
                  Login as Admin
                </label>

                <button
                  className="login-btn-main vendor-login-btn vendor-login-btn-primary"
                  onClick={handleVendorLogin}
                  disabled={loginAsAdmin}
                >
                  Continue
                </button>
              </>

            ) : (

              <>
                <input
                  placeholder="Enter OTP"
                  value={vendorOtp}
                  onChange={(e) => setVendorOtp(e.target.value)}
                  className="login-input vendor-login-input"
                />

                <button
                  className="login-btn-main vendor-login-btn vendor-login-btn-primary"
                  onClick={verifyVendorOtp}
                >
                  Verify OTP
                </button>
              </>
            )}

          </div>
        </div>
      )}
      {showBillSuccess && (
        <div className="bill-success-overlay">
          <div className="bill-success-modal">
            <div className="bill-success-icon">✓</div>
            <div className="bill-success-title">Bill Generated</div>
            <div className="bill-success-text">
              {billSuccessMessage ||
                (billType === "walkin"
                  ? "Walk-in bill generated successfully."
                  : "Customer bill generated successfully.")}
            </div>
            <button
              className="bill-success-btn"
              onClick={() => {
                setShowBillSuccess(false);
                setBillSuccessMessage("");
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {showSessionExpiredPopup && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: 16,
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              background: "#fff8e6", // soft gold background
              color: "#1a1a1a",
              borderRadius: 16,
              padding: "24px",
              maxWidth: 420,
              width: "100%",
              boxShadow: "0 25px 60px rgba(0,0,0,0.3)",
              border: "1px solid rgba(230,195,122,0.6)",
              textAlign: "center",
              animation: "fadeInScale 0.25s ease",
            }}
          >
            {/* Title */}
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                marginBottom: 10,
                color: "#b88a2b",
              }}
            >
              Session Expired
            </div>

            {/* Message */}
            <div
              style={{
                fontSize: 14,
                marginBottom: 20,
                lineHeight: 1.6,
                color: "#333",
              }}
            >
              Your session has ended. Please log in again to continue.
            </div>

            {/* Button */}
            <button
              type="button"
              onClick={() => setShowSessionExpiredPopup(false)}
              style={{
                width: "100%",
                background: "linear-gradient(135deg, #e6c37a, #d4a94f)",
                color: "#1a1a1a",
                border: "none",
                padding: "12px",
                borderRadius: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = "translateY(-1px)";
                e.target.style.boxShadow = "0 8px 20px rgba(0,0,0,0.25)";
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "none";
              }}
            >
              OK, Got it
            </button>
          </div>

          {/* Animation */}

        </div>
      )}

    </>
  );

}
// --------------------------------------------------
// ✅ MAIN Explore Page with Suspense wrapper
// --------------------------------------------------
export default function Explore({ onReady, onOpenServices }) {
  return (

    <Suspense fallback={<div>Loading...</div>}>
      <ExploreContent
        onReady={onReady}
        onOpenServices={onOpenServices}
      />
    </Suspense>
  );
}
