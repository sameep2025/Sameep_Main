"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../../../config";
import { openAdminDashboard, openAdminMenu } from "../../utils/adminQuickActions";
import "./CatalogPreviewTemplate.css";

const DEFAULT_NAV = [
  { label: "Services", href: "#services" },
  { label: "Offers", href: "#offers" },
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

function toAnchor(label) {
  return String(label || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
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
  return splitTextList(terms).slice(0, 2).join(" • ");
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

function flattenOfferCards(cards, sectionName) {
  return (cards || []).flatMap((card, cardIndex) => {
    if (!isOfferLikeCard(card, sectionName)) return [];

    const sourceLabel = !isOffersLabel(sectionName)
      ? sectionName
      : !isOffersLabel(card?.title)
        ? card.title
        : "";

    const normalizedCard = {
      ...card,
      id: card?.id || `offer-${cardIndex}`,
      title: card?.title || `Offer ${cardIndex + 1}`,
      sourceLabel,
    };

    if (Array.isArray(card?.options) && card.options.length > 0) {
      return card.options
        .map((option, optionIndex) => ({
          id: `${normalizedCard.id}-option-${optionIndex}`,
          title: option?.label || normalizedCard.title,
          offerText: option?.offerText || normalizedCard.offerText || "",
          terms: option?.terms || normalizedCard.terms || [],
          img: option?.imageUrl || normalizedCard.img || "",
        }))
        .filter((offer) => offer.title || offer.offerText || splitTextList(offer.terms).length > 0);
    }

    return [normalizedCard];
  });
}

function getOfferCards(orderedCategories) {
  return (orderedCategories || []).flatMap((section) =>
    flattenOfferCards(section?.cards, section?.sectionName)
  );
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

function CatalogServiceItem({ row, onAddToCart, itemIdBase }) {
  const [expanded, setExpanded] = useState(false);

  const previewPoints = row.bulletPoints.slice(0, 2);
  const extraPoints = row.bulletPoints.slice(2);
  const showMoreAvailable = extraPoints.length > 0 || row.packagesIncludes.length > 0;

  const handleAdd = () => {
    if (typeof onAddToCart !== "function") return;

    onAddToCart(
      {
        _id: itemIdBase,
        categoryId: itemIdBase,
        cartKey: row.cartKey,
        name: row.title,
        price: Number(row.price) || 0,
      },
      row.categoryPath,
      []
    );
  };

  return (
    <article className="catalog-item">
      <div className="catalog-item-copy">
        <div className="catalog-item-header">
          <div>
            <h3>{row.title}</h3>
            {row.subtitle ? <p className="catalog-item-subtitle">{row.subtitle}</p> : null}
            <div className="catalog-item-meta">
              <span>{formatCurrency(row.price)}</span>
              {row.summary ? <span>{row.summary}</span> : null}
            </div>
          </div>
          {row.imageUrl ? (
            <div className="catalog-item-media">
              <img src={row.imageUrl} alt={row.title} />
            </div>
          ) : null}
        </div>

        {previewPoints.length > 0 ? (
          <ul className="catalog-item-points">
            {previewPoints.map((point, index) => (
              <li key={`${row.id}-point-${index}`}>{point}</li>
            ))}
          </ul>
        ) : null}

        {expanded && extraPoints.length > 0 ? (
          <ul className="catalog-item-points catalog-item-points-extra">
            {extraPoints.map((point, index) => (
              <li key={`${row.id}-extra-${index}`}>{point}</li>
            ))}
          </ul>
        ) : null}

        {expanded && row.packagesIncludes.length > 0 ? (
          <div className="catalog-item-package-box">
            <div className="catalog-item-package-title">Package Includes</div>
            <div className="catalog-item-package-list">
              {row.packagesIncludes.map((item, index) => (
                <span key={`${row.id}-package-${index}`}>{item}</span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="catalog-item-actions">
          {showMoreAvailable ? (
            <button
              type="button"
              className="catalog-link-btn"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          ) : <span />}
          <button type="button" className="catalog-add-btn" onClick={handleAdd}>
            Add
          </button>
        </div>
      </div>
    </article>
  );
}

export default function CatalogPreviewTemplate({
  vendorInfo,
  category,
  orderedCategories,
  sectionsWithHeading,
  cardsWithoutHeading,
  mergedHeroImages,
  heroTagline,
  heroDescription,
  onOpenMenu,
  onOpenGallery,
  cartItems,
  cartTotal,
  onAddToCart,
  onIncreaseQty,
  onDecreaseQty,
}) {
  const [serviceModeLabel, setServiceModeLabel] = useState("Service Type");
  const [activeSectionName, setActiveSectionName] = useState("");
  const [activeCardId, setActiveCardId] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);

  const navItems = useMemo(() => {
    const webMenu = Array.isArray(category?.webMenu) ? category.webMenu : [];
    const mapped = webMenu
      .map((item) => {
        const normalized = String(item || "").trim().toLowerCase();
        if (!normalized) return null;
        if (normalized === "categories") return { label: item, href: "#services" };
        if (normalized === "gallery") return { label: item, href: "#gallery", action: "gallery" };
        if (normalized === "about" || normalized === "why us") return { label: item, href: "#services" };
        if (normalized === "contact") return { label: item, href: "#contact" };
        return { label: item, href: `#${toAnchor(item)}` };
      })
      .filter(Boolean);

    return mapped.length > 0 ? mapped : DEFAULT_NAV;
  }, [category]);

  const handleNavClick = (event, item) => {
    if (item?.action === "gallery") {
      event.preventDefault();
      onOpenGallery?.();
      setMobileMenuOpen(false);
    }
  };

  const trustSummary = vendorInfo?.trustSummary || vendorInfo?.trust || {};
  const trustEntries = Object.entries(trustSummary || {}).filter(
    ([, value]) => value !== null && value !== undefined && value !== ""
  );
  const trustCategoryId = vendorInfo?.categoryId || category?._id || category?.id;
  const serviceModeEntry = trustEntries.find(
    ([key, value]) =>
      Array.isArray(value) && /(service|mode|delivery|format|type)/i.test(String(key))
  );
  const serviceModes = Array.isArray(serviceModeEntry?.[1])
    ? serviceModeEntry[1].map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const formatTrustStatValue = (value) => {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || "").trim()).filter(Boolean).join(" + ");
    }
    return String(value ?? "").trim();
  };

  useEffect(() => {
    let cancelled = false;

    async function loadTrustQuestionMeta() {
      if (!trustCategoryId || !serviceModeEntry?.[0]) {
        if (!cancelled) setServiceModeLabel("Service Type");
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/trust/questions?categoryId=${encodeURIComponent(String(trustCategoryId))}`
        );
        const data = await response.json();
        const questions = Array.isArray(data?.questions) ? data.questions : [];
        const matched = questions.find(
          (question) => String(question?.id || "").trim() === String(serviceModeEntry[0]).trim()
        );
        if (!cancelled) {
          setServiceModeLabel(String(matched?.label || serviceModeEntry[0] || "Service Type"));
        }
      } catch {
        if (!cancelled) {
          setServiceModeLabel(String(serviceModeEntry?.[0] || "Service Type"));
        }
      }
    }

    loadTrustQuestionMeta();
    return () => {
      cancelled = true;
    };
  }, [serviceModeEntry, trustCategoryId]);

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

      if (filteredCards.length === 0) return;
      flatSections.push({ sectionName: section.sectionName, cards: filteredCards });
    });

    if (Array.isArray(cardsWithoutHeading) && cardsWithoutHeading.length > 0) {
      const filteredStandaloneCards = cardsWithoutHeading
        .filter((card) => !isOfferLikeCard(card, card?.title))
        .map((card, index) => ({
          ...card,
          id: card?.id || `featured-${index}`,
        }))
        .filter(isDisplayableCard);

      if (filteredStandaloneCards.length > 0) {
        flatSections.unshift({
          sectionName: "Featured Services",
          cards: filteredStandaloneCards,
        });
      }
    }

    return flatSections;
  }, [cardsWithoutHeading, sectionsWithHeading]);

  const activeSection =
    serviceSections.find((section) => section.sectionName === activeSectionName) ||
    serviceSections[0] ||
    null;
  const activeCard =
    activeSection?.cards?.find((card) => card.id === activeCardId) ||
    activeSection?.cards?.[0] ||
    null;
  const activeRows = useMemo(
    () => (activeCard && activeSection ? buildCatalogRows(activeCard, activeSection.sectionName) : []),
    [activeCard, activeSection]
  );

  const offerCards = useMemo(() => getOfferCards(orderedCategories), [orderedCategories]);
  const poweredByUrl = getPoweredByUrl();
  const customerPortalUrl = `${poweredByUrl}/mybills`;
  const mapsLink = useMemo(() => {
    const googleMapsUrl = vendorInfo?.googlePlace?.mapsUrl;
    if (!googleMapsUrl) return "#";
    if (!String(googleMapsUrl).includes("place_id:")) return googleMapsUrl;

    const placeId = String(googleMapsUrl).split("place_id:")[1] || "";
    if (!placeId) return googleMapsUrl;

    const queryName = encodeURIComponent(heroTagline || vendorInfo?.businessName || "");
    return `https://www.google.com/maps/search/?api=1&query=${queryName}&query_place_id=${placeId}`;
  }, [heroTagline, vendorInfo?.businessName, vendorInfo?.googlePlace?.mapsUrl]);

  const statEntries = Object.entries(trustSummary)
    .filter(([key, value]) => {
      if (value === null || value === undefined || value === "") return false;
      if (key === serviceModeEntry?.[0]) return false;
      if (Array.isArray(value)) {
        return value.map((item) => String(item || "").trim()).filter(Boolean).length > 0;
      }
      return true;
    })
    .slice(0, 3);

  const introSummary = getRefinedHeroCopy({
    heroDescription,
    categoryName: category?.name,
    address: vendorInfo?.location?.address,
  });
  const heroImage = mergedHeroImages?.[0] || getCardImage(activeCard) || "";
  const phoneNumbers = [
    vendorInfo?.phone,
    ...(Array.isArray(vendorInfo?.secondaryPhones) ? vendorInfo.secondaryPhones : []),
  ].filter(Boolean);
  const serviceModeSummary = serviceModes.join(" + ");
  const logoUrl =
    typeof vendorInfo?.logoUrl === "string" ? vendorInfo.logoUrl.trim() : "";

  return (
    <div className="catalog-template-shell">
      <header className="catalog-header" id="home">
        <a className="catalog-brand" href="#home">
          {logoUrl ? (
            <img
              className="catalog-brand-logo"
              src={logoUrl}
              alt={`${vendorInfo?.businessName || "Business"} logo`}
            />
          ) : (
            <span className="catalog-brand-mark">
              {(vendorInfo?.businessName || category?.name || "B").charAt(0).toUpperCase()}
            </span>
          )}
          <span className="catalog-brand-text">{vendorInfo?.businessName || "Business"}</span>
        </a>

        <nav className="catalog-nav" aria-label="Primary">
          {navItems.map((item) => (
            <a key={`${item.label}-${item.href}`} href={item.href} onClick={(event) => handleNavClick(event, item)}>
              {item.label}
            </a>
          ))}
          <a href={customerPortalUrl} target="_blank" rel="noopener noreferrer">
            My Bills & Rewards
          </a>
        </nav>

        <div className="catalog-admin-menu">
          <button
            type="button"
            className="catalog-admin-btn"
            onClick={() => setShowAdminMenu((current) => !current)}
          >
            Admin
          </button>
          {showAdminMenu ? (
            <div className="catalog-admin-dropdown">
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
          className="catalog-book-btn"
          onClick={() => scrollToElementById("contact")}
        >
          Book Appointment
        </button>

        <button
          type="button"
          className={`catalog-mobile-toggle ${mobileMenuOpen ? "is-open" : ""}`}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((current) => !current)}
        >
          <span />
          <span />
          <span />
        </button>
      </header>

      {mobileMenuOpen ? (
        <div className="catalog-mobile-menu">
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
          <div className="catalog-mobile-admin-menu">
            <button
              type="button"
              className="catalog-book-btn catalog-book-btn-secondary"
              onClick={() => setShowAdminMenu((current) => !current)}
            >
              Admin
            </button>
            {showAdminMenu ? (
              <div className="catalog-admin-dropdown catalog-admin-dropdown-mobile">
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

      <section className="catalog-hero">
        <div className="catalog-hero-copy">
          <h1>{heroTagline || vendorInfo?.businessName || "Browse services"}</h1>
          <p>{introSummary}</p>

          {serviceModeSummary ? (
            <div className="catalog-service-mode-line">
              <span>{serviceModeLabel}:</span> {serviceModeSummary}
            </div>
          ) : null}

          <div className="catalog-stats">
            {statEntries.map(([key, value]) => (
              <div key={key} className="catalog-stat-card">
                <strong>{formatTrustStatValue(value)}</strong>
                <span>{prettifyLabel(key)}</span>
              </div>
            ))}
            {typeof vendorInfo?.googlePlace?.rating === "number" ? (
              <a className="catalog-stat-card catalog-stat-link" href={mapsLink} target="_blank" rel="noopener noreferrer">
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
        </div>

        <div className="catalog-hero-visual">
          {heroImage ? <img src={heroImage} alt={heroTagline || vendorInfo?.businessName || "Service preview"} /> : null}
        </div>
      </section>

      {offerCards.length > 0 ? (
        <section className="catalog-offers" id="offers">
          <div className="catalog-offers-header">
            <span className="catalog-kicker">Offers</span>
            <h2>Current Promotions</h2>
          </div>

          <div className="catalog-offers-track">
            {offerCards.map((offer) => (
              <article key={offer.id} className="catalog-offer-card">
                {getCardImage(offer) ? (
                  <div className="catalog-offer-media">
                    <img src={getCardImage(offer)} alt={offer.title} />
                  </div>
                ) : null}
                <div className="catalog-offer-copy">
                  <div className="catalog-offer-label">{offer.title}</div>
                  {offer.offerText ? <p>{offer.offerText}</p> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="catalog-services" id="services">
        <div className="catalog-services-header">
          <span className="catalog-kicker">Services</span>
          <h2>What service do you need ?</h2>
        </div>

        {serviceSections.length > 1 ? (
          <div className="catalog-section-tabs">
            {serviceSections.map((section) => {
              const isActive =
                (activeSection?.sectionName || serviceSections[0]?.sectionName) === section.sectionName;
              return (
                <button
                  key={section.sectionName}
                  type="button"
                  className={`catalog-section-tab ${isActive ? "is-active" : ""}`}
                  onClick={() => {
                    setActiveSectionName(section.sectionName);
                    setActiveCardId("");
                  }}
                >
                  {section.sectionName}
                </button>
              );
            })}
          </div>
        ) : null}

        {activeSection ? (
          <>
            <div className="catalog-card-grid">
              {activeSection.cards.map((card) => {
                const isActive = (activeCard?.id || activeSection.cards[0]?.id) === card.id;
                const cardImage = getCardImage(card);
                return (
                  <button
                    key={card.id}
                    type="button"
                    className={`catalog-card-tile ${isActive ? "is-active" : ""}`}
                    onClick={() => setActiveCardId(card.id)}
                  >
                    <div className="catalog-card-tile-image">
                      {cardImage ? <img src={cardImage} alt={card.title} /> : <span>{card.title.charAt(0)}</span>}
                    </div>
                    <div className="catalog-card-tile-title">{card.title}</div>
                  </button>
                );
              })}
            </div>

            {activeCard ? (
              <div className="catalog-detail-panel">
                <div className="catalog-detail-header">
                  <h3>{activeCard.title}</h3>
                </div>
                <div className="catalog-detail-list">
                  {activeRows.map((row) => (
                    <CatalogServiceItem
                      key={row.id}
                      row={row}
                      itemIdBase={activeCard.id}
                      onAddToCart={onAddToCart}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {cartItems.length > 0 ? (
        <div className="catalog-cart-bar">
          <div className="catalog-cart-copy">
            <strong>{cartItems.length} item(s) selected</strong>
            <span>{formatCurrency(cartTotal)}</span>
          </div>
          <div className="catalog-cart-pills">
            {cartItems.slice(0, 4).map((item, index) => (
              <div key={`${item.cartKey || item.itemId}-${index}`} className="catalog-cart-pill">
                <span>{item.name}</span>
                <div className="catalog-cart-pill-controls">
                  <button type="button" onClick={() => onDecreaseQty(item)}>-</button>
                  <strong>{item.qty || 1}</strong>
                  <button type="button" onClick={() => onIncreaseQty(item)}>+</button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="catalog-cart-open-btn" onClick={onOpenMenu}>
            Open Cart
          </button>
        </div>
      ) : null}

      <section className="catalog-contact" id="contact">
        <div className="catalog-contact-card">
          <span className="catalog-kicker">Contact</span>
          <h2>{vendorInfo?.businessName || "Reach us"}</h2>
          <p>{vendorInfo?.location?.address || "Location not available"}</p>

          {phoneNumbers.length > 0 ? (
            <div className="catalog-contact-phones">
              {phoneNumbers.map((phone, index) => (
                <a key={`${phone}-${index}`} href={`tel:${phone}`}>
                  {phone}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <footer className="catalog-footer">
        <div className="catalog-footer-copy">
          <span>
            © {new Date().getFullYear()} {vendorInfo?.businessName || "Business"}
          </span>
        </div>
        <a
          className="catalog-footer-powered"
          href={poweredByUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <img src="/favicon.svg" alt="Ynot" className="catalog-footer-powered-logo" />
          Powered by Ynot
        </a>
      </footer>
    </div>
  );
}
