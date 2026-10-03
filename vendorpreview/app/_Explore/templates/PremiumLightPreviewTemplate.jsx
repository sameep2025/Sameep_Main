"use client";

import { useMemo, useState } from "react";
import { FaMapMarkerAlt, FaPhoneAlt, FaStar } from "react-icons/fa";
import ContactSection from "../../Contact/Contact";
import { openAdminDashboard, openAdminMenu } from "../../utils/adminQuickActions";
import "./PremiumLightPreviewTemplate.css";

const DEFAULT_NAV = [
  { label: "Categories", href: "#services" },
  { label: "Why Us", href: "#why-us" },
  { label: "Gallery", href: "#gallery", action: "gallery" },
  { label: "Contact", href: "#contact" },
];

function getPoweredByUrl() {
  return (
    process.env.NEXT_PUBLIC_VENDOR_PREVIEW_ROOT_URL ||
    process.env.NEXT_PUBLIC_PREVIEW_BASE_URL ||
    "http://localhost:4000"
  )
    .trim()
    .replace(/\/$/, "");
}

function scrollToElementById(id) {
  if (typeof window === "undefined") return;
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (amount <= 0) return "Contact";
  return `₹${amount.toLocaleString("en-IN")}`;
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
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).join(" + ");
  }
  return String(value ?? "").trim();
}

function isOffersLabel(value) {
  return String(value || "").trim().toLowerCase() === "offers";
}

function isOfferLikeCard(card, sectionName) {
  if (!card) return false;
  if (isOffersLabel(sectionName) || isOffersLabel(card.title)) return true;

  const hasOptionOffers =
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
    });

  return hasOptionOffers && isOffersLabel(card.title);
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
    return `Premium ${String(categoryName).toLowerCase()} services in ${place}.`;
  }

  if (categoryName) {
    return `Premium ${String(categoryName).toLowerCase()} services tailored for everyday care.`;
  }

  return "";
}

function getRefinedHeroCopy({ heroDescription, categoryName, address }) {
  const cleaned = String(heroDescription || "").trim();
  if (cleaned) return cleaned;
  return buildFallbackHeroSummary({ categoryName, address });
}

function splitHeroHeading(value, fallback) {
  const source = String(value || fallback || "").trim();
  if (!source) {
    return { leading: "", accent: "" };
  }

  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return { leading: "", accent: words[0] };
  }

  return {
    leading: words.slice(0, -1).join(" "),
    accent: words[words.length - 1],
  };
}

function buildCatalogRows(card, sectionName) {
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
          categoryPath: [
            sectionName,
            card?.title,
            option?.label,
            subOption?.label,
            leaf?.label,
          ].filter(Boolean),
          cartKey: `${card.id}-${option?.label || optionIndex}-${subOption?.label || subIndex}-${leaf?.label || leafIndex}`,
        });
      });
    });
  });

  return rows;
}

function getCommonPrefix(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const reference = items[0];
  const prefix = [];

  for (let index = 0; index < reference.length; index += 1) {
    const value = reference[index];
    if (items.every((entry) => entry[index] === value)) {
      prefix.push(value);
    } else {
      break;
    }
  }

  return prefix;
}

function PremiumLightServiceCard({ card, sectionName, onAddToCart }) {
  const rows = useMemo(() => buildCatalogRows(card, sectionName), [card, sectionName]);
  const [selectedValues, setSelectedValues] = useState({});
  const [expandedGroups, setExpandedGroups] = useState({});

  const hierarchyState = useMemo(() => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { groups: [], filteredRows: [] };
    }

    const maxDepth = Math.max(...rows.map((row) => row.categoryPath.length));
    const groups = [];
    let narrowedRows = rows;

    for (let depth = 2; depth < maxDepth; depth += 1) {
      const values = Array.from(
        new Set(
          narrowedRows
            .map((row) => String(row.categoryPath?.[depth] || "").trim())
            .filter(Boolean)
        )
      );

      if (values.length === 0) break;

      const key = `level-${depth}`;
      const selected = selectedValues[key];
      const effectiveSelected = values.includes(selected) ? selected : values[0];
      const parentLabel = depth > 2 ? String(narrowedRows[0]?.categoryPath?.[depth - 1] || "").trim() : "";

      groups.push({
        key,
        depth,
        values,
        selected: effectiveSelected,
        label:
          depth === 2
            ? "Select Service"
            : depth === 3
              ? `Choose ${parentLabel || "Variant"} Type`
              : `More ${parentLabel || "Options"}`,
      });

      narrowedRows = narrowedRows.filter(
        (row) => String(row.categoryPath?.[depth] || "").trim() === effectiveSelected
      );
    }

    return {
      groups,
      filteredRows: narrowedRows,
    };
  }, [rows, selectedValues]);

  const chipGroups = hierarchyState.groups;
  const filteredRows = hierarchyState.filteredRows;
  const primaryGroup = chipGroups[0] || null;
  const secondaryGroups = chipGroups.slice(1);

  const activeRow = filteredRows[0] || rows[0] || null;
  const supportingRows = filteredRows.slice(1, 3);
  const highlightImage = activeRow?.imageUrl || getCardImage(card);
  const displayPoints = activeRow?.bulletPoints?.slice(0, 3) || [];
  const commonPath = getCommonPrefix(filteredRows.map((row) => row.categoryPath || []));
  const detailPath = activeRow
    ? activeRow.categoryPath.filter((item, index) => commonPath[index] !== item).slice(0, 2)
    : [];
  const selectionSummary = [primaryGroup?.selected, ...secondaryGroups.map((group) => group.selected)]
    .filter(Boolean)
    .join(" • ");

  const handleAdd = () => {
    if (!activeRow || typeof onAddToCart !== "function") return;

    onAddToCart(
      {
        _id: card.id,
        categoryId: card.id,
        cartKey: activeRow.cartKey,
        name: activeRow.title,
        price: Number(activeRow.price) || 0,
      },
      activeRow.categoryPath,
      []
    );
  };

  return (
    <article className="premium-light-service-card">
      <div className="premium-light-service-visual">
        {highlightImage ? (
          <img src={highlightImage} alt={activeRow?.title || card.title} />
        ) : (
          <div className="premium-light-service-fallback">
            {(card.title || sectionName || "S").charAt(0).toUpperCase()}
          </div>
        )}
        <div className="premium-light-service-overlay">
          <h3>{card.title}</h3>
          <strong>{formatCurrency(activeRow?.price)}</strong>
          {detailPath.length > 0 ? <p>{detailPath.join(" • ")}</p> : null}
        </div>
      </div>

      <div className="premium-light-service-body">
        {primaryGroup && primaryGroup.values.length > 1 ? (
          <div className="premium-light-chip-group premium-light-chip-group--primary">
            <span>{primaryGroup.label}</span>
            <div className="premium-light-chip-row premium-light-chip-row--primary">
              {primaryGroup.values.map((value) => {
                const isActive = primaryGroup.selected === value;
                return (
                  <button
                    key={`${primaryGroup.key}-${value}`}
                    type="button"
                    className={`premium-light-chip ${isActive ? "is-active" : ""}`}
                    onClick={() =>
                      setSelectedValues((current) => ({
                        ...current,
                        [primaryGroup.key]: value,
                      }))
                    }
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {selectionSummary ? (
          <div className="premium-light-selection-summary">
            <span>Selected</span>
            <strong>{selectionSummary}</strong>
          </div>
        ) : null}

        {secondaryGroups.length > 0 ? (
          <div className="premium-light-secondary-panel">
            {secondaryGroups.map((group) => (
              group.values.length > 1 ? (
                <div key={group.key} className="premium-light-chip-group premium-light-chip-group--secondary">
                  <span>{group.label}</span>
                  <div className="premium-light-chip-row premium-light-chip-row--secondary">
                    {(expandedGroups[group.key] ? group.values : group.values.slice(0, 8)).map((value) => {
                      const isActive = group.selected === value;
                      return (
                        <button
                          key={`${group.key}-${value}`}
                          type="button"
                          className={`premium-light-chip ${isActive ? "is-active" : ""}`}
                          onClick={() =>
                            setSelectedValues((current) => ({
                              ...current,
                              [group.key]: value,
                            }))
                          }
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>
                  {group.values.length > 8 ? (
                    <button
                      type="button"
                      className="premium-light-chip-toggle"
                      onClick={() =>
                        setExpandedGroups((current) => ({
                          ...current,
                          [group.key]: !current[group.key],
                        }))
                      }
                    >
                      {expandedGroups[group.key] ? "Show less" : `Show ${group.values.length - 8} more`}
                    </button>
                  ) : null}
                </div>
              ) : null
            ))}
          </div>
        ) : null}

        {displayPoints.length > 0 ? (
          <ul className="premium-light-service-points">
            {displayPoints.map((point, index) => (
              <li key={`${activeRow?.id || card.id}-point-${index}`}>{point}</li>
            ))}
          </ul>
        ) : null}

        {supportingRows.length > 0 ? (
          <div className="premium-light-service-related">
            {supportingRows.map((row) => (
              <div key={row.id} className="premium-light-related-line">
                <span>{row.title}</span>
                <strong>{formatCurrency(row.price)}</strong>
              </div>
            ))}
          </div>
        ) : null}

        <button type="button" className="premium-light-add-btn" onClick={handleAdd}>
          Add to Cart
        </button>
      </div>
    </article>
  );
}

export default function PremiumLightPreviewTemplate({
  vendorInfo,
  category,
  sectionsWithHeading,
  cardsWithoutHeading,
  mergedHeroImages,
  heroTagline,
  heroDescription,
  onOpenGallery,
  cartItems,
  cartTotal,
  onAddToCart,
  onIncreaseQty,
  onDecreaseQty,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const trustSummary = vendorInfo?.trustSummary || vendorInfo?.trust || {};
  const poweredByUrl = getPoweredByUrl();
  const customerPortalUrl = `${poweredByUrl}/mybills`;
  const businessName = vendorInfo?.businessName || category?.name || "Business";
  const heroImage = mergedHeroImages?.[0] || "";
  const logoUrl = typeof vendorInfo?.logoUrl === "string" ? vendorInfo.logoUrl.trim() : "";

  const navItems = useMemo(() => {
    const webMenu = Array.isArray(category?.webMenu) ? category.webMenu : [];
    const mapped = webMenu
      .map((item) => {
        const normalized = String(item || "").trim().toLowerCase();
        if (!normalized) return null;
        if (normalized === "categories") return { label: item, href: "#services" };
        if (normalized === "gallery") return { label: item, href: "#gallery", action: "gallery" };
        if (normalized === "why us" || normalized === "about") return { label: item, href: "#why-us" };
        if (normalized === "contact") return { label: item, href: "#contact" };
        return { label: item, href: `#${normalized.replace(/\s+/g, "-")}` };
      })
      .filter(Boolean);

    return mapped.length > 0 ? mapped : DEFAULT_NAV;
  }, [category]);

  const serviceSections = useMemo(() => {
    const flatSections = [];

    (sectionsWithHeading || []).forEach((section) => {
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

      if (filteredCards.length > 0) {
        flatSections.push({ sectionName: section.sectionName, cards: filteredCards });
      }
    });

    if (Array.isArray(cardsWithoutHeading) && cardsWithoutHeading.length > 0) {
      const standaloneCards = cardsWithoutHeading
        .filter((card) => !isOfferLikeCard(card, card?.title))
        .map((card, index) => ({
          ...card,
          id: card?.id || `featured-${index}`,
          title: card?.title || `Featured ${index + 1}`,
        }))
        .filter(isDisplayableCard);

      if (standaloneCards.length > 0) {
        flatSections.unshift({ sectionName: "Featured Services", cards: standaloneCards });
      }
    }

    return flatSections;
  }, [cardsWithoutHeading, sectionsWithHeading]);

  const statEntries = Object.entries(trustSummary)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 2);

  const allRows = useMemo(
    () =>
      serviceSections.flatMap((section) =>
        section.cards.flatMap((card) => buildCatalogRows(card, section.sectionName))
      ),
    [serviceSections]
  );

  const topServices = useMemo(
    () =>
      Array.from(new Set(allRows.map((row) => row.title).filter(Boolean))).slice(0, 4),
    [allRows]
  );

  const areaList = useMemo(() => {
    const source = [
      ...(Array.isArray(vendorInfo?.areasServed) ? vendorInfo.areasServed : []),
      ...String(vendorInfo?.location?.address || "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    ];

    return Array.from(new Set(source)).slice(0, 4);
  }, [vendorInfo]);

  const introSummary = getRefinedHeroCopy({
    heroDescription,
    categoryName: category?.name,
    address: vendorInfo?.location?.address,
  });
  const heroHeading = useMemo(
    () => splitHeroHeading(heroTagline || businessName, businessName),
    [businessName, heroTagline]
  );

  const phoneNumbers = [
    vendorInfo?.phone,
    ...(Array.isArray(vendorInfo?.secondaryPhones) ? vendorInfo.secondaryPhones : []),
  ].filter(Boolean);

  const galleryBadgeImage = mergedHeroImages?.[1] || mergedHeroImages?.[0] || "";

  const handleNavClick = (event, item) => {
    if (item?.action === "gallery") {
      event.preventDefault();
      onOpenGallery?.();
      setMobileMenuOpen(false);
      return;
    }

    if (typeof window !== "undefined" && item?.href?.startsWith("#")) {
      event.preventDefault();
      scrollToElementById(item.href.replace(/^#/, ""));
      setMobileMenuOpen(false);
    }
  };

  return (
    <div className="premium-light-shell">
      <header className="premium-light-header" id="home">
        <a className="premium-light-brand" href="#home">
          {logoUrl ? (
            <img
              className="premium-light-brand-logo"
              src={logoUrl}
              alt={`${businessName} logo`}
            />
          ) : (
            <span className="premium-light-brand-mark">
              {businessName.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="premium-light-brand-text">{businessName}</span>
        </a>

        <nav className="premium-light-nav" aria-label="Primary">
          {navItems.map((item) => (
            <a
              key={`${item.label}-${item.href}`}
              href={item.href}
              onClick={(event) => handleNavClick(event, item)}
            >
              {item.label}
            </a>
          ))}
          <a href={customerPortalUrl} target="_blank" rel="noopener noreferrer">
            My Bills & Rewards
          </a>
        </nav>

        <div className="premium-light-admin-menu">
          <button
            type="button"
            className="premium-light-admin-btn"
            onClick={() => setShowAdminMenu((current) => !current)}
          >
            Admin
          </button>
          {showAdminMenu ? (
            <div className="premium-light-admin-dropdown">
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

        <button
          type="button"
          className="premium-light-cta"
          onClick={() => scrollToElementById("contact")}
        >
          Book Appointment
        </button>

        <button
          type="button"
          className={`premium-light-mobile-toggle ${mobileMenuOpen ? "is-open" : ""}`}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((current) => !current)}
        >
          <span />
          <span />
          <span />
        </button>
      </header>

      {mobileMenuOpen ? (
        <div className="premium-light-mobile-menu">
          {navItems.map((item) => (
            <a
              key={`${item.label}-mobile`}
              href={item.href}
              onClick={(event) => handleNavClick(event, item)}
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
          <div className="premium-light-mobile-admin-menu">
            <button
              type="button"
              className="premium-light-cta premium-light-mobile-admin-btn"
              onClick={() => setShowAdminMenu((current) => !current)}
            >
              Admin
            </button>
            {showAdminMenu ? (
              <div className="premium-light-admin-dropdown premium-light-admin-dropdown-mobile">
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

      <section className="premium-light-hero">
        <div className="premium-light-hero-copy">
          {typeof vendorInfo?.googlePlace?.rating === "number" ? (
            <div className="premium-light-rating-pill">
              <FaStar />
              <span>
                Rated {vendorInfo.googlePlace.rating} on Google
                {vendorInfo?.googlePlace?.userRatingsTotal
                  ? ` (${vendorInfo.googlePlace.userRatingsTotal})`
                  : ""}
              </span>
            </div>
          ) : null}

          <h1>
            {heroHeading.leading ? (
              <>
                <span className="premium-light-hero-heading-main">{heroHeading.leading}</span>{" "}
                <span className="premium-light-hero-heading-accent">{heroHeading.accent}</span>
              </>
            ) : (
              <span className="premium-light-hero-heading-accent">{heroHeading.accent}</span>
            )}
          </h1>
          <p className="premium-light-hero-summary">{introSummary}</p>

          <div className="premium-light-stat-row">
            {statEntries.map(([key, value]) => (
              <div key={key} className="premium-light-stat-card">
                <strong>{formatTrustStatValue(value)}</strong>
                <span>{prettifyLabel(key)}</span>
              </div>
            ))}
          </div>

          <div className="premium-light-hero-actions">
            <button
              type="button"
              className="premium-light-primary-btn"
              onClick={() => scrollToElementById("services")}
            >
              Explore Services <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        <div className="premium-light-hero-visual">
          {heroImage ? (
            <img src={heroImage} alt={heroTagline || businessName} />
          ) : (
            <div className="premium-light-hero-placeholder">{businessName}</div>
          )}

          {galleryBadgeImage ? (
            <div className="premium-light-floating-card">
              <img src={galleryBadgeImage} alt="Gallery highlight" />
              <div>
                <strong>{serviceSections.length} service categories</strong>
                <span>Thoughtfully crafted experiences</span>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="premium-light-why-us" id="why-us">
        <div className="premium-light-section-heading">
          <h2>Why Choose Us</h2>
          <span />
        </div>

        <div className="premium-light-why-grid">
          <div className="premium-light-why-copy">
            <p>{introSummary}</p>
          </div>

          <div className="premium-light-why-metrics">
            {statEntries.map(([key, value]) => (
              <div key={`${key}-metric`} className="premium-light-metric-card">
                <strong>{formatTrustStatValue(value)}</strong>
                <span>{prettifyLabel(key)}</span>
              </div>
            ))}
            {typeof vendorInfo?.googlePlace?.rating === "number" ? (
              <div className="premium-light-metric-card">
                <strong>{vendorInfo.googlePlace.rating}*</strong>
                <span>Google Rating</span>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="premium-light-services" id="services">
        {serviceSections.map((section) => (
          <div key={section.sectionName} className="premium-light-service-section">
            <div className="premium-light-section-heading is-centered">
              <h2>{section.sectionName}</h2>
              <span />
            </div>

            <div className="premium-light-service-grid">
              {section.cards.map((card) => (
                <PremiumLightServiceCard
                  key={card.id}
                  card={card}
                  sectionName={section.sectionName}
                  onAddToCart={onAddToCart}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      {cartItems.length > 0 ? (
        <div className="premium-light-cart-bar">
          <div className="premium-light-cart-summary">
            <strong>{cartItems.length} item(s) in cart</strong>
            <span>{formatCurrency(cartTotal)}</span>
          </div>
          <div className="premium-light-cart-items">
            {cartItems.slice(0, 4).map((item, index) => (
              <div key={`${item.cartKey || item.itemId}-${index}`} className="premium-light-cart-pill">
                <span>{item.name}</span>
                <div className="premium-light-cart-controls">
                  <button type="button" onClick={() => onDecreaseQty(item)}>-</button>
                  <strong>{item.qty || 1}</strong>
                  <button type="button" onClick={() => onIncreaseQty(item)}>+</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <section className="premium-light-contact-wrap" id="contact">
        <div className="premium-light-contact-shell">
          <aside className="premium-light-contact-aside">
            <h3>Secure Your Experience</h3>

            {phoneNumbers[0] ? (
              <div className="premium-light-contact-line">
                <FaPhoneAlt />
                <div>
                  <span>Call Us</span>
                  <a href={`tel:${phoneNumbers[0]}`}>{phoneNumbers[0]}</a>
                </div>
              </div>
            ) : null}

            {vendorInfo?.location?.address ? (
              <div className="premium-light-contact-line">
                <FaMapMarkerAlt />
                <div>
                  <span>Location</span>
                  <p>{vendorInfo.location.address}</p>
                </div>
              </div>
            ) : null}

            {Array.isArray(vendorInfo?.hours) && vendorInfo.hours.length > 0 ? (
              <div className="premium-light-hours">
                <span>Opening Hours</span>
                <ul>
                  {vendorInfo.hours.slice(0, 7).map((entry, index) => (
                    <li key={`${entry?.day || "day"}-${index}`}>
                      <strong>{entry?.day || `Day ${index + 1}`}</strong>
                      <span>{entry?.hours || "Closed"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>

          <div className="premium-light-contact-form">
            <ContactSection
              mode="inline"
              sectionId="premium-light-form"
              hideHeader={false}
              title="Request Appointment"
              subtitle="Tell us what you need and we will help you pick the right service."
              submitLabel="Request Appointment Now"
            />
          </div>
        </div>
      </section>

      <footer className="premium-light-footer">
        <div className="premium-light-footer-grid">
          <div className="premium-light-footer-brand">
            <div className="premium-light-footer-brand-row">
              {logoUrl ? (
                <img src={logoUrl} alt={`${businessName} logo`} />
              ) : (
                <span className="premium-light-footer-logo-fallback">
                  {businessName.charAt(0).toUpperCase()}
                </span>
              )}
              <strong>{businessName}</strong>
            </div>
            <p>{introSummary}</p>
          </div>

          <div>
            <h4>Areas We Serve</h4>
            <ul>
              {areaList.map((area) => (
                <li key={area}>{area}</li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Top Services</h4>
            <ul>
              {topServices.map((service) => (
                <li key={service}>{service}</li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Contact</h4>
            <ul>
              {phoneNumbers.slice(0, 2).map((phone) => (
                <li key={phone}>
                  <a href={`tel:${phone}`}>{phone}</a>
                </li>
              ))}
              {vendorInfo?.email ? (
                <li>
                  <a href={`mailto:${vendorInfo.email}`}>{vendorInfo.email}</a>
                </li>
              ) : null}
            </ul>
          </div>
        </div>

        <div className="premium-light-footer-copy">
          <span>
            © {new Date().getFullYear()} {businessName}. All rights reserved.
          </span>
          <a href={poweredByUrl} target="_blank" rel="noopener noreferrer">
            Powered by Ynot
          </a>
        </div>
      </footer>
    </div>
  );
}
