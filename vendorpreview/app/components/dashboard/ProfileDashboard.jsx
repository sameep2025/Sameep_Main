"use client";
import "./ProfileDashboard.css";
import ProfileSocialHandles from "./ProfileSocialHandles";
import { useState } from "react";
import { SOCIAL_ICONS } from "../../Icons/SocialIcons";
import { useVendor } from "@/app/context/VendorContext";
import HomeLocationModal from "../../Profile/HomeLocationModal";
import BusinessLocationsModal from "../../Profile/BusinessLocationsModal";
import BusinessHoursModal from "../../Profile/BusinessHoursModal";
import BrandingContactModal from "../../Profile/BrandingContactModal";
import HeroTextModal from "../../Profile/HeroTextModal";
import TemplateSelectionModal from "../../Profile/TemplateSelectionModal";
import WhyUsModal from "../../Profile/WhyUsModal";
import AboutFounderModal from "../../Profile/AboutFounderModal";
import ShowcaseSectionModal from "../../Profile/ShowcaseSectionModal";
import PaymentSettingsModal from "../../Profile/PaymentSettingsModal";
import GstSettings from "./GstSettings";

function ProfileDashboard({
  vendorInfo,
  categorySocials,
  onOpenServices,
}) {
  const formatTemplateName = (value) =>
    String(value || "system default")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  const { vendorInfo: contextVendorInfo, setVendorInfo } = useVendor();
  const [activePanel, setActivePanel] = useState("home");
  const [selectedSocial, setSelectedSocial] = useState(null);
  const [showHomeLocation, setShowHomeLocation] = useState(false);
  const [showBusinessLocations, setShowBusinessLocations] = useState(false);
  const [showBusinessHours, setShowBusinessHours] = useState(false);
  const [showBrandingContact, setShowBrandingContact] = useState(false);
  const [showHeroText, setShowHeroText] = useState(false);
  const [showWhyUs, setShowWhyUs] = useState(false);
  const [showFounderAbout, setShowFounderAbout] = useState(false);
  const [showShowcaseSection, setShowShowcaseSection] = useState(false);
  const [showTemplateSelection, setShowTemplateSelection] = useState(false);
  const [showPaymentSettings, setShowPaymentSettings] = useState(false);
  const [hoursVendor, setHoursVendor] = useState(null);
  const [loadingVendor, setLoadingVendor] = useState(false);
  const currentVendorInfo = contextVendorInfo || vendorInfo;
  const vendorId = currentVendorInfo?.vendorId || currentVendorInfo?._id || null;
  const brandingDetailsCount =
    (currentVendorInfo?.logoUrl ? 1 : 0) +
    (Array.isArray(currentVendorInfo?.secondaryPhones)
      ? currentVendorInfo.secondaryPhones.filter(Boolean).length
      : 0);
  const galleryCount = Array.isArray(currentVendorInfo?.rowImages)
    ? currentVendorInfo.rowImages.length
    : currentVendorInfo?.rowImages && typeof currentVendorInfo.rowImages === "object"
      ? Object.values(currentVendorInfo.rowImages).flat().filter(Boolean).length
      : 0;

  const socialLinks = currentVendorInfo?.socialLinks || {};
  const locationCount =
    currentVendorInfo?.locations?.length ||
    currentVendorInfo?.nearbyLocations?.length ||
    0;
  const targetedLocationCount =
    currentVendorInfo?.targetedLocations?.length ||
    currentVendorInfo?.nearbyLocations?.length ||
    currentVendorInfo?.location?.nearbyLocations?.length ||
    0;
  const initialHomeLocation = currentVendorInfo?.location
    ? {
        lat: currentVendorInfo.location.lat,
        lng: currentVendorInfo.location.lng,
      }
    : undefined;
  const hoursCount = currentVendorInfo?.businessHours?.length || currentVendorInfo?.hours?.length || 0;
  const heroTextCount =
    (currentVendorInfo?.customFields?.freeText1 ? 1 : 0) +
    (currentVendorInfo?.customFields?.freeText2 ? 1 : 0) +
    (Array.isArray(currentVendorInfo?.customFields?.quickHighlights)
      ? currentVendorInfo.customFields.quickHighlights.filter(Boolean).length
      : 0);
  const whyUsCards = Array.isArray(currentVendorInfo?.customFields?.whyUs?.cards)
    ? currentVendorInfo.customFields.whyUs.cards
    : [];
  const founderAbout = currentVendorInfo?.customFields?.founderAbout || {};
  const showcaseSection = currentVendorInfo?.customFields?.showcaseSection || {};
  const showcaseItems = Array.isArray(showcaseSection?.items) ? showcaseSection.items : [];
  const whyUsCount =
    (currentVendorInfo?.customFields?.whyUs?.heading ? 1 : 0) +
    (currentVendorInfo?.customFields?.whyUs?.subHeading ? 1 : 0) +
    whyUsCards.filter((card) => card?.title || card?.description).length;
  const founderAboutCount =
    (founderAbout?.heading ? 1 : 0) +
    (founderAbout?.body ? 1 : 0) +
    (founderAbout?.founderName ? 1 : 0) +
    (founderAbout?.founderRole ? 1 : 0) +
    (founderAbout?.founderImageUrl ? 1 : 0);
  const showcaseSectionCount =
    (showcaseSection?.heading ? 1 : 0) +
    (showcaseSection?.subHeading ? 1 : 0) +
    (showcaseSection?.itemLabel ? 1 : 0) +
    showcaseItems.filter(
      (item) => item?.title || item?.subtitle || item?.description || (Array.isArray(item?.imageUrls) && item.imageUrls.length)
    ).length;
  const openService = (serviceKey) => {
    onOpenServices?.(serviceKey);
  };
  const openBusinessHours = async () => {
    try {
      if (!vendorId) return;

      setLoadingVendor(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/dummy-vendors/${vendorId}`
      );

      if (!response.ok) {
        throw new Error("Failed to load business hours");
      }

      const data = await response.json();
      setHoursVendor(data);
      setShowBusinessHours(true);
    } catch (error) {
      console.error("Failed to load vendor", error);
      alert("Failed to load business hours");
    } finally {
      setLoadingVendor(false);
    }
  };
  const normalize = (label) =>
    String(label || "")
      .toLowerCase()
      .replace(/\s+/g, "");
  const formatSocialUrl = (value) =>
    value.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const socialsToRender =
    categorySocials === null
      ? []
      : (() => {
          const mapped = (categorySocials || [])
            .map((label) => {
              const key = normalize(label);
              if (!SOCIAL_ICONS[key]) return null;

              return {
                key,
                label,
                value:
                  key === "whatsapp"
                    ? socialLinks.whatsapp || currentVendorInfo?.phone || ""
                    : socialLinks[key] || "",
              };
            })
            .filter(Boolean);

          if (!mapped.some(({ key }) => key === "whatsapp")) {
            const whatsappValue = socialLinks.whatsapp || currentVendorInfo?.phone || "";
            if (whatsappValue) {
              mapped.push({
                key: "whatsapp",
                label: "WhatsApp",
                value: whatsappValue,
              });
            }
          }

          return mapped;
        })();
  const socialCount = socialsToRender.filter((item) => Boolean(item.value?.trim())).length;

const cardHandlers = {
  brandingContact: () => setShowBrandingContact(true),
  heroText: () => setShowHeroText(true),
  whyUs: () => setShowWhyUs(true),
  founderAbout: () => setShowFounderAbout(true),
  showcaseSection: () => setShowShowcaseSection(true),
  websiteTemplate: () => setShowTemplateSelection(true),
  paymentSettings: () => setShowPaymentSettings(true),
  gstSettings: () => setActivePanel("gst-settings"),
  gallery: () => openService("gallery"),
  locations: () => setShowHomeLocation(true),
  targetedLocations: () => setShowBusinessLocations(true),
  hours: () => openBusinessHours(),
};

  const profileCards = [
    {
      key: "brandingContact",
      title: "Branding & Contact",
      description: `Manage logo and backup phone numbers. ${brandingDetailsCount} branding detail${brandingDetailsCount === 1 ? "" : "s"} configured.`,
    },
    {
      key: "heroText",
      title: "Hero Text",
      description: `Update the heading, description, and quick highlights. ${heroTextCount} field${heroTextCount === 1 ? "" : "s"} configured.`,
    },
    {
      key: "whyUs",
      title: "Why Us",
      description: `Manage the Modern Light Our Story section with heading, sub heading, and 4 cards. ${whyUsCount} field${whyUsCount === 1 ? "" : "s"} configured.`,
    },
    {
      key: "founderAbout",
      title: "About Founder",
      description: `Add the founder story, name, role, and optional image. ${founderAboutCount} field${founderAboutCount === 1 ? "" : "s"} configured.`,
    },
    {
      key: "showcaseSection",
      title: "Showcase Section",
      description: `Create premium projects, partners, clients, or customer showcases for Modern Light. ${showcaseSectionCount} field${showcaseSectionCount === 1 ? "" : "s"} configured.`,
    },
    {
      key: "websiteTemplate",
      title: "Website Template",
      description: `Choose the default preview template. Currently set to ${formatTemplateName(currentVendorInfo?.selectedTemplateKey)}.`,
    },
    ...(String(currentVendorInfo?.selectedTemplateKey || "").trim().toLowerCase() === "ecommerce"
      ? [
          {
            key: "paymentSettings",
            title: "Payment Settings",
            description: "Configure vendor-specific Razorpay credentials for ecommerce checkout.",
          },
        ]
      : []),
    {
      key: "social-panel",
      title: "My Social Handles",
      description: `Add Instagram, Facebook, LinkedIn etc. ${socialCount} handle${socialCount === 1 ? "" : "s"} linked.`,
    },
    {
      key: "gstSettings",
      title: "GST Settings",
      description: "Prepare GSTIN, registered business details, tax rate, SAC, and pricing preference. GST billing remains inactive.",
    },
    {
      key: "gallery",
      title: "My Gallery",
      description: `Manage business images. ${galleryCount} image${galleryCount === 1 ? "" : "s"} available.`,
    },
    {
      key: "locations",
      title: "Home Locations",
      description: `Manage business locations. ${locationCount} location${locationCount === 1 ? "" : "s"} available.`,
    },
    {
  key: "targetedLocations",
  title: "Targeted Locations",
  description: `Manage targeted service areas. ${targetedLocationCount} location${
    targetedLocationCount === 1 ? "" : "s"
  } available.`,
},
    {
      key: "hours",
      title: "Business Hours",
      description: loadingVendor
        ? "Loading business hours..."
        : `Update working hours. ${hoursCount} hour entr${hoursCount === 1 ? "y" : "ies"} available.`,
    },
  ];

  return (
    <div className="profile-dashboard">
      {activePanel === "home" && (
        <div className="profile-grid">
          {profileCards.map((card) => (
            <div
              key={card.key}
              className="profile-card clickable"
              onClick={() => {
                if (card.key === "social-panel") {
                  setActivePanel("social");
                  return;
                }
                cardHandlers[card.key]();
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (card.key === "social-panel") {
                    setActivePanel("social");
                    return;
                  }
                  cardHandlers[card.key]();
                }
              }}
            >
              <h3 className="profile-card-title">{card.title}</h3>
              <p className="profile-card-copy">{card.description}</p>
            </div>
          ))}
        </div>
      )}

      {showHomeLocation && (
        <HomeLocationModal
          vendorId={vendorId}
          initialPosition={initialHomeLocation}
          onClose={() => setShowHomeLocation(false)}
        />
      )}

      {showBrandingContact && (
        <BrandingContactModal
          vendorId={vendorId}
          businessName={currentVendorInfo?.businessName || ""}
          initialLogoUrl={currentVendorInfo?.logoUrl || ""}
          initialSecondaryPhones={currentVendorInfo?.secondaryPhones || []}
          initialLanguagePreference={currentVendorInfo?.languagePreference || "en"}
          onClose={() => setShowBrandingContact(false)}
        />
      )}

      {showHeroText && (
        <HeroTextModal
          vendorId={vendorId}
          businessName={currentVendorInfo?.businessName || ""}
          categoryId={
            typeof currentVendorInfo?.categoryId === "object"
              ? currentVendorInfo?.categoryId?._id || ""
              : currentVendorInfo?.categoryId || ""
          }
          categoryName={
            typeof currentVendorInfo?.categoryId === "object"
              ? currentVendorInfo?.categoryId?.name || ""
              : currentVendorInfo?.categoryName || ""
          }
          initialHeading={currentVendorInfo?.customFields?.freeText1 || ""}
          initialDescription={currentVendorInfo?.customFields?.freeText2 || ""}
          initialQuickHighlights={currentVendorInfo?.customFields?.quickHighlights || []}
          onClose={() => setShowHeroText(false)}
        />
      )}

      {showWhyUs && (
        <WhyUsModal
          vendorId={vendorId}
          businessName={currentVendorInfo?.businessName || ""}
          categoryId={
            typeof currentVendorInfo?.categoryId === "object"
              ? currentVendorInfo?.categoryId?._id || ""
              : currentVendorInfo?.categoryId || ""
          }
          initialHeading={currentVendorInfo?.customFields?.whyUs?.heading || ""}
          initialSubHeading={currentVendorInfo?.customFields?.whyUs?.subHeading || ""}
          initialCards={currentVendorInfo?.customFields?.whyUs?.cards || []}
          onClose={() => setShowWhyUs(false)}
        />
      )}

      {showFounderAbout && (
        <AboutFounderModal
          vendorId={vendorId}
          businessName={currentVendorInfo?.businessName || ""}
          initialFounderAbout={currentVendorInfo?.customFields?.founderAbout || {}}
          onClose={() => setShowFounderAbout(false)}
        />
      )}

      {showShowcaseSection && (
        <ShowcaseSectionModal
          vendorId={vendorId}
          businessName={currentVendorInfo?.businessName || ""}
          initialShowcaseSection={currentVendorInfo?.customFields?.showcaseSection || {}}
          onClose={() => setShowShowcaseSection(false)}
        />
      )}

      {showTemplateSelection && (
        <TemplateSelectionModal
          vendorId={vendorId}
          businessName={currentVendorInfo?.businessName || ""}
          initialTemplateKey={currentVendorInfo?.selectedTemplateKey || ""}
          initialNurseryColorScheme={currentVendorInfo?.nurseryColorScheme || ""}
          initialModernColorScheme={currentVendorInfo?.modernColorScheme || ""}
          initialClassicColorScheme={currentVendorInfo?.classicColorScheme || ""}
          onClose={() => setShowTemplateSelection(false)}
        />
      )}

      {showPaymentSettings && (
        <PaymentSettingsModal
          vendorId={vendorId}
          businessName={currentVendorInfo?.businessName || ""}
          onClose={() => setShowPaymentSettings(false)}
        />
      )}

      {showBusinessLocations && (
        <BusinessLocationsModal
          vendorId={vendorId}
          initialLocations={
            currentVendorInfo?.targetedLocations ||
            currentVendorInfo?.location?.nearbyLocations ||
            currentVendorInfo?.nearbyLocations ||
            []
          }
          onSaved={(updatedLocations) => {
            setVendorInfo((prev) =>
              prev
                ? {
                    ...prev,
                    targetedLocations: updatedLocations,
                    nearbyLocations: updatedLocations,
                    location: {
                      ...(prev.location || {}),
                      nearbyLocations: updatedLocations,
                    },
                  }
                : prev
            );
          }}
          onClose={() => setShowBusinessLocations(false)}
        />
      )}

      {showBusinessHours && hoursVendor && (
        <BusinessHoursModal
          vendorId={vendorId}
          businessName={
            hoursVendor.businessName ||
            currentVendorInfo?.businessName ||
            ""
          }
          initialHours={hoursVendor.businessHours || []}
          onClose={() => {
            setShowBusinessHours(false);
            setHoursVendor(null);
          }}
        />
      )}

      {activePanel === "social" && (
        <div className="profile-panel">
          <button
            className="dashboard-back-btn profile-panel-back"
            type="button"
            onClick={() => setActivePanel("home")}
          >
            Back To Profile
          </button>

          <div className="profile-card profile-card-social">
            <h3 className="profile-card-title">My Social Handles</h3>
            <p className="profile-card-copy">
              Add Instagram, Facebook, LinkedIn etc. {socialCount} handle{socialCount === 1 ? "" : "s"} linked.
            </p>
            <div className="profile-social-task-list">
              {categorySocials === null && (
                <div className="profile-social-task-muted">
                  Loading social options...
                </div>
              )}

              {categorySocials !== null && socialsToRender.length === 0 && (
                <div className="profile-social-task-muted">
                  No social platforms configured for this category
                </div>
              )}

              {socialsToRender.map(({ key, label, value }) => {
                const Icon = SOCIAL_ICONS[key];
                const hasValue = Boolean(value?.trim());
                const displayValue = hasValue ? formatSocialUrl(value) : "";

                return (
                  <div
                    key={key}
                    className="profile-social-task clickable"
                    onClick={() => {
                      setSelectedSocial({ key, label, value });
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedSocial({ key, label, value });
                      }
                    }}
                  >
                    <div className="profile-social-task-main">
                      {Icon ? (
                        <Icon className={`social-icon ${key}`} />
                      ) : null}
                      <div className="profile-social-text">
                        <span className="profile-social-task-label">
                          {label}
                        </span>
                        {hasValue && (
                          <span className="profile-social-link-text">
                            {displayValue}
                          </span>
                        )}
                      </div>
                    </div>
                    {hasValue ? (
                      <a
                        className="profile-social-task-status"
                        href={value}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                      >
                        Open
                      </a>
                    ) : (
                      <span className="profile-social-task-status">
                        Add
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {selectedSocial && (
            <ProfileSocialHandles
              showTitle={false}
              hideList={true}
              initialSocialKey={selectedSocial.key || ""}
              initialSocialLabel={selectedSocial.label || ""}
              initialSocialValue={selectedSocial.value || ""}
              onCloseEditor={() => setSelectedSocial(null)}
              onSaved={() => setSelectedSocial(null)}
            />
          )}
        </div>
      )}

      {activePanel === "gst-settings" && (
        <GstSettings vendorId={vendorId} onBack={() => setActivePanel("home")} />
      )}
    </div>
  );
}

export default ProfileDashboard;
