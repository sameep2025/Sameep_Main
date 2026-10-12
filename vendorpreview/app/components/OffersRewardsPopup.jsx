"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL } from "../../config";
import "./OffersRewardsPopup.css";

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `₹${amount.toLocaleString("en-IN")}`;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeComparableText(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isDistinctLabel(label, offer) {
  const normalizedLabel = normalizeComparableText(label);
  if (!normalizedLabel) return false;

  return ![offer?.title, offer?.description]
    .map(normalizeComparableText)
    .filter(Boolean)
    .includes(normalizedLabel);
}

function getOfferPriceText(offer) {
  const price = Number(offer?.price || 0) || 0;
  const mrp = Number(offer?.mrp || 0) || 0;
  const discountPercent = Number(offer?.discountPercent || 0) || 0;

  if (discountPercent > 0 && price > 0) {
    return `${discountPercent}% off · ${formatCurrency(price)}`;
  }

  if (mrp > 0 && price > 0 && mrp > price) {
    return `${formatCurrency(price)} · MRP ${formatCurrency(mrp)}`;
  }

  return price > 0 ? formatCurrency(price) : "";
}

function useAnimatedNumber(value, { enabled = true, duration = 1800 } = {}) {
  const [displayValue, setDisplayValue] = useState(enabled ? 0 : value);

  useEffect(() => {
    if (!enabled || value <= 0) {
      setDisplayValue(value);
      return undefined;
    }

    let animationFrame;
    const startedAt = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(progress >= 1 ? value : Math.floor(value * eased));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(tick);
      }
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [duration, enabled, value]);

  return displayValue;
}

export default function OffersRewardsPopup({
  vendorId,
  businessName,
  templateKey = "classic",
  enabled = true,
  suppressAutoOpen = false,
}) {
  const [highlights, setHighlights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [activeOfferIndex, setActiveOfferIndex] = useState(0);
  const closeButtonRef = useRef(null);
  const offersTrackRef = useRef(null);
  const previousFocusRef = useRef(null);
  const closedForVisitRef = useRef(false);
  const autoOpenedVendorRef = useRef("");

  const hasHighlights = Boolean(highlights?.hasHighlights);
  const offers = Array.isArray(highlights?.offers) ? highlights.offers : [];
  const rewards = highlights?.rewards || {};
  const issuedPoints = Number(rewards.totalIssuedPoints || 0) || 0;
  const displayBusinessName = businessName || highlights?.vendor?.businessName || "YNOT Business";
  const animatedIssuedPoints = useAnimatedNumber(issuedPoints, {
    enabled: open && !reduceMotion,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mediaQuery) return;

    setReduceMotion(mediaQuery.matches);
    const handleChange = () => setReduceMotion(mediaQuery.matches);
    mediaQuery.addEventListener?.("change", handleChange);
    return () => mediaQuery.removeEventListener?.("change", handleChange);
  }, []);

  useEffect(() => {
    closedForVisitRef.current = false;
    autoOpenedVendorRef.current = "";
    setDismissed(false);
    setOpen(false);
    setHighlights(null);
    setActiveOfferIndex(0);
  }, [vendorId]);

  useEffect(() => {
    setActiveOfferIndex(0);
    if (offersTrackRef.current) {
      offersTrackRef.current.scrollLeft = 0;
    }
  }, [offers.length]);

  useEffect(() => {
    if (!vendorId || !enabled || typeof window === "undefined") return;

    let cancelled = false;
    setLoading(true);

    fetch(`${API_BASE_URL}/api/public-vendors/${vendorId}/highlights`, {
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) throw new Error("Highlights API failed");
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        const data = payload?.data || null;
        setHighlights(data);
        if (
          data?.hasHighlights &&
          !closedForVisitRef.current &&
          autoOpenedVendorRef.current !== vendorId
        ) {
          if (suppressAutoOpen) {
            setDismissed(true);
            return;
          }

          autoOpenedVendorRef.current = vendorId;
          previousFocusRef.current = document.activeElement;
          setOpen(true);
        }
      })
      .catch(() => {
        if (!cancelled) setHighlights(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, suppressAutoOpen, vendorId]);

  useEffect(() => {
    if (!open) return undefined;

    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (previewImage) {
          setPreviewImage(null);
          return;
        }
        handleClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, previewImage]);

  useEffect(() => {
    if (!open || typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [open]);

  const handleClose = () => {
    setPreviewImage(null);
    closedForVisitRef.current = true;
    setDismissed(true);
    setOpen(false);
    previousFocusRef.current?.focus?.();
  };

  const handleReopen = () => {
    previousFocusRef.current = document.activeElement;
    setOpen(true);
  };

  const scrollToOffer = (index) => {
    const track = offersTrackRef.current;
    if (!track || offers.length === 0) return;

    const nextIndex = Math.min(Math.max(index, 0), offers.length - 1);
    const target = track.children[nextIndex];

    if (target?.scrollIntoView) {
      target.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "nearest",
        inline: "start",
      });
    }

    setActiveOfferIndex(nextIndex);
  };

  const handleOffersScroll = () => {
    const track = offersTrackRef.current;
    if (!track || offers.length <= 1) return;

    const trackLeft = track.getBoundingClientRect().left;
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    Array.from(track.children).forEach((child, index) => {
      const distance = Math.abs(child.getBoundingClientRect().left - trackLeft);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    setActiveOfferIndex(nearestIndex);
  };

  const handleOffersKeyDown = (event) => {
    if (offers.length <= 1) return;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollToOffer(activeOfferIndex + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollToOffer(activeOfferIndex - 1);
    }
  };

  const themeClass = useMemo(() => {
    const normalized = normalizeText(templateKey).toLowerCase();
    return normalized ? `offers-rewards-popup--${normalized.replace(/[^a-z0-9_-]/g, "")}` : "";
  }, [templateKey]);

  if (!vendorId || loading || !hasHighlights) return null;

  return (
    <>
      {open ? (
        <div className={`offers-rewards-popup ${themeClass}`} role="presentation">
          <div className="offers-rewards-popup__backdrop" onClick={handleClose} />
          <section
            className="offers-rewards-popup__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="offers-rewards-popup-title"
          >
            <button
              ref={closeButtonRef}
              type="button"
              className="offers-rewards-popup__close"
              onClick={handleClose}
              aria-label="Close offers and rewards popup"
            >
              ×
            </button>

            <header className="offers-rewards-popup__header">
              <span>Welcome</span>
              <h2 id="offers-rewards-popup-title">{displayBusinessName}</h2>
            </header>

            {offers.length > 0 ? (
              <div className="offers-rewards-popup__section">
                <div className="offers-rewards-popup__offers-heading">
                  <h3>Current Offers</h3>
                  {offers.length > 1 ? (
                    <span>{activeOfferIndex + 1} of {offers.length} Offers</span>
                  ) : null}
                </div>
                <div
                  ref={offersTrackRef}
                  className={`offers-rewards-popup__offers${
                    offers.length === 1 ? " offers-rewards-popup__offers--single" : ""
                  }`}
                  aria-label="Current offers"
                  tabIndex={offers.length > 1 ? 0 : undefined}
                  onScroll={handleOffersScroll}
                  onKeyDown={handleOffersKeyDown}
                >
                  {offers.map((offer) => {
                    const label = isDistinctLabel(offer.sourceLabel, offer) ? offer.sourceLabel : "";
                    const priceText = getOfferPriceText(offer);
                    return (
                      <article
                        key={offer.id}
                        className={`offers-rewards-popup__offer-card${
                          offer.imageUrl ? "" : " offers-rewards-popup__offer-card--no-image"
                        }`}
                      >
                        {offer.imageUrl ? (
                          <div className="offers-rewards-popup__offer-image">
                            <button
                              type="button"
                              className="offers-rewards-popup__image-button"
                              onClick={() => setPreviewImage({ src: offer.imageUrl, alt: offer.title })}
                              aria-label={`View full image for ${offer.title}`}
                            >
                              <img src={offer.imageUrl} alt={offer.title} loading="lazy" />
                              <span>Tap to view full image</span>
                            </button>
                          </div>
                        ) : null}
                        <div className="offers-rewards-popup__offer-copy">
                          {label ? <span>{label}</span> : null}
                          <h4>{offer.title}</h4>
                          {offer.description ? <p>{offer.description}</p> : null}
                          {priceText ? <strong>{priceText}</strong> : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
                {offers.length > 1 ? (
                  <div className="offers-rewards-popup__carousel-controls">
                    <button
                      type="button"
                      onClick={() => scrollToOffer(activeOfferIndex - 1)}
                      disabled={activeOfferIndex === 0}
                      aria-label="Show previous offer"
                    >
                      ‹
                    </button>
                    <div className="offers-rewards-popup__dots" aria-label="Offer pagination">
                      {offers.map((offer, index) => (
                        <button
                          key={`offer-dot-${offer.id || index}`}
                          type="button"
                          className={index === activeOfferIndex ? "is-active" : ""}
                          onClick={() => scrollToOffer(index)}
                          aria-label={`Show offer ${index + 1} of ${offers.length}`}
                          aria-current={index === activeOfferIndex ? "true" : undefined}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => scrollToOffer(activeOfferIndex + 1)}
                      disabled={activeOfferIndex === offers.length - 1}
                      aria-label="Show next offer"
                    >
                      ›
                    </button>
                  </div>
                ) : null}
                {offers.length > 1 ? (
                  <p className="offers-rewards-popup__swipe-hint">Swipe to see more offers</p>
                ) : null}
              </div>
            ) : null}

            {rewards.programEnabled ? (
              <div className="offers-rewards-popup__rewards">
                <div>
                  <span>Rewards</span>
                  <strong>Earn {rewards.earnPercent}% Rewards on eligible bills</strong>
                  {rewards.eligibilitySummary ? <p>{rewards.eligibilitySummary}</p> : null}
                </div>
                <div className="offers-rewards-popup__points">
                  <strong>{animatedIssuedPoints.toLocaleString("en-IN")}</strong>
                  <span>Reward Points Issued So Far</span>
                  <p>By {displayBusinessName}</p>
                  <em>1 Reward Point = ₹1</em>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              className="offers-rewards-popup__explore"
              onClick={handleClose}
            >
              Explore Products & Services
            </button>
          </section>

          {previewImage ? (
            <div
              className="offers-rewards-popup__image-preview"
              role="dialog"
              aria-modal="true"
              aria-label="Full promotional image preview"
            >
              <div
                className="offers-rewards-popup__image-preview-backdrop"
                onClick={() => setPreviewImage(null)}
              />
              <div className="offers-rewards-popup__image-preview-panel">
                <button
                  type="button"
                  className="offers-rewards-popup__image-preview-close"
                  onClick={() => setPreviewImage(null)}
                  aria-label="Close full image preview"
                >
                  ×
                </button>
                <img src={previewImage.src} alt={previewImage.alt} />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {dismissed ? (
        <button
          type="button"
          className={`offers-rewards-popup__reopen ${themeClass}`}
          onClick={handleReopen}
          aria-label="Reopen offers and rewards"
        >
          Offers & Rewards
        </button>
      ) : null}
    </>
  );
}
