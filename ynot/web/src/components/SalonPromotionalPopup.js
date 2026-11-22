"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  getPromotionalPosterPage,
  markPromotionalPopupShown,
  movePromotionalPosterPage,
  shouldOpenPromotionalPopup,
} from "../utils/promotionalPopup.mjs";

const MOBILE_QUERY = "(max-width: 760px)";

export default function SalonPromotionalPopup({
  posters,
  signupHref,
  demoHref,
}) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [pageStart, setPageStart] = useState(0);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const updateLayout = () => {
      setMobile(media.matches);
      setPageStart(0);
    };
    updateLayout();
    media.addEventListener?.("change", updateLayout);
    return () => media.removeEventListener?.("change", updateLayout);
  }, []);

  useEffect(() => {
    if (!shouldOpenPromotionalPopup(window.sessionStorage, posters)) return;
    markPromotionalPopupShown(window.sessionStorage);
    previousFocusRef.current = document.activeElement;
    setOpen(true);
  }, [posters]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open || !Array.isArray(posters) || posters.length === 0) return null;

  const pageSize = mobile ? 1 : 2;
  const page = getPromotionalPosterPage(posters, pageStart, pageSize);
  const showNavigation = page.total > pageSize;
  const movePage = (direction) => {
    setPageStart((current) =>
      movePromotionalPosterPage(current, direction, pageSize, posters.length)
    );
  };

  return (
    <div className="salonPromoBackdrop" role="presentation">
      <section
        ref={dialogRef}
        className="salonPromoDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="salon-promo-title"
        aria-describedby="salon-promo-description"
      >
        <button
          ref={closeRef}
          type="button"
          className="salonPromoClose"
          onClick={() => setOpen(false)}
          aria-label="Close promotional highlights"
        >
          <span aria-hidden="true">×</span>
        </button>

        <div className="salonPromoHeading">
          <p className="salonKicker">YNOT Promotional Highlights</p>
          <h2 id="salon-promo-title">A smarter way to run your salon</h2>
          <p id="salon-promo-description">
            Explore current YNOT highlights, then start your salon setup or book a guided demo.
          </p>
        </div>

        <div className={`salonPromoPosterGrid${mobile ? " isMobile" : ""}`} aria-live="polite">
          {page.posters.map((poster) => (
            <figure className="salonPromoPoster" key={poster.id}>
              <Image
                src={poster.imageUrl}
                alt={poster.altText}
                width={poster.width}
                height={poster.height}
                sizes={mobile ? "calc(100vw - 48px)" : "40vw"}
                quality={82}
              />
            </figure>
          ))}
        </div>

        {showNavigation ? (
          <div className="salonPromoNavigation" aria-label="Promotional poster navigation">
            <button type="button" onClick={() => movePage(-1)} aria-label="Previous promotional poster">
              <span aria-hidden="true">←</span> Previous
            </button>
            <span>{page.start + 1}–{page.end} of {page.total}</span>
            <button type="button" onClick={() => movePage(1)} aria-label="Next promotional poster">
              Next <span aria-hidden="true">→</span>
            </button>
          </div>
        ) : null}

        <div className="salonPromoActions">
          <Link className="salonPrimaryButton" href={signupHref}>Sign Up Now</Link>
          <a className="salonSecondaryButton" href={demoHref}>Book a Free Demo</a>
        </div>
      </section>
    </div>
  );
}
