"use client";

import { useEffect, useMemo, useState } from "react";
import { ENQUIRY_OPEN_EVENT } from "../../utils/enquiryFlow";
import ContactSection from "../../Contact/Contact";
import { API_BASE_URL } from "../../../config";
import { SOCIAL_ICONS } from "../../Icons/SocialIcons";
import "./EcommercePreviewTemplate.css";

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `₹${amount.toLocaleString("en-IN")}`;
}

function formatDisplayCurrency(value) {
  const amount = Number(value || 0);
  if (amount <= 0) return "Contact for price";
  return formatCurrency(amount);
}

function normalizePhones(vendorInfo) {
  return [vendorInfo?.phone, ...(Array.isArray(vendorInfo?.secondaryPhones) ? vendorInfo.secondaryPhones : [])]
    .map((phone) => String(phone || "").trim())
    .filter(Boolean);
}

function toAnchor(label) {
  return String(label || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

function normalizeSocialKey(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function getSocialHref(key, value) {
  if (!value) return "#";
  if (value.startsWith("http")) return value;
  if (key === "email") return `mailto:${value}`;
  if (key === "whatsapp") {
    const digits = String(value).replace(/\D/g, "");
    const normalized =
      digits.length === 10
        ? `91${digits}`
        : digits.length === 11 && digits.startsWith("0")
        ? `91${digits.slice(1)}`
        : digits;
    return normalized ? `https://wa.me/${normalized}` : "#";
  }
  return `https://${key}.com/${value}`;
}

function getSocialLabel(key) {
  switch (key) {
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    case "youtube":
      return "YouTube";
    case "linkedin":
      return "LinkedIn";
    case "whatsapp":
      return "WhatsApp";
    case "email":
      return "Email";
    case "website":
      return "Website";
    case "x":
      return "X";
    default:
      return key.charAt(0).toUpperCase() + key.slice(1);
  }
}

function prettifyLabel(key) {
  const normalized = String(key || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.toLowerCase() === "experience years") {
    return "Years Experience";
  }

  return normalized;
}

function formatTrustStatValue(value) {
  return String(value ?? "").trim();
}

function getPoweredByUrl() {
  return (
    process.env.NEXT_PUBLIC_VENDOR_PREVIEW_ROOT_URL ||
    process.env.NEXT_PUBLIC_PREVIEW_BASE_URL ||
    "http://localhost:4000"
  )
    .trim()
    .replace(/\/$/, "");
}

function getMapsHref(vendorInfo, heroTagline) {
  const googleMapsUrl = vendorInfo?.googlePlace?.mapsUrl;
  if (!googleMapsUrl) return "";

  let placeId = "";
  if (googleMapsUrl.startsWith("place_id:")) {
    placeId = googleMapsUrl.replace("place_id:", "");
  } else if (googleMapsUrl.includes("place_id:")) {
    placeId = googleMapsUrl.split("place_id:")[1];
  }

  if (!placeId) return googleMapsUrl;

  const queryName = encodeURIComponent(heroTagline || vendorInfo?.businessName || "");
  return `https://www.google.com/maps/search/?api=1&query=${queryName}&query_place_id=${placeId}`;
}

function scrollToElementById(id) {
  if (typeof window === "undefined") return;
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getDiscountLabel(item) {
  const discountPercent = Number(item?.discountPercent || 0);
  if (discountPercent > 0) {
    return `${discountPercent}%`;
  }

  const mrp = Number(item?.mrp || 0);
  const price = Number(item?.price || 0);
  if (mrp > 0 && mrp > price) {
    const derived = Math.round(((mrp - price) / mrp) * 100);
    if (derived > 0) {
      return `${derived}%`;
    }
  }

  return "";
}

function getResolvedPricing(node) {
  const basePrice = Number(node?.price || 0) || 0;
  const configuredMrp = Number(node?.mrp || 0) || 0;
  const configuredDiscount = Math.max(0, Number(node?.discountPercent || 0) || 0);

  const mrp = configuredMrp > 0 ? configuredMrp : basePrice;

  let netPrice = basePrice;
  if (configuredDiscount > 0) {
    if (configuredMrp > 0 && basePrice > 0 && basePrice < configuredMrp) {
      netPrice = basePrice;
    } else if (mrp > 0) {
      netPrice = mrp - (mrp * configuredDiscount) / 100;
    }
  } else if (netPrice <= 0 && mrp > 0) {
    netPrice = mrp;
  }

  return {
    mrp,
    netPrice: Math.max(0, Number(netPrice.toFixed(2))),
    discountPercent: configuredDiscount,
  };
}

function splitTextList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  return String(value || "")
    .split(/\r?\n|,|•/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getTermsSummary(terms) {
  return splitTextList(terms).slice(0, 2).join(" • ");
}

function collectLeafItems(
  nodes,
  pathNames = [],
  inheritedImageUrl = "",
  inheritedMeta = { terms: [], packagesIncludes: [] }
) {
  const items = [];

  const buildDisplayInfo = (path) => {
    const normalizedPath = (Array.isArray(path) ? path : [])
      .map((segment) => String(segment || "").trim())
      .filter(Boolean);

    if (normalizedPath.length === 0) {
      return { name: "Item", subtitle: "" };
    }

    if (normalizedPath.length === 1) {
      return { name: normalizedPath[0], subtitle: "" };
    }

    return {
      name: normalizedPath.slice(-2).join(" - "),
      subtitle: normalizedPath.length > 2 ? normalizedPath.slice(0, -2).join(" / ") : "",
    };
  };

  (Array.isArray(nodes) ? nodes : []).forEach((node, index) => {
    if (!node) return;

    const currentPath = [...pathNames, node.name].filter(Boolean);
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const resolvedImageUrl = String(node.imageUrl || inheritedImageUrl || "").trim();
    const nodeTerms = splitTextList(node.terms);
    const nodePackagesIncludes = splitTextList(node.packagesIncludes);
    const resolvedTerms = nodeTerms.length > 0 ? nodeTerms : inheritedMeta.terms;
    const resolvedPackagesIncludes =
      nodePackagesIncludes.length > 0 ? nodePackagesIncludes : inheritedMeta.packagesIncludes;
    const displayInfo = buildDisplayInfo(currentPath);

    if (node.isLeaf && node.price !== null && node.price !== undefined) {
      const pricing = getResolvedPricing(node);
      const rawNode = {
        ...node,
        subtitle: displayInfo.subtitle,
        displayName: displayInfo.name,
        nodePath: currentPath,
        imageUrl: resolvedImageUrl,
        terms: resolvedTerms,
        packagesIncludes: resolvedPackagesIncludes,
        price: pricing.netPrice,
        mrp: pricing.mrp,
        discountPercent: pricing.discountPercent,
      };

      items.push({
        id: node.id || node._id || `${currentPath.join("-")}-${index}`,
        cartKey: node.id || node._id || `${currentPath.join("-")}-${index}`,
        name: displayInfo.name,
        subtitle: displayInfo.subtitle,
        itemCode: node.itemCode || "",
        unitLabel: node.unitLabel || "",
        nodePath: currentPath,
        imageUrl: resolvedImageUrl,
        summary: getTermsSummary(resolvedTerms),
        bulletPoints: resolvedTerms,
        packagesIncludes: resolvedPackagesIncludes,
        price: pricing.netPrice,
        mrp: pricing.mrp,
        discountPercent: pricing.discountPercent,
        minQty: Math.max(1, Number(node.minQty) || 1),
        stepQty: Math.max(1, Number(node.stepQty) || 1),
        isOrderable: node.isOrderable !== false,
        rawNode,
      });
      return;
    }

    if (hasChildren) {
      items.push(
        ...collectLeafItems(node.children, currentPath, resolvedImageUrl, {
          terms: resolvedTerms,
          packagesIncludes: resolvedPackagesIncludes,
        })
      );
    }
  });

  return items;
}

function buildGroupedItems(items) {
  const groups = new Map();

  (Array.isArray(items) ? items : []).forEach((item, index) => {
    if (!item) return;

    const nodePath = (Array.isArray(item.nodePath) ? item.nodePath : [])
      .map((segment) => String(segment || "").trim())
      .filter(Boolean);
    const hasHierarchyVariant = nodePath.length > 2;
    const parentPath = hasHierarchyVariant ? nodePath.slice(0, -1) : nodePath;
    const variantLabel = hasHierarchyVariant
      ? nodePath[nodePath.length - 1]
      : String(item.unitLabel || "").trim();
    const groupPath = parentPath.length > 0 ? parentPath : nodePath;
    const groupName = groupPath.length > 0 ? groupPath[groupPath.length - 1] : item.name || "Item";
    const groupSubtitle =
      groupPath.length > 1 ? groupPath.slice(0, -1).join(" / ") : String(item.subtitle || "").trim();
    const groupKey =
      groupPath.length > 0 ? groupPath.join("||") : `item||${item.id || item.cartKey || index}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        id: groupKey,
        name: groupName,
        subtitle: groupSubtitle,
        nodePath: groupPath,
        itemCode: "",
        unitLabel: "",
        imageUrl: item.imageUrl || "",
        summary: "",
        bulletPoints: [],
        packagesIncludes: [],
        isOrderable: false,
        minQty: Math.max(1, Number(item.minQty) || 1),
        stepQty: Math.max(1, Number(item.stepQty) || 1),
        hasVariantSelector: false,
        variants: [],
      });
    }

    const group = groups.get(groupKey);
    const normalizedVariantLabel = String(variantLabel || "").trim();
    const normalizedGroupName = String(groupName || "").trim();

    group.variants.push({
      ...item,
      variantLabel: normalizedVariantLabel || item.name || "Default",
      variantSortOrder: index,
    });
    group.hasVariantSelector =
      group.hasVariantSelector ||
      Boolean(normalizedVariantLabel && normalizedVariantLabel !== normalizedGroupName);
    group.imageUrl = group.imageUrl || item.imageUrl || "";
    group.itemCode = group.itemCode || item.itemCode || "";
    group.unitLabel = group.unitLabel || item.unitLabel || "";
    group.summary = group.summary || item.summary || "";
    group.bulletPoints = group.bulletPoints.length > 0 ? group.bulletPoints : item.bulletPoints || [];
    group.packagesIncludes =
      group.packagesIncludes.length > 0 ? group.packagesIncludes : item.packagesIncludes || [];
    group.isOrderable = group.isOrderable || item.isOrderable !== false;
    group.minQty = Math.min(group.minQty, Math.max(1, Number(item.minQty) || 1));
    group.stepQty = Math.min(group.stepQty, Math.max(1, Number(item.stepQty) || 1));
  });

  return Array.from(groups.values()).map((group) => ({
    ...group,
    variants: group.variants.sort((left, right) => left.variantSortOrder - right.variantSortOrder),
    defaultVariantKey: group.variants[0]?.cartKey || group.variants[0]?.id || group.id,
  }));
}

function buildSections(menuTree) {
  return (Array.isArray(menuTree) ? menuTree : [])
    .map((section, index) => {
      const leafItems = section?.isLeaf
        ? collectLeafItems([section], [])
        : collectLeafItems(section?.children || [], [section?.name].filter(Boolean));
      const items = buildGroupedItems(leafItems);

      if (!items.length) return null;

      return {
        id: section?.id || section?._id || `section-${index}`,
        title: section?.name || `Section ${index + 1}`,
        anchor: toAnchor(section?.name || `section-${index}`),
        itemCount: items.length,
        items,
      };
    })
    .filter(Boolean);
}

function getCartItem(cartItems, item) {
  return (Array.isArray(cartItems) ? cartItems : []).find(
    (entry) => (entry.cartKey || entry.itemId) === item.cartKey
  );
}

function getSelectedVariant(groupItem, selectedVariantKey, cartItems) {
  const variants = Array.isArray(groupItem?.variants) ? groupItem.variants : [];
  if (!variants.length) return null;

  if (selectedVariantKey) {
    const matchedVariant = variants.find((variant) => variant.cartKey === selectedVariantKey);
    if (matchedVariant) return matchedVariant;
  }

  const activeVariant = variants.find((variant) => {
    const cartItem = getCartItem(cartItems, variant);
    return Number(cartItem?.qty || 0) > 0;
  });
  if (activeVariant) return activeVariant;

  return (
    variants.find((variant) => variant.cartKey === groupItem.defaultVariantKey) ||
    variants[0]
  );
}

export default function EcommercePreviewTemplate({
  vendorInfo,
  category,
  menuTree,
  mergedHeroImages,
  heroTagline,
  heroDescription,
  cartItems,
  cartTotal,
  onAddToCart,
  onIncreaseQty,
  onDecreaseQty,
  onClearCart,
  onOpenAdmin,
  showAdminMenu,
  onToggleAdminMenu,
  onOpenAdminMenu,
  onOpenAdminDashboard,
  hasVendorSession = false,
  onLogout,
}) {
  const [showCartDetails, setShowCartDetails] = useState(false);
  const [showCheckoutForm, setShowCheckoutForm] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [selectedVariantKeys, setSelectedVariantKeys] = useState({});
  const [openVariantDropdownId, setOpenVariantDropdownId] = useState("");
  const [heroImageIndex, setHeroImageIndex] = useState(0);
  const [paymentConfig, setPaymentConfig] = useState({
    paymentEnabled: false,
    provider: "",
    keyId: "",
  });
  const sections = useMemo(() => buildSections(menuTree), [menuTree]);
  const phoneNumbers = useMemo(() => normalizePhones(vendorInfo), [vendorInfo]);
  const businessHours = useMemo(() => {
    const hours = vendorInfo?.businessHours || vendorInfo?.hours || [];
    return Array.isArray(hours)
      ? hours.filter((entry) => String(entry?.day || entry?.hours || "").trim())
      : [];
  }, [vendorInfo]);
  const locationAddress = String(vendorInfo?.location?.address || "").trim();
  const locationLat = Number(vendorInfo?.location?.lat);
  const locationLng = Number(vendorInfo?.location?.lng);
  const hasEmbeddedMap = Number.isFinite(locationLat) && Number.isFinite(locationLng);
  const mapsHref = useMemo(() => getMapsHref(vendorInfo, heroTagline), [heroTagline, vendorInfo]);
  const trustSummary = vendorInfo?.trustSummary || vendorInfo?.trust || {};
  const statEntries = Object.entries(trustSummary)
    .filter(([key, value]) => {
      if (value === null || value === undefined || value === "") return false;
      if (Array.isArray(value)) return false;
      if (/google\s*rating/i.test(String(key))) return false;
      return true;
    })
    .slice(0, 3);
  const hasHeroStats = statEntries.length > 0 || typeof vendorInfo?.googlePlace?.rating === "number";
  const socialEntries = useMemo(() => {
    const socialLinks = vendorInfo?.socialLinks || {};

    const mapped = Object.entries(socialLinks)
      .map(([key, rawValue]) => {
        const normalizedKey = normalizeSocialKey(key);
        const value = String(rawValue || "").trim();
        if (!normalizedKey || !value) return null;
        return {
          key: normalizedKey,
          value,
          href: getSocialHref(normalizedKey, value),
          label: getSocialLabel(normalizedKey),
        };
      })
      .filter(Boolean);

    if (!mapped.some((entry) => entry.key === "whatsapp") && phoneNumbers.length > 0) {
      mapped.push({
        key: "whatsapp",
        value: phoneNumbers[0],
        href: getSocialHref("whatsapp", phoneNumbers[0]),
        label: "WhatsApp",
      });
    }

    return mapped;
  }, [phoneNumbers, vendorInfo]);
  const poweredByUrl = getPoweredByUrl();
  const customerPortalUrl = `${poweredByUrl}/mybills`;
  const vendorId =
    vendorInfo?.vendorId ||
    vendorInfo?._id ||
    vendorInfo?.vendor?._id ||
    null;
  const isRazorpayCheckoutEnabled =
    paymentConfig.paymentEnabled &&
    paymentConfig.provider === "razorpay" &&
    Boolean(String(paymentConfig.keyId || "").trim());
  const ecommercePrimaryCtaLabel = isRazorpayCheckoutEnabled ? "Checkout" : "Place Order";
  const ecommerceSubmitLabel = isRazorpayCheckoutEnabled ? "Proceed to Payment" : "Place Order";

  const heroImageList = useMemo(() => {
    const previewImages = Array.isArray(mergedHeroImages)
      ? mergedHeroImages.map((image) => String(image || "").trim()).filter(Boolean)
      : [];
    const sectionImages = sections
      .flatMap((section) => section.items.map((item) => String(item.imageUrl || "").trim()))
      .filter(Boolean);
    return Array.from(new Set([...previewImages, ...sectionImages]));
  }, [mergedHeroImages, sections]);

  useEffect(() => {
    if (heroImageList.length <= 1) return undefined;

    const interval = window.setInterval(() => {
      setHeroImageIndex((current) => (current + 1) % heroImageList.length);
    }, 3200);

    return () => window.clearInterval(interval);
  }, [heroImageList]);

  const heroImage = heroImageList[heroImageList.length ? heroImageIndex % heroImageList.length : 0] || "";

  const cartMrpTotal = useMemo(
    () =>
      (Array.isArray(cartItems) ? cartItems : []).reduce((sum, item) => {
        const referencePrice = Number(item.mrp) > 0 ? Number(item.mrp) : Number(item.price) || 0;
        return sum + referencePrice * (Number(item.qty) || 0);
      }, 0),
    [cartItems]
  );
  const cartDiscountTotal = Math.max(cartMrpTotal - Number(cartTotal || 0), 0);
  const normalizedCatalogSearch = String(catalogSearch || "").trim().toLowerCase();
  const filteredSections = useMemo(() => {
    if (!normalizedCatalogSearch) return sections;

    return sections
      .map((section) => {
        const sectionMatches = String(section.title || "").toLowerCase().includes(normalizedCatalogSearch);
        const filteredItems = section.items.filter((item) => {
          const haystack = [
            item.name,
            item.subtitle,
            item.itemCode,
            item.unitLabel,
            ...(Array.isArray(item.variants) ? item.variants.map((variant) => variant.variantLabel) : []),
          ]
            .map((value) => String(value || "").toLowerCase())
            .join(" ");

          return haystack.includes(normalizedCatalogSearch);
        });

        if (sectionMatches) {
          return section;
        }

        if (filteredItems.length > 0) {
          return {
            ...section,
            itemCount: filteredItems.length,
            items: filteredItems,
          };
        }

        return null;
      })
      .filter(Boolean);
  }, [normalizedCatalogSearch, sections]);
  const visibleSectionChips = useMemo(() => sections.slice(0, 6), [sections]);
  const hiddenSectionChips = useMemo(() => sections.slice(6), [sections]);
  const filteredCategoryOptions = useMemo(() => {
    const normalizedCategorySearch = String(categorySearch || "").trim().toLowerCase();
    if (!normalizedCategorySearch) return hiddenSectionChips;
    return hiddenSectionChips.filter((section) =>
      String(section.title || "").toLowerCase().includes(normalizedCategorySearch)
    );
  }, [categorySearch, hiddenSectionChips]);
  const detailedCartItems = useMemo(
    () =>
      (Array.isArray(cartItems) ? cartItems : []).map((item, index) => {
        const qty = Number(item?.qty || 0) || 0;
        const mrp = Number(item?.mrp || 0) > 0 ? Number(item.mrp) : Number(item?.price || 0) || 0;
        const unitPrice = Number(item?.price || 0) || 0;
        const grossTotal = mrp * qty;
        const netTotal = unitPrice * qty;

        return {
          id: String(item?.cartKey || item?.itemId || `cart-item-${index}`),
          name: item?.name || "Selected item",
          subtitle: String(item?.subtitle || "").trim(),
          metaLine: item?.itemCode || item?.unitLabel || "",
          imageUrl: String(item?.imageUrl || "").trim(),
          qty,
          mrp,
          unitPrice,
          grossTotal,
          netTotal,
          savings: Math.max(grossTotal - netTotal, 0),
        };
      }),
    [cartItems]
  );

  useEffect(() => {
    if (!vendorId) {
      setPaymentConfig({
        paymentEnabled: false,
        provider: "",
        keyId: "",
      });
      return;
    }

    let cancelled = false;

    async function loadPaymentConfig() {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/vendor-payment-config/${vendorId}`,
          { cache: "no-store" }
        );

        const data = await response.json().catch(() => ({}));
        if (!response.ok || cancelled) return;

        const config = data?.config || {};
        setPaymentConfig({
          paymentEnabled: Boolean(config.paymentEnabled),
          provider: String(config.provider || ""),
          keyId: String(config?.razorpay?.keyId || ""),
        });
      } catch (error) {
        console.error("Ecommerce payment config fetch failed", error);
        if (!cancelled) {
          setPaymentConfig({
            paymentEnabled: false,
            provider: "",
            keyId: "",
          });
        }
      }
    }

    loadPaymentConfig();

    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(".ecommerce-variant-dropdown")) return;
      setOpenVariantDropdownId("");
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpenVariantDropdownId("");
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handlePlaceOrder = () => {
    if (typeof window !== "undefined") {
      if (!showCheckoutForm) {
        setShowCheckoutForm(true);
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent(ENQUIRY_OPEN_EVENT, { detail: { source: "ecommerce-template" } }));
        }, 120);
        return;
      }

      window.dispatchEvent(new CustomEvent(ENQUIRY_OPEN_EVENT, { detail: { source: "ecommerce-template" } }));
    }
    scrollToElementById("ecommerce-contact");
  };

  const handleSelectCatalogSection = (anchor) => {
    setShowCategoryPicker(false);
    setCategorySearch("");
    scrollToElementById(anchor);
  };

  return (
    <div className="ecommerce-preview">
      <section className="ecommerce-topbar">
        <div className="ecommerce-brand">
          {typeof vendorInfo?.logoUrl === "string" && vendorInfo.logoUrl.trim() ? (
            <img
              src={vendorInfo.logoUrl.trim()}
              alt={`${vendorInfo?.businessName || "Business"} logo`}
              className="ecommerce-brand-logo"
            />
          ) : (
            <div className="ecommerce-brand-fallback">
              {(vendorInfo?.businessName || category?.name || "B").charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="ecommerce-brand-name">{vendorInfo?.businessName || "Product Catalog"}</div>
          </div>
        </div>

        <nav className="ecommerce-nav">
          <button type="button" onClick={() => scrollToElementById("ecommerce-home")}>Home</button>
          <button type="button" onClick={() => scrollToElementById("ecommerce-catalog")}>Catalog</button>
          <button type="button" onClick={() => scrollToElementById("ecommerce-summary")}>Summary</button>
          <button type="button" onClick={() => scrollToElementById("ecommerce-contact")}>Contact</button>
          <a href={customerPortalUrl} target="_blank" rel="noopener noreferrer">
            My Bills & Rewards
          </a>
          {typeof onOpenAdmin === "function" ? (
            <div className="ecommerce-admin-menu">
              <button
                type="button"
                className="ecommerce-admin-button"
                onClick={onToggleAdminMenu || onOpenAdmin}
              >
                Admin
              </button>
              {showAdminMenu ? (
                <div className="ecommerce-admin-dropdown">
                  <button type="button" onClick={onOpenAdminMenu}>
                    Billing
                  </button>
                  <button type="button" onClick={onOpenAdminDashboard}>
                    Dashboard
                  </button>
                  {hasVendorSession ? (
                    <button
                      type="button"
                      onClick={() => {
                        onToggleAdminMenu?.();
                        onLogout?.();
                      }}
                    >
                      Logout
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </nav>
      </section>

      <section id="ecommerce-home" className="ecommerce-hero">
        <div className="ecommerce-hero-copy">
          <h1>{heroTagline || vendorInfo?.businessName || "Build your order"}</h1>
          <p>
            {heroDescription ||
              vendorInfo?.location?.address ||
              "Browse products, adjust quantities and share the order with the business."}
          </p>
          {hasHeroStats ? (
            <div className="ecommerce-hero-stats">
              {statEntries.map(([key, value]) => (
                <div key={key} className="ecommerce-hero-stat-card">
                  <strong>{formatTrustStatValue(value)}</strong>
                  <span>{prettifyLabel(key)}</span>
                </div>
              ))}
              {typeof vendorInfo?.googlePlace?.rating === "number" ? (
                <a
                  className="ecommerce-hero-stat-card ecommerce-hero-stat-link"
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <strong>{vendorInfo.googlePlace.rating}*</strong>
                  <span>
                    Google Rating
                    {vendorInfo?.googlePlace?.userRatingsTotal
                      ? ` (${vendorInfo.googlePlace.userRatingsTotal})`
                      : ""}
                  </span>
                </a>
              ) : null}
            </div>
          ) : null}
          <div className="ecommerce-hero-actions">
            <button type="button" className="ecommerce-primary-button" onClick={() => scrollToElementById("ecommerce-catalog")}>
              View Catalog
            </button>
            {phoneNumbers[0] ? (
              <a className="ecommerce-secondary-button" href={`tel:${phoneNumbers[0]}`}>
                Call Now
              </a>
            ) : null}
          </div>
        </div>

        <div className="ecommerce-hero-media">
          {heroImage ? (
            <img src={heroImage} alt={heroTagline || vendorInfo?.businessName || "Catalog preview"} />
          ) : (
            <div className="ecommerce-hero-placeholder">Catalog Preview</div>
          )}
        </div>
      </section>

      <section id="ecommerce-catalog" className="ecommerce-catalog">
        <div className="ecommerce-catalog-heading">
          <div className="ecommerce-catalog-toolbar">
            <div className="ecommerce-catalog-search">
              <input
                type="text"
                value={catalogSearch}
                onChange={(event) => setCatalogSearch(event.target.value)}
                placeholder="Search products or categories"
                aria-label="Search products or categories"
              />
            </div>
            <div className="ecommerce-catalog-nav">
              <div className="ecommerce-section-pills">
                {visibleSectionChips.map((section) => (
                  <button key={section.id} type="button" onClick={() => scrollToElementById(section.anchor)}>
                    {section.title}
                  </button>
                ))}
              </div>
              {hiddenSectionChips.length > 0 ? (
                <div className="ecommerce-category-picker">
                  <button
                    type="button"
                    className="ecommerce-category-picker-toggle"
                    onClick={() => setShowCategoryPicker((current) => !current)}
                  >
                    More
                  </button>
                  {showCategoryPicker ? (
                    <div className="ecommerce-category-picker-menu">
                      <input
                        type="text"
                        value={categorySearch}
                        onChange={(event) => setCategorySearch(event.target.value)}
                        placeholder="Search categories"
                        aria-label="Search categories"
                      />
                      <div className="ecommerce-category-picker-list">
                        {filteredCategoryOptions.length > 0 ? (
                          filteredCategoryOptions.map((section) => (
                            <button
                              key={section.id}
                              type="button"
                              onClick={() => handleSelectCatalogSection(section.anchor)}
                            >
                              <span>{section.title}</span>
                              <small>{section.itemCount} items</small>
                            </button>
                          ))
                        ) : (
                          <div className="ecommerce-category-picker-empty">No matching categories</div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {!sections.length ? (
          <div className="ecommerce-empty-state">
            No active priced items were found in My Menu for this template yet.
          </div>
        ) : null}

        {sections.length > 0 && filteredSections.length === 0 ? (
          <div className="ecommerce-empty-state">
            No products matched your search.
          </div>
        ) : null}

        {filteredSections.map((section) => (
          <div key={section.id} id={section.anchor} className="ecommerce-section-card">
            <div className="ecommerce-section-header">
              <h3>{section.title}</h3>
              <span>{section.itemCount} items</span>
            </div>

            <div className="ecommerce-table">
              <div className="ecommerce-table-head">
                <span>#</span>
                <span>Product Name</span>
                <span>Qty</span>
                <span>MRP / Unit</span>
                <span>Discount</span>
                <span>Gross Amt</span>
                <span>Net Pay</span>
              </div>

              {section.items.map((item, index) => {
                const selectedVariant = getSelectedVariant(
                  item,
                  selectedVariantKeys[item.id],
                  cartItems
                );
                if (!selectedVariant) return null;

                const cartItem = getCartItem(cartItems, selectedVariant);
                const qty = Number(cartItem?.qty || 0);
                const discountLabel = getDiscountLabel(selectedVariant);
                const referenceMrp = Number(selectedVariant.mrp) > 0 ? Number(selectedVariant.mrp) : null;
                const effectiveMrp = referenceMrp || Number(selectedVariant.price) || 0;
                const grossAmount = qty > 0 ? effectiveMrp * qty : 0;
                const netAmount = qty > 0 ? (Number(selectedVariant.price) || 0) * qty : 0;
                const savingsAmount = Math.max(grossAmount - netAmount, 0);
                const activeVariantsInCart = (Array.isArray(item.variants) ? item.variants : []).filter((variant) => {
                  const activeCartItem = getCartItem(cartItems, variant);
                  return Number(activeCartItem?.qty || 0) > 0;
                }).length;
                const groupIsActive = activeVariantsInCart > 0;
                const isVariantMenuOpen = openVariantDropdownId === item.id;
                const packageIncludes = Array.isArray(selectedVariant.packagesIncludes)
                  ? selectedVariant.packagesIncludes.filter(Boolean)
                  : [];
                const termPoints = Array.isArray(selectedVariant.bulletPoints)
                  ? selectedVariant.bulletPoints.filter(Boolean)
                  : [];
                const displaySummary =
                  termPoints.length === 0 ? String(selectedVariant.summary || "").trim() : "";

                return (
                  <div
                    key={item.id}
                    className={`ecommerce-table-row${groupIsActive ? " ecommerce-table-row--active" : ""}${isVariantMenuOpen ? " ecommerce-table-row--dropdown-open" : ""}`}
                  >
                    <span className="ecommerce-row-index">{String(index + 1).padStart(2, "0")}</span>

                    <div className="ecommerce-product-cell">
                      {selectedVariant.imageUrl ? (
                        <img src={selectedVariant.imageUrl} alt={item.name} className="ecommerce-product-image" />
                      ) : (
                        <div className="ecommerce-product-image ecommerce-product-image--placeholder">
                          {item.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <strong>{item.name}</strong>
                        {selectedVariant.itemCode ? <small>{selectedVariant.itemCode}</small> : null}
                        {item.subtitle ? <p>{item.subtitle}</p> : null}
                        {displaySummary ? (
                          <div className="ecommerce-product-summary">{displaySummary}</div>
                        ) : null}
                        {packageIncludes.length > 0 ? (
                          <div className="ecommerce-product-meta-box">
                            <div className="ecommerce-product-meta-title">Package Includes</div>
                            <div className="ecommerce-product-package-list">
                              {packageIncludes.map((packageItem, packageIndex) => (
                                <span key={`${selectedVariant.cartKey}-package-${packageIndex}`}>{packageItem}</span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {termPoints.length > 0 ? (
                          <ul className="ecommerce-product-terms">
                            {termPoints.map((point, pointIndex) => (
                              <li key={`${selectedVariant.cartKey}-term-${pointIndex}`}>{point}</li>
                            ))}
                          </ul>
                        ) : null}
                        {item.hasVariantSelector ? (
                          <div className="ecommerce-variant-selector">
                            <div className="ecommerce-variant-dropdown">
                              <button
                                type="button"
                                className={`ecommerce-variant-dropdown-trigger${isVariantMenuOpen ? " is-open" : ""}`}
                                aria-haspopup="listbox"
                                aria-expanded={isVariantMenuOpen}
                                onClick={() =>
                                  setOpenVariantDropdownId((current) => (current === item.id ? "" : item.id))
                                }
                              >
                                <span>{selectedVariant.variantLabel}</span>
                              </button>
                              {isVariantMenuOpen ? (
                                <div className="ecommerce-variant-dropdown-menu" role="listbox" aria-label={`Variants for ${item.name}`}>
                                  {item.variants.map((variant) => {
                                    const isSelected = selectedVariant.cartKey === variant.cartKey;
                                    return (
                                      <button
                                        key={variant.cartKey || variant.id}
                                        type="button"
                                        role="option"
                                        aria-selected={isSelected}
                                        className={`ecommerce-variant-dropdown-option${isSelected ? " is-selected" : ""}`}
                                        onClick={() => {
                                          setSelectedVariantKeys((current) => ({
                                            ...current,
                                            [item.id]: variant.cartKey,
                                          }));
                                          setOpenVariantDropdownId("");
                                        }}
                                      >
                                        {variant.variantLabel}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                            <div className="ecommerce-variant-chips">
                              {item.variants.map((variant) => {
                                const isSelected = selectedVariant.cartKey === variant.cartKey;
                                return (
                                  <button
                                    key={variant.cartKey || variant.id}
                                    type="button"
                                    className={`ecommerce-variant-chip${isSelected ? " is-active" : ""}`}
                                    onClick={() =>
                                      setSelectedVariantKeys((current) => ({
                                        ...current,
                                        [item.id]: variant.cartKey,
                                      }))
                                    }
                                  >
                                    {variant.variantLabel}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="ecommerce-mobile-action-slot">
                              {qty > 0 ? (
                                <div className="ecommerce-qty-control">
                                  <button type="button" onClick={() => onDecreaseQty(selectedVariant.cartKey)}>-</button>
                                  <span>{qty}</span>
                                  <button type="button" onClick={() => onIncreaseQty(selectedVariant.cartKey)}>+</button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="ecommerce-add-button"
                                  onClick={() => onAddToCart(selectedVariant.rawNode)}
                                  disabled={!selectedVariant.isOrderable}
                                >
                                  {selectedVariant.isOrderable ? "Add" : "Unavailable"}
                                </button>
                              )}
                            </div>
                          </div>
                        ) : null}
                        {!item.hasVariantSelector ? (
                          <div className="ecommerce-mobile-action-slot">
                            {qty > 0 ? (
                              <div className="ecommerce-qty-control">
                                <button type="button" onClick={() => onDecreaseQty(selectedVariant.cartKey)}>-</button>
                                <span>{qty}</span>
                                <button type="button" onClick={() => onIncreaseQty(selectedVariant.cartKey)}>+</button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="ecommerce-add-button"
                                onClick={() => onAddToCart(selectedVariant.rawNode)}
                                disabled={!selectedVariant.isOrderable}
                              >
                                {selectedVariant.isOrderable ? "Add" : "Unavailable"}
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="ecommerce-qty-cell">
                      {qty > 0 ? (
                        <div className="ecommerce-qty-control">
                          <button type="button" onClick={() => onDecreaseQty(selectedVariant.cartKey)}>-</button>
                          <span>{qty}</span>
                          <button type="button" onClick={() => onIncreaseQty(selectedVariant.cartKey)}>+</button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="ecommerce-add-button"
                          onClick={() => onAddToCart(selectedVariant.rawNode)}
                          disabled={!selectedVariant.isOrderable}
                        >
                          {selectedVariant.isOrderable ? "Add" : "Unavailable"}
                        </button>
                      )}
                      {(selectedVariant.minQty > 1 || selectedVariant.stepQty > 1 || selectedVariant.unitLabel || activeVariantsInCart > 1) ? (
                        <small>
                          {selectedVariant.minQty > 1 ? `Min ${selectedVariant.minQty}` : ""}
                          {selectedVariant.stepQty > 1 ? `${selectedVariant.minQty > 1 ? " • " : ""}Step ${selectedVariant.stepQty}` : ""}
                          {selectedVariant.unitLabel ? `${selectedVariant.minQty > 1 || selectedVariant.stepQty > 1 ? " • " : ""}${selectedVariant.unitLabel}` : ""}
                          {activeVariantsInCart > 1 ? `${selectedVariant.minQty > 1 || selectedVariant.stepQty > 1 || selectedVariant.unitLabel ? " • " : ""}${activeVariantsInCart} variants in cart` : ""}
                        </small>
                      ) : null}
                    </div>

                    <div className="ecommerce-mobile-compact-row">
                      <div className="ecommerce-mobile-compact-main">
                        <div className="ecommerce-mobile-compact-group">
                          <span className="ecommerce-mobile-compact-label">MRP</span>
                          {referenceMrp ? <strong>{formatDisplayCurrency(referenceMrp)}</strong> : <strong>{formatDisplayCurrency(selectedVariant.price)}</strong>}
                        </div>

                        <div className="ecommerce-mobile-compact-group">
                          <span className="ecommerce-mobile-compact-label">Discount</span>
                          {discountLabel ? <span className="ecommerce-discount-badge">{discountLabel}</span> : <span className="ecommerce-mobile-compact-empty">--</span>}
                        </div>
                      </div>

                      <div className="ecommerce-mobile-net-group">
                        <span className="ecommerce-mobile-compact-label">Net</span>
                        {qty > 0 ? (
                          <>
                            <strong>{formatCurrency(netAmount)}</strong>
                            {savingsAmount > 0 ? <small>save {formatCurrency(savingsAmount)}</small> : null}
                          </>
                        ) : (
                          <strong>{formatDisplayCurrency(selectedVariant.price)}</strong>
                        )}
                      </div>
                    </div>

                    <div className="ecommerce-price-cell">
                      {referenceMrp ? <strong>{formatDisplayCurrency(referenceMrp)}</strong> : <strong>{formatDisplayCurrency(selectedVariant.price)}</strong>}
                      {referenceMrp && referenceMrp > selectedVariant.price ? <small>{formatDisplayCurrency(selectedVariant.price)}</small> : null}
                    </div>

                    <div className="ecommerce-discount-cell">
                      {discountLabel ? <span className="ecommerce-discount-badge">{discountLabel}</span> : <span>--</span>}
                    </div>

                    <div className="ecommerce-gross-cell">
                      {qty > 0 ? <strong>{formatCurrency(grossAmount)}</strong> : <span>--</span>}
                    </div>

                    <div className="ecommerce-netpay-cell">
                      {qty > 0 ? (
                        <>
                          <strong>{formatCurrency(netAmount)}</strong>
                          {savingsAmount > 0 ? <small>save {formatCurrency(savingsAmount)}</small> : null}
                        </>
                      ) : (
                        <strong>{formatDisplayCurrency(selectedVariant.price)}</strong>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section id="ecommerce-summary" className="ecommerce-bottom-grid">
        <div className="ecommerce-note-card">
          <h3>Business Details</h3>
          <div className="ecommerce-business-grid">
            <div className="ecommerce-business-block">
              <span className="ecommerce-business-label">Location</span>
              <p>{locationAddress || "Location details are not available yet."}</p>
              {mapsHref ? (
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noreferrer"
                  className="ecommerce-map-link"
                >
                  View Map
                </a>
              ) : null}
              {hasEmbeddedMap ? (
                <div className="ecommerce-map-frame">
                  <iframe
                    title="Business map"
                    width="100%"
                    height="180"
                    loading="lazy"
                    src={`https://www.google.com/maps?q=${locationLat},${locationLng}&z=15&output=embed`}
                  />
                </div>
              ) : null}
            </div>

            <div className="ecommerce-business-block">
              <span className="ecommerce-business-label">Business Hours</span>
              {businessHours.length > 0 ? (
                <ul className="ecommerce-business-hours">
                  {businessHours.map((entry, index) => (
                    <li key={entry?._id || `${entry?.day || "day"}-${index}`}>
                      <span>{entry?.day || "Day"}</span>
                      <span>{entry?.hours || "Closed"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Business hours are not available yet.</p>
              )}
            </div>
          </div>

          <div className="ecommerce-business-secondary">
            <div className="ecommerce-business-block">
              <span className="ecommerce-business-label">Contact Numbers</span>
              <div className="ecommerce-contact-pills ecommerce-contact-pills--compact">
                {phoneNumbers.map((phone, index) => (
                  <a key={phone} href={`tel:${phone}`}>
                    {index === 0 ? "Primary" : `Alt ${index}`} • {phone}
                  </a>
                ))}
                {vendorInfo?.email ? <a href={`mailto:${vendorInfo.email}`}>{vendorInfo.email}</a> : null}
              </div>
            </div>

            {socialEntries.length > 0 ? (
              <div className="ecommerce-social-section">
                <span className="ecommerce-business-label">Social Handles</span>
                <div className="ecommerce-social-icons" aria-label="Social handles">
                  {socialEntries.map((entry) => (
                    (() => {
                      const Icon = SOCIAL_ICONS[entry.key];
                      return (
                        <a
                          key={`${entry.key}-${entry.value}`}
                          href={entry.href}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={entry.label}
                          title={entry.label}
                        >
                          {Icon ? <Icon /> : <span>{entry.label}</span>}
                        </a>
                      );
                    })()
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside id="ecommerce-order-summary" className="ecommerce-order-card">
          <h3>Order Summary</h3>
          <div className="ecommerce-order-line">
            <span>Total Amount (MRP)</span>
            <strong>{formatCurrency(cartMrpTotal)}</strong>
          </div>
          <div className="ecommerce-order-line">
            <span>Discount Amount</span>
            <strong>- {formatCurrency(cartDiscountTotal)}</strong>
          </div>
          <div className="ecommerce-order-total">
            <span>Net Pay</span>
            <strong>{formatCurrency(cartTotal)}</strong>
          </div>
          {detailedCartItems.length > 0 ? (
            <div className="ecommerce-cart-details">
              <button
                type="button"
                className="ecommerce-cart-toggle"
                onClick={() => setShowCartDetails((current) => !current)}
              >
                <span>Cart Details ({detailedCartItems.length})</span>
                <span>{showCartDetails ? "Hide" : "Show"}</span>
              </button>

              {showCartDetails ? (
                <div className="ecommerce-cart-list">
                  {detailedCartItems.map((item) => (
                    <div key={item.id} className="ecommerce-cart-list-item">
                      <div className="ecommerce-cart-list-main">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="ecommerce-cart-list-image" />
                        ) : (
                          <div className="ecommerce-cart-list-image ecommerce-cart-list-image--placeholder">
                            {item.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <strong>{item.name}</strong>
                          {item.subtitle ? <small>{item.subtitle}</small> : null}
                          <small>
                            Qty {item.qty}
                            {item.metaLine ? ` • ${item.metaLine}` : ""}
                          </small>
                          <small>
                            {formatCurrency(item.unitPrice)} each
                            {item.mrp > item.unitPrice ? ` • MRP ${formatCurrency(item.mrp)}` : ""}
                          </small>
                        </div>
                      </div>
                      <div className="ecommerce-cart-list-total">
                        <strong>{formatCurrency(item.netTotal)}</strong>
                        {item.savings > 0 ? <small>save {formatCurrency(item.savings)}</small> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {!showCheckoutForm ? (
            <button type="button" className="ecommerce-primary-button ecommerce-full-width" onClick={handlePlaceOrder}>
              {ecommercePrimaryCtaLabel}
            </button>
          ) : (
            <div id="ecommerce-contact" className="ecommerce-inline-checkout">
              <ContactSection
                mode="inline"
                showCartSummary={false}
                sectionId="ecommerce-contact"
                hideHeader={true}
                submitLabel={ecommerceSubmitLabel}
              />
            </div>
          )}
          <button
            type="button"
            className="ecommerce-secondary-button ecommerce-full-width"
            onClick={onClearCart}
            disabled={!cartItems?.length}
          >
            Clear All Items
          </button>
        </aside>
      </section>

      {cartItems?.length > 0 ? (
        <button
          type="button"
          className="ecommerce-floating-cart-button"
          onClick={() => scrollToElementById("ecommerce-order-summary")}
          aria-label={`Go to cart summary with ${cartItems.length} item${cartItems.length === 1 ? "" : "s"}`}
        >
          <span className="ecommerce-floating-cart-count">{cartItems.length}</span>
          <span className="ecommerce-floating-cart-copy">
            <strong>Cart</strong>
            <small>{formatCurrency(cartTotal)}</small>
          </span>
        </button>
      ) : null}

      <footer className="ecommerce-footer">
        <div className="ecommerce-footer-copy">
          <span>
            © {new Date().getFullYear()} {vendorInfo?.businessName || "Business"} All Rights Reserved.
          </span>
        </div>
        <a
          className="ecommerce-footer-powered"
          href={poweredByUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <img src="/favicon.svg" alt="Ynot" className="ecommerce-footer-powered-logo" />
          <span>Powered by Ynot</span>
        </a>
      </footer>

    </div>
  );
}
