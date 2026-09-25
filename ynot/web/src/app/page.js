"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CategoryCard from "../components/CategoryCard";
import {
  getCategories,
  getDigitalScorePublicConfig,
  getSiteContact,
  getTrustedPartners,
} from "../services/api";
import {
  buildSiteAnalyticsPayload,
  buildPageViewPayload,
  shouldTrackPageViewOnce,
  trackSiteEvent,
  trackSitePageView,
} from "../utils/siteAnalytics";
import { PREVIEW_BASE_URL } from "../utils/config";

function buildTrustedPartnerPreviewUrl(subdomain) {
  const normalized = String(subdomain || "").trim().toLowerCase();
  if (!normalized) return "";
  return PREVIEW_BASE_URL.replace("://", `://${normalized}.`);
}

const TRUSTED_PARTNER_SCROLL_SPEED = 150;
const TRUSTED_PARTNER_MIN_DURATION = 60;

export default function Home() {
  const router = useRouter();
  const trustedPartnersTrackRef = useRef(null);
  const [categories, setCategories] = useState([]);
  const [siteContact, setSiteContact] = useState({
    addressLine1: "",
    addressLine2: "",
    phone: "",
  });
  const [trustedPartners, setTrustedPartners] = useState([]);
  const [digitalScoreConfig, setDigitalScoreConfig] = useState(null);
  const [trustedPartnersDuration, setTrustedPartnersDuration] = useState(90);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        setError("");
        const data = await getCategories();
        setCategories(data || []);
      } catch (err) {
        console.error(err);
        setError("Failed to load categories right now.");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  useEffect(() => {
    async function fetchDigitalScoreConfig() {
      try {
        const data = await getDigitalScorePublicConfig();
        setDigitalScoreConfig(data);
      } catch (err) {
        console.error(err);
      }
    }

    fetchDigitalScoreConfig();
  }, []);

  useEffect(() => {
    async function fetchSiteContact() {
      try {
        const data = await getSiteContact();
        setSiteContact({
          addressLine1: data?.addressLine1 || "",
          addressLine2: data?.addressLine2 || "",
          phone: data?.phone || "",
        });
      } catch (err) {
        console.error(err);
      }
    }

    fetchSiteContact();
  }, []);

  useEffect(() => {
    async function fetchTrustedPartners() {
      try {
        const data = await getTrustedPartners();
        setTrustedPartners(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      }
    }

    fetchTrustedPartners();
  }, []);

  useEffect(() => {
    if (!shouldTrackPageViewOnce("ynot_home:/")) return;
    const payload = buildPageViewPayload({ pageType: "ynot_home" });
    trackSitePageView(payload);
  }, []);

  useEffect(() => {
    const track = trustedPartnersTrackRef.current;
    if (!track || trustedPartners.length <= 1) return;

    const updateTrustedPartnersDuration = () => {
      const scrollDistance = track.scrollWidth / 2;
      const duration = scrollDistance / TRUSTED_PARTNER_SCROLL_SPEED;
      setTrustedPartnersDuration(Math.max(TRUSTED_PARTNER_MIN_DURATION, duration));
    };

    updateTrustedPartnersDuration();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateTrustedPartnersDuration);
      return () => window.removeEventListener("resize", updateTrustedPartnersDuration);
    }

    const resizeObserver = new ResizeObserver(updateTrustedPartnersDuration);
    resizeObserver.observe(track);

    return () => resizeObserver.disconnect();
  }, [trustedPartners.length]);

  const sortedCategories = useMemo(
    () =>
      [...categories].sort(
        (a, b) =>
          (b.vendorCount || b.totalVendors || 0) -
          (a.vendorCount || a.totalVendors || 0)
      ),
    [categories]
  );

  const enabledCategories = sortedCategories.filter(
    (category) =>
      category.onboardingEnabled !== false &&
      category.visibleToVendor !== false
  );
  const disabledCategories = sortedCategories.filter(
    (category) =>
      category.onboardingEnabled === false ||
      category.visibleToVendor === false
  );

  const featuredCategories = enabledCategories.slice(0, 3);
  const secondaryCategories = enabledCategories.slice(3, 9);
  const mixedCategories = [...secondaryCategories, ...disabledCategories].slice(
    0,
    6
  );
  const topCategory = featuredCategories[0] || enabledCategories[0] || null;

  const totalActiveVendors = enabledCategories.reduce(
    (sum, category) => sum + (category.vendorCount || category.totalVendors || 0),
    0
  );
  const hasSiteContact =
    Boolean(siteContact.addressLine1) ||
    Boolean(siteContact.addressLine2) ||
    Boolean(siteContact.phone);
  const trustedPartnersDisplay = useMemo(
    () =>
      trustedPartners.length > 1
        ? [...trustedPartners, ...trustedPartners]
        : trustedPartners,
    [trustedPartners]
  );

  const trackHomeCta = (ctaName, meta = {}) => {
    const payload = buildSiteAnalyticsPayload({
      pageType: "ynot_home",
      eventType: "cta_click",
      meta: {
        sourceLabel: ctaName,
        ...meta,
      },
    });
    trackSiteEvent(payload);
  };

  const scrollToSection = (id) => {
    const target = document.getElementById(id);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const startDigitalScore = (source = "digital_score_cta") => {
    trackHomeCta(source);
    router.push("/digital-score");
  };

  const startOnboarding = (categoryId, source = "onboarding_cta") => {
    trackHomeCta(source, categoryId ? { utmContent: String(categoryId) } : {});
    const base = "/onboarding";
    router.push(categoryId ? `${base}?categoryId=${categoryId}` : base);
  };

  return (
    <div className="landingPage">
      <header className="siteHeader">
        <div className="siteShell siteHeaderInner">
          <button
            className="brandButton"
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <span className="brandMark">Y</span>
            <span className="brandWordmark">YNOT</span>
          </button>

          <nav className="siteNav" aria-label="Primary">
            <button type="button" onClick={() => scrollToSection("how-it-works")}>
              How it works
            </button>
            <button type="button" onClick={() => scrollToSection("categories")}>
              Categories
            </button>
            <button type="button" onClick={() => scrollToSection("contact")}>
              Contact
            </button>
          </nav>

          <button
            className="navCtaButton"
            onClick={() => startOnboarding("", "header_set_up_business")}
          >
            Set up business
          </button>
        </div>
      </header>

      <main>
        <section className="heroSectionV2">
          <div className="siteShell heroGrid">
            <div className="heroCopy">
              <div className="eyebrowPill">Launch in minutes</div>
              <h1>
                Get your
                <span className="titleAccent"> business online</span>
              </h1>
              <p className="heroDescription">
                Build your digital storefront, showcase your services, and start
                onboarding customers without the tech headache.
              </p>

              <div className="heroButtons">
                <button
                  className="primaryHeroButton"
                  onClick={() => startOnboarding("", "hero_get_started")}
                >
                  Get started now
                </button>
                <button
                  className="secondaryHeroButton"
                  onClick={() => {
                    trackHomeCta("hero_view_categories");
                    scrollToSection("categories");
                  }}
                >
                  View categories
                </button>
                {digitalScoreConfig?.isEnabled ? (
                  <button
                    className="secondaryHeroButton digitalScoreHeroButton"
                    onClick={() => startDigitalScore("hero_digital_score")}
                  >
                    {digitalScoreConfig?.ctaText || "Check Your Digital Score"}
                  </button>
                ) : null}
              </div>

              <div className="trustRow">
                <div className="avatarStack" aria-hidden="true">
                  <span>A</span>
                  <span>S</span>
                  <span>P</span>
                  <strong>+500</strong>
                </div>
                <p>
                  Trusted by hundreds of vendors already growing through YNOT.
                </p>
              </div>
            </div>

            <div className="heroVisual">
              <div className="floatingStatCard statCardLight">
                <span className="statIcon">+</span>
                <strong>{Math.max(totalActiveVendors, 500)}+</strong>
                <p>Active vendors</p>
              </div>
              <div className="floatingStatCard statCardAccent">
                <span className="statIcon">3</span>
                <strong>3 steps</strong>
                <p>Fast onboarding</p>
              </div>
              <div className="floatingStatCard statCardDark">
                <span className="statIcon">#</span>
                <strong>{Math.max(enabledCategories.length, 10)}+</strong>
                <p>Categories</p>
              </div>

              <div className="heroPreviewCard">
                <div className="heroPreviewMedia">
                  <img
                    src={topCategory?.imageUrl || "/placeholder.svg"}
                    alt={topCategory?.name || "YNOT featured category"}
                  />
                  <div className="heroPreviewOverlay" />
                </div>
                <div className="heroPreviewContent">
                  <p className="previewEyebrow">Featured category</p>
                  <h3>{topCategory?.name || "Salon & Spa"}</h3>
                  <p>
                    Start with a guided setup flow tailored to your business
                    type and get online faster.
                  </p>
                  <button
                    className="previewAction"
                    onClick={() =>
                      startOnboarding(
                        topCategory?.categoryId || topCategory?.id || topCategory?._id,
                        "featured_category_start"
                      )
                    }
                  >
                    Start with this category
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="valueStrip">
            <div className="siteShell valueStripInner">
              <span>Fast</span>
              <span>Reliable</span>
              <span>Scalable</span>
              <span>Simple</span>
            </div>
          </div>
        </section>

        {trustedPartners.length > 0 ? (
          <section className="trustedPartnersSection">
            <div className="siteShell">
              <div className="sectionIntro trustedPartnersIntro">
                <div>
                  <p className="sectionKicker">Trusted partners</p>
                  <h2>Businesses already growing with YNOT</h2>
                </div>
              </div>

              <div className="trustedPartnersGrid">
                <div
                  ref={trustedPartnersTrackRef}
                  className="trustedPartnersTrack"
                  style={{
                    "--trusted-partners-duration": `${trustedPartnersDuration}s`,
                  }}
                >
                  {trustedPartnersDisplay.map((partner, index) => {
                  const mediaUrl = partner.imageUrl || partner.categoryImageUrl || "";
                  const previewUrl = buildTrustedPartnerPreviewUrl(partner.subdomain);
                  const destinationUrl = previewUrl || partner.googleProfileUrl || "";
                  const cardProps = destinationUrl
                    ? {
                        href: destinationUrl,
                        target: "_blank",
                        rel: "noreferrer",
                        onClick: () =>
                          trackHomeCta("trusted_partner_click", {
                            utmContent: String(partner.vendorId || ""),
                          }),
                      }
                    : {};
                  const CardTag = destinationUrl ? "a" : "div";

                    return (
                      <CardTag
                        key={`${partner.vendorId}-${index}`}
                        className={`trustedPartnerCard ${
                          destinationUrl ? "isClickable" : "isStatic"
                        }`}
                        {...cardProps}
                      >
                        <div className="trustedPartnerMedia" aria-hidden="true">
                          {mediaUrl ? (
                            <img
                              src={mediaUrl}
                              alt={partner.businessName}
                            />
                          ) : (
                            <span>{String(partner.businessName || "Y").charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="trustedPartnerContent">
                          {destinationUrl ? (
                            <span className="trustedPartnerLinkIcon" aria-hidden="true">
                              ↗
                            </span>
                          ) : null}
                          <h3>{partner.businessName}</h3>
                          <p className="trustedPartnerMeta">
                            {[partner.city, partner.categoryName].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </CardTag>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="processSection" id="how-it-works">
          <div className="siteShell">
            <div className="sectionIntro sectionIntroCentered">
              <p className="sectionKicker">The process</p>
              <h2>Launch faster with a guided setup flow</h2>
              <p>
                We&apos;ve simplified business digitisation into three clear
                steps so vendors can start quickly and confidently.
              </p>
            </div>

            <div className="processGrid">
              <article className="processCard">
                <div className="processNumber">1</div>
                <div className="processGhost">01</div>
                <h3>Choose your category</h3>
                <p>
                  Start with the service category that best matches your business
                  and onboarding path.
                </p>
              </article>
              <article className="processCard processCardAccent">
                <div className="processNumber">2</div>
                <div className="processGhost">02</div>
                <h3>Set up your profile</h3>
                <p>
                  Add business details, services, contact information, and brand
                  identity in one guided flow.
                </p>
              </article>
              <article className="processCard">
                <div className="processNumber">3</div>
                <div className="processGhost">03</div>
                <h3>Go online instantly</h3>
                <p>
                  Publish your presence and begin attracting customer interest
                  through your new digital storefront.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="categoriesShowcase" id="categories">
          <div className="siteShell">
            <div className="sectionIntro sectionIntroSplit">
              <div>
                <p className="sectionKicker">Popular categories</p>
                <h2>Pick the right category and get started</h2>
                <p>
                  Join vendors across industries already using YNOT to build
                  their online presence.
                </p>
              </div>
              <div className="liveBadge">
                <span className="liveDot" />
                {Math.max(totalActiveVendors, 500)}+ Vendors live
              </div>
            </div>

            {loading ? <div className="loadingState">Loading categories...</div> : null}
            {!loading && error ? <div className="emptyState">{error}</div> : null}
            {!loading && !error && enabledCategories.length === 0 ? (
              <div className="emptyState">No categories available right now.</div>
            ) : null}

            {!loading && !error && featuredCategories.length > 0 ? (
              <div className="featuredGrid">
                {featuredCategories.map((category) => {
                  const categoryId =
                    category.categoryId || category.id || category._id;

                  return (
                    <CategoryCard
                      key={categoryId}
                      category={category}
                      variant="featured"
                      onClick={() => startOnboarding(categoryId, "featured_category_card")}
                    />
                  );
                })}
              </div>
            ) : null}

            {!loading && !error && mixedCategories.length > 0 ? (
              <div className="compactGrid">
                {mixedCategories.map((category) => {
                  const categoryId =
                    category.categoryId || category.id || category._id;
                  const disabled =
                    category.onboardingEnabled === false ||
                    category.visibleToVendor === false;

                  return (
                    <CategoryCard
                      key={categoryId}
                      category={category}
                      variant="compact"
                      disabled={disabled}
                      onClick={() => startOnboarding(categoryId, "secondary_category_card")}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>
        </section>

        <section className="ctaBannerSection">
          <div className="siteShell">
            <div className="ctaBanner">
              <div className="ctaBannerCopy">
                <p className="sectionKicker sectionKickerLight">
                  Ready to grow
                </p>
                <h2>Give your business a cleaner, faster path online.</h2>
                <p>
                  Use YNOT to turn category discovery into a guided onboarding
                  journey for your business.
                </p>
              </div>
              <div className="ctaBannerActions">
                <button
                  className="primaryHeroButton"
                  onClick={() => startOnboarding("", "cta_banner_set_up_business")}
                >
                  Set up my business
                </button>
                <button
                  className="secondaryDarkButton"
                  onClick={() => {
                    trackHomeCta("cta_banner_browse_categories");
                    scrollToSection("categories");
                  }}
                >
                  Browse categories
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="siteFooter">
        <div className="siteShell footerGrid">
          <div className="footerBrand" id="contact">
            <div className="footerLogo">
              <span className="brandMark">Y</span>
              <span className="brandWordmark">YNOT</span>
            </div>
            <p>
              Helping local businesses bridge the digital divide with simple,
              focused onboarding tools.
            </p>
            {hasSiteContact ? (
              <div className="footerContact">
                <p className="footerContactHeading">Contact</p>
                {siteContact.addressLine1 ? (
                  <p className="footerContactLine">{siteContact.addressLine1}</p>
                ) : null}
                {siteContact.addressLine2 ? (
                  <p className="footerContactLine">{siteContact.addressLine2}</p>
                ) : null}
                {siteContact.phone ? (
                  <a className="footerContactLink" href={`tel:${siteContact.phone}`}>
                    {siteContact.phone}
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="footerLinks">
            <h3>Explore</h3>
            <button type="button" onClick={() => scrollToSection("categories")}>
              Categories
            </button>
            <button type="button" onClick={() => scrollToSection("how-it-works")}>
              How it works
            </button>
            <button
              type="button"
              onClick={() => startOnboarding("", "footer_vendor_onboarding")}
            >
              Vendor onboarding
            </button>
          </div>

          <div className="footerLinks">
            <h3>Platform</h3>
            <a href="/onboarding">Set up business</a>
            <a href="/onboarding">Get started</a>
            <a href="/onboarding">Launch online</a>
            <a href="/privacy-policy">Privacy Policy</a>
          </div>
        </div>

        <div className="siteShell footerBottom">
          <p>© 2026 YNOT Go Online. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
