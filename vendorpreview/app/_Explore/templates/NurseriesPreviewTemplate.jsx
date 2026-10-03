"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../../../config";
import "./NurseriesPreviewTemplate.css";
import ContactSection from "../../Contact/Contact";
import { ENQUIRY_OPEN_EVENT } from "../../utils/enquiryFlow";
import { openAdminDashboard, openAdminMenu } from "../../utils/adminQuickActions";
import { getYnotBaseUrl } from "../../utils/ynotBaseUrl";

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (amount <= 0) return "Contact for price";
  return `₹${amount.toLocaleString("en-IN")}`;
}

function hasDisplayPrice(value) {
  return Number(value || 0) > 0;
}

function toAnchor(label) {
  return String(label || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

function scrollToElementById(id) {
  if (typeof window === "undefined") return;
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getCardImage(card) {
  if (card?.img) return card.img;

  if (Array.isArray(card?.options)) {
    for (const option of card.options) {
      if (option?.imageUrl) return option.imageUrl;

      if (Array.isArray(option?.subOptions)) {
        for (const subOption of option.subOptions) {
          if (subOption?.imageUrl) return subOption.imageUrl;

          if (Array.isArray(subOption?.subSubOptions)) {
            for (const leaf of subOption.subSubOptions) {
              if (leaf?.imageUrl) return leaf.imageUrl;
            }
          }
        }
      }
    }
  }

  return "";
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
  return splitTextList(terms).join(" • ");
}

function buildGoogleProfileLink({ mapsUrl, businessName, heroTagline, categoryName }) {
  const googleMapsUrl = String(mapsUrl || "").trim();
  if (!googleMapsUrl) return "";

  let placeId = "";
  if (googleMapsUrl.startsWith("place_id:")) {
    placeId = googleMapsUrl.replace("place_id:", "");
  } else if (googleMapsUrl.includes("place_id:")) {
    placeId = googleMapsUrl.split("place_id:")[1];
  }

  if (!placeId) return googleMapsUrl;

  const queryName = encodeURIComponent(
    String(heroTagline || businessName || categoryName || "").trim()
  );
  return `https://www.google.com/maps/search/?api=1&query=${queryName}&query_place_id=${placeId}`;
}

function isOffersLabel(value) {
  return String(value || "").trim().toLowerCase() === "offers";
}

function isOfferLikeCard(card, sectionName) {
  if (!card) return false;
  if (isOffersLabel(sectionName) || isOffersLabel(card.title)) return true;

  return (
    Array.isArray(card.options) &&
    card.options.some((option) => {
      const ownOffer = typeof option?.offerText === "string" && option.offerText.trim();
      const nestedOffer =
        Array.isArray(option?.subOptions) &&
        option.subOptions.some((subOption) => {
          const subOffer = typeof subOption?.offerText === "string" && subOption.offerText.trim();
          const deepOffer =
            Array.isArray(subOption?.subSubOptions) &&
            subOption.subSubOptions.some(
              (leaf) => typeof leaf?.offerText === "string" && leaf.offerText.trim()
            );
          return subOffer || deepOffer;
        });
      return ownOffer || nestedOffer;
    })
  );
}

function isDisplayableCard(card) {
  if (!card) return false;
  if (card.simple) return true;
  if (Number(card.base || 0) > 0) return true;
  if (Array.isArray(card.terms) && card.terms.length > 0) return true;
  if (typeof card.offerText === "string" && card.offerText.trim()) return true;
  if (typeof card.packagesIncludes === "string" && card.packagesIncludes.trim()) return true;
  if (Array.isArray(card.options) && card.options.length > 0) return true;
  return false;
}

function buildFallbackHeroSummary({ categoryName, address }) {
  const place = String(address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");

  if (categoryName && place) {
    return `Explore premium ${String(categoryName).toLowerCase()} collections from ${place}.`;
  }

  if (categoryName) {
    return `Browse healthy ${String(categoryName).toLowerCase()} collections for homes, gardens and gifting.`;
  }

  return "Explore curated plant and garden collections.";
}

function getRefinedHeroCopy({ heroDescription, categoryName, address }) {
  const cleaned = String(heroDescription || "").trim();
  if (cleaned) return cleaned;
  return buildFallbackHeroSummary({ categoryName, address });
}

function buildNurseryRows(card, sectionName) {
  const rows = [];
  const cardImage = getCardImage(card);

  if (!Array.isArray(card?.options) || card.options.length === 0) {
    rows.push({
      id: `${card.id}-default`,
      title: card?.title || sectionName,
      subtitle: "",
      summary: getTermsSummary(card?.terms),
      bulletPoints: splitTextList(card?.terms),
      packagesIncludes: splitTextList(card?.packagesIncludes),
      imageUrl: cardImage,
      price: Number(card?.base || 0),
      categoryPath: [sectionName, card?.title].filter(Boolean),
      cartKey: `${card.id}-default`,
      offerText: String(card?.offerText || "").trim(),
    });
    return rows;
  }

  card.options.forEach((option, optionIndex) => {
    const optionImage = option?.imageUrl || cardImage;
    const subOptions = Array.isArray(option?.subOptions) ? option.subOptions : [];

    if (subOptions.length === 0) {
      rows.push({
        id: `${card.id}-option-${optionIndex}`,
        title: option?.label || card?.title || sectionName,
        subtitle: card?.title && option?.label !== card.title ? card.title : "",
        summary: getTermsSummary(option?.terms || card?.terms),
        bulletPoints: splitTextList(option?.terms || card?.terms),
        packagesIncludes: splitTextList(option?.packagesIncludes || card?.packagesIncludes),
        imageUrl: optionImage,
        price: Number(option?.price || card?.base || 0),
        categoryPath: [sectionName, card?.title, option?.label].filter(Boolean),
        cartKey: `${card.id}-${option?.label || optionIndex}`,
        offerText: String(option?.offerText || card?.offerText || "").trim(),
      });
      return;
    }

    subOptions.forEach((subOption, subIndex) => {
      const subImage = subOption?.imageUrl || optionImage;
      const leafOptions = Array.isArray(subOption?.subSubOptions) ? subOption.subSubOptions : [];

      if (leafOptions.length === 0) {
        rows.push({
          id: `${card.id}-sub-${optionIndex}-${subIndex}`,
          title: subOption?.label || option?.label || card?.title || sectionName,
          subtitle: [card?.title, option?.label].filter(Boolean).join(" • "),
          summary: getTermsSummary(subOption?.terms || option?.terms || card?.terms),
          bulletPoints: splitTextList(subOption?.terms || option?.terms || card?.terms),
          packagesIncludes: splitTextList(
            subOption?.packagesIncludes || option?.packagesIncludes || card?.packagesIncludes
          ),
          imageUrl: subImage,
          price: Number(option?.price || 0) + Number(subOption?.price || 0),
          categoryPath: [sectionName, card?.title, option?.label, subOption?.label].filter(Boolean),
          cartKey: `${card.id}-${option?.label || optionIndex}-${subOption?.label || subIndex}`,
          offerText: String(subOption?.offerText || option?.offerText || card?.offerText || "").trim(),
        });
        return;
      }

      leafOptions.forEach((leaf, leafIndex) => {
        rows.push({
          id: `${card.id}-leaf-${optionIndex}-${subIndex}-${leafIndex}`,
          title: leaf?.label || subOption?.label || option?.label || card?.title || sectionName,
          subtitle: [card?.title, option?.label, subOption?.label].filter(Boolean).join(" • "),
          summary: getTermsSummary(leaf?.terms || subOption?.terms || option?.terms || card?.terms),
          bulletPoints: splitTextList(leaf?.terms || subOption?.terms || option?.terms || card?.terms),
          packagesIncludes: splitTextList(
            leaf?.packagesIncludes ||
              subOption?.packagesIncludes ||
              option?.packagesIncludes ||
              card?.packagesIncludes
          ),
          imageUrl: leaf?.imageUrl || subImage,
          price: Number(option?.price || 0) + Number(leaf?.price || 0),
          categoryPath: [sectionName, card?.title, option?.label, subOption?.label, leaf?.label].filter(Boolean),
          cartKey: `${card.id}-${option?.label || optionIndex}-${subOption?.label || subIndex}-${leaf?.label || leafIndex}`,
          offerText: String(
            leaf?.offerText || subOption?.offerText || option?.offerText || card?.offerText || ""
          ).trim(),
        });
      });
    });
  });

  return rows;
}

function buildNurseryHierarchyTree(rows) {
  const root = [];
  const nodeMap = new Map();

  rows.forEach((row) => {
    const segments = (row?.categoryPath || [])
      .slice(1)
      .map((label) => String(label || "").trim())
      .filter(Boolean);

    if (!segments.length) return;

    let parentChildren = root;
    let parentKey = "";

    segments.forEach((segment, index) => {
      const nodeKey = parentKey ? `${parentKey}__${segment}` : segment;
      let node = nodeMap.get(nodeKey);

      if (!node) {
        node = {
          key: nodeKey,
          label: segment,
          depth: index,
          children: [],
          rowIds: new Set(),
          row: null,
        };
        nodeMap.set(nodeKey, node);
        parentChildren.push(node);
      }

      node.rowIds.add(row.id);

      if (index === segments.length - 1) {
        node.row = row;
      }

      parentChildren = node.children;
      parentKey = nodeKey;
    });
  });

  const finalize = (nodes) =>
    nodes
      .map((node) => ({
        ...node,
        rowIds: Array.from(node.rowIds),
        children: finalize(node.children),
      }));

  return finalize(root);
}

function collectHierarchyRowIds(nodes) {
  const ids = new Set();

  const walk = (items) => {
    items.forEach((item) => {
      item.rowIds.forEach((id) => ids.add(id));
      if (item.children.length > 0) walk(item.children);
    });
  };

  walk(nodes);
  return Array.from(ids);
}

function collectHierarchyNodeKeys(nodes) {
  const keys = [];

  const walk = (items) => {
    items.forEach((item) => {
      keys.push(item.key);
      if (item.children.length > 0) walk(item.children);
    });
  };

  walk(nodes);
  return keys;
}

function filterHierarchyTree(nodes, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) return nodes;

  const walk = (items) =>
    items.reduce((accumulator, item) => {
      const filteredChildren = walk(item.children || []);
      const selfMatches = String(item.label || "").toLowerCase().includes(normalizedQuery);

      if (selfMatches || filteredChildren.length > 0) {
        accumulator.push({
          ...item,
          children: filteredChildren,
        });
      }

      return accumulator;
    }, []);

  return walk(nodes);
}

function getHierarchySelectionState(rowIds, selectedRowIds) {
  const total = rowIds.length;
  const selectedCount = rowIds.filter((id) => selectedRowIds.has(id)).length;

  return {
    checked: total > 0 && selectedCount === total,
    indeterminate: selectedCount > 0 && selectedCount < total,
  };
}

function NurseryHierarchyNode({ node, selectedRowIds, expandedKeys, onToggle, onToggleExpand }) {
  const selectionState = getHierarchySelectionState(node.rowIds, selectedRowIds);
  const isExpandable = node.children.length > 0;
  const isExpanded = isExpandable ? expandedKeys.has(node.key) : false;

  return (
    <div className={`nursery-filter-tree-node depth-${Math.min(node.depth, 4)}`}>
      <div className="nursery-filter-tree-label">
        <input
          ref={(element) => {
            if (element) {
              element.indeterminate = selectionState.indeterminate;
            }
          }}
          type="checkbox"
          checked={selectionState.checked}
          onChange={() => onToggle(node.rowIds, !selectionState.checked)}
        />

        <span className="nursery-filter-tree-text">
          <span className="nursery-filter-tree-title">
            {isExpandable ? (
              <button
                type="button"
                className="nursery-filter-tree-expand"
                aria-label={isExpanded ? `Collapse ${node.label}` : `Expand ${node.label}`}
                onClick={() => onToggleExpand(node.key)}
              >
                {isExpanded ? "−" : "+"}
              </button>
            ) : (
              <span className="nursery-filter-tree-expand is-placeholder" aria-hidden="true">
                •
              </span>
            )}
            <span className="nursery-filter-tree-name">{node.label}</span>
          </span>
          {node.children.length > 0 ? (
            <span className="nursery-filter-tree-meta">{node.rowIds.length}</span>
          ) : null}
        </span>
      </div>

      {node.children.length > 0 && isExpanded ? (
        <div className="nursery-filter-tree-children">
          {node.children.map((child) => (
            <NurseryHierarchyNode
              key={child.key}
              node={child}
              selectedRowIds={selectedRowIds}
              expandedKeys={expandedKeys}
              onToggle={onToggle}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NurseryProductCard({ row, cartItem, onAddToCart, onIncreaseQty, onDecreaseQty, viewMode }) {
  const normalizedPath = [...new Set((row?.categoryPath || []).map((label) => String(label || "").trim()).filter(Boolean))];
  const categoryRoot = normalizedPath[0] || "";
  const mostSpecificPathLabel =
    [...normalizedPath]
      .reverse()
      .find((label) => label && label !== categoryRoot) || "";
  const displayTitle =
    (row?.title && row.title !== categoryRoot ? row.title : "") ||
    mostSpecificPathLabel ||
    row?.title ||
    categoryRoot ||
    "Item";
  const breadcrumbSegments = normalizedPath.filter(
    (label, index) =>
      label &&
      !(index === normalizedPath.length - 1 && label.toLowerCase() === String(displayTitle || "").trim().toLowerCase())
  );
  const breadcrumbText = breadcrumbSegments.join(" / ");
  const displaySummary =
    row?.summary && row.summary !== breadcrumbText ? row.summary : "";
  const packageIncludes = Array.isArray(row?.packagesIncludes)
    ? row.packagesIncludes.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const termPoints = Array.isArray(row?.bulletPoints)
    ? row.bulletPoints.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const shouldShowSummary = Boolean(displaySummary) && termPoints.length === 0;

  const handleAdd = () => {
    if (typeof onAddToCart !== "function") return;
    onAddToCart(
      {
        _id: row.cartKey,
        categoryId: row.cartKey,
        cartKey: row.cartKey,
        name: row.title,
        price: Number(row.price) || 0,
      },
      row.categoryPath,
      []
    );
  };

  return (
    <article className={`nursery-product-card ${viewMode === "list" ? "is-list" : ""}`}>
      <div className="nursery-product-media">
        {row.offerText ? <span className="nursery-sale-badge">{row.offerText}</span> : null}
        {row.imageUrl ? (
          <img src={row.imageUrl} alt={row.title} />
        ) : (
          <div className="nursery-product-placeholder">Preview</div>
        )}
      </div>
      <div className="nursery-product-body">
        {breadcrumbText ? <p className="nursery-product-breadcrumb">{breadcrumbText}</p> : null}
        <h3>{displayTitle}</h3>
        {shouldShowSummary ? <p className="nursery-product-summary">{displaySummary}</p> : null}
        {packageIncludes.length > 0 ? (
          <div className="nursery-product-meta-box">
            <div className="nursery-product-meta-title">Package Includes</div>
            <div className="nursery-product-package-list">
              {packageIncludes.map((item, index) => (
                <span key={`${row.id}-package-${index}`}>{item}</span>
              ))}
            </div>
          </div>
        ) : null}
        {termPoints.length > 0 ? (
          <ul className="nursery-product-terms">
            {termPoints.map((point, index) => (
              <li key={`${row.id}-term-${index}`}>{point}</li>
            ))}
          </ul>
        ) : null}
        <div className="nursery-mobile-product-copy">
          <strong>{displayTitle}</strong>
          {breadcrumbText ? <span>{breadcrumbText}</span> : null}
        </div>
        <div className="nursery-product-footer">
          <div className="nursery-mobile-footer-copy">
            <strong>{displayTitle}</strong>
            {breadcrumbText ? <span>{breadcrumbText}</span> : null}
          </div>
          <span
            className={`nursery-product-price ${
              hasDisplayPrice(row.price) ? "" : "is-contact"
            }`}
          >
            {formatCurrency(row.price)}
          </span>
          {cartItem ? (
            <div className="nursery-qty-controls">
              <button type="button" onClick={() => onDecreaseQty?.(row.cartKey)}>-</button>
              <span>{cartItem.qty || 1}</span>
              <button type="button" onClick={() => onIncreaseQty?.(row.cartKey)}>+</button>
            </div>
          ) : (
            <button type="button" className="nursery-add-btn" onClick={handleAdd}>
              Add to Cart
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function NurseryCollectionCard({ collection, isActive, onClick }) {
  const images = Array.isArray(collection?.images) ? collection.images.filter(Boolean) : [];
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    setImageIndex(0);
  }, [collection?.id, images.length]);

  useEffect(() => {
    if (images.length <= 1) return undefined;

    const intervalId = window.setInterval(() => {
      setImageIndex((current) => (current + 1) % images.length);
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [images]);

  const currentImage = images[imageIndex] || collection?.imageUrl || "";

  return (
    <button
      type="button"
      className={`nursery-collection-card ${isActive ? "is-active" : ""}`}
      onClick={onClick}
    >
      {currentImage ? (
        <div className="nursery-collection-image">
          <img src={currentImage} alt={collection.title} />
        </div>
      ) : null}
      <div className="nursery-collection-overlay">
        <h3>{collection.title}</h3>
        <p>{collection.description}</p>
        <span>View {collection.itemCount} items</span>
      </div>
    </button>
  );
}

export default function NurseriesPreviewTemplate({
  vendorInfo,
  category,
  orderedCategories,
  sectionsWithHeading,
  cardsWithoutHeading,
  mergedHeroImages,
  heroTagline,
  heroDescription,
  cartItems,
  cartTotal,
  onAddToCart,
  onIncreaseQty,
  onDecreaseQty,
  onOpenMenu,
  onOpenGallery,
  hasVendorSession = false,
  onLogout,
  colorScheme = "forest",
}) {
  const [activeSectionName, setActiveSectionName] = useState("");
  const [selectedHierarchyRowIds, setSelectedHierarchyRowIds] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState("featured");
  const [viewMode, setViewMode] = useState("grid");
  const [serviceModeLabel, setServiceModeLabel] = useState("Service Type");
  const [heroImageIndex, setHeroImageIndex] = useState(0);
  const [hierarchySearch, setHierarchySearch] = useState("");
  const [expandedHierarchyKeys, setExpandedHierarchyKeys] = useState([]);
  const [showAdminMenu, setShowAdminMenu] = useState(false);

  const navItems = useMemo(() => {
    const webMenu = Array.isArray(category?.webMenu) ? category.webMenu : [];
    const mapped = webMenu
      .map((item) => {
        const normalized = String(item || "").trim().toLowerCase();
        if (!normalized) return null;
        if (normalized === "categories" || normalized === "services") return { label: item, href: "#services" };
        if (normalized === "gallery") return { label: item, href: "#gallery", action: "gallery" };
        if (normalized === "contact") return { label: item, href: "#contact" };
        return { label: item, href: `#${toAnchor(item)}` };
      })
      .filter(Boolean);
    return mapped;
  }, [category]);

  const handleNavClick = (event, item) => {
    if (item?.action === "gallery") {
      event.preventDefault();
      onOpenGallery?.();
      setMobileMenuOpen(false);
    }
  };

  const serviceSections = useMemo(() => {
    const flatSections = [];

    (orderedCategories || []).forEach((section) => {
      const normalized = String(section?.sectionName || "").trim().toLowerCase();
      if (normalized === "offers") return;

      const filteredCards = (Array.isArray(section.cards) ? section.cards : [])
        .filter((card) => !isOfferLikeCard(card, section.sectionName))
        .map((card, index) => ({
          ...card,
          id: card?.id || `${section.sectionName}-${index}`,
          title: card?.title || section.sectionName,
        }))
        .filter(isDisplayableCard);

      if (filteredCards.length === 0) return;
      flatSections.push({ sectionName: section.sectionName, cards: filteredCards });
    });

    return flatSections;
  }, [orderedCategories]);

  useEffect(() => {
    if (!serviceSections.length) return;
    if (serviceSections.some((section) => section.sectionName === activeSectionName)) return;
    setActiveSectionName(serviceSections[0].sectionName);
  }, [activeSectionName, serviceSections]);

  const activeSection =
    serviceSections.find((section) => section.sectionName === activeSectionName) ||
    serviceSections[0] ||
    null;
  const activeSectionRows = useMemo(() => {
    if (!activeSection) return [];
    return activeSection.cards.flatMap((card) =>
      buildNurseryRows(card, activeSection.sectionName)
    );
  }, [activeSection]);
  const trustSummary = vendorInfo?.trustSummary || vendorInfo?.trust || {};
  const trustEntries = useMemo(
    () =>
      Object.entries(trustSummary || {}).filter(
        ([, value]) => value !== null && value !== undefined && value !== ""
      ),
    [trustSummary]
  );
  const trustCategoryId = vendorInfo?.categoryId || category?._id || category?.id;
  const [trustQuestionLabels, setTrustQuestionLabels] = useState({});
  const trustDisplayEntries = useMemo(
    () =>
      trustEntries
        .map(([key, value]) => {
          const items = Array.isArray(value)
            ? value.map((item) => String(item || "").trim()).filter(Boolean)
            : [];
          return {
            key,
            label:
              trustQuestionLabels[key] ||
              String(key).replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
            value: Array.isArray(value) ? items.join(" + ") : String(value),
            values: items,
            isList: Array.isArray(value),
          };
        })
        .filter((entry) => String(entry.value || "").trim()),
    [trustEntries, trustQuestionLabels]
  );
  const serviceModeEntry = useMemo(
    () =>
      trustEntries.find(
        ([key, value]) =>
          Array.isArray(value) && /(service|mode|delivery|format|type)/i.test(String(key))
      ) || null,
    [trustEntries]
  );
  const serviceModes = useMemo(
    () =>
      Array.isArray(serviceModeEntry?.[1])
        ? serviceModeEntry[1].map((item) => String(item || "").trim()).filter(Boolean)
        : [],
    [serviceModeEntry]
  );
  const serviceModeTrustKey = useMemo(
    () => String(serviceModeEntry?.[0] || "").trim(),
    [serviceModeEntry]
  );
  const extraListEntries = useMemo(
    () =>
      trustDisplayEntries.filter(
        (entry) => entry.isList && String(entry.key || "") !== serviceModeTrustKey
      ),
    [serviceModeTrustKey, trustDisplayEntries]
  );
  const statEntries = useMemo(
    () => trustDisplayEntries.filter((entry) => !entry.isList),
    [trustDisplayEntries]
  );
  const googleProfileLink = useMemo(
    () =>
      buildGoogleProfileLink({
        mapsUrl: vendorInfo?.googlePlace?.mapsUrl,
        businessName: vendorInfo?.businessName,
        heroTagline,
        categoryName: category?.name,
      }),
    [category?.name, heroTagline, vendorInfo?.businessName, vendorInfo?.googlePlace?.mapsUrl]
  );
  const trustKeysKey = useMemo(
    () => trustEntries.map(([key]) => String(key || "").trim()).filter(Boolean).join("|"),
    [trustEntries]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadTrustQuestionMeta() {
      const trustKeys = trustKeysKey ? trustKeysKey.split("|").filter(Boolean) : [];

      if (!trustCategoryId || trustKeys.length === 0) {
        if (!cancelled) {
          setServiceModeLabel("Service Type");
          setTrustQuestionLabels({});
        }
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/trust/questions?categoryId=${encodeURIComponent(String(trustCategoryId))}`
        );
        const data = await response.json();
        const questions = Array.isArray(data?.questions) ? data.questions : [];
        if (!cancelled) {
          const labelMap = {};
          questions.forEach((question) => {
            const id = String(question?.id || "").trim();
            if (!id) return;
            labelMap[id] = String(question?.label || id);
          });
          setTrustQuestionLabels(labelMap);
          setServiceModeLabel(
            String(
              (serviceModeTrustKey && labelMap[serviceModeTrustKey]) ||
              serviceModeTrustKey ||
              "Service Type"
            )
          );
        }
      } catch {
        if (!cancelled) {
          setTrustQuestionLabels({});
          setServiceModeLabel(String(serviceModeTrustKey || "Service Type"));
        }
      }
    }

    loadTrustQuestionMeta();
    return () => {
      cancelled = true;
    };
  }, [serviceModeTrustKey, trustCategoryId, trustKeysKey]);

  const hierarchyTree = useMemo(
    () => buildNurseryHierarchyTree(activeSectionRows),
    [activeSectionRows]
  );

  const allHierarchyRowIds = useMemo(
    () => collectHierarchyRowIds(hierarchyTree),
    [hierarchyTree]
  );

  const allHierarchyKeys = useMemo(
    () => collectHierarchyNodeKeys(hierarchyTree),
    [hierarchyTree]
  );

  useEffect(() => {
    setSelectedHierarchyRowIds(allHierarchyRowIds);
  }, [allHierarchyRowIds]);

  useEffect(() => {
    setExpandedHierarchyKeys(allHierarchyKeys);
  }, [allHierarchyKeys]);

  const filteredHierarchyTree = useMemo(
    () => filterHierarchyTree(hierarchyTree, hierarchySearch),
    [hierarchyTree, hierarchySearch]
  );

  const activeRows = useMemo(() => {
    let rows = [...activeSectionRows];

    if (selectedHierarchyRowIds.length > 0) {
      const selectedSet = new Set(selectedHierarchyRowIds);
      rows = rows.filter((row) => selectedSet.has(row.id));
    } else {
      rows = [];
    }

    const sorted = [...rows];
    if (sortBy === "price_low") {
      sorted.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    } else if (sortBy === "price_high") {
      sorted.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    } else if (sortBy === "name") {
      sorted.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
    }
    return sorted;
  }, [activeSectionRows, selectedHierarchyRowIds, sortBy]);

  const selectedHierarchyRowIdSet = useMemo(
    () => new Set(selectedHierarchyRowIds),
    [selectedHierarchyRowIds]
  );

  const expandedHierarchyKeySet = useMemo(
    () => new Set(expandedHierarchyKeys),
    [expandedHierarchyKeys]
  );

  const toggleHierarchyRows = (rowIds, shouldSelect) => {
    setSelectedHierarchyRowIds((current) => {
      const next = new Set(current);
      rowIds.forEach((id) => {
        if (shouldSelect) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return Array.from(next);
    });
  };

  const toggleHierarchyExpand = (nodeKey) => {
    setExpandedHierarchyKeys((current) => {
      const next = new Set(current);
      if (next.has(nodeKey)) {
        next.delete(nodeKey);
      } else {
        next.add(nodeKey);
      }
      return Array.from(next);
    });
  };

  const collectionCards = useMemo(() => {
    return serviceSections.map((section) => {
      const rows = section.cards.flatMap((card) => buildNurseryRows(card, section.sectionName));
      const images = [
        ...new Set(
          [
            ...section.cards.map((card) => getCardImage(card)),
            ...rows.map((row) => row.imageUrl),
          ].filter(Boolean)
        ),
      ];
      const previewTitles = rows
        .slice(0, 2)
        .map((row) => row.title)
        .filter(Boolean);
      const remainingCount = Math.max(rows.length - previewTitles.length, 0);
      const titlePreview = [
        ...previewTitles,
        remainingCount > 0 ? `+${remainingCount} more` : "",
      ]
        .filter(Boolean)
        .join(" • ");

      return {
        id: section.sectionName,
        title: section.sectionName,
        description: titlePreview || "Explore premium nursery collections.",
        imageUrl: images[0] || "",
        images,
        itemCount: rows.length,
      };
    });
  }, [serviceSections]);

  const repeatedCollectionCards = collectionCards.length > 1 ? [...collectionCards, ...collectionCards] : collectionCards;
  const heroImageList = useMemo(() => {
    return [
      ...new Set(
        [
          ...(Array.isArray(mergedHeroImages) ? mergedHeroImages : []),
          ...collectionCards.flatMap((collection) => (Array.isArray(collection.images) ? collection.images : [])),
        ]
          .map((image) => String(image || "").trim())
          .filter(Boolean)
      ),
    ];
  }, [collectionCards, mergedHeroImages]);
  const heroImage = heroImageList[heroImageIndex] || "";
  const introSummary = getRefinedHeroCopy({
    heroDescription,
    categoryName: category?.name,
    address: vendorInfo?.location?.address,
  });
  const phoneNumbers = [
    vendorInfo?.phone,
    ...(Array.isArray(vendorInfo?.secondaryPhones) ? vendorInfo.secondaryPhones : []),
  ].filter(Boolean);
  const customerPortalUrl = `${getYnotBaseUrl()}/mybills`;

  const locationLat = vendorInfo?.location?.lat;
  const locationLng = vendorInfo?.location?.lng;
  const logoUrl = typeof vendorInfo?.logoUrl === "string" ? vendorInfo.logoUrl.trim() : "";

  const handleOpenEnquiry = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(ENQUIRY_OPEN_EVENT));
    }
    scrollToElementById("contact");
  };

  useEffect(() => {
    if (!heroImageList.length) return;
    setHeroImageIndex((current) => (current >= heroImageList.length ? 0 : current));
  }, [heroImageList]);

  useEffect(() => {
    if (heroImageList.length <= 1) return;
    const interval = window.setInterval(() => {
      setHeroImageIndex((current) => (current + 1) % heroImageList.length);
    }, 1800);

    return () => window.clearInterval(interval);
  }, [heroImageList]);

  return (
    <div
      className={`nursery-template-shell theme-${
        String(colorScheme || "forest").trim().toLowerCase() || "forest"
      }`}
    >
      <header className="nursery-header" id="home">
        <div className="nursery-header-top">
          {navItems.length > 0 ? (
            <button
              type="button"
              className={`nursery-mobile-toggle ${mobileMenuOpen ? "is-open" : ""}`}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((current) => !current)}
            >
              <span />
              <span />
              <span />
            </button>
          ) : (
            <div />
          )}

          <a className="nursery-brand" href="#home">
            {logoUrl ? (
              <img src={logoUrl} alt={`${vendorInfo?.businessName || "Nursery"} logo`} className="nursery-brand-logo" />
            ) : (
              <span className="nursery-brand-mark">
                {(vendorInfo?.businessName || category?.name || "N").charAt(0).toUpperCase()}
              </span>
            )}
            <span className="nursery-brand-text">{vendorInfo?.businessName || "Nursery"}</span>
          </a>

          <div className="nursery-searchbar">
            <select
              value={activeSection?.sectionName || ""}
              onChange={(event) => {
                setActiveSectionName(event.target.value);
                scrollToElementById("services");
              }}
            >
              <option value="">All categories</option>
              {serviceSections.map((section) => (
                <option key={section.sectionName} value={section.sectionName}>
                  {section.sectionName}
                </option>
              ))}
            </select>
          </div>

          <div className="nursery-header-actions">
            {phoneNumbers[0] ? (
              <a
                href={`tel:${phoneNumbers[0]}`}
                className="nursery-header-action nursery-header-action-primary"
              >
                <span className="nursery-header-action-label">Call Now</span>
                <span className="nursery-header-action-meta">{phoneNumbers[0]}</span>
              </a>
            ) : null}
            <div className="nursery-admin-menu">
              <button
                type="button"
                className="nursery-header-action nursery-header-action-secondary"
                onClick={() => setShowAdminMenu((current) => !current)}
              >
                <span className="nursery-header-action-label">Admin</span>
              </button>
              {showAdminMenu ? (
                <div className="nursery-admin-dropdown">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdminMenu(false);
                      openAdminMenu();
                    }}
                  >
                    Menu
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdminMenu(false);
                      openAdminDashboard();
                    }}
                  >
                    Dashboard
                  </button>
                </div>
              ) : null}
            </div>
            {hasVendorSession ? (
              <button
                type="button"
                className="nursery-header-action nursery-header-action-secondary"
                onClick={onLogout}
              >
                <span className="nursery-header-action-label">Logout</span>
              </button>
            ) : null}
            <button
              type="button"
              className="nursery-header-action nursery-header-action-secondary"
              onClick={onOpenMenu}
            >
              <span className="nursery-header-action-label">Cart</span>
              <span className="nursery-header-action-badge">
                {cartItems.length > 0 ? cartItems.length : 0}
              </span>
            </button>
          </div>
        </div>

        {navItems.length > 0 || customerPortalUrl ? (
          <nav className="nursery-nav" aria-label="Primary">
            {navItems.map((item) => (
              <a key={`${item.label}-${item.href}`} href={item.href} onClick={(event) => handleNavClick(event, item)}>
                {item.label}
              </a>
            ))}
            <a href={customerPortalUrl} target="_blank" rel="noopener noreferrer">
              My Bills & Rewards
            </a>
          </nav>
        ) : null}

        {mobileMenuOpen && (navItems.length > 0 || customerPortalUrl) ? (
          <div className="nursery-mobile-menu">
            {navItems.map((item) => (
              <a
                key={`${item.label}-mobile`}
                href={item.href}
                onClick={(event) => {
                  handleNavClick(event, item);
                  if (item?.action !== "gallery") setMobileMenuOpen(false);
                }}
              >
                {item.label}
              </a>
            ))}
            <a
              href={customerPortalUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileMenuOpen(false)}
            >
              My Bills & Rewards
            </a>
            {hasVendorSession ? (
              <button
                type="button"
                className="nursery-mobile-menu-logout"
                onClick={() => {
                  onLogout?.();
                  setMobileMenuOpen(false);
                }}
              >
                Logout
              </button>
            ) : null}
            <div className="nursery-mobile-admin-menu">
              <button
                type="button"
                className="nursery-mobile-menu-logout"
                onClick={() => setShowAdminMenu((current) => !current)}
              >
                Admin
              </button>
              {showAdminMenu ? (
                <div className="nursery-admin-dropdown nursery-admin-dropdown-mobile">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdminMenu(false);
                      setMobileMenuOpen(false);
                      openAdminMenu();
                    }}
                  >
                    Menu
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdminMenu(false);
                      setMobileMenuOpen(false);
                      openAdminDashboard();
                    }}
                  >
                    Dashboard
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      <section className="nursery-hero">
        <div className="nursery-hero-copy">
          <h1>{heroTagline || vendorInfo?.businessName || category?.name || "Nursery"}</h1>
          <p>{introSummary}</p>

          {statEntries.length > 0 || typeof vendorInfo?.googlePlace?.rating === "number" ? (
            <div className="nursery-stats-grid">
              {statEntries.map((entry) => (
                <div key={entry.key} className="nursery-stat-card">
                  <strong>{entry.value}</strong>
                  <span>{entry.label}</span>
                </div>
              ))}
              {typeof vendorInfo?.googlePlace?.rating === "number" ? (
                googleProfileLink ? (
                  <a
                    className="nursery-stat-card is-link"
                    href={googleProfileLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <strong>{vendorInfo.googlePlace.rating}*</strong>
                    <span>
                      Google Rating
                      {vendorInfo?.googlePlace?.userRatingsTotal
                        ? ` (${vendorInfo.googlePlace.userRatingsTotal})`
                        : ""}
                    </span>
                  </a>
                ) : (
                  <div className="nursery-stat-card">
                    <strong>{vendorInfo.googlePlace.rating}*</strong>
                    <span>
                      Google Rating
                      {vendorInfo?.googlePlace?.userRatingsTotal
                        ? ` (${vendorInfo.googlePlace.userRatingsTotal})`
                        : ""}
                    </span>
                  </div>
                )
              ) : null}
            </div>
          ) : null}

          {serviceModes.length > 0 || extraListEntries.length > 0 ? (
            <div className="nursery-service-mode-groups">
              {serviceModes.length > 0 ? (
                <div className="nursery-service-mode-group">
                  <p className="nursery-service-mode-group-label">{serviceModeLabel}</p>
                  <div className="nursery-service-mode-list">
                    {serviceModes.map((mode) => (
                      <span key={`service-mode-${mode}`} className="nursery-service-mode-chip">
                        <span className="nursery-service-mode-chip-icon">✓</span>
                        {mode}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {extraListEntries.map((entry) => (
                <div key={entry.key} className="nursery-service-mode-group">
                  <p className="nursery-service-mode-group-label">{entry.label}</p>
                  <div className="nursery-service-mode-list">
                    {entry.values.map((value) => (
                      <span key={`${entry.key}-${value}`} className="nursery-service-mode-chip">
                        <span className="nursery-service-mode-chip-icon">✓</span>
                        {value}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="nursery-hero-visual-column">
          <div className="nursery-hero-visual">
            {heroImage ? <img src={heroImage} alt={heroTagline || vendorInfo?.businessName || "Nursery preview"} /> : null}
          </div>
          {heroImageList.length > 0 ? (
            <div className="nursery-hero-gallery-action">
              <button type="button" className="nursery-secondary-btn" onClick={onOpenGallery}>
                View Gallery
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {collectionCards.length > 0 ? (
        <section className="nursery-collections" id="collections">
          <div className="nursery-section-head">
            <h2>Explore by Category</h2>
            <p>Browse every collection as a dedicated box and jump straight into the products you need.</p>
          </div>

          <div className="nursery-collections-marquee">
            <div
              className={`nursery-collections-track ${
                collectionCards.length > 1 ? "is-animated" : ""
              }`}
            >
              {repeatedCollectionCards.map((collection, index) => (
                <NurseryCollectionCard
                  key={`${collection.id}-${index}`}
                  collection={collection}
                  isActive={activeSection?.sectionName === collection.title}
                  onClick={() => {
                    setActiveSectionName(collection.title);
                    scrollToElementById("services");
                  }}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="nursery-products" id="services">
        <div className="nursery-mobile-toolbar">
          <button type="button" onClick={() => setMobileFiltersOpen((current) => !current)}>
            <span>Filters</span>
            <strong>{activeSection?.sectionName || "All categories"}</strong>
          </button>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="featured">Sort by</option>
            <option value="name">Name</option>
            <option value="price_low">Price: Low to High</option>
            <option value="price_high">Price: High to Low</option>
          </select>
        </div>

        <div className="nursery-products-layout">
          <aside className={`nursery-sidebar ${mobileFiltersOpen ? "is-open" : ""}`}>
            <div className="nursery-sidebar-head">
              <h3>Filters</h3>
              <button type="button" className="nursery-sidebar-close" onClick={() => setMobileFiltersOpen(false)}>
                Close
              </button>
            </div>

            <div className="nursery-filter-group">
              <strong>Categories</strong>
              <div className="nursery-filter-list">
                {serviceSections.map((section) => {
                  const count = section.cards.flatMap((card) => buildNurseryRows(card, section.sectionName)).length;
                  const active = activeSection?.sectionName === section.sectionName;
                  return (
                    <button
                      key={section.sectionName}
                      type="button"
                      className={`nursery-filter-item ${active ? "is-active" : ""}`}
                      onClick={() => {
                        setActiveSectionName(section.sectionName);
                        setMobileFiltersOpen(false);
                      }}
                    >
                      <span>{section.sectionName}</span>
                      <span>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {hierarchyTree.length > 0 ? (
              <div className="nursery-filter-group">
                <div className="nursery-filter-group-head">
                  <strong>Hierarchy</strong>
                </div>

                <div className="nursery-filter-search">
                  <input
                    type="text"
                    value={hierarchySearch}
                    onChange={(event) => setHierarchySearch(event.target.value)}
                    placeholder="Search hierarchy"
                  />
                </div>

                <div className="nursery-filter-bulk-actions">
                  <button
                    type="button"
                    className="nursery-filter-bulk-btn"
                    onClick={() => setSelectedHierarchyRowIds(allHierarchyRowIds)}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="nursery-filter-bulk-btn is-secondary"
                    onClick={() => setSelectedHierarchyRowIds([])}
                  >
                    Deselect All
                  </button>
                  <button
                    type="button"
                    className="nursery-filter-bulk-btn is-tertiary"
                    onClick={() => setExpandedHierarchyKeys(allHierarchyKeys)}
                  >
                    Expand All
                  </button>
                  <button
                    type="button"
                    className="nursery-filter-bulk-btn is-tertiary"
                    onClick={() => setExpandedHierarchyKeys([])}
                  >
                    Collapse All
                  </button>
                </div>

                <div className="nursery-filter-hierarchy-tree">
                  {filteredHierarchyTree.map((node) => (
                    <NurseryHierarchyNode
                      key={node.key}
                      node={node}
                      selectedRowIds={selectedHierarchyRowIdSet}
                      expandedKeys={expandedHierarchyKeySet}
                      onToggle={toggleHierarchyRows}
                      onToggleExpand={toggleHierarchyExpand}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </aside>

          <div className="nursery-products-main">
            <div className="nursery-mobile-summary">
              <h2>{activeSection?.sectionName || category?.name || "Nursery Collection"}</h2>
              <p>
                {activeRows.length > 0
                  ? `Showing ${activeRows.length} curated items in this collection.`
                  : "No products found for this collection yet."}
              </p>
            </div>

            <div className="nursery-products-topbar">
              <div>
                <h2>{activeSection?.sectionName || category?.name || "Nursery Collection"}</h2>
                <p>
                  {activeRows.length > 0
                    ? `Showing ${activeRows.length} curated items in this collection.`
                    : "No products found for this collection yet."}
                </p>
              </div>

              <div className="nursery-products-controls">
                <label>
                  Sort by
                  <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                    <option value="featured">Featured</option>
                    <option value="name">Name</option>
                    <option value="price_low">Price: Low to High</option>
                    <option value="price_high">Price: High to Low</option>
                  </select>
                </label>

                <div className="nursery-view-toggle desktop-only">
                  <button type="button" className={viewMode === "grid" ? "is-active" : ""} onClick={() => setViewMode("grid")}>
                    Grid
                  </button>
                  <button type="button" className={viewMode === "list" ? "is-active" : ""} onClick={() => setViewMode("list")}>
                    List
                  </button>
                </div>
              </div>
            </div>

            <div className={`nursery-product-grid ${viewMode === "list" ? "is-list" : ""}`}>
              {activeRows.map((row) => {
                const cartItem = cartItems.find((item) => (item.cartKey || item.itemId) === row.cartKey);
                return (
                  <NurseryProductCard
                    key={row.id}
                    row={row}
                    cartItem={cartItem}
                    viewMode={viewMode}
                    onAddToCart={onAddToCart}
                    onIncreaseQty={onIncreaseQty}
                    onDecreaseQty={onDecreaseQty}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <ContactSection />

      {cartItems.length > 0 ? (
        <div className="nursery-cart-bar">
          <div>
            <strong>{cartItems.length} item(s) selected</strong>
            <span>{formatCurrency(cartTotal)}</span>
          </div>
          <div className="nursery-cart-bar-actions">
            {hasVendorSession ? (
              <button type="button" onClick={onOpenMenu}>
                Go to Cart
              </button>
            ) : (
              <button type="button" className="nursery-cart-secondary-btn" onClick={handleOpenEnquiry}>
                Service Enquiry
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
