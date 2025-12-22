// pages/preview/[vendorId]/[categoryId].jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";

import { useRouter } from "next/router";
import Head from "next/head";
import dynamic from "next/dynamic";
import TopNavBar from "../../../components/TopNavBar";
import HomeSection from "../../../components/HomeSection";
import BenefitsSection from "../../../components/BenefitsSection";
import AboutSection from "../../../components/AboutSection";
import ContactSection from "../../../components/ContactSection";
import Footer from "../../../components/Footer";
import FullPageShimmer from "../../../components/FullPageShimmer";
import API_BASE_URL, { ASSET_BASE_URL } from "../../../config";

const LocationPickerModal = dynamic(() => import("../../../components/LocationPickerModal"), { ssr: false });
const BusinessLocationModal = dynamic(() => import("../../../components/BusinessLocationModal"), { ssr: false });
const BusinessHoursModal = dynamic(() => import("../../../components/BusinessHoursModal"), { ssr: false });

export default function PreviewPage() {
  const router = useRouter();
  const { vendorId, categoryId, lat, lng, homeLocs, mode, setupTimerKey } = router.query;

  const parsedHomeLocations = homeLocs ? JSON.parse(homeLocs) : [];

  const isDummyMode = String(mode || "").trim().toLowerCase() === "dummy";

  const [vendor, setVendor] = useState(null);
  const [categoryTree, setCategoryTree] = useState(null);
  const [loadingVendor, setLoadingVendor] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [error, setError] = useState("");
  const [selectedLeaf, setSelectedLeaf] = useState(null);
  const [location, setLocation] = useState(null);
  const [showHomeLocationModal, setShowHomeLocationModal] = useState(false);
  const [showBusinessLocationModal, setShowBusinessLocationModal] = useState(false);
  const [showBusinessHoursModal, setShowBusinessHoursModal] = useState(false);
  const [cardSelections, setCardSelections] = useState({});
  const [nodeSelections, setNodeSelections] = useState({});
  // Attribute filter bar state (driven by uiConfig.attributesBar)
  const [attrSelections, setAttrSelections] = useState({}); // { field: value }
  const [attrDropdownOpen, setAttrDropdownOpen] = useState({}); // { [cardKey]: boolean }
  const [comboSizeDropdownOpen, setComboSizeDropdownOpen] = useState({}); // { [comboIndex]: boolean }
  const [pairSelections, setPairSelections] = useState({}); // { index: "A|B" }
  const [taxiSelections, setTaxiSelections] = useState({}); // { [lvl1Id]: { lvl2, lvl3, bodySeats: "body|seats", fuelType: string, modelBrand: "model|brand" } }
  const [combos, setCombos] = useState([]);
  const [webMenu, setWebMenu] = useState([]);
  const [servicesNavLabel, setServicesNavLabel] = useState("Our Services");
  const [isInventoryModel, setIsInventoryModel] = useState(false);
  const [vendorComboOverrides, setVendorComboOverrides] = useState({}); // { `${comboId}|${sizeKey}`: { price, status } }
  const [packageSelections, setPackageSelections] = useState({}); // { [idx]: { size: string|null } }
  const [invImgIdx, setInvImgIdx] = useState({}); // { [targetId]: number }
  const [heroTitle, setHeroTitle] = useState(null);
  const [heroDescription, setHeroDescription] = useState(null);
  const [homePopup, setHomePopup] = useState(null);
  const [whyUs, setWhyUs] = useState(null);
  const [about, setAbout] = useState(null);
  const [contact, setContact] = useState(null);
  const [individualAddon, setIndividualAddon] = useState(null);
  const [packagesAddon, setPackagesAddon] = useState(null);
  const [vendorAddonTitle, setVendorAddonTitle] = useState(null);
  const [vendorAddonDescription, setVendorAddonDescription] = useState(null);
  const [categoryProfilePictures, setCategoryProfilePictures] = useState([]); // fallback when vendor has no profile pictures
  const [activeServiceKey, setActiveServiceKey] = useState(null); // which service/card should animate
  const [attributesHeading, setAttributesHeading] = useState(null);
  const [parentSelectorLabel, setParentSelectorLabel] = useState(null);
  const [inventoryLabelName, setInventoryLabelName] = useState(null);
  const [inventoryLabelsList, setInventoryLabelsList] = useState([]);
  const [linkedAttributes, setLinkedAttributes] = useState({}); // dummy category linkedAttributes (for inventory scopes)
  const [modelsByFamily, setModelsByFamily] = useState({}); // cache of master models per family (cars, bikes, etc.)
  const [invItems, setInvItems] = useState([]); // dummy vendor inventory selections for this category
  const [activeInvScope, setActiveInvScope] = useState(null); // { family, label }
  const [showLinkedModal, setShowLinkedModal] = useState(false); // inventory popup visibility
  const [draftSelections, setDraftSelections] = useState({}); // cascade selector draft per family
  const [editingItemKey, setEditingItemKey] = useState(null); // currently edited inventory row key
  const [socialHandles, setSocialHandles] = useState([]);
  const [showMyEnquiriesModal, setShowMyEnquiriesModal] = useState(false);
  const [myEnquiries, setMyEnquiries] = useState([]);
  const [myEnquiriesLoading, setMyEnquiriesLoading] = useState(false);
  const [myEnquiriesError, setMyEnquiriesError] = useState("");
  const [enquiryStatusConfig, setEnquiryStatusConfig] = useState([]);
  const [expandedEnquiryGroup, setExpandedEnquiryGroup] = useState(null); // track which group's table is visible
  const [showSetupCategoryModal, setShowSetupCategoryModal] = useState(false);
  const [setupCategories, setSetupCategories] = useState([]);
  const [setupCategoriesLoading, setSetupCategoriesLoading] = useState(false);
  const [setupCategoriesError, setSetupCategoriesError] = useState("");
  const [setupSelectedCategory, setSetupSelectedCategory] = useState(null);
  const [setupPlaceQuery, setSetupPlaceQuery] = useState("");
  const [setupPlaceResults, setSetupPlaceResults] = useState([]);
  const [setupPlaceLoading, setSetupPlaceLoading] = useState(false);
  const [setupPlaceError, setSetupPlaceError] = useState("");
  const [setupSelectedPlace, setSetupSelectedPlace] = useState(null);
  const [setupShowPlacesStep, setSetupShowPlacesStep] = useState(false);
  const [setupOtpPhoneInfo, setSetupOtpPhoneInfo] = useState(null); // { countryCode, phone, full }
  const [setupOtpSending, setSetupOtpSending] = useState(false);
  const [setupOtpSendError, setSetupOtpSendError] = useState("");
  const [setupOtpSent, setSetupOtpSent] = useState(false);
  const [setupOtpCode, setSetupOtpCode] = useState("");
  const [setupOtpVerifying, setSetupOtpVerifying] = useState(false);
  const [setupOtpVerifyError, setSetupOtpVerifyError] = useState("");
  const [setupOtpVerified, setSetupOtpVerified] = useState(false);
  const [setupOtpBypass, setSetupOtpBypass] = useState(false);
  const [setupMobileFlowOpen, setSetupMobileFlowOpen] = useState(false);
  const [setupMobileCountryCode, setSetupMobileCountryCode] = useState("91");
  const [setupMobilePhone, setSetupMobilePhone] = useState("");
  const [setupVerifiedCustomerId, setSetupVerifiedCustomerId] = useState("");
  const [setupVerifiedToken, setSetupVerifiedToken] = useState("");
  const [setupGeneratedDummyVendorId, setSetupGeneratedDummyVendorId] = useState("");
  const [setupGeneratePreviewError, setSetupGeneratePreviewError] = useState("");
  const [showSetupPreviewPrompt, setShowSetupPreviewPrompt] = useState(false);
  const [setupPreviewPromptLoading, setSetupPreviewPromptLoading] = useState(false);
  const [setupPreviewPromptError, setSetupPreviewPromptError] = useState("");
  // Subcategory selection popup state
  const [showSubcategoryPopup, setShowSubcategoryPopup] = useState(false);
  const [setupSubcategories, setSetupSubcategories] = useState([]); // first-level children of selected category
  const [setupSelectedSubcategories, setSetupSelectedSubcategories] = useState({}); // { [id]: true/false }
  const [setupSubcategoriesLoading, setSetupSubcategoriesLoading] = useState(false);
  // Vehicle count popup state for inventory model categories
  const [showVehicleCountPopup, setShowVehicleCountPopup] = useState(false);
  const [setupVehicleCounts, setSetupVehicleCounts] = useState({}); // { [serviceId]: count }
  // Setup inventory selection popup state (after vehicle count)
  const [showSetupInventoryPopup, setShowSetupInventoryPopup] = useState(false);
  const [setupInventoryScopes, setSetupInventoryScopes] = useState([]); // [{ serviceId, serviceName, family, label, maxCount }]
  const [setupCurrentScopeIndex, setSetupCurrentScopeIndex] = useState(0);
  const [setupInventoryItems, setSetupInventoryItems] = useState({}); // { [serviceId]: [items] }
  const [setupInventoryDraft, setSetupInventoryDraft] = useState({}); // { [family]: { field: value } }
  const [setupModelsByFamily, setSetupModelsByFamily] = useState({}); // cache of models for setup flow
  // Profile setup confirmation popups
  const [showProfileSetupConfirm, setShowProfileSetupConfirm] = useState(false); // "Your profile has been set" popup
  const [showPreviewConfirm, setShowPreviewConfirm] = useState(false); // "Do you want preview?" popup
  const [setupProfileStatus, setSetupProfileStatus] = useState(""); // "", "profile_setup", "preview"

  const [setupCreationTimerRunning, setSetupCreationTimerRunning] = useState(false);
  const [setupCreationTimerStartMs, setSetupCreationTimerStartMs] = useState(null);
  const [setupCreationElapsedMs, setSetupCreationElapsedMs] = useState(0);
  const [setupCreationTimerKey, setSetupCreationTimerKey] = useState("");
  const [setupCreationFinalMs, setSetupCreationFinalMs] = useState(null);
  const setupTimerReportedRef = useRef(false);

  const [setupResumeCategoryId, setSetupResumeCategoryId] = useState("");
  const setupResumeTriggeredRef = useRef(false);

  const [setupGoogleAuthToken, setSetupGoogleAuthToken] = useState("");
  const setupProgressSaveRef = useRef({ t: null, pending: null });

  // OTP flow state for preview booking (country code + mobile + OTP)
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpStep, setOtpStep] = useState(1); // 1: phone, 2: otp
  const [countries, setCountries] = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [countryCode, setCountryCode] = useState("91");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [loginAsAdmin, setLoginAsAdmin] = useState(false);
  const [adminPasscodeInput, setAdminPasscodeInput] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [navIdentity, setNavIdentity] = useState({ role: "guest", displayName: "Guest", loggedIn: false });
  const [enquirySubmitted, setEnquirySubmitted] = useState(false);
  const [lastEnquiryPath, setLastEnquiryPath] = useState("");
  const [contactInfoModal, setContactInfoModal] = useState(null); // { enquiry, nextStatus }
  const [expandedEnquiryId, setExpandedEnquiryId] = useState(null); // which individual enquiry card details are visible

  const loading = loadingVendor || loadingCategories;

  const formatElapsed = useCallback((ms) => {
    try {
      const safe = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
      const mm = String(Math.floor(safe / 60)).padStart(2, "0");
      const ss = String(safe % 60).padStart(2, "0");
      return `${mm}:${ss}`;
    } catch {
      return "00:00";
    }
  }, []);

  const startSetupCreationTimer = useCallback(() => {
    try {
      const now = Date.now();
      setSetupCreationTimerStartMs(now);
      setSetupCreationElapsedMs(0);
      setSetupCreationTimerRunning(true);
      setSetupCreationFinalMs(null);
      setSetupCreationTimerKey(`${now}-${Math.random().toString(16).slice(2)}`);
    } catch {}
  }, []);

  const stopSetupCreationTimer = useCallback(() => {
    try {
      setSetupCreationTimerRunning(false);
    } catch {}
  }, []);

  useEffect(() => {
    if (!setupCreationTimerRunning) return;
    if (!setupCreationTimerStartMs) return;

    const id = window.setInterval(() => {
      try {
        setSetupCreationElapsedMs(Date.now() - setupCreationTimerStartMs);
      } catch {}
    }, 250);

    return () => {
      try {
        window.clearInterval(id);
      } catch {}
    };
  }, [setupCreationTimerRunning, setupCreationTimerStartMs]);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (!setupCreationTimerKey) return;

      const doneKey = `setupTimerDone:${setupCreationTimerKey}`;
      const onStorage = (e) => {
        try {
          if (!e) return;
          if (String(e.key || "") !== doneKey) return;
          const payload = e.newValue ? JSON.parse(e.newValue) : null;
          const doneAt = payload && typeof payload.doneAt === "number" ? payload.doneAt : null;
          if (!doneAt) return;
          if (!setupCreationTimerStartMs) return;

          const finalMs = Math.max(0, doneAt - setupCreationTimerStartMs);
          setSetupCreationElapsedMs(finalMs);
          setSetupCreationFinalMs(finalMs);
          setSetupCreationTimerRunning(false);
          try {
            window.localStorage.removeItem(doneKey);
          } catch {}
        } catch {}
      };

      window.addEventListener("storage", onStorage);
      return () => {
        try {
          window.removeEventListener("storage", onStorage);
        } catch {}
      };
    } catch {}
  }, [setupCreationTimerKey, setupCreationTimerStartMs]);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (!setupTimerKey) return;
      if (setupTimerReportedRef.current) return;
      if (loading) return;
      setupTimerReportedRef.current = true;
      const doneKey = `setupTimerDone:${setupTimerKey}`;
      window.localStorage.setItem(doneKey, JSON.stringify({ doneAt: Date.now() }));
    } catch {}
  }, [setupTimerKey, loading]);

  // Auto-add data when all required fields are selected for cars and bikes families
  useEffect(() => {
    try {
      if (!showSetupInventoryPopup) return;
      if (!setupInventoryScopes.length) return;
      
      const currentScope = setupInventoryScopes[setupCurrentScopeIndex];
      if (!currentScope) return;
      
      const { serviceId, family, maxCount } = currentScope;
      const currentItems = setupInventoryItems[serviceId] || [];
      
      // Check if limit has been reached
      if (currentItems.length >= maxCount) return;
      
      // Apply auto-add for both cars and bikes families
      const famLower = String(family).toLowerCase();
      if (famLower !== 'cars' && famLower !== 'bikes') return;
      
      const sel = setupInventoryDraft[family] || {};
      const hasSelection = Object.values(sel).some((v) => v && String(v).trim() !== "");
      if (!hasSelection) return;
      
      // Debounce check - prevent rapid successive triggers
      const now = Date.now();
      if (window.__lastAutoAddTime && now - window.__lastAutoAddTime < 500) {
        return;
      }
      
      // Check if all required fields are selected
      let requiredFields;
      if (famLower === 'cars') {
        // For cars: check brand and model, then auto-fill bodyType
        const brand = sel.brand || sel.Brand || '';
        const model = sel.model || sel.Model || '';
        
        if (brand && model) {
          // Auto-fill bodyType with first available option
          const parentLinkedAttr = setupSelectedCategory?.linkedAttributes || {};
          const { fields, listsByField } = getSetupCascadeLists(family, parentLinkedAttr);
          const bodyTypeOptions = Array.isArray(listsByField.bodyType) ? listsByField.bodyType : [];
          
          if (bodyTypeOptions.length > 0 && !sel.bodyType) {
            // Auto-fill bodyType with first option
            setSetupInventoryDraft((prev) => ({
              ...prev,
              [family]: { ...sel, bodyType: bodyTypeOptions[0] }
            }));
            window.__lastAutoAddTime = now;
            return; // Wait for next effect cycle to check all fields
          }
        }
        
        requiredFields = ['brand', 'model', 'transmission', 'bodyType'];
      } else if (famLower === 'bikes') {
        requiredFields = ['bikeBrand', 'model', 'bikeTransmission'];
      } else {
        return;
      }
      
      const allFieldsSelected = requiredFields.every(field => 
        sel[field] && String(sel[field]).trim() !== ''
      );
      
      if (!allFieldsSelected) return;
      
      // Normalize selections for bikes
      let selNorm = { ...sel };
      if (famLower === "bikes") {
        if (selNorm.brand && !selNorm.bikeBrand) {
          selNorm = { ...selNorm, bikeBrand: selNorm.brand };
        }
        if (selNorm.brand) {
          const { brand, ...rest } = selNorm;
          selNorm = rest;
        }
      }
      
      // Create snapshot and add to items
      const snapshot = {
        at: Date.now(),
        selections: { [family]: selNorm },
        scopeFamily: family,
        scopeLabel: currentScope.label,
      };
      
      // Batch state updates for better performance
      setSetupInventoryItems((prev) => ({
        ...prev,
        [serviceId]: [...(prev[serviceId] || []), snapshot],
      }));
      
      // Clear the draft for next selection
      setSetupInventoryDraft((prev) => ({ ...prev, [family]: {} }));
      
      // Update debounce timestamp
      window.__lastAutoAddTime = now;
      
    } catch (error) {
      console.error('Error in auto-add data effect:', error);
    }
  }, [showSetupInventoryPopup, setupInventoryScopes, setupCurrentScopeIndex, setupInventoryDraft, setupInventoryItems]);

  const makePreviewSessionKey = useCallback((venId, catId) => {
    try {
      const v = venId || "";
      const c = catId || "";
      return `previewSession:${v}:${c}`;
    } catch {
      return "previewSession:unknown:unknown";
    }
  }, []);

  const makeSetupResumeKey = useCallback((venId, catId) => {
    try {
      const v = venId || "";
      const c = catId || "";
      return `setupResume:${v}:${c}`;
    } catch {
      return "setupResume:unknown:unknown";
    }
  }, []);

  const makeSetupGoogleAuthKey = useCallback((venId, catId) => {
    try {
      const v = venId || "";
      const c = catId || "";
      return `setupGoogleAuth:${v}:${c}`;
    } catch {
      return "setupGoogleAuth:unknown:unknown";
    }
  }, []);

  const getStoredSetupGoogleAuthToken = useCallback(() => {
    try {
      if (typeof window === "undefined") return "";
      const key = makeSetupGoogleAuthKey(vendorId, categoryId);
      const raw = window.localStorage.getItem(key);
      return raw ? String(raw) : "";
    } catch {
      return "";
    }
  }, [makeSetupGoogleAuthKey, vendorId, categoryId]);

  const saveStoredSetupGoogleAuthToken = useCallback((token) => {
    try {
      if (typeof window === "undefined") return;
      const t = token ? String(token) : "";
      const key = makeSetupGoogleAuthKey(vendorId, categoryId);
      if (t) {
        window.localStorage.setItem(key, t);
      } else {
        window.localStorage.removeItem(key);
      }
    } catch {}
  }, [makeSetupGoogleAuthKey, vendorId, categoryId]);

  const getStoredCustomerId = useCallback(() => {
    try {
      if (typeof window === "undefined") return "";
      const key = makePreviewSessionKey(vendorId, categoryId);
      const val = window.localStorage.getItem(key);
      return val || "";
    } catch {
      return "";
    }
  }, [makePreviewSessionKey, vendorId, categoryId]);

  const handleOpenSetupBusiness = useCallback(async (opts) => {
    try {
      const shouldReadResumeKey = !!(opts && opts.resume);

      startSetupCreationTimer();
      setShowSetupCategoryModal(true);
      setSetupCategoriesError("");
      setSetupCategories([]);
      setSetupSelectedCategory(null);
      try {
        if (shouldReadResumeKey && typeof window !== "undefined" && vendorId && categoryId) {
          const resumeKey = makeSetupResumeKey(vendorId, categoryId);
          const raw = window.localStorage.getItem(resumeKey);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              const catId = parsed && (parsed.selectedCategoryId || parsed.categoryId)
                ? String(parsed.selectedCategoryId || parsed.categoryId)
                : "";
              if (catId) {
                setSetupResumeCategoryId(String(catId));
              }
            } catch {}
          }
        }
      } catch {}
      setSetupPlaceQuery("");
      setSetupPlaceResults([]);
      setSetupPlaceError("");
      setSetupSelectedPlace(null);
      setSetupShowPlacesStep(false);
      setSetupOtpPhoneInfo(null);
      setSetupOtpSending(false);
      setSetupOtpSendError("");
      setSetupOtpSent(false);
      setSetupOtpCode("");
      setSetupOtpVerifying(false);
      setSetupOtpVerifyError("");
      setSetupOtpVerified(false);
      setSetupOtpBypass(false);
      setSetupMobileFlowOpen(false);
      setSetupMobileCountryCode("91");
      setSetupMobilePhone("");
      setSetupVerifiedCustomerId("");
      setSetupVerifiedToken("");
      setSetupGeneratedDummyVendorId("");
      setSetupGeneratePreviewError("");
      setShowSetupPreviewPrompt(false);
      setSetupPreviewPromptLoading(false);
      setSetupPreviewPromptError("");
      setShowSubcategoryPopup(false);
      setSetupSubcategories([]);
      setSetupSelectedSubcategories({});
      setSetupSubcategoriesLoading(false);
      setSetupCategoriesLoading(true);
      console.log("🚀 Fetching dummy categories");
      const res = await fetch(`${API_BASE_URL}/api/dummy-categories`);
      console.log('[DEBUG dummy-categories response]', {
        ok: res?.ok,
        status: res?.status,
        statusText: res?.statusText,
        url: res?.url,
      });
      if (!res.ok) {
        throw new Error("Failed to load categories");
      }
      const data = await res.json();
      console.log('[DEBUG dummy-categories json]', data);
      const list = Array.isArray(data) ? data : [];
      try {
        const drivingSchoolMatches = list.filter((c) => {
          const nm = c && c.name != null ? String(c.name) : '';
          return nm.trim().toLowerCase() === 'driving school';
        });
        console.log('[DEBUG driving-school categories count]', drivingSchoolMatches.length);
        
        console.log(
          '[DEBUG driving-school categories items]',
          drivingSchoolMatches.map((c) => ({
            id: String(c?._id || c?.id || ''),
            name: String(c?.name || ''),
          }))
        );
      } catch {}
      setSetupCategories(list);
    } catch (e) {
      console.error("Setup My Business categories error", e);
      setSetupCategoriesError("Failed to load categories");
    } finally {
      setSetupCategoriesLoading(false);
    }
  }, [startSetupCreationTimer, vendorId, categoryId, makeSetupResumeKey]);

  const persistSetupDummyVendor = useCallback(async (placeOverride) => {
    try {
      const customerId = setupVerifiedCustomerId;
      const token = setupVerifiedToken;
      const catId = setupSelectedCategory?._id || setupSelectedCategory?.id || null;
      const place = placeOverride || setupSelectedPlace;
      const businessName = (place && place.name) ? String(place.name) : "";
      const placeLocation = place?.location || null;
      const placeAddress = place?.address || "";
      const openingHoursText = Array.isArray(place?.openingHoursText) ? place.openingHoursText : [];
      const phoneFull = setupOtpPhoneInfo ? `+${setupOtpPhoneInfo.countryCode}${setupOtpPhoneInfo.phone}` : "";

      if (!customerId || !catId || !businessName || !phoneFull) return false;

      const dvRes = await fetch(`${API_BASE_URL}/api/dummy-vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: String(customerId),
          phone: String(phoneFull),
          businessName: String(businessName),
          contactName: String(businessName),
          categoryId: String(catId),
          status: "Registered",
          location: {
            lat: typeof placeLocation?.lat === "number" ? placeLocation.lat : undefined,
            lng: typeof placeLocation?.lng === "number" ? placeLocation.lng : undefined,
            address: String(placeAddress || ""),
          },
          openingHoursText,
        }),
      });

      const dvJson = await dvRes.json().catch(() => ({}));
      const dvId = dvJson?._id || dvJson?.id || "";
      if (!dvId) return false;

      setSetupGeneratedDummyVendorId(String(dvId));
      try {
        if (typeof window !== "undefined") {
          if (token) {
            window.localStorage.setItem(`previewToken:${dvId}:${catId}`, String(token));
          }
          const identityKey = `previewIdentity:${dvId}:${catId}`;
          const existingIdentity = window.localStorage.getItem(identityKey);
          if (!existingIdentity) {
            window.localStorage.setItem(
              identityKey,
              JSON.stringify({
                role: "vendor",
                displayName: businessName || "Vendor",
                loggedIn: true,
              })
            );
          }
        }
      } catch {}

      setShowSetupPreviewPrompt(true);

      try {
        scheduleSaveSetupProgress({
          currentStep: "REGISTERED",
          generatedDummyVendorId: String(dvId),
          payload: {
            setupSelectedSubcategories,
            setupVehicleCounts,
            setupInventoryScopes,
            setupCurrentScopeIndex,
            setupInventoryDraft,
            setupInventoryItems,
          },
        });
      } catch {}

      return true;
    } catch (e) {
      console.error("Failed to persist setup dummy vendor", e);
      return false;
    }
  }, [setupVerifiedCustomerId, setupVerifiedToken, setupSelectedCategory, setupSelectedPlace, setupOtpPhoneInfo, setupSelectedSubcategories, setupVehicleCounts, setupInventoryScopes, setupCurrentScopeIndex, setupInventoryDraft, setupInventoryItems]);

  const handleSetupPlacesSearch = async () => {
    const q = (setupPlaceQuery || "").trim();
    if (!q) return;
    try {
      setSetupPlaceLoading(true);
      setSetupPlaceError("");
      setSetupPlaceResults([]);
      setSetupSelectedPlace(null);
      
      const res = await fetch(
        `${API_BASE_URL}/api/google/places/search?query=${encodeURIComponent(q)}`
      );
      
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error("Too many requests. Please try again later.");
        } else if (res.status >= 500) {
          throw new Error("Server is temporarily unavailable. Please try again later.");
        } else {
          throw new Error(`Failed to search places (Status: ${res.status})`);
        }
      }
      
      const data = await res.json();
      const results = Array.isArray(data?.results) ? data.results : [];
      setSetupPlaceResults(results);
    } catch (e) {
      console.error("Setup My Business Places search error", e);
      if (e.name === 'TypeError' && e.message.includes('fetch')) {
        setSetupPlaceError("Network error. Please check your internet connection and try again.");
      } else {
        setSetupPlaceError(e.message || "Failed to search places");
      }
    } finally {
      setSetupPlaceLoading(false);
    }
  };

  const handleSetupBypassOtp = async (phoneInfoOverride) => {
    const phoneInfo = phoneInfoOverride || setupOtpPhoneInfo;
    if (!phoneInfo) {
      setSetupOtpSendError("Please enter a valid phone number");
      return;
    }
    try {
      setSetupOtpVerifying(true);
      setSetupOtpSendError("");
      setSetupOtpVerifyError("");

      const bypassRes = await fetch(`/api/customers/bypass-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: phoneInfo.countryCode,
          phone: phoneInfo.phone,
        }),
      });
      const bypassJson = await bypassRes.json().catch(() => ({}));
      if (!bypassRes.ok) {
        const msg = bypassJson?.message || `OTP bypass failed (status ${bypassRes.status})`;
        throw new Error(msg);
      }

      const customerId = bypassJson?.customer?._id || bypassJson?.customer?.id || "";
      const token = bypassJson && bypassJson.token ? String(bypassJson.token) : "";
      setSetupVerifiedCustomerId(customerId ? String(customerId) : "");
      setSetupVerifiedToken(token);

      setSetupOtpVerified(true);
      setSetupOtpBypass(true);
      setSetupOtpSent(false);
      setSetupOtpCode("");

      try {
        if (setupSelectedPlace && customerId && !setupGeneratedDummyVendorId) {
          await persistSetupDummyVendor(setupSelectedPlace);
        }
        if (!setupSelectedPlace) setSetupShowPlacesStep(true);
      } catch {}
    } catch (e) {
      console.error("Setup My Business bypass OTP error", e);
      setSetupOtpSendError(e?.message || "OTP bypass failed");
      setSetupOtpBypass(false);
      if (!setupGeneratedDummyVendorId) {
        setSetupOtpVerified(false);
        setSetupVerifiedCustomerId("");
        setSetupVerifiedToken("");
      }
    } finally {
      setSetupOtpVerifying(false);
    }
  };

  const handleSetupSelectPlace = async (placeId) => {
    try {
      setSetupPlaceLoading(true);
      setSetupPlaceError("");

      // Find the search result to preserve rating data
      const searchResult = setupPlaceResults.find(r => r.placeId === placeId);
      
      // Fetch place details and progress in parallel for faster resume
      const catId = setupSelectedCategory?._id || setupSelectedCategory?.id || "";
      const [placeRes, progressResult] = await Promise.all([
        fetch(`${API_BASE_URL}/api/google/places/details?placeId=${encodeURIComponent(placeId)}`),
        catId ? fetchSetupProgress(String(catId), String(placeId)).catch(() => null) : Promise.resolve(null),
      ]);

      if (!placeRes.ok) {
        if (placeRes.status === 429) {
          throw new Error("Too many requests. Please try again later.");
        } else if (placeRes.status >= 500) {
          throw new Error("Server is temporarily unavailable. Please try again later.");
        } else {
          throw new Error(`Failed to fetch place details (Status: ${placeRes.status})`);
        }
      }
      
      const data = await placeRes.json();
      const place = data?.place || null;
      
      // Merge rating data from search results with detailed place data
      if (place && searchResult) {
        place.rating = searchResult.rating;
        place.userRatingsTotal = searchResult.userRatingsTotal;
      }
      
      setSetupSelectedPlace(place);

      try {
        const pId = place?.placeId || place?.place_id || placeId || "";
        if (catId && pId) {
          // Use already-fetched progress
          if (progressResult) {
            const restored = await applySetupProgressRestore(progressResult);
            if (restored) {
              try {
                if (typeof window !== "undefined" && vendorId && categoryId) {
                  const resumeKey = makeSetupResumeKey(vendorId, categoryId);
                  window.localStorage.removeItem(resumeKey);
                }
              } catch {}
              return;
            }
          }

          scheduleSaveSetupProgress({
            currentStep: "PLACE_SELECTED",
            payload: {
              setupSelectedPlace: {
                placeId: String(pId),
                name: String(place?.name || ""),
                address: String(place?.address || ""),
                location: place?.location || null,
              },
            },
          });
        }
      } catch {}

      // Derive phone number for OTP from place.phone (expected formats like +91XXXXXXXXXX)
      try {
        if (!setupMobileFlowOpen) {
          const raw =
            (place && (place.internationalPhoneNumber || place.phone || place.formattedPhoneNumber || "")) || "";
          const clean = String(raw).replace(/[\s\-()]/g, "");

          // If Google gives E.164/international (starts with +), parse it.
          const intlMatch = clean.match(/^\+(\d{1,3})(\d{6,15})$/);
          if (intlMatch) {
            const cc = intlMatch[1];
            const local = intlMatch[2];
            setSetupOtpPhoneInfo({ countryCode: cc, phone: local, full: clean });
          } else {
            // Otherwise treat as national format; use selected/default country code.
            const cc = String(setupMobileCountryCode || "").replace(/\D/g, "") || "91";
            const digits = String(clean).replace(/\D/g, "");
            const local = digits.replace(/^0+/, "");
            if (local && local.length >= 6) {
              setSetupOtpPhoneInfo({ countryCode: cc, phone: local, full: `+${cc}${local}` });
            } else {
              setSetupOtpPhoneInfo(null);
            }
          }
        }
      } catch {
        if (!setupMobileFlowOpen) {
          setSetupOtpPhoneInfo(null);
        }
      }

      try {
        if (setupOtpVerified && setupVerifiedCustomerId && !setupGeneratedDummyVendorId) {
          await persistSetupDummyVendor(place);
        }
      } catch {}
    } catch (e) {
      console.error("Setup My Business Places details error", e);
      if (e.name === 'TypeError' && e.message.includes('fetch')) {
        setSetupPlaceError("Network error. Please check your internet connection and try again.");
      } else {
        setSetupPlaceError(e.message || "Failed to fetch place details");
      }
    } finally {
      setSetupPlaceLoading(false);
    }
  };

  useEffect(() => {
    try {
      if (!showSubcategoryPopup) return;
      scheduleSaveSetupProgress({
        currentStep: "SUBCATEGORY_POPUP",
        payload: { setupSelectedSubcategories },
      });
    } catch {}
  }, [showSubcategoryPopup, setupSelectedSubcategories]);

  useEffect(() => {
    try {
      if (!showVehicleCountPopup) return;
      scheduleSaveSetupProgress({
        currentStep: "VEHICLE_COUNT_POPUP",
        payload: { setupSelectedSubcategories, setupVehicleCounts },
      });
    } catch {}
  }, [showVehicleCountPopup, setupSelectedSubcategories, setupVehicleCounts]);

  useEffect(() => {
    try {
      if (!showSetupInventoryPopup) return;
      const safeItems = (() => {
        try {
          const out = {};
          const src = setupInventoryItems && typeof setupInventoryItems === "object" ? setupInventoryItems : {};
          Object.keys(src).forEach((k) => {
            const arr = Array.isArray(src[k]) ? src[k] : [];
            out[k] = arr.map((it) => {
              const cp = { ...(it || {}) };
              try { delete cp.pendingFiles; } catch {}
              return cp;
            });
          });
          return out;
        } catch {
          return setupInventoryItems;
        }
      })();

      scheduleSaveSetupProgress({
        currentStep: "INVENTORY_POPUP",
        payload: {
          setupSelectedSubcategories,
          setupVehicleCounts,
          setupInventoryScopes,
          setupCurrentScopeIndex,
          setupInventoryDraft,
          setupInventoryItems: safeItems,
        },
      });
    } catch {}
  }, [showSetupInventoryPopup, setupSelectedSubcategories, setupVehicleCounts, setupInventoryScopes, setupCurrentScopeIndex, setupInventoryDraft, setupInventoryItems]);

  const handleSetupSendOtp = async (phoneInfoOverride) => {
    const phoneInfo = phoneInfoOverride || setupOtpPhoneInfo;
    if (!phoneInfo) {
      setSetupOtpSendError("Please enter a valid phone number");
      return;
    }
    try {
      setSetupOtpSending(true);
      setSetupOtpSendError("");
      const res = await fetch(`${API_BASE_URL}/api/customers/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: phoneInfo.countryCode,
          phone: phoneInfo.phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to send OTP");
      }
      setSetupOtpSent(true);
    } catch (e) {
      console.error("Setup My Business send OTP error", e);
      setSetupOtpSendError(e?.message || "Failed to send OTP");
    } finally {
      setSetupOtpSending(false);
    }
  };

  const handleSetupVerifyOtp = async () => {
    if (!setupOtpPhoneInfo || !setupOtpCode) {
      setSetupOtpVerifyError("Please enter the OTP");
      return;
    }
    try {
      setSetupOtpVerifying(true);
      setSetupOtpVerifyError("");
      const res = await fetch(`${API_BASE_URL}/api/customers/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: setupOtpPhoneInfo.countryCode,
          phone: setupOtpPhoneInfo.phone,
          otp: setupOtpCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "OTP verification failed");
      }

      let customerId = "";
      let token = "";
      try {
        customerId = data?.customer?._id || data?.customer?.id || "";
        token = data && data.token ? String(data.token) : "";
        setSetupVerifiedCustomerId(customerId ? String(customerId) : "");
        setSetupVerifiedToken(token);
      } catch {}

      setSetupOtpVerified(true);
      try {
        if (setupSelectedPlace && customerId && !setupGeneratedDummyVendorId) {
          await persistSetupDummyVendor(setupSelectedPlace);
        }
        if (!setupSelectedPlace) setSetupShowPlacesStep(true);
      } catch {}
    } catch (e) {
      console.error("Setup My Business verify OTP error", e);
      setSetupOtpVerifyError(e?.message || "OTP verification failed");
    } finally {
      setSetupOtpVerifying(false);
    }
  };

  const loadSetupFirstLevelServices = useCallback(async () => {
    try {
      const opts = (arguments && arguments.length > 0 ? arguments[0] : null) || {};
      const openPopup = opts && typeof opts.openPopup === "boolean" ? opts.openPopup : true;
      const preserveSelection = opts && typeof opts.preserveSelection === "boolean" ? opts.preserveSelection : false;
      const overrideDvId = opts && typeof opts.overrideDvId === "string" ? opts.overrideDvId : "";
      const overrideCatId = opts && (typeof opts.overrideCatId === "string" || typeof opts.overrideCatId === "number")
        ? String(opts.overrideCatId)
        : "";

      setSetupGeneratePreviewError("");
      const dvId = overrideDvId || setupGeneratedDummyVendorId;
      const catId = overrideCatId || setupSelectedCategory?._id || setupSelectedCategory?.id;
      if (!catId) {
        setSetupGeneratePreviewError("Preview link not ready yet");
        return false;
      }
      setSetupSubcategoriesLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/dummy-categories?parentId=${catId}`);
        if (res.ok) {
          const children = await res.json();
          const childrenArr = Array.isArray(children) ? children : [];
          // Include all subcategories - allow packages and other categories to show
          const filteredChildren = childrenArr.filter((c) => {
            const name = String(c.name || "").toLowerCase().trim();
            return true; // Show all categories including packages
          });
          setSetupSubcategories(filteredChildren);
          if (!preserveSelection) {
            const defaultSelected = {};
            filteredChildren.forEach((c) => {
              const id = c._id || c.id;
              if (id) defaultSelected[id] = true;
            });
            setSetupSelectedSubcategories(defaultSelected);
          } else {
            setSetupSelectedSubcategories((prev) => {
              try {
                const base = prev && typeof prev === "object" ? prev : {};
                const out = { ...base };
                filteredChildren.forEach((c) => {
                  const id = c._id || c.id;
                  if (!id) return;
                  if (typeof out[id] === "undefined") out[id] = true;
                });
                return out;
              } catch {
                return prev;
              }
            });
          }
        } else {
          setSetupSubcategories([]);
          setSetupSelectedSubcategories({});
        }
      } catch {
        setSetupSubcategories([]);
        setSetupSelectedSubcategories({});
      } finally {
        setSetupSubcategoriesLoading(false);
      }
      if (openPopup) {
        setShowSubcategoryPopup(true);
      }
      return true;
    } catch (e) {
      setSetupGeneratePreviewError("Failed to load services");
      return false;
    }
  }, [setupGeneratedDummyVendorId, setupSelectedCategory]);

  const handleSetupPreviewPromptYes = useCallback(async () => {
    try {
      setSetupPreviewPromptError("");
      setSetupPreviewPromptLoading(true);
      const dvId = setupGeneratedDummyVendorId;
      const catId = setupSelectedCategory?._id || setupSelectedCategory?.id;
      if (!dvId || !catId) {
        setSetupPreviewPromptError("Preview link not ready yet");
        return;
      }
      setShowSetupPreviewPrompt(false);
      await loadSetupFirstLevelServices();
    } finally {
      setSetupPreviewPromptLoading(false);
    }
  }, [setupGeneratedDummyVendorId, setupSelectedCategory, loadSetupFirstLevelServices]);

  const handleSetupPreviewPromptNo = useCallback(() => {
    try {
      setShowSetupPreviewPrompt(false);
    } catch {}
  }, []);

  const postEnquiry = useCallback(
    async ({ source, serviceName, price, terms, categoryPath, categoryIds, attributes }) => {
      try {
        if (!vendorId || !categoryId) return;

        // Hard block: do not create enquiries when preview is viewed as vendor/admin
        try {
          let effectiveRole = (navIdentity && navIdentity.role) || "guest";
          if (!effectiveRole && typeof window !== "undefined") {
            const identityKey = makePreviewIdentityKey(vendorId, categoryId);
            const raw = window.localStorage.getItem(identityKey);
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed.role === "string") {
                  effectiveRole = parsed.role;
                }
              } catch {}
            }
          }
          if (effectiveRole === "vendor") {
            return;
          }
        } catch {}

        const customerId = getStoredCustomerId();
        // Prefer customer phone over vendor phone for enquiries
        let enquiryPhone = "";
        try {
          // Try to read persisted identity (may contain customer phone)
          if (typeof window !== "undefined") {
            const identityKey = makePreviewIdentityKey(vendorId, categoryId);
            const raw = window.localStorage.getItem(identityKey);
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === "object") {
                  if (parsed.fullNumber && typeof parsed.fullNumber === "string") {
                    enquiryPhone = parsed.fullNumber;
                  } else if (parsed.phone && typeof parsed.phone === "string") {
                    enquiryPhone = parsed.phone;
                  }
                }
              } catch {}
            }
          }
        } catch {}

        // Fallback: rebuild from current OTP state if available
        if (!enquiryPhone) {
          try {
            const cleanPhone = (phone || "").replace(/\D/g, "");
            if (countryCode && cleanPhone) {
              enquiryPhone = `+${countryCode}${cleanPhone}`;
            }
          } catch {}
        }

        // Final fallback: vendor phone (old behaviour)
        if (!enquiryPhone) {
          enquiryPhone =
            (vendor && vendor.customerId && vendor.customerId.fullNumber) ||
            (vendor && vendor.phone) ||
            "";
        }

        // Default status for new enquiries: first / lowest-rank status from config (e.g., "New")
        let initialStatus = "";
        try {
          const cfgList = Array.isArray(enquiryStatusConfig)
            ? enquiryStatusConfig
            : [];
          let bestName = "";
          let bestRank = Infinity;
          cfgList.forEach((row, idx) => {
            if (!row) return;
            const nm =
              row && row.name != null ? String(row.name).trim() : "";
            if (!nm) return;
            const rawRank = row && typeof row.rank === "number" && !Number.isNaN(row.rank)
              ? row.rank
              : idx + 1;
            if (rawRank < bestRank) {
              bestRank = rawRank;
              bestName = nm;
            }
          });
          initialStatus = bestName || "";
        } catch {}

        const body = {
          vendorId: String(vendorId),
          categoryId: String(categoryId),
          customerId,
          phone: enquiryPhone,
          serviceName: serviceName || "",
          source: source || "",
          price: price == null || price === "" ? null : Number(price),
          terms: terms || "",
          categoryPath: Array.isArray(categoryPath) ? categoryPath : [],
          categoryIds: Array.isArray(categoryIds)
            ? categoryIds.map((v) => String(v))
            : [],
          attributes: attributes && typeof attributes === 'object' ? attributes : {},
          status: initialStatus || undefined,
        };

        const pathLabel = (() => {
          try {
            const arr = Array.isArray(categoryPath) ? categoryPath : [];
            const clean = arr.map((s) => String(s || "").trim()).filter(Boolean);
            return clean.join(" > ");
          } catch {
            return "";
          }
        })();
        try {
          setLastEnquiryPath(pathLabel);
        } catch {}

        await fetch(`${API_BASE_URL}/api/enquiries`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        try {
          setEnquirySubmitted(true);
        } catch {}
      } catch (err) {
        console.error("Failed to create enquiry from preview", err);
      }
    },
    [vendorId, categoryId, vendor, navIdentity, getStoredCustomerId, enquiryStatusConfig]
  );

  const makePreviewTokenKey = useCallback((venId, catId) => {
    try {
      const v = venId || "";
      const c = catId || "";
      return `previewToken:${v}:${c}`;
    } catch {
      return "previewToken:unknown:unknown";
    }
  }, []);

   const makePreviewIdentityKey = useCallback((venId, catId) => {
    try {
      const v = venId || "";
      const c = catId || "";
      return `previewIdentity:${v}:${c}`;
    } catch {
      return "previewIdentity:unknown:unknown";
    }
  }, []);

  const loginSubtitle = (() => {
    try {
      const raw = String(servicesNavLabel || "").toLowerCase();
      if (raw.includes("product") && !raw.includes("service")) {
        return "Explore our products with a quick login.";
      }
      if (raw.includes("service") && !raw.includes("product")) {
        return "Explore our services with a quick login.";
      }
      if (raw.includes("product") && raw.includes("service")) {
        return "Explore our products and services with a quick login.";
      }
    } catch {}
    return "Explore our products and services with a quick login.";
  })();

  // Fetch vendor-specific combo pricing overrides for this vendor & category
  useEffect(() => {
    try {
      if (!vendorId || !categoryId) {
        setVendorComboOverrides({});
        return;
      }
      (async () => {
        try {
          const res = await fetch(
            `${API_BASE_URL}/api/vendor-combo-pricing/${encodeURIComponent(
              String(vendorId)
            )}?categoryId=${encodeURIComponent(String(categoryId))}`
          );
          if (!res.ok) {
            setVendorComboOverrides({});
            return;
          }
          const rows = await res.json().catch(() => []);
          const map = {};
          (Array.isArray(rows) ? rows : []).forEach((r) => {
            const cid = String(r.comboId || "");
            const sk = String(r.sizeKey || "default");
            if (!cid) return;
            map[`${cid}|${sk}`] = {
              price: typeof r.price === "number" ? r.price : null,
              status: r.status || "Inactive",
            };
          });
          setVendorComboOverrides(map);
        } catch {
          setVendorComboOverrides({});
        }
      })();
    } catch {
      setVendorComboOverrides({});
    }
  }, [vendorId, categoryId]);

  const handleAdminLogin = async () => {
    const code = (adminPasscodeInput || "").trim();
    if (!/^\d{4}$/.test(code)) {
      setOtpError("Invalid admin passcode");
      return;
    }
    try {
      setOtpLoading(true);
      setOtpError("");
      const res = await fetch(`${API_BASE_URL}/api/customers/admin-impersonate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: code, vendorId, categoryId }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setOtpError(errJson?.message || "Invalid admin passcode");
        return;
      }

      const json = await res.json().catch(() => null);
      const adminExpiresAt = json && json.expiresAt ? json.expiresAt : null;

      // Treat admin impersonation as a vendor identity for this preview page
      try {
        if (typeof window !== "undefined") {
          const role = "vendor";
          const displayName = (vendor?.businessName && String(vendor.businessName).trim())
            ? `${String(vendor.businessName).trim()} (Admin)`
            : "Admin";
          const identity = { role, displayName, loggedIn: true, adminExpiresAt };
          const identityKey = makePreviewIdentityKey(vendorId, categoryId);
          try {
            window.localStorage.setItem(identityKey, JSON.stringify(identity));
          } catch {}
          try {
            if (json && json.token) {
              const tokenKey = makePreviewTokenKey(vendorId, categoryId);
              window.localStorage.setItem(tokenKey, json.token);
            }
          } catch {}
          setNavIdentity(identity);
        }
      } catch {}

      handleCloseOtpModal();
    } catch (err) {
      console.error("admin login error (preview)", err);
      if (!otpError) {
        setOtpError("Invalid admin passcode");
      }
    } finally {
      setOtpLoading(false);
    }
  };

  // Fetch country codes when OTP modal is opened the first time
  useEffect(() => {
    if (!showOtpModal) return;

    if (countries.length > 0) return;

    const fetchCountries = async () => {
      try {
        setCountriesLoading(true);
        const res = await fetch(`${API_BASE_URL}/api/countries/codes`);
        if (!res.ok) {
          console.error("Failed to load country codes, status:", res.status);
          return;
        }
        const json = await res.json().catch(() => ({}));
        const data = Array.isArray(json?.data) ? json.data : [];
        const list = data
          .map((c) => ({
            name: c.name,
            code: String(c.dial_code || "").replace("+", ""),
          }))
          .filter((c) => c.name && c.code)
          .sort((a, b) => a.name.localeCompare(b.name));
        setCountries(list);
        // Prefer India (+91) if available, otherwise first in list
        try {
          const preferred = list.find((c) => String(c.code) === "91");
          if (preferred) setCountryCode(preferred.code);
          else if (list.length > 0) setCountryCode(list[0].code);
        } catch {
          if (list.length > 0) setCountryCode(list[0].code);
        }
      } catch (err) {
        console.error("Failed to fetch countries for OTP modal", err);
      } finally {
        setCountriesLoading(false);
      }
    };

    fetchCountries();
  }, [showOtpModal, countries.length]);

  // Load any stored identity for this vendor/category into navIdentity
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (!vendorId || !categoryId) return;
      const key = makePreviewIdentityKey(vendorId, categoryId);
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const role = parsed.role === "vendor" ? "vendor" : "guest";
        const displayName = typeof parsed.displayName === "string" && parsed.displayName.trim()
          ? parsed.displayName.trim()
          : role === "vendor" ? "Vendor" : "Guest";
        const loggedIn = !!parsed.loggedIn;
        setNavIdentity({ role, displayName, loggedIn });
      }
    } catch {}
  }, [vendorId, categoryId, makePreviewIdentityKey]);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (!vendorId || !categoryId) return;
      const url = new URL(window.location.href);
      const gNameParam = url.searchParams.get("googleName");
      const gEmailParam = url.searchParams.get("googleEmail");
      const gAuthTokenParam = url.searchParams.get("googleAuthToken");
      if (!gNameParam && !gEmailParam && !gAuthTokenParam) return;

      // During Setup My Business, Google login is used only for verification.
      // Do not log the user into preview navbar as a guest.
      try {
        const key = makePreviewIdentityKey(vendorId, categoryId);
        window.localStorage.removeItem(key);
      } catch {}
      setNavIdentity({ role: "guest", displayName: "Guest", loggedIn: false });

      url.searchParams.delete("googleName");
      url.searchParams.delete("googleEmail");
      url.searchParams.delete("googleAuthToken");
      window.history.replaceState(null, "", url.toString());

      try {
        if (gAuthTokenParam) {
          const token = decodeURIComponent(String(gAuthTokenParam));
          setSetupGoogleAuthToken(token);
          saveStoredSetupGoogleAuthToken(token);
        }
      } catch {}

      // After Google OAuth, resume the setup flow with category pre-selected
      try {
        setupResumeTriggeredRef.current = true;
        const resumeKey = makeSetupResumeKey(vendorId, categoryId);
        const raw = window.localStorage.getItem(resumeKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          const catId = parsed && (parsed.selectedCategoryId || parsed.categoryId)
            ? String(parsed.selectedCategoryId || parsed.categoryId)
            : "";
          if (catId) {
            setSetupResumeCategoryId(catId);
          }
        }
        handleOpenSetupBusiness({ resume: true });
      } catch {}
    } catch {}
  }, [vendorId, categoryId, makePreviewIdentityKey, saveStoredSetupGoogleAuthToken, makeSetupResumeKey, handleOpenSetupBusiness]);

  useEffect(() => {
    try {
      if (setupGoogleAuthToken) return;
      const token = getStoredSetupGoogleAuthToken();
      if (token) setSetupGoogleAuthToken(token);
    } catch {}
  }, [setupGoogleAuthToken, getStoredSetupGoogleAuthToken]);

  const fetchSetupProgress = useCallback(async (catId, placeId) => {
    try {
      const token = setupGoogleAuthToken || getStoredSetupGoogleAuthToken();
      if (!token) return null;
      const c = catId ? String(catId) : "";
      const p = placeId ? String(placeId) : "";
      if (!c || !p) return null;

      const res = await fetch(
        `${API_BASE_URL}/api/setup-progress?categoryId=${encodeURIComponent(c)}&placeId=${encodeURIComponent(p)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return null;
      if (!json || !json.exists) return null;
      return json.progress || null;
    } catch {
      return null;
    }
  }, [setupGoogleAuthToken, getStoredSetupGoogleAuthToken]);

  const saveSetupProgress = useCallback(async ({ catId, placeId, currentStep, generatedDummyVendorId, payload }) => {
    try {
      const token = setupGoogleAuthToken || getStoredSetupGoogleAuthToken();
      if (!token) return false;
      const c = catId ? String(catId) : "";
      const p = placeId ? String(placeId) : "";
      if (!c || !p) return false;

      const res = await fetch(`${API_BASE_URL}/api/setup-progress`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          categoryId: c,
          placeId: p,
          currentStep: typeof currentStep === "string" ? currentStep : "",
          generatedDummyVendorId: typeof generatedDummyVendorId === "string" ? generatedDummyVendorId : "",
          payload: payload && typeof payload === "object" ? payload : {},
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [setupGoogleAuthToken, getStoredSetupGoogleAuthToken]);

  const scheduleSaveSetupProgress = useCallback((next) => {
    try {
      if (!next || typeof next !== "object") return;
      const catId = setupSelectedCategory?._id || setupSelectedCategory?.id || "";
      const placeId = setupSelectedPlace?.placeId || setupSelectedPlace?.place_id || "";
      if (!catId || !placeId) return;
      const base = setupProgressSaveRef.current?.pending || {};
      const mergedPayload = { ...(base.payload || {}), ...(next.payload || {}) };

      const effectiveDvId = (() => {
        try {
          if (typeof next.generatedDummyVendorId === "string" && next.generatedDummyVendorId.trim()) return next.generatedDummyVendorId.trim();
          if (typeof base.generatedDummyVendorId === "string" && base.generatedDummyVendorId.trim()) return base.generatedDummyVendorId.trim();
          if (typeof setupGeneratedDummyVendorId === "string" && setupGeneratedDummyVendorId.trim()) return setupGeneratedDummyVendorId.trim();
          return "";
        } catch {
          return "";
        }
      })();

      const pending = {
        ...base,
        ...next,
        catId: String(catId),
        placeId: String(placeId),
        generatedDummyVendorId: effectiveDvId,
        payload: mergedPayload,
      };
      setupProgressSaveRef.current.pending = pending;
      if (setupProgressSaveRef.current.t) {
        clearTimeout(setupProgressSaveRef.current.t);
      }
      setupProgressSaveRef.current.t = setTimeout(() => {
        try {
          const toSend = setupProgressSaveRef.current.pending;
          setupProgressSaveRef.current.pending = null;
          setupProgressSaveRef.current.t = null;
          if (!toSend) return;
          saveSetupProgress(toSend);
        } catch {}
      }, 150);
    } catch {}
  }, [saveSetupProgress, setupSelectedCategory, setupSelectedPlace, setupGeneratedDummyVendorId]);

  const applySetupProgressRestore = useCallback(async (progress) => {
    try {
      if (!progress || typeof progress !== "object") return false;
      const step = String(progress.currentStep || "").trim();
      const dvId = progress.generatedDummyVendorId ? String(progress.generatedDummyVendorId) : "";
      if (dvId) setSetupGeneratedDummyVendorId(dvId);

      const payload = progress.payload && typeof progress.payload === "object" ? progress.payload : {};
      const savedSubcats = payload.setupSelectedSubcategories && typeof payload.setupSelectedSubcategories === "object"
        ? payload.setupSelectedSubcategories
        : null;
      const savedCounts = payload.setupVehicleCounts && typeof payload.setupVehicleCounts === "object"
        ? payload.setupVehicleCounts
        : null;
      const savedScopes = Array.isArray(payload.setupInventoryScopes) ? payload.setupInventoryScopes : null;
      const savedIdx = Number.isFinite(payload.setupCurrentScopeIndex) ? payload.setupCurrentScopeIndex : null;
      const savedDraft = payload.setupInventoryDraft && typeof payload.setupInventoryDraft === "object" ? payload.setupInventoryDraft : null;
      const savedItems = payload.setupInventoryItems && typeof payload.setupInventoryItems === "object" ? payload.setupInventoryItems : null;

      setShowSetupPreviewPrompt(false);
      if (step === "SUBCATEGORY_POPUP") {
        if (savedSubcats) setSetupSelectedSubcategories(savedSubcats);
        setShowVehicleCountPopup(false);
        setShowSetupInventoryPopup(false);
        setShowSubcategoryPopup(true);
        // Load services in background (non-blocking)
        loadSetupFirstLevelServices({ openPopup: false, preserveSelection: true, overrideDvId: dvId }).catch(() => {});
        return true;
      }

      if (step === "VEHICLE_COUNT_POPUP") {
        if (savedSubcats) setSetupSelectedSubcategories(savedSubcats);
        if (savedCounts) setSetupVehicleCounts(savedCounts);
        setShowSubcategoryPopup(false);
        setShowSetupInventoryPopup(false);
        setShowVehicleCountPopup(true);
        // Load services in background (non-blocking)
        loadSetupFirstLevelServices({ openPopup: false, preserveSelection: true, overrideDvId: dvId }).catch(() => {});
        return true;
      }

      if (step === "INVENTORY_POPUP") {
        if (savedSubcats) setSetupSelectedSubcategories(savedSubcats);
        if (savedCounts) setSetupVehicleCounts(savedCounts);
        if (savedScopes) setSetupInventoryScopes(savedScopes);
        if (savedDraft) setSetupInventoryDraft(savedDraft);
        if (savedItems) setSetupInventoryItems(savedItems);
        if (savedIdx != null) setSetupCurrentScopeIndex(Math.max(0, savedIdx));
        setShowSubcategoryPopup(false);
        setShowVehicleCountPopup(false);
        setShowSetupInventoryPopup(true);
        // Load services and models in background (non-blocking)
        loadSetupFirstLevelServices({ openPopup: false, preserveSelection: true, overrideDvId: dvId }).catch(() => {});
        try {
          const scopes = savedScopes || [];
          const idx = savedIdx != null ? savedIdx : 0;
          const scope = scopes[idx];
          if (scope && scope.family) {
            fetchSetupModelsForFamily(scope.family).catch(() => {});
          }
        } catch {}
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }, [loadSetupFirstLevelServices]);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (!vendorId || !categoryId) return;
      if (setupResumeTriggeredRef.current) return;

      // Skip auto-resume if returning from Google OAuth (has googleAuthToken in URL)
      const url = new URL(window.location.href);
      if (url.searchParams.get("googleAuthToken")) return;

      // Only auto-resume on dummy/setup vendor pages, not on existing vendor pages
      const vId = String(vendorId || "").toLowerCase();
      const isDummyVendor = vId.startsWith("dummyvendor-") || vId === "dummyvendor";
      if (!isDummyVendor) return;

      const resumeKey = makeSetupResumeKey(vendorId, categoryId);
      const raw = window.localStorage.getItem(resumeKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const catId = parsed && (parsed.selectedCategoryId || parsed.categoryId) ? String(parsed.selectedCategoryId || parsed.categoryId) : "";
      if (!catId) return;

      setupResumeTriggeredRef.current = true;
      setSetupResumeCategoryId(catId);
      handleOpenSetupBusiness({ resume: true });
    } catch {}
  }, [vendorId, categoryId, makeSetupResumeKey, handleOpenSetupBusiness]);

  useEffect(() => {
    try {
      if (!showSetupCategoryModal) return;
      if (!setupResumeCategoryId) return;
      if (!Array.isArray(setupCategories) || setupCategories.length === 0) return;

      const cat = setupCategories.find((c) => String(c?._id || c?.id || "") === String(setupResumeCategoryId));
      if (!cat) return;

      setSetupSelectedCategory(cat);
      setSetupShowPlacesStep(true);

      setSetupResumeCategoryId("");
    } catch {}
  }, [showSetupCategoryModal, setupResumeCategoryId, setupCategories, vendorId, categoryId, makeSetupResumeKey]);

  const handleLogout = useCallback(() => {
    try {
      if (typeof window === "undefined") return;
      const identityKey = makePreviewIdentityKey(vendorId, categoryId);
      const tokenKey = makePreviewTokenKey(vendorId, categoryId);
      const sessionKey = makePreviewSessionKey(vendorId, categoryId);

      const extraKeysToClear = (() => {
        try {
          const out = [];
          const path = String(window.location?.pathname || "");
          const parts = path.split("/").filter(Boolean);
          const idx = parts.indexOf("preview");
          const vFromPath = idx >= 0 && parts.length > idx + 1 ? parts[idx + 1] : "";
          const cFromPath = idx >= 0 && parts.length > idx + 2 ? parts[idx + 2] : "";
          const pairs = [
            { v: String(vendorId || ""), c: String(categoryId || "") },
            { v: String(vFromPath || ""), c: String(cFromPath || "") },
          ];
          const seen = new Set();
          pairs.forEach(({ v, c }) => {
            if (!v || !c) return;
            const k = `${v}::${c}`;
            if (seen.has(k)) return;
            seen.add(k);
            out.push(`previewIdentity:${v}:${c}`);
            out.push(`previewToken:${v}:${c}`);
            out.push(`previewSession:${v}:${c}`);
          });
          return out;
        } catch {
          return [];
        }
      })();

      try {
        const token = window.localStorage.getItem(tokenKey);
        if (token) {
          fetch(`${API_BASE_URL}/api/customers/logout`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          }).catch(() => {});
        }
      } catch {}
      try {
        window.localStorage.removeItem(identityKey);
      } catch {}
      try {
        window.localStorage.removeItem(tokenKey);
      } catch {}
      try {
        window.localStorage.removeItem(sessionKey);
      } catch {}
      try {
        extraKeysToClear.forEach((k) => {
          try {
            window.localStorage.removeItem(k);
          } catch {}
        });
      } catch {}
      setNavIdentity({ role: "guest", displayName: "Guest", loggedIn: false });
    } catch {}
  }, [vendorId, categoryId, makePreviewIdentityKey, makePreviewTokenKey, makePreviewSessionKey]);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return undefined;
      if (!navIdentity || !navIdentity.loggedIn) return undefined;

      const identityKey = makePreviewIdentityKey(vendorId, categoryId);
      let expiresAt = null;
      try {
        const raw = window.localStorage.getItem(identityKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            expiresAt = parsed.adminExpiresAt || parsed.expiresAt || null;
          }
        }
      } catch {}

      if (!expiresAt) return undefined;
      const ms = new Date(expiresAt).getTime();
      if (!Number.isFinite(ms)) return undefined;

      const check = () => {
        if (Date.now() >= ms) {
          setSessionExpired(true);
          handleLogout();
        }
      };

      check();
      const id = setInterval(check, 60000);
      return () => clearInterval(id);
    } catch {
      return undefined;
    }
  }, [navIdentity, vendorId, categoryId, makePreviewIdentityKey, handleLogout]);

  // Background token validity check: ensures that if the same user logs in elsewhere,
  // this tab will pick up the change and log out shortly after.
  useEffect(() => {
    try {
      if (typeof window === "undefined") return undefined;

      const tokenKey = makePreviewTokenKey(vendorId, categoryId);

      const checkToken = async () => {
        try {
          const token = window.localStorage.getItem(tokenKey);
          if (!token) return;

          const res = await fetch(`${API_BASE_URL}/api/customers/session-status-token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });

          if (!res.ok) {
            // If the status endpoint itself fails, be conservative and log out.
            setSessionExpired(true);
            handleLogout();
            return;
          }

          const data = await res.json().catch(() => null);
          const status = data && data.status;
          // Any non-active status (no_session, expired, invalid_token, etc.)
          // should force this tab to log out.
          if (!status || status !== "active") {
            setSessionExpired(true);
            handleLogout();
          }
        } catch {
          // On unexpected errors, do nothing; next interval will retry.
        }
      };

      // Run once immediately and then on a short interval
      checkToken();
      const id = setInterval(checkToken, 5000);
      return () => clearInterval(id);
    } catch {
      return undefined;
    }
  }, [vendorId, categoryId, makePreviewTokenKey, handleLogout]);

  // Listen for token changes across tabs/windows. If the preview token for this
  // vendor/category is changed (e.g., a new login happens elsewhere), this tab
  // will immediately log out without requiring a manual refresh.
  useEffect(() => {
    try {
      if (typeof window === "undefined") return undefined;

      const tokenKey = makePreviewTokenKey(vendorId, categoryId);

      const onStorage = (event) => {
        try {
          if (!event || event.key !== tokenKey) return;

          const newVal = event.newValue;

          // If token for this vendor/category is removed or changed, force logout
          if (!newVal) {
            setSessionExpired(true);
            handleLogout();
            return;
          }

          // If there was a token in this tab and it has been replaced elsewhere,
          // also force logout so that only the latest login remains active.
          const current = window.localStorage.getItem(tokenKey);
          if (current && current !== newVal) {
            setSessionExpired(true);
            handleLogout();
          }
        } catch {
          // ignore storage event errors
        }
      };

      window.addEventListener("storage", onStorage);
      return () => {
        try {
          window.removeEventListener("storage", onStorage);
        } catch {}
      };
    } catch {
      return undefined;
    }
  }, [vendorId, categoryId, makePreviewTokenKey, handleLogout]);

  const handleOpenOtpModal = async () => {
    try {
      // Always prepare and show the OTP modal. Any existing session checks
      // are handled elsewhere; this function just opens the login flow.
      setOtpError("");
      setOtpStep(1);
      setPhone("");
      setOtp("");
      setLoginAsAdmin(false);
      setAdminPasscodeInput("");
      setShowOtpModal(true);
    } catch (e) {
      console.error("Failed to open OTP modal", e);
    }
  };

  const handleCloseOtpModal = () => {
    setShowOtpModal(false);
    setOtpError("");
    setOtpStep(1);
    setPhone("");
    setOtp("");
    setLoginAsAdmin(false);
    setAdminPasscodeInput("");
  };

  const guardEnrollClick = async () => {
    try {
      const role = (navIdentity && navIdentity.role) || "guest";
      const loggedIn = !!(navIdentity && navIdentity.loggedIn);

      // Vendor/admin preview: ignore Enroll clicks
      if (role === "vendor") {
        return false;
      }

      // Not logged in: open login popup
      if (!loggedIn) {
        await handleOpenOtpModal();
        return false;
    }

    // Logged-in non-vendor (customer): allow enquiry
    return true;
  } catch {
      return false;
  }
  };

  const requestOtp = async () => {
    if (loginAsAdmin) {
      return;
    }
    const cleanPhone = phone.replace(/\D/g, "");
    if (!countryCode || !cleanPhone || cleanPhone.length < 6) {
      setOtpError("Enter a valid mobile number");
      return;
    }
    try {
      setOtpLoading(true);
      setOtpError("");
      const res = await fetch(`${API_BASE_URL}/api/customers/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCode, phone: cleanPhone }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.message || "Failed to request OTP");
      }
      setOtpStep(2);
    } catch (err) {
      console.error("requestOtp error (preview)", err);
      setOtpError(err.message || "Failed to request OTP");
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOtp = async () => {
    const cleanPhone = phone.replace(/\D/g, "");
    if (!otp) {
      setOtpError("Enter OTP");
      return;
    }
    try {
      setOtpLoading(true);
      setOtpError("");
      const res = await fetch(`${API_BASE_URL}/api/customers/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCode, phone: cleanPhone, otp, vendorId, categoryId }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.message || "OTP verify failed");
      }
      const json = await res.json().catch(() => null);
      console.log("OTP verified (preview)", json);
      try {
        if (typeof window !== "undefined") {
          if (json && json.customer && json.customer._id) {
            const key = makePreviewSessionKey(vendorId, categoryId);
            window.localStorage.setItem(key, json.customer._id);
          }
          if (json && json.token) {
            const tokenKey = makePreviewTokenKey(vendorId, categoryId);
            window.localStorage.setItem(tokenKey, json.token);
          }
          if (json) {
            // Decide role strictly for this preview page based on phone number.
            // Only when the verified customer's phone matches THIS vendor's
            // configured number do we treat them as vendor.
            let role = "guest";
            try {
              if (vendor) {
                const vendorRaw =
                  (vendor.customerId && vendor.customerId.fullNumber) ||
                  vendor.phone ||
                  "";
                const vendorDigits = String(vendorRaw).replace(/\D/g, "");

                const customerRaw =
                  (json.customer && (json.customer.fullNumber || json.customer.phone)) ||
                  "";
                const customerDigits = String(customerRaw).replace(/\D/g, "");

                console.log("VENDOR PHONE CHECK:", {
                  vendorRaw,
                  vendorDigits,
                  customerRaw,
                  customerDigits,
                  match: vendorDigits === customerDigits || customerDigits.endsWith(vendorDigits) || vendorDigits.endsWith(customerDigits)
                });

                if (vendorDigits && customerDigits && 
                    (vendorDigits === customerDigits || 
                     customerDigits.endsWith(vendorDigits) || 
                     vendorDigits.endsWith(customerDigits))) {
                  role = "vendor";
                }
              }
            } catch {}

            const displayName =
              typeof json.displayName === "string" && json.displayName.trim()
                ? json.displayName.trim()
                : role === "vendor"
                ? (vendor?.businessName || "Vendor")
                : "Guest";
            const customerRaw =
              (json.customer && (json.customer.fullNumber || json.customer.phone)) ||
              `+${countryCode}${cleanPhone}`;
            const customerDigits = String(customerRaw).replace(/\D/g, "");
            const identity = {
              role,
              displayName,
              loggedIn: true,
              fullNumber: customerRaw,
              phone: customerDigits,
            };
            const identityKey = makePreviewIdentityKey(vendorId, categoryId);
            try {
              window.localStorage.setItem(identityKey, JSON.stringify(identity));
            } catch {}
            setNavIdentity(identity);
          }
        }
      } catch {}
      handleCloseOtpModal();
      // TODO: proceed to booking flow using json.customer if needed
    } catch (err) {
      console.error("verifyOtp error (preview)", err);
      setOtpError(err.message || "Failed to verify OTP");
    } finally {
      setOtpLoading(false);
    }
  };

  // Whenever the category tree changes, collect all image URLs from
  // the tree (root + all descendants) so HomeSection can show a
  // gallery of category/subcategory images when the vendor has
  // no explicit profilePictures.
  useEffect(() => {
    try {
      const out = [];
      const norm = (v) => {
        const s = (v == null) ? '' : String(v);
        const t = s.trim();
        if (!t) return null;
        return t;
      };
      const visit = (node) => {
        if (!node) return;
        const img = norm(node.imageUrl || node.iconUrl || node.image);
        if (img) out.push(img);
        const kids = Array.isArray(node.children) ? node.children : [];
        kids.forEach(visit);
      };
      if (categoryTree) visit(categoryTree);
      setCategoryProfilePictures(out);
    } catch {
      setCategoryProfilePictures([]);
    }
  }, [categoryTree]);

  // SIMPLIFIED: Always return true - show all nodes
  const hasActiveLeaf = useCallback((node) => {
    return true;
  }, []);

  // SIMPLIFIED: Always return true - show all nodes
  // Dummy mode: consider inventory row-level pricing status for the node
  const hasActivePricingForNode = useCallback((node) => {
    try {
      if (!isDummyMode) return true;
      if (!node) return false;

      const normalizeId = (val) => {
        if (val == null) return '';
        if (typeof val === 'string' || typeof val === 'number') return String(val);
        if (typeof val === 'object') {
          if (val.$oid) return String(val.$oid);
          if (val.oid) return String(val.oid);
          if (val._id) return normalizeId(val._id);
          if (val.id) return normalizeId(val.id);
        }
        return String(val);
      };

      const collectIds = (root) => {
        const out = new Set();
        const stack = [root];
        while (stack.length) {
          const cur = stack.pop();
          const id = normalizeId(cur?.id ?? cur?._id);
          if (id) out.add(String(id));
          const kids = Array.isArray(cur?.children) ? cur.children : [];
          for (const ch of kids) stack.push(ch);
        }
        return Array.from(out);
      };

      const targetIds = collectIds(node);
      if (targetIds.length === 0) return false;

      const catKey = String(categoryId || '');
      const invRaw = Array.isArray(vendor?.inventorySelections?.[catKey]) ? vendor.inventorySelections[catKey] : [];

      const rowKeyIsActive = (entry, rk) => {
        try {
          const map = entry?.pricingStatusByRow && typeof entry.pricingStatusByRow === 'object' ? entry.pricingStatusByRow : {};
          if (!Object.prototype.hasOwnProperty.call(map, rk)) return false;
          return String(map[rk] || '').trim().toLowerCase() === 'active';
        } catch {
          return false;
        }
      };

      for (const entry of invRaw) {
        const pbr = entry?.pricesByRow;
        const statusMap =
          entry?.pricingStatusByRow && typeof entry.pricingStatusByRow === 'object'
            ? entry.pricingStatusByRow
            : {};
        const keys = new Set([
          ...((pbr && typeof pbr === 'object') ? Object.keys(pbr) : []),
          ...Object.keys(statusMap),
        ]);
        for (const rk of keys) {
          const ids = String(rk).split('|');
          if (!ids.some((id) => targetIds.includes(String(id)))) continue;
          if (rowKeyIsActive(entry, rk)) return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }, [isDummyMode, vendor, categoryId]);

  // ----------------- Inventory helpers (dummy vendors) -----------------

  const loadDummyInventorySelections = useCallback(async (vid, cid) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/dummy-vendors/${vid}`, { cache: "no-store" });
      if (!res.ok) return [];
      const json = await res.json().catch(() => ({}));
      const map = json && typeof json.inventorySelections === "object" ? json.inventorySelections : {};
      const list = Array.isArray(map?.[cid]) ? map[cid] : [];
      return list;
    } catch {
      return [];
    }
  }, []);

  const saveDummyInventorySelections = useCallback(async (vid, cid, items) => {
    const payload = { inventorySelections: { [cid]: items } };
    await fetch(`${API_BASE_URL}/api/dummy-vendors/${vid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return true;
  }, []);

  const ensureLinkedSubcategoryForScope = useCallback(
    async (cid, fam, label) => {
      try {
        const keySpecific = `${fam}:${label}:linkedSubcategory`;
        const keyGeneric = `${fam}:inventoryLabels:linkedSubcategory`;
        const la = linkedAttributes || {};
        const hasSpecific = Array.isArray(la[keySpecific]) && la[keySpecific].length > 0;
        const hasGeneric = Array.isArray(la[keyGeneric]) && la[keyGeneric].length > 0;
        if (hasSpecific || hasGeneric) return;
        const next = { ...la, [keySpecific]: ["ALL"] };
        await fetch(`${API_BASE_URL}/api/dummy-categories/${cid}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkedAttributes: next }),
        });
        setLinkedAttributes(next);
      } catch {}
    },
    [linkedAttributes]
  );

  const fetchModelsForFamily = useCallback(
    async (familyKey) => {
      try {
        const orig = String(familyKey || "").trim();
        if (!orig) return [];
        const cached = modelsByFamily[orig];
        if (Array.isArray(cached) && cached.length > 0) return cached;
        const lower = orig.toLowerCase();
        const singular = lower.endsWith("s") ? lower.slice(0, -1) : lower;
        const noSpaces = lower.replace(/\s+/g, "");
        const extras = [];
        if (
          noSpaces === "tempobus" ||
          lower === "tempo bus" ||
          lower.includes("tempo mini") ||
          noSpaces.includes("tempomini") ||
          lower.includes("minibus") ||
          lower.includes("minibuses")
        ) {
          extras.push("tempoBus");
        }
        const candidates = Array.from(new Set([orig, lower, singular, noSpaces, ...extras]));
        let models = [];
        // try sequential candidates until one returns data
        // eslint-disable-next-line no-restricted-syntax
        for (const c of candidates) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const res = await fetch(`${API_BASE_URL}/api/models?category=${encodeURIComponent(c)}`, {
              cache: "no-store",
            });
            if (!res.ok) continue;
            // eslint-disable-next-line no-await-in-loop
            const data = await res.json().catch(() => []);
            const arr = Array.isArray(data) ? data : [];
            if (arr.length) {
              models = arr.map((d) => ({ _id: d._id || d.id, name: d.name || d.model || "", raw: d }));
              break;
            }
          } catch {}
        }
        setModelsByFamily((prev) => ({ ...prev, [orig]: models }));
        return models;
      } catch {
        return [];
      }
    },
    [modelsByFamily]
  );

  // Fetch models for setup inventory flow (uses separate cache)
  const fetchSetupModelsForFamily = useCallback(
    async (familyKey) => {
      try {
        const orig = String(familyKey || "").trim();
        if (!orig) return [];
        const cached = setupModelsByFamily[orig];
        if (Array.isArray(cached) && cached.length > 0) return cached;
        const lower = orig.toLowerCase();
        const singular = lower.endsWith("s") ? lower.slice(0, -1) : lower;
        const noSpaces = lower.replace(/\s+/g, "");
        const candidates = Array.from(new Set([orig, lower, singular, noSpaces]));
        let models = [];
        for (const c of candidates) {
          try {
            const res = await fetch(`${API_BASE_URL}/api/models?category=${encodeURIComponent(c)}`, {
              cache: "no-store",
            });
            if (!res.ok) continue;
            const data = await res.json().catch(() => []);
            const arr = Array.isArray(data) ? data : [];
            if (arr.length) {
              models = arr.map((d) => ({ _id: d._id || d.id, name: d.name || d.model || "", raw: d }));
              break;
            }
          } catch {}
        }
        setSetupModelsByFamily((prev) => ({ ...prev, [orig]: models }));
        return models;
      } catch {
        return [];
      }
    },
    [setupModelsByFamily]
  );

  // Get cascade lists for setup inventory flow
  const getSetupCascadeLists = useCallback(
    (familyKey, parentLinkedAttr) => {
      const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      let models = setupModelsByFamily[familyKey] || [];
      if (!models.length) {
        const orig = String(familyKey || "");
        const lower = orig.toLowerCase();
        const singular = lower.endsWith("s") ? lower.slice(0, -1) : lower;
        const noSpaces = lower.replace(/\s+/g, "");
        const keys = [orig, lower, singular, noSpaces];
        for (let i = 0; i < keys.length; i += 1) {
          const k = keys[i];
          const m = setupModelsByFamily[k];
          if (Array.isArray(m) && m.length) {
            models = m;
            break;
          }
        }
      }

      const la = parentLinkedAttr || {};
      let selectedFields = Array.isArray(la[familyKey]) ? la[familyKey] : [];
      const famLower = String(familyKey || "").toLowerCase();
      const brandFieldForFamily = famLower === "bikes" ? "bikeBrand" : "brand";
      const modelFieldsKey = `${familyKey}:modelFields`;
      const modelFields = Array.isArray(la[modelFieldsKey]) ? la[modelFieldsKey] : [];
      if (modelFields.length) {
        const canon = (s) => String(s).trim();
        const set = new Set((selectedFields || []).map((f) => canon(f)));
        modelFields.forEach((mf) => {
          const c = canon(mf);
          if (c && !set.has(c)) {
            set.add(c);
            selectedFields.push(c);
          }
        });
      }

      const keysInFirst = models.length ? Object.keys(models[0].raw || models[0]) : [];
      if (!selectedFields || selectedFields.length === 0) {
        const candidates = ["brand", "model", "variant", "transmission", "fuelType", "bodyType", "seats"];
        selectedFields = candidates.filter((k) => keysInFirst.includes(k));
        if (!selectedFields.includes(brandFieldForFamily) && (keysInFirst.includes("brand") || keysInFirst.includes("bikeBrand")))
          selectedFields.unshift(brandFieldForFamily);
        if (!selectedFields.includes("model") && (keysInFirst.includes("model") || keysInFirst.includes("modelName")))
          selectedFields.splice(1, 0, "model");
      } else {
        const low = selectedFields.map((s) => String(s).toLowerCase());
        if (!low.includes(String(brandFieldForFamily).toLowerCase())) selectedFields.unshift(brandFieldForFamily);
        if (!low.includes("model")) selectedFields.splice(1, 0, "model");
      }

      const curr = setupInventoryDraft[familyKey] || {};
      const pickFirst = (obj, arr) => {
        for (let i = 0; i < arr.length; i += 1) {
          const k = arr[i];
          if (obj && obj[k] != null && String(obj[k]).trim() !== "") return String(obj[k]);
        }
        return "";
      };
      const selectedBrand = pickFirst(
        curr,
        famLower === "bikes" ? ["bikeBrand", "brand", "Brand", "make", "Make"] : ["brand", "Brand", "make", "Make"]
      );
      const selectedModel = pickFirst(curr, ["model", "Model", "modelName", "model_name", "name"]);

      const listsByField = {};
      if (famLower === "bikes") {
        const lowSet = new Set((selectedFields || []).map((s) => String(s).toLowerCase()));
        if (lowSet.has("bikebrand") && lowSet.has("brand")) {
          selectedFields = selectedFields.filter((s) => String(s).toLowerCase() !== "brand");
        }
      }
      const fields = selectedFields
        .map((f) => String(f).trim())
        .filter((f) => f && norm(f) !== "modelfields");

      // Helper to get key candidates for a field (same logic as getCascadeLists)
      const getKeyCandidates = (field) => {
        const fieldNorm = norm(field);
        const canonicalJsKey =
          fieldNorm.endsWith("bodytype") ? "bodyType" :
          fieldNorm.endsWith("fueltype") ? "fuelType" :
          fieldNorm.endsWith("seats") ? "seats" :
          fieldNorm.endsWith("transmission") ? "transmission" :
          fieldNorm;
        if (canonicalJsKey === "brand" || (famLower === "bikes" && fieldNorm === "bikebrand"))
          return ["brand", "bikeBrand", "make", "Brand", "Make"];
        if (canonicalJsKey === "model" || fieldNorm === "model")
          return ["model", "modelName", "Model", "model_name", "name"];
        if (canonicalJsKey === "variant") return ["variant", "Variant", "trim", "Trim"];
        if (canonicalJsKey === "transmission" || fieldNorm.includes("transmission"))
          return ["transmission", "Transmission", "gearbox", "gear_type", "gearType", "bikeTransmission"];
        if (canonicalJsKey === "bodyType")
          return ["bodyType", "BodyType", "body_type", "type"];
        if (canonicalJsKey === "fuelType")
          return ["fuelType", "FuelType", "fueltype", "Fuel", "fuel_type"];
        if (canonicalJsKey === "seats")
          return ["seats", "Seats", "seatCapacity", "SeatCapacity", "seatingCapacity", "SeatingCapacity"];
        return [field];
      };

      fields.forEach((heading) => {
        const hLower = norm(heading);
        const isBrand = hLower.endsWith("brand");
        const isModel = hLower.endsWith("model") || hLower === "model";
        const keyCandidates = getKeyCandidates(heading);
        let vals = [];
        if (isBrand) {
          const set = new Set();
          models.forEach((m) => {
            const raw = m.raw || m;
            const v = raw.bikeBrand || raw.brand || raw.Brand || raw.make || raw.Make || "";
            if (v) set.add(String(v));
          });
          vals = Array.from(set).sort();
        } else if (isModel) {
          if (selectedBrand) {
            const set = new Set();
            models.forEach((m) => {
              const raw = m.raw || m;
              const b = raw.bikeBrand || raw.brand || raw.Brand || raw.make || raw.Make || "";
              if (String(b).toLowerCase() === String(selectedBrand).toLowerCase()) {
                const v = raw.model || raw.Model || raw.modelName || raw.name || "";
                if (v) set.add(String(v));
              }
            });
            vals = Array.from(set).sort();
          }
        } else {
          const set = new Set();
          models.forEach((m) => {
            const raw = m.raw || m;
            const b = raw.bikeBrand || raw.brand || raw.Brand || raw.make || raw.Make || "";
            const md = raw.model || raw.Model || raw.modelName || raw.name || "";
            const brandMatch = !selectedBrand || String(b).toLowerCase() === String(selectedBrand).toLowerCase();
            const modelMatch = !selectedModel || String(md).toLowerCase() === String(selectedModel).toLowerCase();
            if (brandMatch && modelMatch) {
              // Try all key candidates to find the value
              let v = null;
              for (const k of keyCandidates) {
                if (raw[k] != null && String(raw[k]).trim() !== "") {
                  v = raw[k];
                  break;
                }
              }
              if (v != null && String(v).trim() !== "") set.add(String(v));
            }
          });
          vals = Array.from(set).sort();
        }
        listsByField[heading] = vals;
      });

      return { fields, listsByField };
    },
    [setupModelsByFamily, setupInventoryDraft]
  );

  const getCascadeLists = useCallback(
    (familyKey) => {
      const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      let models = modelsByFamily[familyKey] || [];
      if (!models.length) {
        const orig = String(familyKey || "");
        const lower = orig.toLowerCase();
        const singular = lower.endsWith("s") ? lower.slice(0, -1) : lower;
        const noSpaces = lower.replace(/\s+/g, "");
        const keys = [orig, lower, singular, noSpaces];
        for (let i = 0; i < keys.length; i += 1) {
          const k = keys[i];
          const m = modelsByFamily[k];
          if (Array.isArray(m) && m.length) {
            models = m;
            break;
          }
        }
      }

      let selectedFields = Array.isArray(linkedAttributes[familyKey])
        ? linkedAttributes[familyKey]
        : [];
      const famLower = String(familyKey || "").toLowerCase();
      const brandFieldForFamily = famLower === "bikes" ? "bikeBrand" : "brand";
      const modelFieldsKey = `${familyKey}:modelFields`;
      const modelFields = Array.isArray(linkedAttributes[modelFieldsKey])
        ? linkedAttributes[modelFieldsKey]
        : [];
      if (modelFields.length) {
        const canon = (s) => String(s).trim();
        const set = new Set((selectedFields || []).map((f) => canon(f)));
        modelFields.forEach((mf) => {
          const c = canon(mf);
          if (c && !set.has(c)) {
            set.add(c);
            selectedFields.push(c);
          }
        });
      }

      const keysInFirst = models.length ? Object.keys(models[0].raw || models[0]) : [];
      if (!selectedFields || selectedFields.length === 0) {
        const candidates = [
          "brand",
          "model",
          "variant",
          "transmission",
          "fuelType",
          "bodyType",
          "seats",
        ];
        selectedFields = candidates.filter((k) => keysInFirst.includes(k));
        if (
          !selectedFields.includes(brandFieldForFamily) &&
          (keysInFirst.includes("brand") || keysInFirst.includes("bikeBrand"))
        )
          selectedFields.unshift(brandFieldForFamily);
        if (
          !selectedFields.includes("model") &&
          (keysInFirst.includes("model") || keysInFirst.includes("modelName"))
        )
          selectedFields.splice(1, 0, "model");
      } else {
        const low = selectedFields.map((s) => String(s).toLowerCase());
        if (!low.includes(String(brandFieldForFamily).toLowerCase()))
          selectedFields.unshift(brandFieldForFamily);
        if (!low.includes("model")) selectedFields.splice(1, 0, "model");
      }

      const curr = draftSelections[familyKey] || {};
      const pickFirst = (obj, arr) => {
        for (let i = 0; i < arr.length; i += 1) {
          const k = arr[i];
          if (obj && obj[k] != null && String(obj[k]).trim() !== "") return String(obj[k]);
        }
        return "";
      };
      const selectedBrand = pickFirst(
        curr,
        famLower === "bikes"
          ? ["bikeBrand", "brand", "Brand", "make", "Make"]
          : ["brand", "Brand", "make", "Make"]
      );
      const selectedModel = pickFirst(curr, [
        "model",
        "Model",
        "modelName",
        "model_name",
        "name",
      ]);

      const listsByField = {};
      if (famLower === "bikes") {
        const lowSet = new Set((selectedFields || []).map((s) => String(s).toLowerCase()));
        if (lowSet.has("bikebrand") && lowSet.has("brand")) {
          selectedFields = selectedFields.filter((s) => String(s).toLowerCase() !== "brand");
        }
      }
      const fields = selectedFields
        .filter(Boolean)
        .sort((a, b) => {
          const order = ["brand", "model"];
          const pa = order.indexOf(String(a).toLowerCase());
          const pb = order.indexOf(String(b).toLowerCase());
          if (pa !== -1 || pb !== -1)
            return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
          return 0;
        });

      const buildValues = (field) => {
        const fieldNorm = String(field).toLowerCase().replace(/[^a-z0-9]/g, "");
        const canonicalJsKey =
          fieldNorm.endsWith("bodytype")
            ? "bodyType"
            : fieldNorm.endsWith("fueltype")
            ? "fuelType"
            : fieldNorm.endsWith("seats")
            ? "seats"
            : fieldNorm.endsWith("transmission")
            ? "transmission"
            : fieldNorm;
        const keyCandidates = (() => {
          const f = canonicalJsKey;
          if (f === "brand" || (famLower === "bikes" && f === "bikebrand"))
            return ["brand", "bikeBrand", "make", "Brand", "Make"];
          if (f === "model")
            return ["model", "modelName", "Model", "model_name", "name"];
          if (f === "variant") return ["variant", "Variant", "trim", "Trim"];
          if (f === "transmission")
            return [
              "transmission",
              "Transmission",
              "gearbox",
              "gear_type",
              "gearType",
            ];
          if (f === "bodyType")
            return ["bodyType", "BodyType", "body_type", "type"];
          if (f === "fuelType")
            return ["fuelType", "FuelType", "fueltype", "Fuel", "fuel_type"];
          if (f === "seats")
            return [
              "seats",
              "Seats",
              "seatCapacity",
              "SeatCapacity",
              "seatingCapacity",
              "SeatingCapacity",
            ];
          return [field];
        })();
        const vals = new Set();
        models.forEach((m) => {
          const raw = m.raw || m;
          const nselBrand = norm(selectedBrand);
          const nrawBrand = norm(
            raw?.brand || raw?.bikeBrand || raw?.make || raw?.Brand || raw?.Make || ""
          );
          if (selectedBrand && nrawBrand !== nselBrand) return;
          if (
            canonicalJsKey !== "brand" &&
            !(famLower === "bikes" && canonicalJsKey === "bikebrand")
          ) {
            const nselModel = norm(selectedModel);
            const nrawModel = norm(
              raw?.model ||
                raw?.modelName ||
                raw?.Model ||
                raw?.model_name ||
                raw?.name ||
                ""
            );
            if (canonicalJsKey !== "model" && selectedModel && nrawModel !== nselModel)
              return;
          }
          let v;
          for (let i = 0; i < keyCandidates.length; i += 1) {
            const k = keyCandidates[i];
            if (raw && raw[k] !== undefined && raw[k] !== null) {
              v = raw[k];
              break;
            }
          }
          if (v !== undefined && v !== null && String(v).trim() !== "")
            vals.add(String(v));
        });
        const arr = Array.from(vals);
        if (canonicalJsKey === "model" && !selectedBrand) return [];
        return arr;
      };

      fields.forEach((field) => {
        listsByField[field] = buildValues(field);
      });
      return { fields, listsByField };
    },
    [draftSelections, linkedAttributes, modelsByFamily]
  );

  // Load inventory selections whenever vendor/category changes in dummy preview mode
  useEffect(() => {
    (async () => {
      try {
        if (!vendorId || !categoryId) {
          setInvItems([]);
          return;
        }
        const list = await loadDummyInventorySelections(vendorId, categoryId);
        const safe = Array.isArray(list) ? list : [];
        setInvItems(safe);
        try {
          console.log("[PREVIEW] Dummy inventorySelections rows", {
            vendorId,
            categoryId,
            count: safe.length,
            rows: safe,
          });
        } catch {}
      } catch {
        setInvItems([]);
      }
    })();
  }, [vendorId, categoryId, loadDummyInventorySelections]);

  useEffect(() => {
    try {
      const isDummy = String(mode || '').toLowerCase() === 'dummy';
      if (!isDummy) return;
      if (!vendorId || !categoryId) return;
      if (!categoryTree) return;

      const flattenTree = (node, rows = [], parentLevels = [], parentIds = []) => {
        try {
          if (!node) return rows;
          const levels = [...parentLevels, node.name ?? "Unnamed"];
          const ids = [...parentIds, (node._id ?? node.id)];
          const kids = Array.isArray(node.children) ? node.children : [];
          if (kids.length === 0) {
            rows.push({
              id: node._id ?? node.id,
              levels,
              levelIds: ids,
              price: (typeof node.vendorPrice === "number") ? node.vendorPrice : (node.price ?? "-"),
              pricingStatus: node.pricingStatus,
              terms: node.terms,
              node,
            });
          } else {
            kids.forEach((child) => flattenTree(child, rows, levels, ids));
          }
          return rows;
        } catch {
          return rows;
        }
      };

      const baseRows = flattenTree(categoryTree, []);
      const items = Array.isArray(invItems) ? invItems : [];
      const la = (linkedAttributes && typeof linkedAttributes === 'object') ? linkedAttributes : {};

      const matchesForRow = (row) => {
        try {
          const lvlIds = Array.isArray(row.levelIds) ? row.levelIds.map((x) => String(x)) : [];
          const firstIdx = (lvlIds[0] === 'root') ? 2 : 1;
          const firstSubcatId = lvlIds.length > firstIdx ? lvlIds[firstIdx] : null;

          return items.filter((it) => {
            try {
              const hasScope = it && it.scopeFamily && it.scopeLabel;
              const keyCandidates = hasScope
                ? [
                    `${it.scopeFamily}:${it.scopeLabel}:linkedSubcategory`,
                    `${it.scopeFamily}:inventoryLabels:linkedSubcategory`,
                  ]
                : [];
              let linked = [];
              for (const k of keyCandidates) {
                const arr = la?.[k];
                if (Array.isArray(arr) && arr.length) {
                  linked = arr;
                  break;
                }
              }
              const val = (Array.isArray(linked) && linked.length) ? String(linked[0]) : '';
              if (val === 'ALL') return true;
              if (!firstSubcatId) return false;
              return String(firstSubcatId) === val;
            } catch {
              return false;
            }
          });
        } catch {
          return [];
        }
      };

      const expandedRows = [];
      baseRows.forEach((row) => {
        const matches = matchesForRow(row);
        const computeEffective = (inv) => {
          try {
            const statusMap = inv && inv.pricingStatusByRow && typeof inv.pricingStatusByRow === 'object' ? inv.pricingStatusByRow : {};
            const keys = Object.keys(statusMap);
            if (!keys.length) return { status: row.pricingStatus, rowKey: null };
            const ids = Array.isArray(row.levelIds) ? row.levelIds.map((x) => String(x)) : [];
            const leafId = ids.length ? String(ids[ids.length - 1]) : '';
            let bestKey = null;
            for (const k of keys) {
              const parts = String(k).split('|').map((s) => s.trim()).filter(Boolean);
              if (leafId && parts.includes(leafId)) { bestKey = k; break; }
            }
            if (!bestKey) {
              for (const k of keys) {
                const parts = String(k).split('|').map((s) => s.trim()).filter(Boolean);
                if (parts.some((p) => ids.includes(p))) { bestKey = k; break; }
              }
            }
            if (!bestKey) return { status: row.pricingStatus, rowKey: null };
            const raw = statusMap[bestKey];
            const status = raw == null ? row.pricingStatus : String(raw);
            return { status, rowKey: bestKey };
          } catch {
            return { status: row.pricingStatus, rowKey: null };
          }
        };
        if (!matches.length) {
          expandedRows.push({
            categoryPath: row.levels,
            categoryIds: row.levelIds,
            price: row.price,
            pricingStatus: row.pricingStatus,
            terms: row.terms,
            effectivePricingStatus: row.pricingStatus,
            matchedRowKey: null,
            inventory: null,
          });
        } else {
          matches.forEach((m, idx) => {
            const eff = computeEffective(m);
            expandedRows.push({
              categoryPath: row.levels,
              categoryIds: row.levelIds,
              price: row.price,
              pricingStatus: row.pricingStatus,
              effectivePricingStatus: eff.status,
              matchedRowKey: eff.rowKey,
              terms: row.terms,
              inventory: m,
              inventoryIndex: idx,
            });
          });
        }
      });

      let activeRows = expandedRows;
      try {
        const isActive = (r) => {
          const s = (r && r.effectivePricingStatus != null) ? String(r.effectivePricingStatus).trim().toLowerCase() : '';
          return s === 'active';
        };
        const inactiveRows = expandedRows.filter((r) => !isActive(r));
        activeRows = expandedRows.filter((r) => isActive(r));
        console.log("[PREVIEW] Dummy removed inactive rows (effectivePricingStatus)", {
          vendorId,
          categoryId,
          before: expandedRows.length,
          removed: inactiveRows.length,
          after: activeRows.length,
          removedRows: inactiveRows,
        });
      } catch {}

      console.log("[PREVIEW] Dummy expanded row data (like admin rows)", {
        vendorId,
        categoryId,
        baseLeafCount: baseRows.length,
        expandedCount: activeRows.length,
        rows: activeRows,
      });
    } catch {}
  }, [mode, vendorId, categoryId, categoryTree, invItems, linkedAttributes]);

  // Build dynamic service labels from top-level category children (product card sections).
  // For accepted vendors, use the same visibility rule as the product cards (shouldShowLvl1),
  // which treats a L1 node as visible if either the node itself or its inventory has
  // active pricing. For non-accepted vendors, include all top-level services.
  const serviceLabels = useMemo(() => {
    try {

      const children = Array.isArray(categoryTree?.children) ? categoryTree.children : [];
      console.log("Service Labels - Top-level children count:", children.length);
      console.log("Top-level children:", children);
      console.log("Top-level active children:", children.filter((n) => {
        try {
          return isNodePricingActive(n) || hasActivePricingForNode(n);
        } catch {
          return false;
        }
      }));
      const source = children.filter((n) => {
        try {
          return isNodePricingActive(n) || hasActivePricingForNode(n);
        } catch {
          return false;
        }
      });


      const labels = source
        .map((n) => (n && typeof n.name === "string" ? n.name.trim() : ""))
        .filter((name) => !!name);
      if (labels.length > 0) return labels;

    } catch {}

    // Fallback for non-accepted or error cases: derive labels from top-level names.
    try {
      const children = Array.isArray(categoryTree?.children) ? categoryTree.children : [];
      const out = [];
      const seen = new Set();
      children.forEach((n) => {
        const name = (n && typeof n.name === "string" ? n.name.trim() : "") || "";
        const key = name.toLowerCase();
        if (name && !seen.has(key)) {
          seen.add(key);
          out.push(name);
        }
      });
      return out;
    } catch {
      return [];
    }
  }, [categoryTree, vendor, categoryId]);

  const hasActiveIndividualsForNav = useMemo(() => {
    try {
      const children = Array.isArray(categoryTree?.children) ? categoryTree.children : [];

      return children.some((n) => {
        try {
          return isNodePricingActive(n) || hasActivePricingForNode(n);
        } catch {
          return false;
        }
      });
    } catch {
      return false;
    }
  }, [categoryTree, vendor]);

  const makeServiceKey = useCallback((name) => {
    try {
      const raw = String(name || "");
      return raw
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    } catch {
      return "";
    }
  }, []);

  const scrollToServiceSection = useCallback((serviceKey) => {
    try {
      if (typeof window === "undefined" || !serviceKey) return;
      const header = document.querySelector("header");
      const headerHeight = header ? header.getBoundingClientRect().height : 80;
      const OFFSET = headerHeight + 16;

      const el = document.getElementById(`service-${serviceKey}`);
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const targetY = window.scrollY + rect.top - OFFSET;
      window.scrollTo({ top: targetY, behavior: "smooth" });
    } catch {}
  }, []);

  // Listen for service selection events from TopNavBar (Our Services dropdown)
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handler = (event) => {
      try {
        const detail = event?.detail || {};
        const key = detail.key || detail.serviceKey || makeServiceKey(detail.label);
        if (!key) return;
        setActiveServiceKey(key);
        scrollToServiceSection(key);
        // Clear after animation duration so we can re-trigger
        window.setTimeout(() => {
          setActiveServiceKey((current) => (current === key ? null : current));
        }, 900);
      } catch {}
    };
    window.addEventListener("preview:service-click", handler);
    return () => window.removeEventListener("preview:service-click", handler);
  }, [makeServiceKey, scrollToServiceSection]);

  // Hydrate preview category tree with per-node parentSelectorLabel from dummy-categories API
  const augmentTreeWithDummyLabels = useCallback(async (root) => {
    if (!root) return root;
    const pickId = (n) => {
      try { return String(n?.id || n?._id || ""); } catch { return ""; }
    };
    const visited = new Set();

    const fetchLabel = async (id) => {
      if (!id || visited.has(id)) return null;
      visited.add(id);
      try {
        console.log("🚀 Fetching dummy categories");
        
const data = await res.json();
const list = Array.isArray(data) ? data : [];

console.log("✅ Total dummy categories count:", list.length);
        const res = await fetch(`${API_BASE_URL}/api/dummy-categories/${id}`, { cache: 'no-store' });
        if (!res.ok) return null;
        const json = await res.json().catch(() => null);
        if (json && typeof json.parentSelectorLabel === 'string') {
          const t = json.parentSelectorLabel.trim();
          return t || "";
        }
      } catch {}
      return null;
    };

    const visit = async (node) => {
      if (!node) return;
      const id = pickId(node);
      const lbl = await fetchLabel(id);
      if (lbl !== null && lbl !== undefined) {
        node.parentSelectorLabel = lbl;
      }
      const children = Array.isArray(node.children) ? node.children : [];
      // visit children sequentially to avoid flooding the API
      for (const ch of children) {
        // eslint-disable-next-line no-await-in-loop
        await visit(ch);
      }
    };

    await visit(root);
    return root;
  }, []);

  // ----------------- Fetch vendor & categories -----------------
  const fetchData = useCallback(async () => {
    if (!router.isReady || !vendorId) return;
    setLoadingVendor(true);
    setLoadingCategories(true);
    try {
      try {
        console.log("[PREVIEW] fetchData start", {
          vendorId,
          categoryId,
          mode,
          routerReady: router.isReady,
        });
      } catch {}
      // Try to read webMenu and categoryType from dummy category config (if it exists)
      try {
        if (categoryId) {
          const wmRes = await fetch(`${API_BASE_URL}/api/dummy-categories/${categoryId}?t=${Date.now()}`, { cache: 'no-store' });
          if (wmRes.ok) {
            const wmJson = await wmRes.json().catch(() => null);
            const arr = Array.isArray(wmJson?.webMenu) ? wmJson.webMenu : [];
            setWebMenu(arr);
            try {
              const img = wmJson && typeof wmJson.imageUrl === 'string' ? wmJson.imageUrl : '';
              setCategoryProfilePictures(img && img.trim() ? [img.trim()] : []);
            } catch {
              setCategoryProfilePictures([]);
            }
            if (wmJson?.homePopup && typeof wmJson.homePopup === 'object') {
              setHomePopup(wmJson.homePopup);
            } else {
              setHomePopup(null);
            }
            if (wmJson?.whyUs && typeof wmJson.whyUs === 'object') {
              setWhyUs(wmJson.whyUs);
            } else {
              setWhyUs(null);
            }
            if (wmJson?.about && typeof wmJson.about === 'object') {
              setAbout(wmJson.about);
            } else {
              setAbout(null);
            }
            if (wmJson?.contact && typeof wmJson.contact === 'object') {
              setContact(wmJson.contact);
            } else {
              setContact(null);
            }
            if (wmJson?.individualAddon && typeof wmJson.individualAddon === 'object') {
              setIndividualAddon(wmJson.individualAddon);
            } else {
              setIndividualAddon(null);
            }
            if (wmJson?.packagesAddon && typeof wmJson.packagesAddon === 'object') {
              setPackagesAddon(wmJson.packagesAddon);
            } else {
              setPackagesAddon(null);
            }
            try {
              const rawSocial = Array.isArray(wmJson?.socialHandle)
                ? wmJson.socialHandle
                : wmJson?.socialHandle
                ? [wmJson.socialHandle]
                : [];
              const cleanedSocial = rawSocial
                .map((v) => (v == null ? "" : String(v)))
                .map((v) => v.trim())
                .filter(Boolean);
              setSocialHandles(cleanedSocial);
            } catch {
              setSocialHandles([]);
            }
            try {
              const rawInvLabel = typeof wmJson?.inventoryLabelName === 'string' ? wmJson.inventoryLabelName : '';
              const invTrim = rawInvLabel.trim();
              setInventoryLabelName(invTrim || null);
            } catch {
              setInventoryLabelName(null);
            }
            try {
              const la = (wmJson && wmJson.linkedAttributes && typeof wmJson.linkedAttributes === 'object')
                ? wmJson.linkedAttributes
                : {};
              setLinkedAttributes(la);
              const labels = [];
              const push = (v) => {
                if (!v) return;
                const t = String(v).trim();
                if (!t) return;
                if (!labels.includes(t)) labels.push(t);
              };
              Object.entries(la).forEach(([k, v]) => {
                if (!String(k || '').endsWith(':inventoryLabels')) return;
                if (!Array.isArray(v)) return;
                v.forEach(push);
              });
              setInventoryLabelsList(labels);
            } catch {
              setLinkedAttributes({});
              setInventoryLabelsList([]);
            }
            try {
              const cfg = Array.isArray(wmJson?.enquiryStatusConfig) ? wmJson.enquiryStatusConfig : [];
              setEnquiryStatusConfig(cfg);
            } catch {
              setEnquiryStatusConfig([]);
            }
            // Derive Inventory model flag from categoryModel array on dummy category
            try {
              const rawModels = Array.isArray(wmJson?.categoryModel)
                ? wmJson.categoryModel
                : wmJson?.categoryModel
                ? [wmJson.categoryModel]
                : [];
              const norm = rawModels
                .map((m) => (m == null ? "" : String(m)))
                .map((s) => s.trim().toLowerCase())
                .filter(Boolean);
              setIsInventoryModel(norm.includes("inventory"));
            } catch {
              setIsInventoryModel(false);
            }
            try {
              const rawAttr =
                wmJson && typeof wmJson.attributesHeading === "string"
                  ? wmJson.attributesHeading
                  : "";
              const trimmed = rawAttr.trim();
              setAttributesHeading(trimmed || null);
            } catch {
              setAttributesHeading(null);
            }
            try {
              const rawParentLabel =
                wmJson && typeof wmJson.parentSelectorLabel === "string"
                  ? wmJson.parentSelectorLabel
                  : "";
              const trimmedParent = rawParentLabel.trim();
              setParentSelectorLabel(trimmedParent || null);
            } catch {
              setParentSelectorLabel(null);
            }
            // Derive nav label from categoryType
            const rawType = (wmJson?.categoryType || "").toString();
            let lbl = "Our Services";
            if (rawType === "Products") lbl = "Our Products";
            else if (rawType === "Services") lbl = "Our Services";
            else if (rawType === "Products & Services") lbl = "Our Products & Services";
            setServicesNavLabel(lbl);
          } else {
            setWebMenu([]);
            setServicesNavLabel("Our Services");
            setHomePopup(null);
            setWhyUs(null);
            setAbout(null);
            setContact(null);
            setIsInventoryModel(false);
            setCategoryProfilePictures([]);
          }
        }
      } catch {
        setWebMenu([]);
        setServicesNavLabel("Our Services");
        setHomePopup(null);
        setWhyUs(null);
        setAbout(null);
        setContact(null);
        setIsInventoryModel(false);
        setCategoryProfilePictures([]);
      }

      const forceDummy = String(mode || '').toLowerCase() === 'dummy';
      if (forceDummy) {
        try { console.log("[PREVIEW] Branch selected: forceDummy", { vendorId, categoryId, mode }); } catch {}
        // Dummy vendor flow (forced by query)
        try {
          const dvRes = await fetch(`${API_BASE_URL}/api/dummy-vendors/${vendorId}/categories`, { cache: 'no-store' });
          const dv = await dvRes.json();
          // Fetch full dummy vendor document to hydrate inventorySelections/rowImages
          let dvDoc = {};
          try {
            const vRes = await fetch(`${API_BASE_URL}/api/dummy-vendors/${vendorId}`, { cache: 'no-store' });
            dvDoc = await vRes.json().catch(() => ({}));
          } catch { dvDoc = {}; }
          let dvVendor = { ...(dv?.vendor || {}), ...(dvDoc || {}) };
          try {
            const pics = Array.isArray(dvVendor?.profilePictures) ? dvVendor.profilePictures : [];
            if (pics.length === 0) {
              const pRes = await fetch(`${API_BASE_URL}/api/dummy-vendors/${vendorId}/profile-pictures`, { cache: 'no-store' });
              if (pRes.ok) {
                const pj = await pRes.json().catch(() => null);
                const list = Array.isArray(pj?.profilePictures) ? pj.profilePictures : [];
                if (list.length) dvVendor = { ...dvVendor, profilePictures: list };
              }
            }
          } catch {}
          setVendor(dvVendor);
          let categoriesWithLinked = dv?.categories || null;
          if (categoriesWithLinked) {
            try { categoriesWithLinked = await augmentTreeWithDummyLabels(categoriesWithLinked); } catch {}
          }

          try {
            const records = categoriesWithLinked;
            const count = Array.isArray(records)
              ? records.length
              : (records && typeof records === "object" ? Object.keys(records).length : 0);
            console.log("[PREVIEW] Dummy category records", {
              vendorId,
              categoryId,
              count,
              records,
            });
          } catch {}

          try {
            const root = categoriesWithLinked;
            const flattenLeafCount = (node) => {
              try {
                if (!node) return 0;
                const kids = Array.isArray(node.children) ? node.children : [];
                if (kids.length === 0) return 1;
                return kids.reduce((sum, ch) => sum + flattenLeafCount(ch), 0);
              } catch {
                return 0;
              }
            };
            const leafCount = flattenLeafCount(root);
            console.log("[PREVIEW] Dummy flattened leaf rows", {
              vendorId,
              categoryId,
              count: leafCount,
            });
          } catch {}
          setCategoryTree(categoriesWithLinked);
          if (dvVendor?.location) setLocation(dvVendor.location);
          // Compute hero title/description from dummy category/vendor freeTexts
          try {
            const trimOrNull = (v) => { const s = (v == null) ? '' : String(v); const t = s.trim(); return t ? t : null; };
            const firstNonEmpty = (arr) => Array.isArray(arr) ? arr.map(trimOrNull).find(Boolean) || null : null;
            // Try to fetch the exact dummy category to read its freeTexts if tree doesn't have it
            let dummyCat = null;
            try {
              const r = await fetch(`${API_BASE_URL}/api/dummy-categories/${categoryId}`, { cache: 'no-store' });
              if (r.ok) dummyCat = await r.json();
            } catch {}
            const rawCatFT = (categoriesWithLinked && categoriesWithLinked.freeTexts)
              ? categoriesWithLinked.freeTexts
              : (Array.isArray(dummyCat?.freeTexts) ? dummyCat.freeTexts : []);
            const catFT = (() => { try { const arr = Array.isArray(rawCatFT) ? rawCatFT : []; if (arr.length === 10 && (arr[0] == null || String(arr[0]).trim() === '') && (arr[1] != null && String(arr[1]).trim() !== '')) { return [...arr.slice(1), '']; } return arr; } catch { return Array.isArray(rawCatFT) ? rawCatFT : []; } })();
            const rawVenFT = dvVendor?.freeTexts || []; const venFT = Array.isArray(rawVenFT) ? rawVenFT : [];
            const titleFromCategory = trimOrNull(catFT[0]) || firstNonEmpty(catFT);
            const descFromCategory = trimOrNull(catFT[1]) || firstNonEmpty(catFT);
            const titleFromVendor = trimOrNull(dvVendor?.customFields?.freeText1) || trimOrNull(venFT[0]) || trimOrNull(dvVendor?.ui?.heroTitle) || firstNonEmpty(venFT);
            const descFromVendor = trimOrNull(dvVendor?.customFields?.freeText2) || trimOrNull(venFT[1]) || trimOrNull(dvVendor?.ui?.heroDescription) || firstNonEmpty(venFT);
            setVendorAddonTitle(trimOrNull(dvVendor?.customFields?.freeText1) || null);
            setVendorAddonDescription(trimOrNull(dvVendor?.customFields?.freeText2) || null);
            const q = router?.query || {};
            const title = trimOrNull(q.ft1) || titleFromVendor || titleFromCategory || null;
            const desc = trimOrNull(q.ft2) || descFromVendor || descFromCategory || null;
            setHeroTitle(title); setHeroDescription(desc);
          } catch {}
          // Fetch dummy combos for this category
          try {
            const c1 = await fetch(`${API_BASE_URL}/api/dummy-combos?parentCategoryId=${categoryId}`, { cache: 'no-store' });
            let list = await c1.json().catch(() => []);
            if (!Array.isArray(list) || list.length === 0) {
              try {
                const c2 = await fetch(`${API_BASE_URL}/api/dummy-combos/byParent/${categoryId}`, { cache: 'no-store' });
                list = await c2.json().catch(() => []);
              } catch {}
            }
            setCombos(Array.isArray(list) ? list : []);
          } catch { setCombos([]); }
        } catch (e) {
          setError(e?.message || 'Failed to load dummy vendor preview');
          setCategoryTree(null);
        }
      } else {
        // Try real vendor flow
        const vendorRes = await fetch(`${API_BASE_URL}/api/vendors/${vendorId}`, { cache: 'no-store' });
        let vendorData = {};
        try { vendorData = await vendorRes.json(); } catch { vendorData = {}; }
        const isDummy = (!vendorRes.ok || vendorData?.message);
        try { console.log("[PREVIEW] Branch selected", { vendorId, categoryId, mode, isDummy }); } catch {}
        if (isDummy) {
          // Fallback to dummy
          try {
            const dvRes = await fetch(`${API_BASE_URL}/api/dummy-vendors/${vendorId}/categories`, { cache: 'no-store' });
            const dv = await dvRes.json();
            // Hydrate with full dummy vendor
            let dvDoc = {};
            try {
              const vRes = await fetch(`${API_BASE_URL}/api/dummy-vendors/${vendorId}`, { cache: 'no-store' });
              dvDoc = await vRes.json().catch(() => ({}));
            } catch { dvDoc = {}; }
            let dvVendor = { ...(dv?.vendor || {}), ...(dvDoc || {}) };
            try {
              const pics = Array.isArray(dvVendor?.profilePictures) ? dvVendor.profilePictures : [];
              if (pics.length === 0) {
                const pRes = await fetch(`${API_BASE_URL}/api/dummy-vendors/${vendorId}/profile-pictures`, { cache: 'no-store' });
                if (pRes.ok) {
                  const pj = await pRes.json().catch(() => null);
                  const list = Array.isArray(pj?.profilePictures) ? pj.profilePictures : [];
                  if (list.length) dvVendor = { ...dvVendor, profilePictures: list };
                }
              }
            } catch {}
            setVendor(dvVendor);
            let categoriesWithLinked = dv?.categories || null;
            if (categoriesWithLinked) {
              try { categoriesWithLinked = await augmentTreeWithDummyLabels(categoriesWithLinked); } catch {}
            }
            setCategoryTree(categoriesWithLinked);
            if (dvVendor?.location) setLocation(dvVendor.location);
            // Compute hero title/description for fallback dummy as well
            try {
              const trimOrNull = (v) => { const s = (v == null) ? '' : String(v); const t = s.trim(); return t ? t : null; };
              const firstNonEmpty = (arr) => Array.isArray(arr) ? arr.map(trimOrNull).find(Boolean) || null : null;
              // Try to fetch the exact dummy category to read its freeTexts if tree doesn't have it
              let dummyCat = null;
              try {
                const r = await fetch(`${API_BASE_URL}/api/dummy-categories/${categoryId}`, { cache: 'no-store' });
                if (r.ok) dummyCat = await r.json();
              } catch {}
              const rawCatFT = (categoriesWithLinked && categoriesWithLinked.freeTexts)
                ? categoriesWithLinked.freeTexts
                : (Array.isArray(dummyCat?.freeTexts) ? dummyCat.freeTexts : []);
              const catFT = (() => { try { const arr = Array.isArray(rawCatFT) ? rawCatFT : []; if (arr.length === 10 && (arr[0] == null || String(arr[0]).trim() === '') && (arr[1] != null && String(arr[1]).trim() !== '')) { return [...arr.slice(1), '']; } return arr; } catch { return Array.isArray(rawCatFT) ? rawCatFT : []; } })();
              const rawVenFT = dvVendor?.freeTexts || []; const venFT = Array.isArray(rawVenFT) ? rawVenFT : [];
              const titleFromCategory = trimOrNull(catFT[0]) || firstNonEmpty(catFT);
              const descFromCategory = trimOrNull(catFT[1]) || firstNonEmpty(catFT);
              const titleFromVendor = trimOrNull(venFT[0]) || trimOrNull(dvVendor?.customFields?.freeText1) || trimOrNull(dvVendor?.ui?.heroTitle) || firstNonEmpty(venFT);
              const descFromVendor = trimOrNull(venFT[1]) || trimOrNull(dvVendor?.customFields?.freeText2) || trimOrNull(dvVendor?.ui?.heroDescription) || firstNonEmpty(venFT);
              setVendorAddonTitle(trimOrNull(dvVendor?.customFields?.freeText1) || null);
              setVendorAddonDescription(trimOrNull(dvVendor?.customFields?.freeText2) || null);
              const q = router?.query || {};
              const title = trimOrNull(q.ft1) || titleFromCategory || titleFromVendor || null;
              const desc = trimOrNull(q.ft2) || descFromCategory || descFromVendor || null;
              setHeroTitle(title); setHeroDescription(desc);
            } catch {}
            // Fetch dummy combos for this category (fallback path)
            try {
              const c1 = await fetch(`${API_BASE_URL}/api/dummy-combos?parentCategoryId=${categoryId}`, { cache: 'no-store' });
              let list = await c1.json().catch(() => []);
              if (!Array.isArray(list) || list.length === 0) {
                try {
                  const c2 = await fetch(`${API_BASE_URL}/api/dummy-combos/byParent/${categoryId}`, { cache: 'no-store' });
                  list = await c2.json().catch(() => []);
                } catch {}
              }
              setCombos(Array.isArray(list) ? list : []);
            } catch { setCombos([]); }
          } catch (e) {
            setError(e?.message || 'Failed to load dummy vendor preview');
            setCategoryTree(null);
          }
        } else {
          // Real vendor: load preview tree and meta
          setVendor(vendorData);
          const [categoryRes, locationRes, catMetaRes, serverTreeRes] = await Promise.all([
            fetch(`${API_BASE_URL}/api/vendors/${vendorId}/preview/${categoryId}`, { cache: 'no-store' }),
            fetch(`${API_BASE_URL}/api/vendors/${vendorId}/location`, { cache: 'no-store' }),
            fetch(`${API_BASE_URL}/api/categories/${categoryId}`, { cache: 'no-store' }),
            fetch(`${API_BASE_URL}/api/categories/${categoryId}/tree`, { cache: 'no-store' }),
          ]);
          console.log("total response of individual category tree:", categoryRes);
          console.log("total response of individual category meta:", catMetaRes);
          console.log("total response of individual server tree:", serverTreeRes);
          const categoryData = await categoryRes.json().catch(() => ({}));
          const catMeta = await catMetaRes.json().catch(() => ({}));
          const serverTree = await serverTreeRes.json().catch(() => null);
          let locationData = null;
          try { locationData = await locationRes.json(); } catch { locationData = null; }

          try {
            const records = categoryData?.categories || categoryData;
            const count = Array.isArray(records) ? records.length : (records && typeof records === "object" ? Object.keys(records).length : 0);
            console.log("[PREVIEW] Category API all records", {
              vendorId,
              categoryId,
              count,
              records,
            });
          } catch {}

          const linkedAttributes = (catMeta && catMeta.linkedAttributes) ? catMeta.linkedAttributes : {};
          let categoriesWithLinked = categoryData?.categories ? { ...categoryData.categories, linkedAttributes } : null;
          if (!categoriesWithLinked && serverTree && (serverTree._id || serverTree.id)) {
            categoriesWithLinked = { ...serverTree, linkedAttributes };
          }

          try {
            if (categoriesWithLinked && serverTree && (serverTree._id || serverTree.id)) {
              const pickId = (n) => String(n?.id || n?._id || '');
              const buildIndex = (root) => {
                const idx = new Map();
                const visit = (n) => { if (!n) return; const k = pickId(n); if (k) idx.set(k, n); (Array.isArray(n.children) ? n.children : []).forEach(visit); };
                visit(serverTree); return idx; };
              const serverIdx = buildIndex(serverTree);
              const serverChildrenByParent = new Map();
              const collectChildren = (n) => { if (!n) return; const pid = String(n._id || n.id || ''); if (Array.isArray(n.children)) serverChildrenByParent.set(pid, n.children); (n.children || []).forEach(collectChildren); };
              collectChildren(serverTree);
              const mergeFields = (dst, src) => { if (!dst || !src) return; if (Array.isArray(src.displayType)) dst.displayType = src.displayType; if (src.uiRules && typeof src.uiRules === 'object') dst.uiRules = src.uiRules; if (typeof src.imageUrl === 'string') dst.imageUrl = src.imageUrl; if (typeof src.iconUrl === 'string') dst.iconUrl = src.iconUrl; };
              const overlay = (node, srcParent) => { if (!node) return; const k = pickId(node); let src = k ? serverIdx.get(k) : null; if (!src && srcParent) { const sibs = serverChildrenByParent.get(String(srcParent._id || srcParent.id || '')) || []; const byName = sibs.find((c) => String(c?.name || '').toLowerCase() === String(node?.name || '').toLowerCase()); if (byName) src = byName; } if (src) mergeFields(node, src); const nextSrcParent = src || srcParent; (Array.isArray(node.children) ? node.children : []).forEach((ch) => overlay(ch, nextSrcParent)); };
              overlay(categoriesWithLinked, serverTree);
            }
          } catch {}

          setCategoryTree(categoriesWithLinked);

          try {
            const trimOrNull = (v) => { const s = (v == null) ? '' : String(v); const t = s.trim(); return t ? t : null; };
            const firstNonEmpty = (arr) => Array.isArray(arr) ? arr.map(trimOrNull).find(Boolean) || null : null;
            const rawCatFT = (categoriesWithLinked && categoriesWithLinked.freeTexts) ? categoriesWithLinked.freeTexts : (catMeta && Array.isArray(catMeta.freeTexts)) ? catMeta.freeTexts : (categoryData && Array.isArray(categoryData.freeTexts)) ? categoryData.freeTexts : [];
            const catFT = (() => { try { const arr = Array.isArray(rawCatFT) ? rawCatFT : []; if (arr.length === 10 && (arr[0] == null || String(arr[0]).trim() === '') && (arr[1] != null && String(arr[1]).trim() !== '')) { return [...arr.slice(1), '']; } return arr; } catch { return Array.isArray(rawCatFT) ? rawCatFT : []; } })();
            const rawVenFT = vendorData?.freeTexts || []; const venFT = Array.isArray(rawVenFT) ? rawVenFT : [];
            const titleFromCategory = trimOrNull(catFT[0]) || firstNonEmpty(catFT);
            const descFromCategory = trimOrNull(catFT[1]) || firstNonEmpty(catFT);
            const titleFromVendor = trimOrNull(venFT[0]) || trimOrNull(vendorData?.customFields?.freeText1) || trimOrNull(vendorData?.ui?.heroTitle) || firstNonEmpty(venFT);
            const descFromVendor = trimOrNull(venFT[1]) || trimOrNull(vendorData?.customFields?.freeText2) || trimOrNull(vendorData?.ui?.heroDescription) || firstNonEmpty(venFT);
            const titleFromUi =
              trimOrNull(catMeta?.ui?.heroTitle) ||
              trimOrNull(categoryData?.customFields?.freeText1) ||
              trimOrNull(categoryData?.freeText1) ||
              trimOrNull(categoryData?.ui?.heroTitle);
            const descFromUi =
              trimOrNull(catMeta?.ui?.heroDescription) ||
              trimOrNull(categoryData?.customFields?.freeText2) ||
              trimOrNull(categoryData?.freeText2) ||
              trimOrNull(categoryData?.ui?.heroDescription);
            const q = router?.query || {};
            const title = trimOrNull(q.ft1) || titleFromCategory || titleFromVendor || titleFromUi || 'Welcome';
            const desc = trimOrNull(q.ft2) || descFromCategory || descFromVendor || descFromUi || 'Discover our offerings';
            setHeroTitle(title); setHeroDescription(desc);
          } catch {}

          try {
            const combosRes = await fetch(`${API_BASE_URL}/api/combos?parentCategoryId=${categoryId}`, { cache: 'no-store' });
            let combosData = await combosRes.json().catch(() => []);
            if (!Array.isArray(combosData) || combosData.length === 0) {
              // Fallback to dummy combos if real combos are empty
              try {
                const c1 = await fetch(`${API_BASE_URL}/api/dummy-combos?parentCategoryId=${categoryId}`, { cache: 'no-store' });
                let list = await c1.json().catch(() => []);
                if (!Array.isArray(list) || list.length === 0) {
                  const c2 = await fetch(`${API_BASE_URL}/api/dummy-combos/byParent/${categoryId}`, { cache: 'no-store' });
                  list = await c2.json().catch(() => []);
                }
                combosData = Array.isArray(list) ? list : [];
              } catch {}
            }
            setCombos(Array.isArray(combosData) ? combosData : []);
          } catch { setCombos([]); }

          if (locationData) {
            if (locationData.location) {
              setLocation(locationData.location);
            } else if (
              typeof locationData.lat === "number" ||
              typeof locationData.lng === "number"
            ) {
              setLocation(locationData);
            }
          } else if (vendorData.location) {
            setLocation(vendorData.location);
          }
        }
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoadingVendor(false);
      setLoadingCategories(false);
    }
  }, [router.isReady, vendorId, categoryId, mode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Initialize Taxi Services / Driving School to cheapest option on first load
  useEffect(() => {
    try {
      if (!vendor || !categoryTree) return;
      const rootName = String(categoryTree?.name || '').toLowerCase();
      const isTaxi = rootName === 'taxi services';
      const isDriving = rootName === 'driving school';
      if (!isTaxi && !isDriving) return;

      const familiesByTarget = new Map();
      try {
        const cfg = vendor?.familiesByTarget || {};
        Object.entries(cfg).forEach(([k, arr]) => {
          familiesByTarget.set(String(k), new Set((arr || []).map(String)));
        });
      } catch {}

      const roots = Array.isArray(categoryTree.children) ? categoryTree.children : [];

      const updateForRoot = (lvl1) => {
        const lvl1Id = String(lvl1?.id || '');
        if (!lvl1Id) return;
        const existing = taxiSelections[lvl1Id];
        if (existing && (existing.bodySeats || existing.fuelType || existing.modelBrand || existing.transmission || existing.bodyType)) return; // don't override user

        const invEntries = (vendor?.inventorySelections?.[categoryId] || []).filter((entry) => {
          try {
            const famSet = familiesByTarget.get(lvl1Id);
            if (famSet) {
              const fam = String(entry?.scopeFamily || '');
              if (fam && !famSet.has(fam)) return false;
            }
            const pbr = entry?.pricesByRow;
            if (pbr && typeof pbr === 'object') {
              for (const key of Object.keys(pbr)) {
                const ids = String(key).split('|');
                if (ids.some((id) => String(id) === lvl1Id)) return true;
              }
              return false;
            }
            return true;
          } catch {
            return !isDummyMode;
          }
        });

        let best = { price: null, entry: null };
        invEntries.forEach((entry) => {
          try {
            const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
            if (!pbr) return;
            for (const [key, value] of Object.entries(pbr)) {
              const ids = String(key).split('|');
              if (ids.some((id) => String(id) === lvl1Id)) {
                const num = Number(value);
                if (!Number.isNaN(num) && (best.price == null || num < best.price)) {
                  best = { price: num, entry };
                }
              }
            }
          } catch {}
        });

        if (!best.entry) return;
        const fam = String(best.entry?.scopeFamily || '');
        const sel = (best.entry?.selections && fam && best.entry.selections[fam]) ? best.entry.selections[fam] : {};

        if (isTaxi) {
          const transmission = sel?.transmission != null ? String(sel.transmission) : undefined;
          const bodyType = fam === 'tempoMinibuses' ? (sel?.tempoBusBodyType ?? '') : (sel?.bodyType ?? '');
          const model = String(sel?.model ?? '');
          const brand = fam === 'tempoMinibuses' ? String(sel?.tempoBusBrand ?? '') : String(sel?.brand ?? '');
          setTaxiSelections((prev) => ({
            ...prev,
            [lvl1Id]: {
              ...(prev[lvl1Id] || {}),
              transmission: transmission || prev[lvl1Id]?.transmission,
              bodyType: bodyType || prev[lvl1Id]?.bodyType,
              modelBrand: (model && brand) ? `${model}|${brand}` : prev[lvl1Id]?.modelBrand,
            },
          }));
        }

        if (isDriving) {
          const transmission = (sel?.transmission ?? sel?.bikeTransmission) != null ? String(sel?.transmission ?? sel?.bikeTransmission) : undefined;
          const bodyType = sel?.bodyType != null ? String(sel.bodyType) : undefined;
          const model = String(sel?.model ?? '');
          const brand = String(sel?.brand ?? sel?.bikeBrand ?? '');
          setTaxiSelections((prev) => ({
            ...prev,
            [lvl1Id]: {
              ...(prev[lvl1Id] || {}),
              transmission: transmission || prev[lvl1Id]?.transmission,
              bodyType: bodyType || prev[lvl1Id]?.bodyType,
              modelBrand: (model && brand) ? `${model}|${brand}` : prev[lvl1Id]?.modelBrand,
            },
          }));
        }
      };

      roots.forEach(updateForRoot);
    } catch {}
  }, [vendor, categoryTree, categoryId]);

  // Initialize attribute bar (brand/model/transmission/bodyType) to first brand combo when empty
  useEffect(() => {
    try {
      if (!vendor || !categoryTree) return;

      if (attrSelections && (attrSelections.brand || attrSelections.model || attrSelections.transmission || attrSelections.bodyType || attrSelections.bikeBrand || attrSelections.bikeTransmission)) {
        return; // do not override user/default once set
      }

      const catKey = String(categoryId || '');
      const inv = Array.isArray(vendor?.inventorySelections?.[catKey]) ? vendor.inventorySelections[catKey] : [];
      if (!inv.length) return;

      const cars = [];
      const bikes = [];
      inv.forEach((entry) => {
        try {
          const fam = String(entry?.scopeFamily || '').toLowerCase();
          const sels = entry?.selections || {};
          let sel = sels[fam] || sels.cars || sels.bikes || {};
          if (!sel || typeof sel !== 'object') sel = {};
          if (fam === 'cars') {
            const brand = sel.brand != null ? String(sel.brand) : '';
            const transmission = sel.transmission != null ? String(sel.transmission) : '';
            const model = sel.model != null ? String(sel.model) : '';
            const bodyType = sel.bodyType != null ? String(sel.bodyType) : '';
            if (brand || model || transmission || bodyType) {
              cars.push({ brand, model, transmission, bodyType });
            }
          } else if (fam === 'bikes') {
            const brand = sel.bikeBrand != null ? String(sel.bikeBrand) : (sel.brand != null ? String(sel.brand) : '');
            const transmission = sel.bikeTransmission != null ? String(sel.bikeTransmission) : (sel.transmission != null ? String(sel.transmission) : '');
            const model = sel.model != null ? String(sel.model) : '';
            if (brand || model || transmission) {
              bikes.push({ brand, model, transmission });
            }
          }
        } catch {}
      });

      const carBrands = Array.from(new Set(cars.map((n) => String(n.brand || '').trim()).filter(Boolean)));
      const firstCarBrand = carBrands[0] || '';
      const carsForBrand = firstCarBrand
        ? cars.filter((n) => String(n.brand || '').trim() === firstCarBrand)
        : [];

      // We only default the brand for cars; user will choose model/trans/bodyType.

      const bikeBrands = Array.from(new Set(bikes.map((n) => String(n.brand || '').trim()).filter(Boolean)));
      const firstBikeBrand = bikeBrands[0] || '';
      const bikesForBrand = firstBikeBrand
        ? bikes.filter((n) => String(n.brand || '').trim() === firstBikeBrand)
        : [];

      // For bikes we also only default the brand.

      setAttrSelections((prev) => {
        const current = prev || {};
        if (current.brand || current.model || current.transmission || current.bodyType || current.bikeBrand || current.bikeTransmission) return current;
        const next = { ...current };
        if (firstCarBrand) next.brand = firstCarBrand;
        if (firstBikeBrand) next.bikeBrand = firstBikeBrand;
        return next;
      });
    } catch {}
  }, [vendor, categoryTree, categoryId, attrSelections]);

  // Listen for vendor pricing updates from other tabs/pages and refresh
  useEffect(() => {
    if (!vendorId || !categoryId) return;
    const storageHandler = (e) => {
      try {
        if (!e || e.key !== `vendorPricingUpdated:${vendorId}:${categoryId}`) return;
        fetchData();
      } catch {}
    };
    const customHandler = (e) => {
      try {
        const v = e?.detail?.vendorId;
        const c = e?.detail?.categoryId;
        if (String(v) === String(vendorId) && String(c) === String(categoryId)) {
          fetchData();
        }
      } catch {}
    };
    window.addEventListener('storage', storageHandler);
    window.addEventListener('vendorPricingUpdated', customHandler);
    return () => {
      window.removeEventListener('storage', storageHandler);
      window.removeEventListener('vendorPricingUpdated', customHandler);
    };
  }, [vendorId, categoryId, fetchData]);

  // ----------------- Helpers -----------------
  const hasChildren = (node) => node?.children?.length > 0;

  const containsId = (node, id) => {
    if (!node || !id) return false;
    if (node.id === id) return true;
    return node.children?.some((c) => containsId(c, id)) || false;
  };

  // SIMPLIFIED: Show packages if any combos exist
  const hasPackagesForNav = useMemo(() => {
    return Array.isArray(combos) && combos.length > 0;
  }, [combos]);

  // SIMPLIFIED: Always return true - show all nodes
  const hasVendorActiveForNode = (node) => {
    return true;
  };

  // Check if a node's pricing status is Active based on vendor.nodePricingStatus
  function isNodePricingActive(node) {
    try {
      if (!node) return false;

      const normalizeId = (val) => {
        if (val == null) return '';
        if (typeof val === 'string' || typeof val === 'number') return String(val);
        if (typeof val === 'object') {
          if (val.$oid) return String(val.$oid);
          if (val.oid) return String(val.oid);
          if (val._id) return normalizeId(val._id);
          if (val.id) return normalizeId(val.id);
        }
        return String(val);
      };

      const nodeId = normalizeId(node._id ?? node.id);
      if (!nodeId) return !isDummyMode;

      const statusMap = vendor?.nodePricingStatus;
      const hasStatusMap = statusMap && typeof statusMap === 'object';

      const readStatus = (id) => {
        try {
          if (!hasStatusMap) return undefined;
          return statusMap[String(id)];
        } catch {
          return undefined;
        }
      };

      const status = readStatus(nodeId);
      const isActive = (s) => String(s || '').trim().toLowerCase() === 'active';

      if (status !== undefined && status !== null) {
        return isActive(status);
      }

      const hasActiveDescendant = (n) => {
        try {
          const kids = Array.isArray(n?.children) ? n.children : [];
          for (const ch of kids) {
            const cid = normalizeId(ch?._id ?? ch?.id);
            const st = cid ? readStatus(cid) : undefined;
            if (st !== undefined && st !== null) {
              if (isActive(st)) return true;
            } else {
              if (hasActiveDescendant(ch)) return true;
            }
          }
          return false;
        } catch {
          return false;
        }
      };

      // Dummy mode: strict (only explicitly Active nodes or parents of Active nodes)
      if (isDummyMode) {
        if (hasActiveDescendant(node)) return true;
        return false;
      }

      // Non-dummy: keep permissive behavior when status is missing
      return true;
    } catch {
      return !isDummyMode;
    }
  }

  // ----------------- Card Component -----------------
  const ParentWithSizesCard = ({ node, selection, onSelectionChange, onLeafSelect, mode = "buttons", includeLeafChildren = true }) => {
    if (!node) return null;

    const getDeepestFirstChild = (n) => (!n?.children?.length ? n : getDeepestFirstChild(n.children[0]));

    // Local flag to detect Driving School cards for conditional headings
    const rootNameForCard = String(categoryTree?.name || '').toLowerCase();
    const isDriving = rootNameForCard === 'driving school';

    const specialName = String(node?.name).trim();
    const isSpecialCard = specialName === "Face & Skin" || specialName === "Hand & Foot";

    // Prefer a node-specific parentSelectorLabel if present; fall back to global label
    const labelForCard = (() => {
      try {
        const raw = typeof node?.parentSelectorLabel === "string" ? node.parentSelectorLabel : parentSelectorLabel;
        const trimmed = String(raw || "").trim();
        return trimmed || "";
      } catch {
        return parentSelectorLabel || "";
      }
    })();

    const rawChildren = Array.isArray(node.children) ? node.children : [];
    const parentCandidates = (() => {
      try {
        
        const filtered = rawChildren.filter((ch) => {
          try {
            // For driving school, use hasActivePricingForNode which checks descendants
            const rootNameForCard = String(categoryTree?.name || '').toLowerCase();
            // const isDriving = rootNameForCard === 'driving school';
            // ch = {};
            if (isDriving) {
              return isNodePricingActive(ch) || hasActivePricingForNode(ch);
            }
            return isNodePricingActive(ch);
          } catch {
            return false;
          }
        });
        return filtered;
      } catch {
        return isDummyMode ? [] : rawChildren;
      }
    })();

    const selectedParent = selection?.parent || parentCandidates?.[0] || node;
    const selectedChild = selection?.child || getDeepestFirstChild(selectedParent);

    const displayNode = selectedChild || selectedParent;

    const childLabelForCard = (() => {
      try {
        const raw = typeof selectedParent?.parentSelectorLabel === "string" ? selectedParent.parentSelectorLabel : "";
        const trimmed = String(raw || "").trim();
        return trimmed || "";
      } catch {
        return "";
      }
    })();
    let attributeDropdown = null;

    const getUiForLocal = (nodeOrId) => ({ mode: 'buttons', includeLeafChildren: true });
    
    // Resolve selector display type from the NODE'S OWN config
    const mapToSelectorMode = (dt) => {
      const x = String(dt || '').toLowerCase();
      // if (x === 'dropdown' || x === 'select') return 'dropdown';
      // return 'buttons';
      if (x === 'dropdown' ) return 'dropdown';
      return 'buttons';
    };
  
    const pickDtArr = (arr) => Array.isArray(arr) && arr.length > 0 ? String(arr[0]).toLowerCase() : null;
    const getNodeMode = (n) => pickDtArr(n?.displayType) || getUiForLocal(n).mode || 'buttons';
    // Parent selector (for node's immediate children) comes from node's own displayType
    const parentSelectorMode = mapToSelectorMode(getNodeMode(node));
    // Child selector (for selected parent's children) comes from selectedParent's own displayType
    const childSelectorMode = mapToSelectorMode(getNodeMode(selectedParent));

    const [imgIdx, setImgIdx] = useState(0);
    const [extraRowImages, setExtraRowImages] = useState({}); // { [id]: string[] }
    // Build images for this card
    const ASSET_PREFIX = (ASSET_BASE_URL && String(ASSET_BASE_URL)) || (API_BASE_URL && String(API_BASE_URL)) || '';
    const imagesForCard = (() => {
      try {
        const ids = [displayNode?.id, selectedParent?.id, node?.id].map((x) => String(x || ''));
        let arr = [];
        for (const id of ids) {
          if (!id) continue;
          const rows = Array.isArray(vendor?.rowImages?.[id]) ? vendor.rowImages[id] : (Array.isArray(extraRowImages?.[id]) ? extraRowImages[id] : []);
          if (rows.length) { arr = rows.slice(0, 10); break; }
        }
        if (!arr.length && displayNode?.imageUrl) arr = [displayNode.imageUrl];
        // If still empty, try any available vendor.rowImages across ids
        if (!arr.length) {
          try {
            const all = vendor?.rowImages || {};
            for (const k in all) {
              const list = Array.isArray(all[k]) ? all[k] : [];
              if (list.length) { arr = list.slice(0, 10); break; }
            }
          } catch {}
        }
        // If still empty and in dummy mode, try fetching dummy category's image/icon
        if (!arr.length && String(mode || '').toLowerCase() === 'dummy') {
          try {
            const did = String(displayNode?.id || '');
            if (did) {
              // Synchronous fetch disabled inside IIFE; we cannot await here.
              // Instead, enqueue an async fetch to populate extraRowImages so subsequent renders have data.
              (async () => {
                try {
                  const r = await fetch(`${API_BASE_URL}/api/dummy-categories/${did}`, { cache: 'no-store' });
                  if (r.ok) {
                    const j = await r.json();
                    const candidates = [];
                    if (j?.imageUrl) candidates.push(j.imageUrl);
                    if (j?.iconUrl) candidates.push(j.iconUrl);
                    if (candidates.length) {
                      setExtraRowImages((prev) => ({ ...(prev || {}), [did]: candidates }));
                    }
                  }
                } catch {}
              })();
            }
          } catch {}
        }
        const base = String(ASSET_PREFIX || '').replace(/\/+$/, '');
        return arr.map((s) => {
          const str = String(s);
          let url;
          if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:')) {
            url = str;
          } else {
            const path = str.startsWith('/') ? str : `/${str}`;
            url = `${base}${path}`;
          }
          return encodeURI(url).replace(/\+/g, '%2B');
        });
      } catch { return []; }
    })();
    useEffect(() => { setImgIdx(0); }, [displayNode?.id, selectedParent?.id, node?.id, imagesForCard.length]);

    // Lazy fetch row images if not present in vendor.rowImages.
    // We still attempt per-id fetches when vendor.rowImages/extraRowImages are empty,
    // even if imagesForCard already has generic images (e.g., profilePictures),
    // so row-specific images can replace generic ones.
    useEffect(() => {
      (async () => {
        try {
          const ids = [displayNode?.id, selectedParent?.id, node?.id].map((x) => String(x || ''));
          for (const id of ids) {
            if (!id) continue;
            const hasLocal = Array.isArray(vendor?.rowImages?.[id]) && vendor.rowImages[id].length > 0;
            const hasExtra = Array.isArray(extraRowImages?.[id]) && extraRowImages[id].length > 0;
            if (hasLocal || hasExtra) continue;
            const preferred = String(mode || '').toLowerCase() === 'dummy' ? ['dummy-vendors','vendors'] : ['vendors','dummy-vendors'];
            let data = null;
            for (const bp of preferred) {
              try {
                const res = await fetch(`${API_BASE_URL}/api/${bp}/${vendorId}/rows/${id}/images`, { cache: 'no-store' });
                if (!res.ok) continue;
                data = await res.json().catch(() => null);
                break;
              } catch {}
            }
            if (!data) continue;
            const imgs = Array.isArray(data?.images) ? data.images : [];
            if (imgs.length) {
              setExtraRowImages((prev) => ({ ...(prev || {}), [id]: imgs }));
            }
          }
        } catch {}
      })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vendorId, displayNode?.id, selectedParent?.id, node?.id]);

    return (
      <section style={{ marginBottom: 20 }}>
        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 18,
            padding: 24,
            background: "#D6EEDE", // match HomeSection background
            width: "100%",
            minHeight: 420,
            height: "100%",
            boxShadow: "0 10px 20px rgba(0,0,0,0.06)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            fontFamily: "Poppins, sans-serif",
          }}
        >
          <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 600, textAlign: "center" }}>{node.name}</h2>

          {imagesForCard.length > 0 ? (
            <div style={{ width: '100%', height: 160, borderRadius: 10, overflow: 'hidden', background: '#f8fafc', position: 'relative', marginBottom: 12 }}>
              <div style={{ display: 'flex', width: `${imagesForCard.length * 100}%`, height: '100%', transform: `translateX(-${imgIdx * (100 / imagesForCard.length)}%)`, transition: 'transform 400ms ease' }}>
                {imagesForCard.map((src, i) => (
                  <div key={i} style={{ width: `${100 / imagesForCard.length}%`, height: '100%', flex: '0 0 auto' }}>
                    <img src={src} alt={`img-${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
              {imagesForCard.length > 1 ? (
                <>
                  <button
                    aria-label="Prev"
                    onClick={() => setImgIdx((i) => (i - 1 + imagesForCard.length) % imagesForCard.length)}
                    style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', width: 26, height: 26, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer' }}
                  >‹</button>
                  <button
                    aria-label="Next"
                    onClick={() => setImgIdx((i) => (i + 1) % imagesForCard.length)}
                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 26, height: 26, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer' }}
                  >›</button>
                  <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, display: 'flex', gap: 6, justifyContent: 'center' }}>
                    {imagesForCard.map((_, i) => (
                      <button key={i} onClick={() => setImgIdx(i)} aria-label={`Go to ${i+1}`}
                        style={{ width: i===imgIdx?9:7, height: i===imgIdx?9:7, borderRadius: 999, border: 'none', background: i===imgIdx ? '#fff' : 'rgba(255,255,255,0.6)', cursor: 'pointer' }} />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {displayNode && (
            <div style={{ marginBottom: 12 }}>
              {(() => {
                try {
                  const catKey = String(categoryId || '');
                  const invRaw = Array.isArray(vendor?.inventorySelections?.[catKey]) ? vendor.inventorySelections[catKey] : [];
                  
                  if (isDummyMode) {
                    console.log('[DEBUG invRaw count]', invRaw.length);
                    invRaw.forEach((entry, idx) => {
                      const label = String(entry?.scopeLabel || '');
                      const fam = String(entry?.scopeFamily || '');
                      const sels = entry?.selections || {};
                      const carSel = sels?.cars || {};
                      const brand = String(carSel?.brand || '');
                      const model = String(carSel?.model || '');
                      
                      if (brand.includes('MAHINDRA') || model.includes('XUV') || label.includes('MAHINDRA')) {
                        const statusMap = entry?.pricingStatusByRow || {};
                        const statusKeys = Object.keys(statusMap);
                        const statusValues = statusKeys.map(k => ({ key: k, status: statusMap[k] }));
                        console.log('[DEBUG MAHINDRA FOUND]', idx, { 
                          label, fam, brand, model, 
                          statusKeys, 
                          statusValues,
                          hasActiveRow: statusValues.some(v => String(v.status || '').trim().toLowerCase() === 'active')
                        });
                      }
                    });
                  }
                  
                  const inv = invRaw.filter((entry) => {
                    try {
                      const statusMap = entry?.pricingStatusByRow || {};
                      const keys = Object.keys(statusMap);
                      if (keys.length === 0) return true;
                      for (const key of keys) {
                        const raw = String(statusMap[key] || '').trim().toLowerCase();
                        if (raw === 'active') return true;
                      }
                      return false;
                    } catch {
                      return true;
                    }
                  });
                  
                  if (isDummyMode) {
                    console.log('[DEBUG inv filtered count]', inv.length);
                  }
                  const ids = [displayNode?.id, selectedParent?.id, node?.id].map((x) => String(x || ''));
                  const rootNameLocal = String(categoryTree?.name || '').toLowerCase();
                  const isDrivingLocal = rootNameLocal === 'driving school';

                  const pickBaselinePrice = () => {
                    let invPrice = null;
                    inv.forEach((entry) => {
                      if (invPrice != null) return;
                      const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
                      if (!pbr) return;
                      for (const target of ids) {
                        if (!target) continue;
                        for (const [rk, val] of Object.entries(pbr)) {
                          const parts = String(rk).split('|');
                          if (parts.some((id) => String(id) === target)) {
                            const num = Number(val);
                            if (!Number.isNaN(num)) { invPrice = num; break; }
                          }
                        }
                        if (invPrice != null) break;
                      }
                    });
                    const nodePrice =
                      (displayNode.vendorPrice ?? displayNode.price) ??
                      (selectedParent?.vendorPrice ?? selectedParent?.price) ??
                      (node.vendorPrice ?? node.price) ?? null;
                    return (invPrice != null) ? invPrice : nodePrice;
                  };

                  // For Driving School, make price aware of current brand/model/transmission/bodyType selections
                  if (isDrivingLocal && inv.length > 0) {
                    const targetId = String((displayNode?.id || selectedParent?.id || node?.id || ''));
                    const normalized = [];
                    inv.forEach((entry) => {
                      try {
                        const fam = String(entry?.scopeFamily || '').toLowerCase();
                        const sels = entry?.selections || {};
                        let sel = sels[fam] || sels.cars || sels.bikes || {};
                        if (!sel || typeof sel !== 'object') sel = {};
                        
                        if (isDummyMode && entry?.scopeLabel && String(entry.scopeLabel).includes('MAHINDRA')) {
                          console.log('[DEBUG MAHINDRA]', { fam, sel, entry });
                        }
                        
                        if (fam === 'bikes') {
                          const brand = sel.bikeBrand != null ? String(sel.bikeBrand).trim() : (sel.brand != null ? String(sel.brand).trim() : '');
                          const transmission = sel.bikeTransmission != null ? String(sel.bikeTransmission).trim() : (sel.transmission != null ? String(sel.transmission).trim() : '');
                          const model = sel.model != null ? String(sel.model).trim() : '';
                          normalized.push({ family: fam, brand, model, transmission, bodyType: null, entry });
                        } else if (fam === 'cars') {
                          const brand = sel.brand != null ? String(sel.brand).trim() : '';
                          const transmission = sel.transmission != null ? String(sel.transmission).trim() : '';
                          const model = sel.model != null ? String(sel.model).trim() : '';
                          const bodyType = sel.bodyType != null ? String(sel.bodyType).trim() : '';
                          normalized.push({ family: fam, brand, model, transmission, bodyType, entry });
                        }
                      } catch {}
                    });

                    const minPriceForList = (list) => {
                      try {
                        const prices = [];
                        list.forEach((n) => {
                          const pbr =
                            n.entry &&
                            n.entry.pricesByRow &&
                            typeof n.entry.pricesByRow === 'object'
                              ? n.entry.pricesByRow
                              : null;
                          if (!pbr) return;
                          for (const [key, value] of Object.entries(pbr)) {
                            const ids = String(key).split('|');
                            if (!ids.some((id) => String(id) === targetId)) continue;
                            if (typeof rowPricingIsActive === 'function' && !rowPricingIsActive(n.entry, key)) continue;
                            const num = Number(value);
                            if (!Number.isNaN(num)) prices.push(num);
                          }
                        });
                        if (!prices.length) return null;
                        return Math.min(...prices);
                      } catch {
                        return null;
                      }
                    };

                    const carBrand = String(attrSelections?.brand ?? '').trim() || null;
                    const carModel = String(attrSelections?.model ?? '').trim() || null;
                    const carTrans = String(attrSelections?.transmission ?? '').trim() || null;
                    const carBody = String(attrSelections?.bodyType ?? '').trim() || null;
                    const bikeBrand = String(attrSelections?.bikeBrand ?? '').trim() || null;
                    const bikeModel = String(attrSelections?.bikeModel ?? '').trim() || null;
                    const bikeTrans = String(attrSelections?.bikeTransmission ?? '').trim() || null;

                    const refined = normalized.filter((n) => {
                      const fam = String(n.family || '').toLowerCase();
                      const effBrand = fam === 'bikes' ? bikeBrand : carBrand;
                      const effModel = fam === 'bikes' ? bikeModel : carModel;
                      const effTrans = fam === 'bikes' ? bikeTrans : carTrans;
                      const effBody = fam === 'cars' ? carBody : null;
                      if (effBrand && String(n.brand) !== String(effBrand)) return false;
                      if (effModel && String(n.model) !== String(effModel)) return false;
                      if (effTrans && String(n.transmission) !== String(effTrans)) return false;
                      if (effBody && n.bodyType && String(n.bodyType) !== String(effBody)) return false;
                      return true;
                    });

                    const attrAwarePrice = refined.length ? minPriceForList(refined) : null;
                    const fallback = pickBaselinePrice();
                    const resolvedPrice = (attrAwarePrice != null) ? attrAwarePrice : fallback;
                    if (resolvedPrice == null || Number(resolvedPrice) === 0) return null;
                    return (<p className="unified-price">₹ {resolvedPrice}</p>);
                  }

                  const resolvedPrice = pickBaselinePrice();
                  if (resolvedPrice == null || Number(resolvedPrice) === 0) return null;
                  return (<p className="unified-price">₹ {resolvedPrice}</p>);
                } catch { return null; }
              })()}
              {(() => {
                try {
                  const linked = (categoryTree && categoryTree.linkedAttributes && typeof categoryTree.linkedAttributes === 'object') ? categoryTree.linkedAttributes : {};
                  // Build case-insensitive index of families from linkedAttributes
                  const famIndex = new Map(); // famLower -> { base, fields, modelFields, linkedSub, specificSubs: Set }
                  Object.keys(linked).forEach((k) => {
                    const parts = String(k).split(':');
                    const fam = parts[0] || '';
                    const lower = String(fam || '').toLowerCase();
                    const curr = famIndex.get(lower) || { base: fam, fields: [], modelFields: [], linkedSub: null, specificSubs: new Set() };
                    const last = parts[parts.length - 1];
                    if (parts.length === 1) {
                      // e.g., 'cars' -> fields list
                      curr.fields = Array.isArray(linked[k]) ? linked[k].map(String) : curr.fields;
                    } else if (parts.length === 2 && parts[1] === 'modelFields') {
                      curr.modelFields = Array.isArray(linked[k]) ? linked[k].map(String) : curr.modelFields;
                    } else if (last === 'linkedSubcategory') {
                      const raw = linked[k];
                      const vals = Array.isArray(raw) ? raw.map((v) => String(v || '')) : [String(raw || '')];
                      if (parts.length === 2) {
                        // fam:linkedSubcategory -> family-level
                        curr.linkedSub = vals[0] || '';
                      } else {
                        // fam:<something>:linkedSubcategory -> specific mapping for labels/inventory
                        vals.forEach((v) => { if (v) curr.specificSubs.add(v); });
                      }
                    }
                    famIndex.set(lower, curr);
                  });
                  // Families allowed to render with precedence: specific match > family-level match; treat 'ALL' as global only if no specific mappings exist
                  const targetIdsLinkedAttrs = [displayNode?.id, selectedParent?.id, node?.id].map((x) => String(x || ''));
                  let familiesAllLower = new Set(
                    Array.from(famIndex.entries())
                      .filter(([, v]) => {
                        // Specific mappings take precedence
                        const hasSpecific = v.specificSubs && v.specificSubs.size > 0;
                        if (hasSpecific) {
                          return targetIdsLinkedAttrs.some((tid) => tid && v.specificSubs.has(String(tid)));
                        }
                        // Then check family-level
                        const ls = v.linkedSub;
                        if (!ls) return true; // Include families without explicit mapping
                        if (ls === 'ALL') return true;
                        return targetIdsLinkedAttrs.some((tid) => tid && String(ls) === String(tid));
                      })
                      .map(([k]) => k)
                  );
                  if (familiesAllLower.size === 0) {
                    familiesAllLower = new Set(Array.from(famIndex.keys()));
                  }
                  const catKey = String(categoryId || '');
                  const invPriceListRaw = Array.isArray(vendor?.inventorySelections?.[catKey]) ? vendor.inventorySelections[catKey] : [];
                  // Filter out entries where ALL rows are inactive
                  const invPriceList = invPriceListRaw;
                  // Filter inventory entries based on linkedAttributes mapping and active status
                  // IMPORTANT: Use the specific current node ID for row-level active status check
                  const currentDisplayNodeId = String(displayNode?.id || selectedParent?.id || node?.id || '');
                  
                  // Helper to check if entry matches linkedAttributes mapping
                  const matchesLinkedAttrs = (e) => {
                    const famLower = String(e?.scopeFamily || '').toLowerCase();
                    // If scopeFamily is missing, don't exclude the inventory entry.
                    // Some inventories (especially those without pricing) may not have scopeFamily filled,
                    // but they should still show in preview.
                    if (!famLower) return true;
                    if (!familiesAllLower.has(famLower)) return false;
                    const fam = String(e?.scopeFamily || '');
                    const label = String(e?.scopeLabel || '');
                    const specificKey = `${fam}:${label}:linkedSubcategory`;
                    const genericLabelKey = `${fam}:inventoryLabels:linkedSubcategory`;
                    const familyKey = `${fam}:linkedSubcategory`;
                    let mapped = undefined;
                    if (Array.isArray(linked[specificKey]) && linked[specificKey].length) mapped = String(linked[specificKey][0] || '');
                    else if (Array.isArray(linked[genericLabelKey]) && linked[genericLabelKey].length) mapped = String(linked[genericLabelKey][0] || '');
                    else if (Array.isArray(linked[familyKey]) && linked[familyKey].length) mapped = String(linked[familyKey][0] || '');
                    if (!mapped) return false;
                    return mapped === 'ALL' || targetIdsLinkedAttrs.some((tid) => tid && String(mapped) === String(tid));
                  };
                  
                  // Helper to check if entry has active pricing for current node
                  const hasActivePricing = (e) => {
                    const pbr = e && e.pricesByRow && typeof e.pricesByRow === 'object' ? e.pricesByRow : null;
                    const statusMap = e && e.pricingStatusByRow && typeof e.pricingStatusByRow === 'object' ? e.pricingStatusByRow : {};
                    
                    if (!pbr) return false;
                    
                    const hasStatusMap = Object.keys(statusMap).length > 0;
                    for (const [rk] of Object.entries(pbr)) {
                      const parts = String(rk).split('|');
                      if (!parts.some((id) => String(id) === currentDisplayNodeId)) continue;
                      if (!hasStatusMap) return false;
                      if (!Object.prototype.hasOwnProperty.call(statusMap, rk)) continue;
                      const raw = String(statusMap[rk] || '').trim().toLowerCase();
                      if (raw === 'active') return true;
                    }
                    return false;
                  };
                  
                  // UPDATED: Show all inventory entries by family first (no price required)
                  // This ensures active inventories without prices are always displayed
                  let entriesAll = invPriceList.filter((e) => {
                    const famLower = String(e?.scopeFamily || '').toLowerCase();
                    // If scopeFamily is missing, include the entry instead of dropping it.
                    // This prevents active inventories without pricing/family metadata from disappearing.
                    if (!famLower) return true;
                    return familiesAllLower.has(famLower);
                  });
                  
                  // If no entries by family, try linkedAttributes mapping
                  if (entriesAll.length === 0) {
                    entriesAll = invPriceList.filter((e) => matchesLinkedAttrs(e));
                  }
                  
                  // If still none, try any entry with active pricing
                  if (entriesAll.length === 0) {
                    entriesAll = invPriceList.filter((e) => hasActivePricing(e));
                  }
                  
                  // Prefer entries that have a pricesByRow targeting this card's node ids
                  const entriesMatched = entriesAll.filter((entry) => {
                    try {
                      const pbr = entry && entry.pricesByRow && typeof entry.pricesByRow === 'object' ? entry.pricesByRow : null;
                      if (!pbr) return true; // include entries without prices
                      for (const rk of Object.keys(pbr)) {
                        const parts = String(rk).split('|');
                        const matchesIds = targetIds.some(
                          (tid) => tid && parts.some((id) => String(id) === tid)
                        );
                        if (!matchesIds) continue;
                        if (typeof rowPricingIsActive === 'function' && !rowPricingIsActive(entry, rk)) {
                          continue;
                        }
                        return true;
                      }
                      return false;
                    } catch { return false; }
                  });
                  const entries = entriesMatched.length > 0 ? entriesMatched : entriesAll;
                  
                  // FIX: Filter entries by scopeFamily matching the node's family
                  // Map node names to inventory scopeFamily values
                  const nodeIdForFamily = String(node?.id || '');
                  const nodeName = String(node?.name || '').trim().toLowerCase();
                  
                  // Direct mapping from node name to scopeFamily
                  // Based on category structure: Four Wheeler->cars, Two Wheeler->bikes
                  // Commercial Vehicles has NO inventory in this vendor's data
                  const nodeNameToFamily = {
                    'four wheeler': 'cars',
                    'two wheeler': 'bikes',
                    // 'commercial vehicles' intentionally NOT mapped - has no inventory
                  };
                  
                  const linkedFamilyForNode = nodeNameToFamily[nodeName] || null;
                  
                  // If no family mapping exists, show all entries (allows categories without inventory to render)
                  const filteredEntries = linkedFamilyForNode 
                    ? entriesAll.filter((entry) => {
                        const entryScopeFamily = String(entry?.scopeFamily || '').trim().toLowerCase();
                        // If the entry has no scopeFamily, keep it (can't reliably map it to a family).
                        if (!entryScopeFamily) return true;
                        return entryScopeFamily === linkedFamilyForNode;
                      })
                    : entriesAll;
                  
                  const finalEntries = filteredEntries;
                  
                  let blocks = finalEntries.map((entry, idx) => {
                    const fam = String(entry?.scopeFamily || '');
                    const famLower = fam.toLowerCase();
                    let sel = {};
                    try {
                      const sels = entry?.selections || {};
                      if (sels && typeof sels === 'object') {
                        if (sels[fam]) sel = sels[fam];
                        else {
                          const key = Object.keys(sels).find((k) => String(k).toLowerCase() === famLower);
                          if (key) sel = sels[key];
                        }
                      }
                    } catch { sel = {}; }
                    // Normalize known alias keys per family
                    if (famLower === 'bikes') {
                      try {
                        let nextSel = sel || {};
                        if (nextSel.brand && !nextSel.bikeBrand) nextSel = { ...nextSel, bikeBrand: nextSel.brand };
                        if (nextSel.model && !nextSel.bikeModel) nextSel = { ...nextSel, bikeModel: nextSel.model };
                        // Remove shared car keys so bikes do not interfere with car filters
                        if (Object.prototype.hasOwnProperty.call(nextSel, 'brand') || Object.prototype.hasOwnProperty.call(nextSel, 'model')) {
                          const { brand: _b, model: _m, ...rest } = nextSel;
                          nextSel = rest;
                        }
                        sel = nextSel;
                      } catch {}
                    }
                    const conf = famIndex.get(famLower) || { fields: [], modelFields: [] };
                    const allowed = new Set([...(conf.fields || []), ...(conf.modelFields || [])].map(String));
                    if (famLower === 'cars' || famLower === 'bikes') {
                      ['brand', 'bikeBrand', 'model', 'bikeModel', 'transmission', 'bikeTransmission', 'bodyType'].forEach((k) => {
                        allowed.add(String(k));
                      });
                    }
                    let pairs = Object.entries(sel).filter(([k, v]) => {
                      if (v == null || String(v).trim() === '') return false;
                      return (allowed.size === 0 || allowed.has(String(k)));
                    });
                    // If nothing passed the allowed filter, fall back to all non-empty keys
                    if (pairs.length === 0) {
                      pairs = Object.entries(sel).filter(([k, v]) => v != null && String(v).trim() !== '');
                    }
                    return { key: entry._id || entry.at || idx, pairs, sel, fam: famLower, entry };
                  });
                  // Fallback: if no blocks created, create blocks for ALL filteredEntries
                  // This ensures all active inventory entries appear even without attribute pairs
                  if (blocks.length === 0 && filteredEntries.length > 0) {
                    blocks = filteredEntries.map((entry, idx) => {
                      const fam = String(entry?.scopeFamily || '');
                      const famLower = fam.toLowerCase();
                      const sels = entry?.selections || {};
                      let sel = {};
                      if (sels[fam]) sel = sels[fam];
                      else {
                        const key = Object.keys(sels).find((k) => String(k).toLowerCase() === famLower);
                        if (key) sel = sels[key];
                      }
                      const pairs = Object.entries(sel).filter(([k, v]) => v != null && String(v).trim() !== '');
                      return { key: entry._id || entry.at || idx, pairs, sel, fam: famLower, entry };
                    });
                  }
                  if (blocks.length === 0) {
                    return null;
                  }

                  // Build combo options: each inventory selection becomes one combo
                  const dropdownKey = String(node?.id || 'global');

                  const combos = blocks.map((b) => {
                    const sel = b.sel || {};
                    const famLower = String(b.fam || sel.family || '').toLowerCase();
                    const isBike = famLower === 'bikes';
                    const brand = isBike
                      ? (sel.bikeBrand || sel.brand || '')
                      : (sel.brand || '');
                    const model = isBike
                      ? (sel.bikeModel || sel.model || '')
                      : (sel.model || '');
                    const transmission = isBike
                      ? (sel.bikeTransmission || sel.transmission || '')
                      : (sel.transmission || '');
                    const bodyType = !isBike ? (sel.bodyType || '') : '';
                    return {
                      key: b.key,
                      brand: String(brand || '').trim(),
                      model: String(model || '').trim(),
                      transmission: String(transmission || '').trim(),
                      bodyType: String(bodyType || '').trim(),
                      isBike,
                    };
                  });

                  if (!combos.length) {
                    return null;
                  }

                  const current = attrSelections || {};
                  const activeIndex = combos.findIndex((c) => {
                    if (c.isBike) {
                      return (
                        (!current.bikeBrand || String(current.bikeBrand) === c.brand) &&
                        (!current.bikeModel || String(current.bikeModel) === c.model) &&
                        (!current.bikeTransmission || String(current.bikeTransmission) === c.transmission)
                      );
                    }
                    return (
                      (!current.brand || String(current.brand) === c.brand) &&
                      (!current.model || String(current.model) === c.model) &&
                      (!current.transmission || String(current.transmission) === c.transmission) &&
                      (!current.bodyType || String(current.bodyType) === c.bodyType)
                    );
                  });
                  const activeCombo = activeIndex >= 0 ? combos[activeIndex] : null;

                  // If nothing is selected yet but we have combos, auto-select
                  // the first combo so that both the label and price reflect a
                  // concrete vehicle instead of the generic placeholder.
                  if (
                    !activeCombo &&
                    Array.isArray(combos) &&
                    combos.length &&
                    !current.brand &&
                    !current.model &&
                    !current.transmission &&
                    !current.bodyType &&
                    !current.bikeBrand &&
                    !current.bikeModel &&
                    !current.bikeTransmission
                  ) {
                    const first = combos[0];
                    try {
                      // Reuse the same mapping logic as handleSelectCombo
                      setAttrSelections((prev) => {
                        const next = { ...(prev || {}) };
                        if (first.isBike) {
                          next.bikeBrand = first.brand || undefined;
                          next.bikeModel = first.model || undefined;
                          next.bikeTransmission = first.transmission || undefined;
                          delete next.brand;
                          delete next.model;
                          delete next.transmission;
                          delete next.bodyType;
                        } else {
                          next.brand = first.brand || undefined;
                          next.model = first.model || undefined;
                          next.transmission = first.transmission || undefined;
                          next.bodyType = first.bodyType || undefined;
                          delete next.bikeBrand;
                          delete next.bikeModel;
                          delete next.bikeTransmission;
                        }
                        return next;
                      });
                    } catch {}
                  }

                  const buildLabel = (c, idx) => {
                    const parts = [];
                    if (c.brand) parts.push(c.brand);
                    if (c.model) parts.push(c.model);
                    if (c.transmission) parts.push(c.transmission);
                    if (!c.isBike && c.bodyType) parts.push(c.bodyType);
                    if (!parts.length) return idx !== undefined ? `Vehicle ${idx + 1}` : 'Select Vehicle';
                    return parts.join(' ');
                  };

                  const triggerLabel = activeCombo
                    ? buildLabel(activeCombo, combos.indexOf(activeCombo))
                    : (Array.isArray(combos) && combos.length
                        ? buildLabel(combos[0], 0)
                        : 'Select Vehicle');

                  const handleSelectCombo = (combo, idx) => {
                    setAttrSelections((prev) => {
                      const next = { ...(prev || {}) };
                      // Store the full inventory name for enquiries
                      const fullLabel = buildLabel(combo, idx);
                      next.inventoryName = fullLabel || undefined;
                      
                      if (combo.isBike) {
                        next.bikeBrand = combo.brand || undefined;
                        next.bikeModel = combo.model || undefined;
                        next.bikeTransmission = combo.transmission || undefined;
                        delete next.brand;
                        delete next.model;
                        delete next.transmission;
                        delete next.bodyType;
                      } else {
                        next.brand = combo.brand || undefined;
                        next.model = combo.model || undefined;
                        next.transmission = combo.transmission || undefined;
                        next.bodyType = combo.bodyType || undefined;
                        delete next.bikeBrand;
                        delete next.bikeModel;
                        delete next.bikeTransmission;
                      }
                      Object.keys(next).forEach((k) => {
                        if (next[k] === undefined || next[k] === '') delete next[k];
                      });
                      return next;
                    });
                    setAttrDropdownOpen((prev) => ({ ...(prev || {}), [dropdownKey]: false }));
                  };

                  attributeDropdown = (
                    <div style={{ marginTop: 8, marginBottom: 15, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ fontSize: 11, fontWeight: 400, color: 'black', marginLeft: 2 }}>
      {attributesHeading || "Select Model"}
    </div>
                      {/* <div style={{ fontSize: 11, fontWeight: 500, color: '#e5e7eb', marginLeft: 2 }}>
                        Select model:
                      </div> */}
                      <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setAttrDropdownOpen((prev) => {
                              const current = prev && prev[dropdownKey];
                              return { ...(prev || {}), [dropdownKey]: !current };
                            })
                          }
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            minWidth: 220,
                            padding: '10px 16px',
                            borderRadius: 999,
                            border: '1px solid rgba(148, 163, 184, 0.9)',
                            background: '#ffffff',
                            color: '#111827',
                            boxShadow: '0 6px 18px rgba(15, 23, 42, 0.18)',
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 600,
                            letterSpacing: 0.2,
                            transition: 'transform 160ms ease, box-shadow 160ms ease, background 160ms ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 10px 24px rgba(15, 23, 42, 0.28)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 6px 18px rgba(15, 23, 42, 0.18)';
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {triggerLabel}
                          </span>
                          <span style={{ fontSize: 20, lineHeight: 1 }}>▾</span>
                        </button>

                        {!!attrDropdownOpen?.[dropdownKey] && (
                          <div
                            style={{
                              marginTop: 8,
                              zIndex: 1,
                              width: '100%',
                              maxHeight: '45vh',
                              overflowY: 'auto',
                              padding: 8,
                              borderRadius: 14,
                              background: 'rgba(255, 255, 255, 0.98)',
                              boxShadow: '0 20px 45px rgba(15, 23, 42, 0.25)',
                              overscrollBehavior: 'contain',
                            }}
                          >
                            {combos.map((combo, idx) => {
                              const lineText = buildLabel(combo, idx);
                              return (
                                <button
                                  key={combo.key}
                                  type="button"
                                  onClick={() => handleSelectCombo(combo, idx)}
                                  style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '8px 10px',
                                    marginBottom: 4,
                                    borderRadius: 10,
                                    border: '1px solid rgba(148, 163, 184, 0.8)',
                                    background: '#ffffff',
                                    color: '#0f172a',
                                    cursor: 'pointer',
                                    fontSize: 12,
                                    transition: 'background 140ms ease, transform 140ms ease, box-shadow 140ms ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = '#e5f0ff';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.18)';
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = '#ffffff';
                                    e.currentTarget.style.boxShadow = 'none';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                  }}
                                >
                                  <span
                                    style={{
                                      display: 'block',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {lineText || '—'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}

          {showMyEnquiriesModal && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 2300,
              }}
            >
              <div
                style={{
                  background: "#ffffff",
                  padding: 16,
                  borderRadius: 10,
                  width: "95vw",
                  maxWidth: 900,
                  maxHeight: "85vh",
                  overflow: "auto",
                  fontFamily:
                    "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
                }}
              >
                <div
                style={{
                  display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {expandedEnquiryGroup && (
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          setExpandedEnquiryGroup(null);
                          setExpandedEnquiryId(null);
                        } catch {}
                      }}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 9999,
                        border: "1px solid #e5e7eb",
                        background: "#f9fafb",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      ← 
                    </button>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <h3 style={{ margin: 0 }}>
                      {(() => {
                        try {
                          if (!expandedEnquiryGroup) return "My Enquiries";
                          const raw = String(expandedEnquiryGroup || "");
                          const parts = raw.split("|");
                          const label = (parts[0] || "").trim();
                          return label || "My Enquiries";
                        } catch {
                          return "My Enquiries";
                        }
                      })()}
                    </h3>
                    {!expandedEnquiryGroup && Array.isArray(myEnquiries) && myEnquiries.length > 0 && (
                      <span
                        style={{
  fontSize: 12,
  fontWeight: 600,
  color: "#0369a1",
  background: "#e0f2fe",
  borderRadius: 9999,
  padding: "3px 10px",
}}
                      >
                        {myEnquiries.length}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMyEnquiriesModal(false)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "9999px",
                    border: "1px solid #e5e7eb",
                    background: "#f9fafb",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ×
                </button>
                </div>

                {myEnquiriesLoading ? (
                  <div style={{ padding: 12 }}>Loading enquiries...</div>
                ) : myEnquiriesError ? (
                  <div
                    style={{
                      padding: 12,
                      color: "#b91c1c",
                      background: "#fee2e2",
                      border: "1px solid #fecaca",
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                  >
                    {myEnquiriesError}
                  </div>
                ) : (
                  (() => {
                    try {
                      const cfgList = Array.isArray(enquiryStatusConfig)
                        ? enquiryStatusConfig
                        : [];
                      const cfgByName = new Map();
                      // Build config map and seed groups for each configured status
                      cfgList.forEach((row, idx) => {
                        const nm = (row && row.name != null ? String(row.name) : "").trim();
                        if (!nm) return;
                        const baseRank =
                          row && typeof row.rank === "number" && !Number.isNaN(row.rank)
                            ? row.rank
                            : idx + 1;
                        cfgByName.set(nm, {
                          name: nm,
                          vendorLabel:
                            row && row.vendorLabel != null
                              ? String(row.vendorLabel)
                              : nm,
                          rank: baseRank,
                          mode: row.mode || "action-required",
                          nextStatuses: Array.isArray(row.nextStatuses) ? row.nextStatuses : [],
                        });
                      });

                      const groupsMap = new Map();

                      // Seed one empty group per configured status so cards always show
                      cfgByName.forEach((cfg) => {
                        const key = `${cfg.rank}|${cfg.vendorLabel}`;
                        if (!groupsMap.has(key)) {
                          const contactNextStatus = Array.isArray(cfg.nextStatuses)
                            ? cfg.nextStatuses.find((nm) =>
                                typeof nm === "string" && nm.toLowerCase().includes("contact")
                              ) || null
                            : null;
                          groupsMap.set(key, {
                            label: cfg.vendorLabel,
                            rank: cfg.rank,
                            items: [],
                            statusName: cfg.name,
                            mode: cfg.mode,
                            nextStatuses: cfg.nextStatuses,
                            contactNextStatus,
                          });
                        }
                      });

                      // Optional 'Other' group for statuses not present in config
                      const getOrCreateOtherGroup = () => {
                        const key = "999999|Other";
                        let g = groupsMap.get(key);
                        if (!g) {
                          g = { label: "Other", rank: 999999, items: [] };
                          groupsMap.set(key, g);
                        }
                        return g;
                      };

                      (Array.isArray(myEnquiries) ? myEnquiries : []).forEach((enq) => {
                        try {
                          const rawStatus = enq && enq.status != null ? String(enq.status) : "";
                          const trimmed = rawStatus.trim();
                          const cfg = cfgByName.get(trimmed) || null;
                          if (cfg) {
                            const key = `${cfg.rank}|${cfg.vendorLabel}`;
                            const g = groupsMap.get(key);
                            if (g) {
                              g.items.push(enq);
                            }
                          } else {
                            // Unconfigured / empty statuses go to Other
                            const other = getOrCreateOtherGroup();
                            other.items.push(enq);
                          }
                        } catch {}
                      });

                      const groups = Array.from(groupsMap.values()).sort((a, b) => {
                        if (a.rank !== b.rank) return a.rank - b.rank;
                        return String(a.label || "").localeCompare(String(b.label || ""));
                      });

                      const statusPalette = [
                        {
                          background: "linear-gradient(135deg, #eff6ff, #e0f2fe)",
                          icon: "📄",
                        },
                        {
                          background: "linear-gradient(135deg, #f5f3ff, #e0f2fe)",
                          icon: "👁️",
                        },
                        {
                          background: "linear-gradient(135deg, #ecfdf5, #e0f2fe)",
                          icon: "📞",
                        },
                        {
                          background: "linear-gradient(135deg, #fef2f2, #fee2e2)",
                          icon: "✖️",
                        },
                        {
                          background: "linear-gradient(135deg, #ecfdf3, #dcfce7)",
                          icon: "✅",
                        },
                      ];

                      const formatDateTime = (value) => {
                        try {
                          if (!value) return "";
                          const d = new Date(value);
                          if (Number.isNaN(d.getTime())) return String(value);
                          return d.toLocaleString();
                        } catch {
                          return String(value);
                        }
                      };

                      const formatDate = (value) => {
                        try {
                          if (!value) return "";
                          const d = new Date(value);
                          if (Number.isNaN(d.getTime())) return String(value);
                          return d.toLocaleDateString(undefined, {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          });
                        } catch {
                          return String(value);
                        }
                      };

                      const formatTime = (value) => {
                        try {
                          if (!value) return "";
                          const d = new Date(value);
                          if (Number.isNaN(d.getTime())) return "";
                          return d.toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          });
                        } catch {
                          return "";
                        }
                      };

                      return (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                            gap: 16,
                            alignItems: "stretch",
                          }}
                        >
                          {groups.map((g, idx) => {
                            const groupKey = `${g.label}|${g.rank}`;
                            const isExpanded = expandedEnquiryGroup === groupKey;
                            const visuals =
                              statusPalette[idx % statusPalette.length] || {
                                background: "#ffffff",
                                icon: "📩",
                              };

                            // When one group is expanded, hide all other groups
                            if (expandedEnquiryGroup && !isExpanded) {
                              return null;
                            }

                            return (
                              <div
                                key={`${g.label}|${g.rank}|${idx}`}
                                onClick={() => {
                                  try {
                                    if (!g.items || g.items.length === 0) return;
                                    if (expandedEnquiryGroup === groupKey) return;
                                    setExpandedEnquiryGroup(groupKey);
                                  } catch {}
                                }}
                                style={{
                                  border: "1px solid #e5e7eb",
                                  borderRadius: 16,
                                  padding: 16,
                                  background: visuals.background,
                                  display: "flex",
                                  flexDirection: "column",
                                  justifyContent: "space-between",
                                  minHeight: 150,
                                  boxShadow:
                                    "0 12px 30px rgba(15, 23, 42, 0.06)",
                                  transition:
                                    "box-shadow 0.2s ease-in-out, transform 0.15s ease-in-out",
                                  cursor: g.items && g.items.length > 0 ? "pointer" : "default",
                                }}
                              >
                                {/* Only show the icon + label + count header when NOT expanded */}
                                {!isExpanded && (
                                  <div
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      gap: 6,
                                      marginBottom: 12,
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: 6,
                                        fontWeight: 700,
                                        color: "#020617",
                                        fontSize: 14,
                                        letterSpacing: 0.1,
                                        textAlign: "center",
                                      }}
                                    >
                                      <span
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          width: 28,
                                          height: 28,
                                          borderRadius: "9999px",
                                          background: "rgba(255,255,255,0.8)",
                                          fontSize: 14,
                                        }}
                                      >
                                        {visuals.icon}
                                      </span>
                                      <span>{g.label}</span>
                                    </div>
                                    <div
                                      style={{
                                        fontSize: 12,
                                        color: "#0f172a",
                                        background: "rgba(15,23,42,0.04)",
                                        borderRadius: 9999,
                                        padding: "3px 12px",
                                        border: "1px solid #dbeafe",
                                        fontWeight: 600,
                                      }}
                                    >
                                      {g.items.length}
                                    </div>
                                  </div>
                                )}
                                <div style={{ overflowX: "auto" }}>
                                  {(!g.items || g.items.length === 0) ? null : (
                                    <>
                                      {isExpanded ? (
                                        <>
                                          <div
                                            style={{
                                              display: "grid",
                                              gridTemplateColumns:
                                                expandedEnquiryId != null || (g.items || []).length <= 1
                                                  ? "minmax(0, 1fr)"
                                                  : "repeat(2, minmax(0, 1fr))",
                                              gap: 12,
                                              maxHeight: 360,
                                              overflowY: "auto",
                                              paddingRight: 4,
                                              paddingBottom: 4,
                                              maxWidth: 880,
                                              margin: "0 auto",
                                            }}
                                          >
                                            {(g.items || []).map((enq, i2) => {
                                              const path = Array.isArray(enq?.categoryPath)
                                                ? enq.categoryPath.map((v) => String(v || ""))
                                                : [];
                                              const leafLabel = path.length > 0 ? path[path.length - 1] : enq?.serviceName || "";
                                              const parentLabel = path.length > 1 ? path[path.length - 2] : path[0] || "";
                                              let priceText = "";
                                              if (enq?.price != null && enq.price !== "") {
                                                priceText = `₹${enq.price}`;
                                              }
                                              // Use latest status change time for display date/time
                                              let displayTimestamp = enq?.createdAt;
                                              try {
                                                if (Array.isArray(enq?.statusHistory) && enq.statusHistory.length > 0) {
                                                  const lastEntry = enq.statusHistory[enq.statusHistory.length - 1];
                                                  if (lastEntry && lastEntry.changedAt) {
                                                    displayTimestamp = lastEntry.changedAt;
                                                  }
                                                }
                                              } catch {}

                                              const dateText = formatDate(displayTimestamp);
                                              const timeText = formatTime(displayTimestamp);

                                              let thumbSrc = "";
                                              try {
                                                const attrsObjForImg =
                                                  enq?.attributes && typeof enq.attributes === "object"
                                                    ? enq.attributes
                                                    : {};
                                                const raw =
                                                  attrsObjForImg.imageUrl ||
                                                  attrsObjForImg.img ||
                                                  attrsObjForImg.photo ||
                                                  attrsObjForImg.thumbnail ||
                                                  "";
                                                const s = String(raw || "");
                                                const normalizeImg = (val) => {
                                                  const str = String(val || "");
                                                  if (!str) return "";
                                                  if (str.startsWith("http://") || str.startsWith("https://") || str.startsWith("data:")) {
                                                    return str;
                                                  }
                                                  const pathPart = str.startsWith("/") ? str : `/${str}`;
                                                  return `${ASSET_BASE_URL || API_BASE_URL}${pathPart}`;
                                                };

                                                if (s) {
                                                  thumbSrc = normalizeImg(s);
                                                }

                                                // If no explicit image on the enquiry, fall back to vendor/category images
                                                if (!thumbSrc) {
                                                  let fallback = "";
                                                  if (Array.isArray(vendor?.profilePictures) && vendor.profilePictures.length) {
                                                    fallback = normalizeImg(vendor.profilePictures[0]);
                                                  }
                                                  if (!fallback && Array.isArray(categoryProfilePictures) && categoryProfilePictures.length) {
                                                    fallback = normalizeImg(categoryProfilePictures[0]);
                                                  }
                                                  thumbSrc = fallback;
                                                }
                                              } catch {}

                                              const attrsObj =
                                                enq?.attributes && typeof enq.attributes === "object"
                                                  ? enq.attributes
                                                  : {};
                                              const inventoryLabel =
                                                typeof attrsObj.inventoryName === "string" && attrsObj.inventoryName.trim()
                                                  ? attrsObj.inventoryName.trim()
                                                  : leafLabel || "";

                                              const primaryHeadingValue =
                                                typeof attrsObj.primaryHeadingValue === "string" && attrsObj.primaryHeadingValue.trim()
                                                  ? attrsObj.primaryHeadingValue.trim()
                                                  : "";

                                              const courseTypeLabel =
                                                primaryHeadingValue ||
                                                (typeof attrsObj.courseType === "string" && attrsObj.courseType.trim()
                                                  ? attrsObj.courseType.trim()
                                                  : inventoryLabel || leafLabel || "");

                                              const selectorLabelFromAttrsRaw =
                                                typeof attrsObj.parentSelectorLabel === "string" && attrsObj.parentSelectorLabel.trim()
                                                  ? attrsObj.parentSelectorLabel.trim()
                                                  : "";

                                              const selectorOverrideLabel =
                                                typeof attrsObj.primaryHeadingLabel === "string" && attrsObj.primaryHeadingLabel.trim()
                                                  ? attrsObj.primaryHeadingLabel.trim()
                                                  : "";

                                              const selectorLabelFromAttrs = selectorOverrideLabel || selectorLabelFromAttrsRaw;

                                              const isDetailsOpen = expandedEnquiryId === (enq?._id || i2);

                                              if (expandedEnquiryId && !isDetailsOpen) {
                                                return null;
                                              }

                                              return (
                                                <div
                                                  key={`${g.label}|card|${enq?._id || i2}`}
                                                  style={{
                                                    borderRadius: 12,
                                                    border: "1px solid #e5e7eb",
                                                    background: "#ffffff",
                                                    boxShadow: "0 6px 18px rgba(15,23,42,0.05)",
                                                    padding: 10,
                                                  }}
                                                >
                                                  <div
                                                    style={{
                                                      display: "flex",
                                                      alignItems: "center",
                                                      gap: 10,
                                                      marginBottom: 8,
                                                    }}
                                                  >
                                                    {thumbSrc ? (
                                                      <img
                                                        src={thumbSrc}
                                                        alt={inventoryLabel || leafLabel || "enquiry"}
                                                        style={{
                                                          width: 72,
                                                          height: 72,
                                                          borderRadius: 12,
                                                          objectFit: "cover",
                                                        }}
                                                      />
                                                    ) : (
                                                      <div
                                                        style={{
                                                          width: 72,
                                                          height: 72,
                                                          borderRadius: 12,
                                                          background: "#e5e7eb",
                                                          display: "flex",
                                                          alignItems: "center",
                                                          justifyContent: "center",
                                                          fontSize: 22,
                                                          fontWeight: 600,
                                                          color: "#4b5563",
                                                        }}
                                                      >
                                                        {(inventoryLabel || leafLabel || "?")
                                                          .toString()
                                                          .trim()
                                                          .slice(0, 1)
                                                          .toUpperCase()}
                                                      </div>
                                                    )}
                                                    <div style={{ flex: 1 }}>
                                                      <div
                                                        style={{
                                                          display: "flex",
                                                          justifyContent: "space-between",
                                                          alignItems: "flex-start",
                                                          marginBottom: 2,
                                                        }}
                                                      >
                                                        <div>
                                                          <div
                                                            style={{
                                                              fontWeight: 700,
                                                              fontSize: 14,
                                                              color: "#111827",
                                                            }}
                                                          >
                                                            {courseTypeLabel || "-"}
                                                          </div>
                                                        </div>
                                                        {priceText && (
                                                          <div
                                                            style={{
                                                              fontWeight: 800,
                                                              fontSize: 18,
                                                              color: "#16a34a",
                                                            }}
                                                          >
                                                            {priceText}
                                                          </div>
                                                        )}
                                                      </div>
                                                    </div>
                                                  </div>

                                                  <div
                                                    style={{
                                                      display: "flex",
                                                      alignItems: "center",
                                                      gap: 12,
                                                      fontSize: 11,
                                                      marginTop: 4,
                                                      marginBottom: 6,
                                                      color: "#4b5563",
                                                    }}
                                                  >
                                                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                      <span style={{ opacity: 0.7 }}>Date</span>
                                                      <span style={{ fontWeight: 600 }}>{dateText || "-"}</span>
                                                    </div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                      <span style={{ opacity: 0.7 }}>Time</span>
                                                      <span style={{ fontWeight: 600 }}>{timeText || "-"}</span>
                                                    </div>
                                                  </div>

                                                  <button
                                                    type="button"
                                                    onClick={async () => {
                                                      try {
                                                        const idVal = enq?._id || i2;

                                                        const willClose = expandedEnquiryId === idVal;

                                                        // Toggle details panel first
                                                        setExpandedEnquiryId((prev) =>
                                                          prev === idVal ? null : idVal
                                                        );

                                                        // For automatic groups WITHOUT contact info action,
                                                        // move to next status only when the vendor hides
                                                        // an already-open enquiry (i.e., on "Hide" click),
                                                        // not when first viewing it.
                                                        if (
                                                          willClose &&
                                                          g.mode !== "action-required" &&
                                                          !g.contactNextStatus &&
                                                          Array.isArray(g.nextStatuses) &&
                                                          g.nextStatuses.length > 0 &&
                                                          enq?._id
                                                        ) {
                                                          const rawNext = g.nextStatuses[0];
                                                          const nextLabel = typeof rawNext === "string" ? rawNext.trim() : String(rawNext || "").trim();
                                                          if (nextLabel) {
                                                            try {
                                                              await fetch(`${API_BASE_URL}/api/enquiries/${enq._id}/status`, {
                                                                method: "PUT",
                                                                headers: { "Content-Type": "application/json" },
                                                                body: JSON.stringify({ status: nextLabel }),
                                                              });
                                                              try {
                                                                const params = new URLSearchParams();
                                                                params.set("vendorId", String(vendorId));
                                                                params.set("categoryId", String(categoryId));
                                                                const res = await fetch(`${API_BASE_URL}/api/enquiries?${params.toString()}`, {
                                                                  cache: "no-store",
                                                                });
                                                                const list = await res.json().catch(() => []);
                                                                setMyEnquiries(Array.isArray(list) ? list : []);
                                                              } catch {}
                                                            } catch {}
                                                          }
                                                        }
                                                      } catch {}
                                                    }}
                                                    style={{
                                                      width: "100%",
                                                      padding: "6px 10px",
                                                      borderRadius: 9999,
                                                      border: "1px solid #e5e7eb",
                                                      background: "#f9fafb",
                                                      fontSize: 11,
                                                      fontWeight: 500,
                                                      color: "#111827",
                                                      cursor: "pointer",
                                                      marginTop: 4,
                                                    }}
                                                  >
                                                    {isDetailsOpen ? "Hide enquiry details" : "View enquiry details"}
                                                  </button>

                                                  {isDetailsOpen && (
                                                    <div
                                                      style={{
                                                        marginTop: 8,
                                                        padding: 10,
                                                        borderRadius: 10,
                                                        background: "#f9fafb",
                                                        border: "1px dashed #e5e7eb",
                                                        fontSize: 12,
                                                        lineHeight: 1.5,
                                                        color: "#374151",
                                                        position: "relative",
                                                      }}
                                                    >
                                                      {/* Next Status buttons at the top */}
                                                      {g.mode === "action-required" && Array.isArray(g.nextStatuses) && g.nextStatuses.length > 0 && (
                                                        <div style={{ marginBottom: 12 }}>
                                                          <div style={{ marginBottom: 6 }}><strong>Next Status</strong></div>
                                                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                                            {g.nextStatuses.map((ns, idxNs) => {
                                                              const label = typeof ns === "string" ? ns : String(ns || "");
                                                              if (!label.trim()) return null;
                                                              const isActive = String(enq.status || "").trim() === label.trim();
                                                              return (
                                                                <button
                                                                  key={`next-${enq._id || i2}-${idxNs}`}
                                                                  type="button"
                                                                  onClick={async () => {
                                                                    try {
                                                                      if (!enq._id) return;
                                                                      await fetch(`${API_BASE_URL}/api/enquiries/${enq._id}/status`, {
                                                                        method: "PUT",
                                                                        headers: { "Content-Type": "application/json" },
                                                                        body: JSON.stringify({ status: label }),
                                                                      });
                                                                      try {
                                                                        const params = new URLSearchParams();
                                                                        params.set("vendorId", String(vendorId));
                                                                        params.set("categoryId", String(categoryId));
                                                                        const res = await fetch(`${API_BASE_URL}/api/enquiries?${params.toString()}`, {
                                                                          cache: "no-store",
                                                                        });
                                                                        const list = await res.json().catch(() => []);
                                                                        setMyEnquiries(Array.isArray(list) ? list : []);
                                                                      } catch {}
                                                                    } catch {}
                                                                  }}
                                                                  style={{
  padding: "8px 18px",
  borderRadius: 9999,
  border: "none",
  background: "linear-gradient(135deg, #3b82f6, #6366f1)",
  color: "#ffffff",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  boxShadow: "0 4px 12px rgba(59, 130, 246, 0.35)",
  transition: "transform 0.15s ease, box-shadow 0.15s ease",
}}
                                                                >
                                                                  {label}
                                                                </button>
                                                              );
                                                            })}
                                                          </div>
                                                        </div>
                                                      )}
                                                      {/* Status changed timestamp removed; Date/Time above card now uses latest status change time */}
                                                      <div style={{ marginBottom: 4 }}>
                                                        <strong>Service:</strong>{" "}
                                                        {(() => {
                                                          if (Array.isArray(path) && path.length > 1) {
                                                            return path.slice(1).join(" > ");
                                                          }
                                                          if (Array.isArray(path) && path.length === 1) {
                                                            return path[0];
                                                          }
                                                          return enq?.serviceName || "-";
                                                        })()}
                                                      </div>
                                                      <div style={{ marginBottom: 4 }}>
                                                        <strong>Vehicle type:</strong>{" "}
                                                        {(() => {
                                                          try {
                                                            const attrs = attrsObj;
                                                            const label =
                                                              typeof attrs.inventoryName === "string" && attrs.inventoryName.trim()
                                                                ? attrs.inventoryName.trim()
                                                                : "-";
                                                            return label;
                                                          } catch {
                                                            return "-";
                                                          }
                                                        })()}
                                                      </div>
                                                      <div style={{ marginBottom: 4 }}>
                                                        <strong>Terms:</strong>{" "}
                                                        {(() => {
                                                          const raw = String(enq?.terms || "");
                                                          const parts = raw
                                                            .split(",")
                                                            .map((t) => t.trim())
                                                            .filter(Boolean);
                                                          if (!parts.length) return <span>-</span>;
                                                          return (
                                                            <ul style={{ margin: "4px 0 0", paddingLeft: 0, listStyle: "none" }}>
                                                              {parts.map((t, i) => (
                                                                <li
                                                                  key={i}
                                                                  style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 2 }}
                                                                >
                                                                  <span style={{ color: "#16a34a" }}>✅</span>
                                                                  <span style={{ fontWeight: 400 }}>{t}</span>
                                                                </li>
                                                              ))}
                                                            </ul>
                                                          );
                                                        })()}
                                                      </div>
                                                      <div style={{ marginBottom: 4 }}>
                                                        <strong>Source:</strong> {enq?.source || "-"}
                                                      </div>
                                                      {g.contactNextStatus && (
                                                        <div
                                                          style={{
                                                            position: "absolute",
                                                            top: 10,
                                                            right: 10,
                                                          }}
                                                        >
                                                          <button
                                                            type="button"
                                                            onClick={() => {
                                                              setContactInfoModal({ enquiry: enq, nextStatus: g.contactNextStatus });
                                                            }}
                                                            style={{
                                                              width: 28,
                                                              height: 28,
                                                              borderRadius: "9999px",
                                                              border: "none",
                                                              background: "#16a34a",
                                                              display: "flex",
                                                              alignItems: "center",
                                                              justifyContent: "center",
                                                              cursor: "pointer",
                                                              color: "#ffffff",
                                                              fontSize: 14,
                                                            }}
                                                          >
                                                            📞
                                                          </button>
                                                        </div>
                                                      )}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </>
                                      ) : (
                                        <div
                                          style={{
                                            marginTop: 6,
                                            fontSize: 11,
                                            textAlign: "center",
                                            color: "#64748b",
                                          }}
                                        >
                                          {/* {(!g.items || g.items.length === 0)
                                            ? "No enquiries yet"
                                            : "Tap the card to view details"} */}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    } catch (e) {
                      return (
                        <div
                          style={{
                            padding: 16,
                            textAlign: "center",
                            color: "#b91c1c",
                            background: "#fee2e2",
                            border: "1px solid #fecaca",
                            borderRadius: 8,
                          }}
                        >
                          Failed to render enquiries.
                        </div>
                      );
                    }
                  })()
                )}
              </div>
            </div>
          )}
                      </div>
                    </div>
                  );
                } catch { return null; }
              })()}
            </div>
          )}

          {/* Parent Buttons / Dropdown (resolved per node) */}
          {parentCandidates.length > 0 && (
            parentSelectorMode === "buttons" ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 400, color: "#111827", marginLeft: 2, marginTop: 8, marginBottom: 4 }}>
                  {labelForCard || "Select course type"}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", columnGap: 8, rowGap: 6, marginTop: 2, marginBottom: isSpecialCard ? 4 : 10 }}>
                {parentCandidates.map((opt) => {
                  const leaf = getDeepestFirstChild(opt);
                  const isSelectedParent = selectedParent?.id === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onSelectionChange?.(opt, leaf);
                        onLeafSelect?.(leaf);
                      }}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 999,
                        border: isSelectedParent ? "2px solid #059669" : "1px solid #d1d5db",
                        background: isSelectedParent ? "#059669" : "#f9fafb",
                        color: isSelectedParent ? "#fff" : "#111827",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      {opt.name}
                    </button>
                  );
                })}
              </div>
            </>
            ) : (
              <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {isDriving && (
                  <div style={{ fontSize: 13, fontWeight: 400, color: "#111827", marginBottom: 0 }}>
                    Select course type :
                  </div>
                )}
                <select
                  value={selectedParent?.id || ""}
                  onChange={(e) => {
                    const next = parentCandidates.find((c) => String(c.id) === e.target.value) || parentCandidates[0];
                    const leaf = getDeepestFirstChild(next);
                    onSelectionChange?.(next, leaf);
                    onLeafSelect?.(leaf);
                  }}
                  style={{
                    width: "auto",
                    maxWidth: "100%",
                    padding: "10px 32px 10px 16px",
                    borderRadius: 999,
                    border: "1px solid #111827",
                    background: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    textAlign: "left",
                  }}
                >
                  {parentCandidates.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                  ))}
                </select>
              </div>
            )
          )}

          {/* Child Buttons / Dropdown (resolved per selected parent) */}
          {includeLeafChildren && selectedParent?.children?.length > 0 && (
            (() => {
              // Filter child buttons for driving school
              const filteredChildren = selectedParent.children.filter((child) => {
                try {
                  return isNodePricingActive(child) || hasActivePricingForNode(child);
                } catch {
                  return false;
                }
              });
              
              return filteredChildren.length > 0 ? (
                childSelectorMode === "buttons" ? (
              <>
                {childLabelForCard && (
                  <div style={{ fontSize: 11, fontWeight: 400, color: "#111827", marginLeft: 2, marginTop: 4, marginBottom: 6 }}>
                    {childLabelForCard}
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", columnGap: 8, rowGap: 6, marginBottom: 14 }}>
                  {filteredChildren.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => {
                        onSelectionChange?.(selectedParent, child);
                        onLeafSelect?.(child);
                      }}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 999,
                        border: selectedChild?.id === child.id ? "2px solid #2563eb" : "1px solid #d1d5db",
                        background: selectedChild?.id === child.id ? "#2563eb" : "#f9fafb",
                        color: selectedChild?.id === child.id ? "#fff" : "#111827",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      {child.name}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <select
                  value={selectedChild?.id || ""}
                  onChange={(e) => {
                    const next = filteredChildren.find((c) => String(c.id) === e.target.value) || filteredChildren[0];
                    onSelectionChange?.(selectedParent, next);
                    onLeafSelect?.(next);
                  }}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontSize: 13 }}
                >
                  {filteredChildren.map((child) => (
                    <option key={child.id} value={child.id}>{child.name}</option>
                  ))}
                </select>
              </div>
            )
              ) : null;
            })()
          )}

          {attributeDropdown}

          {(() => {
            const resolvedTerms = displayNode.terms || selectedParent?.terms || node.terms || "";
            if (!resolvedTerms) return null;
            return (
              <ul style={{ marginTop: 8, marginBottom: 10, paddingLeft: 18 }}>
                {resolvedTerms.split(",").map((t, i) => (
                  <li key={i} style={{ fontSize: 13, color: "#4b5563" }}>
                    {t.trim()}
                  </li>
                ))}
              </ul>
            );
          })()}

          <button
            onClick={async () => {
              try {
                const allow = await guardEnrollClick();
                if (!allow) return;
                const pathNames = [
                  categoryTree?.name,
                  node?.name,
                  selectedParent?.name,
                ].filter(Boolean);
                const pathIds = [
                  categoryId,
                  node?.id,
                  selectedParent?.id,
                ].filter(Boolean);
                const resolvedTerms = displayNode.terms || selectedParent?.terms || node.terms || "";
                const num = (() => {
                  try {
                    const catKey = String(categoryId || '');
                    const invRaw = Array.isArray(vendor?.inventorySelections?.[catKey])
                      ? vendor.inventorySelections[catKey]
                      : [];
                    // Filter out inventory entries where ALL rows are inactive
                    const inv = invRaw.filter((entry) => {
                      try {
                        const statusMap = entry?.pricingStatusByRow || {};
                        const keys = Object.keys(statusMap);
                        if (keys.length === 0) return true;
                        for (const key of keys) {
                          const raw = String(statusMap[key] || '').trim().toLowerCase();
                          if (raw === 'active') return true;
                        }
                        return false;
                      } catch {
                        return true;
                      }
                    });
                    const ids = [displayNode?.id, selectedParent?.id, node?.id]
                      .map((x) => String(x || ''))
                      .filter(Boolean);
                    const rootName = String(categoryTree?.name || '').toLowerCase();
                    const isDriving = rootName === 'driving school';

                    const pickBaselinePrice = () => {
                      let invPrice = null;
                      inv.forEach((entry) => {
                        if (invPrice != null) return;
                        const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
                        if (!pbr) return;
                        ids.forEach((target) => {
                          if (!target || invPrice != null) return;
                          for (const [rk, val] of Object.entries(pbr)) {
                            const parts = String(rk).split('|');
                            if (parts.some((id) => String(id) === target)) {
                              const n = Number(val);
                              if (!Number.isNaN(n)) { invPrice = n; break; }
                            }
                          }
                        });
                      });
                      const nodePrice =
                        (displayNode?.vendorPrice ?? displayNode?.price) ??
                        (selectedParent?.vendorPrice ?? selectedParent?.price) ??
                        (node?.vendorPrice ?? node?.price) ?? null;
                      return (invPrice != null) ? invPrice : nodePrice;
                    };

                    if (isDriving && inv.length > 0) {
                      const targetId = String((displayNode?.id || selectedParent?.id || node?.id || ''));
                      const normalized = [];
                      inv.forEach((entry) => {
                        try {
                          const fam = String(entry?.scopeFamily || '').toLowerCase();
                          const sels = entry?.selections || {};
                          let sel = sels[fam] || sels.cars || sels.bikes || {};
                          if (!sel || typeof sel !== 'object') sel = {};
                          if (fam === 'bikes') {
                            const brand = sel.bikeBrand != null ? String(sel.bikeBrand).trim() : (sel.brand != null ? String(sel.brand).trim() : '');
                            const transmission = sel.bikeTransmission != null ? String(sel.bikeTransmission).trim() : (sel.transmission != null ? String(sel.transmission).trim() : '');
                            const model = sel.model != null ? String(sel.model).trim() : '';
                            normalized.push({ family: fam, brand, model, transmission, bodyType: null, entry });
                          } else if (fam === 'cars') {
                            const brand = sel.brand != null ? String(sel.brand).trim() : '';
                            const transmission = sel.transmission != null ? String(sel.transmission).trim() : '';
                            const model = sel.model != null ? String(sel.model).trim() : '';
                            const bodyType = sel.bodyType != null ? String(sel.bodyType).trim() : '';
                            normalized.push({ family: fam, brand, model, transmission, bodyType, entry });
                          }
                        } catch {}
                      });

                      const getPriceForEntry = (n) => {
                        const pbr = (n.entry && n.entry.pricesByRow && typeof n.entry.pricesByRow === 'object') ? n.entry.pricesByRow : null;
                        if (!pbr) return null;
                        for (const [key, value] of Object.entries(pbr)) {
                          const rowIds = String(key).split('|');
                          if (rowIds.some((id) => String(id) === targetId)) {
                            const num = Number(value);
                            if (!Number.isNaN(num)) return num;
                          }
                        }
                        return null;
                      };

                      const carBrand = String(attrSelections?.brand ?? '').trim() || null;
                      const carModel = String(attrSelections?.model ?? '').trim() || null;
                      const carTrans = String(attrSelections?.transmission ?? '').trim() || null;
                      const carBody = String(attrSelections?.bodyType ?? '').trim() || null;
                      const bikeBrand = String(attrSelections?.bikeBrand ?? '').trim() || null;
                      const bikeModel = String(attrSelections?.bikeModel ?? '').trim() || null;
                      const bikeTrans = String(attrSelections?.bikeTransmission ?? '').trim() || null;

                      const refined = normalized.filter((n) => {
                        const fam = String(n.family || '').toLowerCase();
                        const effBrand = fam === 'bikes' ? bikeBrand : carBrand;
                        const effModel = fam === 'bikes' ? bikeModel : carModel;
                        const effTrans = fam === 'bikes' ? bikeTrans : carTrans;
                        const effBody = fam === 'cars' ? carBody : null;
                        if (effBrand && String(n.brand) !== String(effBrand)) return false;
                        if (effModel && String(n.model) !== String(effModel)) return false;
                        if (effTrans && String(n.transmission) !== String(effTrans)) return false;
                        if (effBody && n.bodyType && String(n.bodyType) !== String(effBody)) return false;
                        return true;
                      });

                      // Get the exact price for the selected attributes (first match, not min)
                      let attrAwarePrice = null;
                      for (const n of refined) {
                        const p = getPriceForEntry(n);
                        if (p != null) { attrAwarePrice = p; break; }
                      }
                      const fallback = pickBaselinePrice();
                      const resolvedPrice = (attrAwarePrice != null) ? attrAwarePrice : fallback;
                      return resolvedPrice == null ? null : Number(resolvedPrice);
                    } else {
                      const basePrice = pickBaselinePrice();
                      return basePrice == null ? null : Number(basePrice);
                    }
                  } catch {
                    return null;
                  }
                })();

                const nodeAttrs = displayNode?.attributes || {};
                // Check if this category actually has inventory entries configured.
                const catKeyForAttrs = String(categoryId || "");
                const invForAttrs = Array.isArray(vendor?.inventorySelections?.[catKeyForAttrs])
                  ? vendor.inventorySelections[catKeyForAttrs]
                  : [];
                const hasInventoryForThisCategory = invForAttrs.length > 0;

                // Decide if this specific enquiry should be treated as inventory-based,
                // using common inventory-related fields from either node attributes or
                // the current attribute selections. This avoids hardcoding any category
                // names but still prevents non-inventory cards (with no inventory
                // configured) from reusing stale inventoryName values.
                const inventoryKeys = [
                  "brand",
                  "model",
                  "modelName",
                  "bikeBrand",
                  "bikeModel",
                  "bodyType",
                  "transmission",
                  "bikeTransmission",
                ];
                const sel = attrSelections || {};
                const nodeHasInventoryFields = inventoryKeys.some((k) => {
                  const v = nodeAttrs[k];
                  return typeof v === "string" && v.trim();
                });
                const selectionHasInventoryFields =
                  inventoryKeys.some((k) => {
                    const v = sel[k];
                    return typeof v === "string" && v.trim();
                  }) ||
                  (typeof sel.inventoryName === "string" && sel.inventoryName.trim());

                const treatAsInventory =
                  hasInventoryForThisCategory && (nodeHasInventoryFields || selectionHasInventoryFields);

                const baseAttrs = {
                  segment: node?.name || "",
                  courseType: selectedParent?.name || "",
                  parentSelectorLabel: labelForCard || parentSelectorLabel || "",
                  // Only when there is inventory configured for this category AND we see
                  // inventory-like fields, merge the current selections (which may
                  // contain inventoryName from the dropdown).
                  ...(treatAsInventory ? sel : {}),
                  // Also keep any static attributes defined on the display node.
                  ...nodeAttrs,
                };

                // Try to attach a representative image for this leaf/card so that
                // My Enquiries can show the correct thumbnail instead of a generic one.
                if (!baseAttrs.imageUrl) {
                  const imgCandidate =
                    displayNode?.imageUrl ||
                    displayNode?.iconUrl ||
                    node?.imageUrl ||
                    node?.iconUrl ||
                    "";
                  if (imgCandidate) baseAttrs.imageUrl = imgCandidate;
                }

                // Derive a clean inventory name from the card's inventory attributes
                let inventoryNameForCard = baseAttrs.inventoryName || "";
                if (!inventoryNameForCard) {
                  const invSourceAttrsForCard = displayNode?.attributes || {};
                  const invBrandForCard =
                    (typeof invSourceAttrsForCard.brand === "string" && invSourceAttrsForCard.brand.trim()) ||
                    (typeof invSourceAttrsForCard.bikeBrand === "string" && invSourceAttrsForCard.bikeBrand.trim()) ||
                    "";
                  const invModelForCard =
                    (typeof invSourceAttrsForCard.model === "string" && invSourceAttrsForCard.model.trim()) ||
                    (typeof invSourceAttrsForCard.modelName === "string" && invSourceAttrsForCard.modelName.trim()) ||
                    "";
                  const mb = [invBrandForCard, invModelForCard].filter(Boolean).join(" ");
                  if (mb) inventoryNameForCard = mb;
                }
                await postEnquiry({
                  source: "individual",
                  serviceName: displayNode?.name || node?.name || "",
                  price: num == null || Number.isNaN(Number(num)) ? null : Number(num),
                  terms: resolvedTerms || "",
                  categoryPath: pathNames,
                  categoryIds: pathIds,
                  attributes: inventoryNameForCard
                    ? { ...baseAttrs, inventoryName: inventoryNameForCard }
                    : baseAttrs,
                });
              } catch (e) {
                console.error("Enroll Now enquiry error (card)", e);
              }
            }}
            style={{
              marginTop: "auto",
              width: "100%",
              padding: "10px 14px",
              borderRadius: 28,
              border: "none",
              background: "rgb(245 158 11)",
              color: "#111827",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "Poppins, sans-serif",
            }}
          >
            {(() => {
              try {
                const catKey = String(categoryId || '');
                const invRaw = Array.isArray(vendor?.inventorySelections?.[catKey])
                  ? vendor.inventorySelections[catKey]
                  : [];
                // Filter out inventory entries where ALL rows are inactive
                const inv = invRaw.filter((entry) => {
                  try {
                    const statusMap = entry?.pricingStatusByRow || {};
                    const keys = Object.keys(statusMap);
                    if (keys.length === 0) return true;
                    for (const key of keys) {
                      const raw = String(statusMap[key] || '').trim().toLowerCase();
                      if (raw === 'active') return true;
                    }
                    return false;
                  } catch {
                    return true;
                  }
                });
                const ids = [displayNode?.id, selectedParent?.id, node?.id]
                  .map((x) => String(x || ''))
                  .filter(Boolean);
                const rootName = String(categoryTree?.name || '').toLowerCase();
                const isDriving = rootName === 'driving school';

                const pickBaselinePrice = () => {
                  let invPrice = null;
                  inv.forEach((entry) => {
                    if (invPrice != null) return;
                    const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
                    if (!pbr) return;
                    ids.forEach((target) => {
                      if (!target || invPrice != null) return;
                      for (const [rk, val] of Object.entries(pbr)) {
                        const parts = String(rk).split('|');
                        if (parts.some((id) => String(id) === target)) {
                          const num = Number(val);
                          if (!Number.isNaN(num)) { invPrice = num; break; }
                        }
                      }
                    });
                  });
                  const nodePrice =
                    (displayNode?.vendorPrice ?? displayNode?.price) ??
                    (selectedParent?.vendorPrice ?? selectedParent?.price) ??
                    (node?.vendorPrice ?? node?.price) ?? null;
                  return (invPrice != null) ? invPrice : nodePrice;
                };

                let resolvedPrice = null;
                if (isDriving && inv.length > 0) {
                  const targetId = String((displayNode?.id || selectedParent?.id || node?.id || ''));
                  const normalized = [];
                  inv.forEach((entry) => {
                    try {
                      const fam = String(entry?.scopeFamily || '').toLowerCase();
                      const sels = entry?.selections || {};
                      let sel = sels[fam] || sels.cars || sels.bikes || {};
                      if (!sel || typeof sel !== 'object') sel = {};
                      if (fam === 'bikes') {
                        const brand = sel.bikeBrand != null ? String(sel.bikeBrand).trim() : (sel.brand != null ? String(sel.brand).trim() : '');
                        const transmission = sel.bikeTransmission != null ? String(sel.bikeTransmission).trim() : (sel.transmission != null ? String(sel.transmission).trim() : '');
                        const model = sel.model != null ? String(sel.model).trim() : '';
                        normalized.push({ family: fam, brand, model, transmission, bodyType: null, entry });
                      } else if (fam === 'cars') {
                        const brand = sel.brand != null ? String(sel.brand).trim() : '';
                        const transmission = sel.transmission != null ? String(sel.transmission).trim() : '';
                        const model = sel.model != null ? String(sel.model).trim() : '';
                        const bodyType = sel.bodyType != null ? String(sel.bodyType).trim() : '';
                        normalized.push({ family: fam, brand, model, transmission, bodyType, entry });
                      }
                    } catch {}
                  });

                  const minPriceForList = (list) => {
                    try {
                      const prices = [];
                      list.forEach((n) => {
                        const pbr = (n.entry && n.entry.pricesByRow && typeof n.entry.pricesByRow === 'object') ? n.entry.pricesByRow : null;
                        if (!pbr) return;
                        for (const [key, value] of Object.entries(pbr)) {
                          const rowIds = String(key).split('|');
                          if (rowIds.some((id) => String(id) === targetId)) {
                            const num = Number(value);
                            if (!Number.isNaN(num)) prices.push(num);
                          }
                        }
                      });
                      if (!prices.length) return null;
                      return Math.min(...prices);
                    } catch { return null; }
                  };

                  const carBrand = String(attrSelections?.brand ?? '').trim() || null;
                  const carModel = String(attrSelections?.model ?? '').trim() || null;
                  const carTrans = String(attrSelections?.transmission ?? '').trim() || null;
                  const carBody = String(attrSelections?.bodyType ?? '').trim() || null;
                  const bikeBrand = String(attrSelections?.bikeBrand ?? '').trim() || null;
                  const bikeModel = String(attrSelections?.bikeModel ?? '').trim() || null;
                  const bikeTrans = String(attrSelections?.bikeTransmission ?? '').trim() || null;

                  const refined = normalized.filter((n) => {
                    const fam = String(n.family || '').toLowerCase();
                    const effBrand = fam === 'bikes' ? bikeBrand : carBrand;
                    const effModel = fam === 'bikes' ? bikeModel : carModel;
                    const effTrans = fam === 'bikes' ? bikeTrans : carTrans;
                    const effBody = fam === 'cars' ? carBody : null;
                    if (effBrand && String(n.brand) !== String(effBrand)) return false;
                    if (effModel && String(n.model) !== String(effModel)) return false;
                    if (effTrans && String(n.transmission) !== String(effTrans)) return false;
                    if (effBody && n.bodyType && String(n.bodyType) !== String(effBody)) return false;
                    return true;
                  });

                  const attrAwarePrice = refined.length ? minPriceForList(refined) : null;
                  const fallback = pickBaselinePrice();
                  resolvedPrice = (attrAwarePrice != null) ? attrAwarePrice : fallback;
                } else {
                  resolvedPrice = pickBaselinePrice();
                }

                const num = resolvedPrice == null ? NaN : Number(resolvedPrice);
                if (!Number.isNaN(num) && num > 0) {
                  return (individualAddon && typeof individualAddon.buttonLabel === 'string' && individualAddon.buttonLabel.trim())
                    ? individualAddon.buttonLabel.trim()
                    : 'Enroll Now';
                }
                return 'Contact for Price';
              } catch {}
              return 'Contact for Price';
            })()}
          </button>
        </div>
      </section>
    );
  };

  // ----------------- Render tree -----------------
  const renderTree = (root) => {
    if (!root) return <p>No categories available</p>;
    if (!Array.isArray(root.children) || root.children.length === 0)
      return <p>No categories available</p>;

    const linked = (categoryTree && categoryTree.linkedAttributes && typeof categoryTree.linkedAttributes === "object")
      ? categoryTree.linkedAttributes
      : {};

    // Resolve displayType chain only
    const resolveDisplayTypeFor = (node, parent) => {
      const pick = (arr) => Array.isArray(arr) && arr.length > 0 ? String(arr[0]).toLowerCase() : null;
      return (
        pick(node?.displayType) ||
        pick(parent?.displayType) ||
        pick(root?.displayType) ||
        "card"
      );
    };

    
  const familiesByTarget = new Map();
  // First pass: detect families that have any specific mappings (fam:*:linkedSubcategory)
  const famHasSpecific = new Map(); // fam -> boolean
  Object.keys(linked).forEach((k) => {
    if (!k.endsWith(":linkedSubcategory")) return;
    const parts = String(k).split(":");
    const fam = parts[0] || "";
    if (parts.length > 2) famHasSpecific.set(fam, true);
  });
  // Second pass: add mappings, but ignore ALL for families that have specific mappings
  Object.keys(linked).forEach((k) => {
    if (!k.endsWith(":linkedSubcategory")) return;
    const parts = String(k).split(":");
    const fam = parts[0] || "";
    const raw = linked[k];
    const val = Array.isArray(raw) ? String(raw[0] || "") : String(raw || "");
    if (!val) return; // require explicit mapping
    if (parts.length === 2 && val === "ALL" && famHasSpecific.get(fam)) return; // ignore ALL when specific exists
    const key = val === "ALL" ? "ALL" : val;
    if (!familiesByTarget.has(key)) familiesByTarget.set(key, new Set());
    familiesByTarget.get(key).add(fam);
  });

  const invEntriesRaw = vendor?.inventorySelections?.[categoryId] || [];
  // Filter out inventory entries where ALL rows are inactive
  const invEntries = invEntriesRaw.filter((entry) => {
    try {
      const statusMap = entry?.pricingStatusByRow || {};
      const keys = Object.keys(statusMap);
      if (keys.length === 0) return !isDummyMode;
      // Check if at least one row is active
      for (const key of keys) {
        const raw = String(statusMap[key] || '').trim().toLowerCase();
        if (raw === 'active') return true;
      }
      return false; // all rows are inactive
    } catch {
      return !isDummyMode;
    }
  });
  // Build attribute fields/options from inventory selections
  const allFields = new Set();
  const fieldValues = new Map(); // field -> Set(values)
  for (const entry of invEntries) {
    const fam = entry?.scopeFamily;
    const sel = (entry?.selections && fam && entry.selections[fam]) ? entry.selections[fam] : {};
    Object.entries(sel).forEach(([k, v]) => {
      const key = String(k);
      if (!fieldValues.has(key)) fieldValues.set(key, new Set());
      allFields.add(key);
      if (v != null && String(v).trim() !== "") fieldValues.get(key).add(String(v));
    });
  }
  // Restrict to fields selected in linkedAttributes (Link Attributes for Pricing)
  const linkedLA = (categoryTree && categoryTree.linkedAttributes && typeof categoryTree.linkedAttributes === "object")
    ? categoryTree.linkedAttributes
    : {};
  const allowedFields = new Set();
  Object.entries(linkedLA).forEach(([k, arr]) => {
    if (!Array.isArray(arr)) return;
    // keys like 'cars' or 'Bikes' directly list fields (brand, model, seats, etc.)
    const parts = String(k).split(":");
    if (parts.length === 1) {
      arr.forEach((f) => { if (f) allowedFields.add(String(f)); });
    }
    // keys like 'cars:modelFields'
    if (parts.length === 2 && parts[1] === 'modelFields') {
      arr.forEach((f) => { if (f) allowedFields.add(String(f)); });
    }
  });
  const fieldsListRaw = Array.from(allFields);
  const fieldsList = allowedFields.size > 0
    ? fieldsListRaw.filter((f) => allowedFields.has(String(f)))
    : fieldsListRaw;
  const optionsByField = Object.fromEntries(fieldsList.map((f) => [f, Array.from(fieldValues.get(f) || new Set())]));

  // Build pair options for a given field pair
  const getPairOptions = (A, B) => {
    if (!A || !B || A === B) return [];
    const set = new Set();
    for (const entry of invEntries) {
      const fam = entry?.scopeFamily;
      const sel = (entry?.selections && fam && entry.selections[fam]) ? entry.selections[fam] : {};
      const va = sel?.[A];
      const vb = sel?.[B];
      if (va != null && vb != null && String(va).trim() !== "" && String(vb).trim() !== "") {
        set.add(`${String(va)}|${String(vb)}`);
      }
    }
    return Array.from(set);
  };

  const matchesAttrFilters = (entry) => {
    const fam = entry?.scopeFamily;
    const sel = (entry?.selections && fam && entry.selections[fam]) ? entry.selections[fam] : {};
    // singles: all selected singles must match
    for (const [field, val] of Object.entries(attrSelections || {})) {
      if (!val) continue;
      if (String(sel?.[field] ?? "") !== String(val)) return false;
    }
    // pairs: all chosen pairs must match
    for (const [idx, combo] of Object.entries(pairSelections || {})) {
      if (!combo) continue;
      const cfg = (categoryTree?.uiConfig?.attributesBar || [])[Number(idx)];
      if (!cfg || cfg.type !== 'pair') continue;
      const A = cfg.a;
      const B = cfg.b;
      if (!A || !B) continue;
      const [va, vb] = String(combo).split('|');
      const sa = String(sel?.[A] ?? "");
      const sb = String(sel?.[B] ?? "");
      if (!(sa === String(va ?? "") && sb === String(vb ?? ""))) return false;
    }
    return true;
  };
  const invByFamily = invEntries.reduce((acc, entry) => {
    const fam = String(entry?.scopeFamily || "").trim();
    if (!fam) return acc;
    if (!acc[fam]) acc[fam] = [];
    acc[fam].push(entry);
    return acc;
  }, {});

  const rootName = String(root?.name || '').toLowerCase();
  if (false && rootName.includes('taxi')) {
    const carsList = invByFamily['cars'] || [];
    const tempoList = invByFamily['tempoMinibuses'] || [];

    const extract = (entry) => {
      const fam = entry?.scopeFamily;
      const sel = (entry?.selections && fam && entry.selections[fam]) ? entry.selections[fam] : {};
      if (fam === 'cars') {
        return {
          family: 'cars',
          body: String(sel?.bodyType ?? ''),
          seats: String(sel?.seats ?? ''),
          fuel: sel?.fuelType != null ? String(sel.fuelType) : undefined,
          model: String(sel?.model ?? ''),
          brand: String(sel?.brand ?? ''),
          entry,
        };
      }
      if (fam === 'tempoMinibuses') {
        return {
          family: 'tempoMinibuses',
          body: String(sel?.tempoBusBodyType ?? ''),
          seats: String(sel?.seats ?? ''),
          fuel: undefined, // not applicable for tempos per data
          model: String(sel?.model ?? ''),
          brand: String(sel?.tempoBusBrand ?? ''),
          entry,
        };
      }
      return null;
    };

    const normalized = [
      ...carsList.map(extract).filter(Boolean),
      ...tempoList.map(extract).filter(Boolean),
    ];

    const bodySeatsOptions = Array.from(new Set(normalized
      .filter((n) => n.body && n.seats)
      .map((n) => `${n.body}|${n.seats}`)));

    const filterByBodySeats = (pair) => {
      if (!pair) return normalized;
      const [b, s] = String(pair).split('|');
      return normalized.filter((n) => String(n.body) === String(b ?? '') && String(n.seats) === String(s ?? ''));
    };

    const fuelOptionsFromList = (list) => Array.from(new Set(list
      .map((n) => n.fuel)
      .filter((v) => v != null && String(v).trim() !== '')));

    const modelBrandPairsFromList = (list) => Array.from(new Set(list
      .filter((n) => n.model != null || n.brand != null)
      .map((n) => `${n.model || ''}|${n.brand || ''}`)));

    const uiRow = (label, control) => (
      <div
        style={{
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{label}</div>
        <div style={{ width: '100%' }}>{control}</div>
      </div>
    );

    // Compute minimum price from a list of normalized entries for a target node id,
    // considering only rows with Active pricing status.
    const minPriceForListTarget = (list, targetId) => {
      try {
        const prices = [];
        list.forEach((n) => {
          const pbr = (n.entry && n.entry.pricesByRow && typeof n.entry.pricesByRow === 'object') ? n.entry.pricesByRow : null;
          if (!pbr) return;
          for (const [key, value] of Object.entries(pbr)) {
            const ids = String(key).split('|');
            if (!ids.some((id) => String(id) === String(targetId))) continue;
            if (!rowPricingIsActive(n.entry, key)) continue;
            const num = Number(value);
            if (!Number.isNaN(num)) prices.push(num);
          }
        });
        if (prices.length === 0) return null;
        return Math.min(...prices);
      } catch { return null; }
    };

    // Local helper: compute min price in subtree including inventory pricesByRow for this node id
    const localMinPriceInSubtree = (n) => {
      let best = null;
      const catKey = String(categoryId || '');
      const consider = (val) => {
        if (val == null) return;
        const num = Number(val);
        if (!Number.isNaN(num) && (best == null || num < best)) best = num;
      };
      const visit = (x) => {
        if (!x) return;
        // Consider node/vendor price on the node
        consider(x.vendorPrice ?? x.price);
        // Consider inventory per-row prices targeting this node id
        try {
          const idStr = String(x.id || '');
          const invRaw = Array.isArray(vendor?.inventorySelections?.[catKey]) ? vendor.inventorySelections[catKey] : [];
          const inv = invRaw.filter((entry) => {
            try {
              const statusMap = entry?.pricingStatusByRow || {};
              const keys = Object.keys(statusMap);
              if (keys.length === 0) return !isDummyMode;
              for (const key of keys) {
                const raw = String(statusMap[key] || '').trim().toLowerCase();
                if (raw === 'active') return true;
              }
              return false;
            } catch {
              return !isDummyMode;
            }
          });
          inv.forEach((entry) => {
            const pbr = entry && entry.pricesByRow && typeof entry.pricesByRow === 'object' ? entry.pricesByRow : null;
            if (!pbr) return;
            for (const [rk, val] of Object.entries(pbr)) {
              const parts = String(rk).split('|');
              if (parts.some((pid) => String(pid) === idStr)) { consider(val); }
            }
          });
        } catch {}
        if (Array.isArray(x.children) && x.children.length) x.children.forEach(visit);
      };
      visit(n);
      return best;
    };

    const renderPriceForNode = (node, parentNode) => {
      let livePrice = null;
      const priceRowsRaw = vendor?.inventorySelections?.[categoryId] || [];
      const priceRows = priceRowsRaw.filter((entry) => {
        try {
          const statusMap = entry?.pricingStatusByRow || {};
          const keys = Object.keys(statusMap);
          if (keys.length === 0) return !isDummyMode;
          for (const key of keys) {
            const raw = String(statusMap[key] || '').trim().toLowerCase();
            if (raw === 'active') return true;
          }
          return false;
        } catch {
          return !isDummyMode;
        }
      });
      for (const entry of priceRows) {
        const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
        const statusMap = entry?.pricingStatusByRow || {};
        
        // Check if this entry has a status match for this node even without prices
        if (!pbr) {
          for (const statusKey of Object.keys(statusMap)) {
            const ids = String(statusKey).split('|');
            if (ids.some((id) => String(id) === String(node?.id))) {
              const raw = String(statusMap[statusKey] || '').trim().toLowerCase();
              if (raw === 'active') {
                // This entry is active but has no price, continue to check other entries
                continue;
              }
            }
          }
          continue;
        }
        
        for (const [key, value] of Object.entries(pbr)) {
          const ids = String(key).split('|');
          if (!ids.some((id) => String(id) === String(node?.id))) continue;
          if (!rowPricingIsActive(entry, key)) continue;
          livePrice = Number(value);
          break;
        }
        if (livePrice != null) break;
      }
      
      // Use fallback pricing if no specific price found
      if (livePrice == null) {
        livePrice = vendor?.pricing?.[node?.id] ?? vendor?.pricing?.[parentNode?.id] ?? node?.vendorPrice ?? node?.price ?? null;
      }
      return livePrice;
    };

    // SIMPLIFIED: Always return true - show all nodes
    const hasNodeActiveInventory = (node) => {
      return !isDummyMode;
    };

    // Dummy mode: consider inventory row-level pricing status for the node
    const hasActivePricingForNode = (node) => {
      try {
        if (!isDummyMode) return true;
        if (!node) return false;

        const normalizeId = (val) => {
          if (val == null) return '';
          if (typeof val === 'string' || typeof val === 'number') return String(val);
          if (typeof val === 'object') {
            if (val.$oid) return String(val.$oid);
            if (val.oid) return String(val.oid);
            if (val._id) return normalizeId(val._id);
            if (val.id) return normalizeId(val.id);
          }
          return String(val);
        };

        const collectIds = (root) => {
          const out = new Set();
          const stack = [root];
          while (stack.length) {
            const cur = stack.pop();
            const id = normalizeId(cur?.id ?? cur?._id);
            if (id) out.add(String(id));
            const kids = Array.isArray(cur?.children) ? cur.children : [];
            for (const ch of kids) stack.push(ch);
          }
          return Array.from(out);
        };

        const targetIds = collectIds(node);
        if (targetIds.length === 0) return false;

        const catKey = String(categoryId || '');
        const invRaw = Array.isArray(vendor?.inventorySelections?.[catKey]) ? vendor.inventorySelections[catKey] : [];
        for (const entry of invRaw) {
          const pbr = entry?.pricesByRow;
          const statusMap =
            entry?.pricingStatusByRow && typeof entry.pricingStatusByRow === 'object'
              ? entry.pricingStatusByRow
              : {};
          const keys = new Set([
            ...((pbr && typeof pbr === 'object') ? Object.keys(pbr) : []),
            ...Object.keys(statusMap),
          ]);
          for (const rk of keys) {
            const ids = String(rk).split('|');
            if (!ids.some((id) => targetIds.includes(String(id)))) continue;
            if (rowPricingIsActive(entry, rk)) return true;
          }
        }
        return false;
      } catch {
        return false;
      }
    };

    return (
      // <div style={{ display: 'flex', flexWrap: 'wrap', gap: 30, alignItems: 'stretch', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 30, alignItems: 'stretch' }}>
        {root.children.map((lvl1) => {
          const serviceKey = makeServiceKey(lvl1?.name || "");
          if (isDummyMode && !(isNodePricingActive(lvl1) || hasActivePricingForNode(lvl1))) return null;
          
      // Filter L2 in dummy mode so With/Without License only shows when active
      const lvl2KidsRaw = Array.isArray(lvl1.children) ? lvl1.children : [];
      const lvl2Kids = isDummyMode
        ? lvl2KidsRaw.filter((k) => {
            try {
              return isNodePricingActive(k) || hasActivePricingForNode(k);
            } catch {
              return false;
            }
          })
        : lvl2KidsRaw;
      // Sort L2 by min subtree price
      const sortedLvl2Kids = [...lvl2Kids].sort((a, b) => {
        const pa = localMinPriceInSubtree(a);
        const pb = localMinPriceInSubtree(b);
        const va = pa == null ? Number.POSITIVE_INFINITY : Number(pa);
        const vb = pb == null ? Number.POSITIVE_INFINITY : Number(pb);
        return va - vb;
      });
      const selState = taxiSelections[lvl1.id] || {};
      const selectedLvl2 = sortedLvl2Kids.find((c) => String(c.id) === String(selState.lvl2)) || sortedLvl2Kids[0] || null;
      // Filter L3 in dummy mode too
      const lvl3KidsRaw = Array.isArray(selectedLvl2?.children) ? selectedLvl2.children : [];
      const lvl3Kids = isDummyMode
        ? lvl3KidsRaw.filter((k) => {
            try {
              return isNodePricingActive(k) || hasActivePricingForNode(k);
            } catch {
              return false;
            }
          })
        : lvl3KidsRaw;
      const sortedLvl3Kids = [...lvl3Kids].sort((a, b) => {
        const pa = localMinPriceInSubtree(a);
        const pb = localMinPriceInSubtree(b);
        const va = pa == null ? Number.POSITIVE_INFINITY : Number(pa);
        const vb = pb == null ? Number.POSITIVE_INFINITY : Number(pb);
        return va - vb;
      });
      const selectedLvl3 = sortedLvl3Kids.find((c) => String(c.id) === String(selState.lvl3)) || sortedLvl3Kids[0] || null;

      const belongsToLvl1 = (entry) => {
        try {
          const lvl1Id = String(lvl1?.id || '');
          if (!lvl1Id) return false;
          const pbr = entry?.pricesByRow;
          if (pbr && typeof pbr === 'object') {
            for (const key of Object.keys(pbr)) {
              const ids = String(key).split('|');
              if (ids.some((id) => String(id) === lvl1Id)) return true;
            }
            return false;
          }
          // If no pricesByRow, allow it by default
          return true;
        } catch {
          return false;
        }
      };

      // For accepted vendors, always partition inventory rows by the
      // current lvl1 / lvl2 / lvl3 using belongsToLvl1 so that models are
      // correctly scoped to the selected size. Only keep the old dummy
      // shortcut (no partition) for non-accepted vendors so they can see a
      // loose preview even without configured rows.
      const normalizedForLvl1 = normalized.filter((n) => belongsToLvl1(n.entry));

      // Further restrict to rows that actually include the current target
      // node (selected size / sub-size) and are Active. This ensures that
      // model dropdowns only see rows for the currently selected size.
      const targetNodeId = String((selectedLvl3 || selectedLvl2 || lvl1)?.id || '');
      const normalizedForTarget = targetNodeId
        ? normalizedForLvl1.filter((n) => {
            try {
              const statusMap =
                n.entry && n.entry.pricingStatusByRow && typeof n.entry.pricingStatusByRow === 'object'
                  ? n.entry.pricingStatusByRow
                  : {};
              const pbr =
                n.entry &&
                n.entry.pricesByRow &&
                typeof n.entry.pricesByRow === 'object'
                  ? n.entry.pricesByRow
                  : null;
              const keys = new Set([
                ...((pbr && typeof pbr === 'object') ? Object.keys(pbr) : []),
                ...Object.keys(statusMap),
              ]);
              for (const key of keys) {
                const ids = String(key).split('|');
                if (!ids.some((id) => String(id) === targetNodeId)) continue;
                if (!Object.prototype.hasOwnProperty.call(statusMap, key)) continue;
                const raw = String(statusMap[key] || '').trim().toLowerCase();
                if (raw !== 'active') continue;
                return true;
              }

              const anyActive = Object.values(statusMap).some(
                (v) => String(v || '').trim().toLowerCase() === 'active'
              );
              if (!anyActive) return false;

              const linked =
                categoryTree && categoryTree.linkedAttributes && typeof categoryTree.linkedAttributes === 'object'
                  ? categoryTree.linkedAttributes
                  : {};

              const fam = String(n.entry?.scopeFamily || '');
              const label = String(n.entry?.scopeLabel || '');
              if (!fam) return false;

              const specificKey = `${fam}:${label}:linkedSubcategory`;
              const genericLabelKey = `${fam}:inventoryLabels:linkedSubcategory`;
              const familyKey = `${fam}:linkedSubcategory`;

              const pickFirst = (raw) => {
                if (Array.isArray(raw)) return String(raw[0] || '');
                return String(raw || '');
              };

              const mapped =
                (label && linked && Object.prototype.hasOwnProperty.call(linked, specificKey) ? pickFirst(linked[specificKey]) : '') ||
                (linked && Object.prototype.hasOwnProperty.call(linked, genericLabelKey) ? pickFirst(linked[genericLabelKey]) : '') ||
                (linked && Object.prototype.hasOwnProperty.call(linked, familyKey) ? pickFirst(linked[familyKey]) : '');

              if (!mapped) return false;
              if (String(mapped) === 'ALL') return true;
              return String(mapped) === String(targetNodeId);
            } catch {
              return false;
            }
          })
        : normalizedForLvl1;

      // Final safety: exclude any row where pricingStatusByRow is explicitly "Inactive"
      const normalizedFiltered = normalizedForTarget.filter((n) => {
        try {
          const statusMap = n.entry?.pricingStatusByRow || {};
          for (const key of Object.keys(statusMap)) {
            const raw = String(statusMap[key] || '').trim().toLowerCase();
            if (raw === 'inactive') return false;
          }
          return true;
        } catch {
          return !isDummyMode;
        }
      });

      const bodySeatsOptions = Array.from(new Set(
        normalizedFiltered
          .filter((n) => n.body && n.seats)
          .map((n) => `${n.body}|${n.seats}`)
      ));
      const filterByBodySeats = (pair) => {
        // If any inventory pricing is active, do not filter by body/seats at all.
        if (hasInventoryActive) return normalizedFiltered;
        if (!pair) return normalizedFiltered;
        const [b, s] = String(pair).split('|');
        return normalizedFiltered.filter(
          (n) => String(n.body) === String(b ?? '') && String(n.seats) === String(s ?? '')
        );
      };
      const filteredByBodySeats = filterByBodySeats(selState.bodySeats);
      // Sort bodySeats options by min price for current target
      const targetIdForSort = String((selectedLvl3 || selectedLvl2 || lvl1)?.id || '');
      const bodySeatsWithPrice = bodySeatsOptions.map((opt) => ({
        opt,
        price: minPriceForListTarget(filterByBodySeats(opt), targetIdForSort),
      }));
      bodySeatsWithPrice.sort((a, b) => {
        const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
        const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
        return va - vb;
      });
      const sortedBodySeatsOptions = bodySeatsWithPrice.map((x) => x.opt);
      const fuelOptions = fuelOptionsFromList(filteredByBodySeats);
      const filteredByFuel = selState.fuelType
        ? filteredByBodySeats.filter((n) => String(n.fuel ?? '') === String(selState.fuelType))
        : filteredByBodySeats;
      // Sort fuel options by min price under current bodySeats
      const fuelWithPrice = fuelOptions.map((opt) => ({
        opt,
        price: minPriceForListTarget(filteredByBodySeats.filter((n) => String(n.fuel ?? '') === String(opt)), targetIdForSort),
      }));
      fuelWithPrice.sort((a, b) => {
        const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
        const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
        return va - vb;
      });
      const sortedFuelOptions = fuelWithPrice.map((x) => x.opt);
      const modelBrandOptions = modelBrandPairsFromList(filteredByFuel);
      // Sort modelBrand by min price
      const mbWithPrice = modelBrandOptions.map((opt) => {
        const [m, b] = String(opt).split('|');
        const list = filteredByFuel.filter((n) => String(n.model) === String(m || '') && String(n.brand) === String(b || ''));
        return { opt, price: minPriceForListTarget(list, targetIdForSort) };
      });
      mbWithPrice.sort((a, b) => {
        const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
        const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
        return va - vb;
      });
      const sortedModelBrandOptions = mbWithPrice.map((x) => x.opt);

      const displayNode = selectedLvl3 || selectedLvl2 || lvl1;
      const livePrice = renderPriceForNode(displayNode, selectedLvl2 || lvl1);
      const hasFuelOptions = fuelOptions.length > 0;
      const hasBodySeats = bodySeatsOptions.length > 0;
      const hasModelBrand = modelBrandOptions.length > 0;
      const hasAnyAttributes = hasBodySeats || hasFuelOptions || hasModelBrand;
      const isComplete = (!hasBodySeats || Boolean(selState.bodySeats)) && (!hasFuelOptions || Boolean(selState.fuelType)) && (!hasModelBrand || Boolean(selState.modelBrand));
      const attrAwarePrice = (() => {
        try {
          if (!isComplete) return null;
          const prices = [];
          const targetId = String((selectedLvl3 || selectedLvl2 || lvl1)?.id || '');
          const refined = (() => {
            if (!selState.modelBrand) return filteredByFuel;
            const [m, b] = String(selState.modelBrand).split('|');
            return filteredByFuel.filter((n) => String(n.model) === String(m || '') && String(n.brand) === String(b || ''));
          })();
          refined.forEach((n) => {
            const pbr = (n.entry && n.entry.pricesByRow && typeof n.entry.pricesByRow === 'object') ? n.entry.pricesByRow : null;
            if (!pbr) return;
            for (const [key, value] of Object.entries(pbr)) {
              const ids = String(key).split('|');
              if (!ids.some((id) => String(id) === targetId)) continue;
              if (!rowPricingIsActive(n.entry, key)) continue;
              const num = Number(value);
              if (!Number.isNaN(num)) prices.push(num);
            }
          });
          if (prices.length === 0) return livePrice;
          return Math.min(...prices);
        } catch {
          return livePrice;
        }
      })();

      const hasCategoryActive = isNodePricingActive(displayNode);
      // For inventory categories (like Two Wheeler), treat the card as active
      // only if the CURRENTLY SELECTED inventory row is active. We reuse the
      // same refined list used for attrAwarePrice and rowPricingIsActive.
      const hasInventoryActive = (() => {
        try {
          if (!isComplete) return false;
          const targetId = String((selectedLvl3 || selectedLvl2 || lvl1)?.id || '');
          const refined = (() => {
            if (!selState.modelBrand) return filteredByFuel;
            const [m, b] = String(selState.modelBrand).split('|');
            return filteredByFuel.filter((n) => String(n.model) === String(m || '') && String(n.brand) === String(b || ''));
          })();
          for (const n of refined) {
            const pbr =
              n.entry &&
              n.entry.pricesByRow &&
              typeof n.entry.pricesByRow === 'object'
                ? n.entry.pricesByRow
                : null;
            if (!pbr) continue;
            for (const key of Object.keys(pbr)) {
              const ids = String(key).split('|');
              if (!ids.some((id) => String(id) === targetId)) continue;
              if (rowPricingIsActive(n.entry, key)) return true;
            }
          }
          return false;
        } catch {
          return false;
        }
      })();
      return (
        <section key={lvl1.id} style={{
      marginBottom: 16,
      flex: "0 0 320px",       // same width for Two/Four/Commercial
      maxWidth: 340,
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
    }}
    className={activeServiceKey === serviceKey ? 'service-card-fade-out' : ''}
    >
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 12 }}>
            <h2
              style={{
                margin: 0,
                textTransform: 'Capitalize',
                fontSize: 18,
                fontWeight: 600,
                minHeight: 44,
                display: 'flex',
                alignItems: 'flex-end',
                whiteSpace: 'nowrap',
              }}
            >
              {lvl1.name}
            </h2>
            {sortedLvl2Kids.length > 0 ? (
              (() => {
                // For driving school, render buttons instead of dropdown if there are only 2 options (With/Without License)
                const shouldRenderButtons = sortedLvl2Kids.length <= 2 && 
                  sortedLvl2Kids.every(k => k.name && (k.name.includes('License') || k.name.includes('licence')));
                
                if (shouldRenderButtons) {
                  // SIMPLIFIED: Show all buttons without filtering
                  const filteredButtons = sortedLvl2Kids;
                  
                  // Only render buttons section if there are any active buttons
                  if (filteredButtons.length > 0) {
                    return (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {filteredButtons.map((kid) => {
                          const isSelected = String(selectedLvl2?.id || '') === String(kid.id);
                          return (
                            <button
                              key={kid.id}
                              type="button"
                              onClick={() => {
                                const next = kid;
                                // Compute cheapest defaults for Taxi (bodySeats, fuel, modelBrand) under new selection
                                const nextTargetId = String((selectedLvl3 || next || lvl1)?.id || '');
                                const mp = (list) => {
                                  try {
                                    const prices = [];
                                    list.forEach((n) => {
                                      const pbr = (n.entry && n.entry.pricesByRow && typeof n.entry.pricesByRow === 'object') ? n.entry.pricesByRow : null;
                                      if (!pbr) return;
                                      for (const [key, value] of Object.entries(pbr)) {
                                        const ids = String(key).split('|');
                                        if (ids.some((id) => String(id) === String(nextTargetId))) {
                                          const num = Number(value);
                                          if (!Number.isNaN(num)) prices.push(num);
                                        }
                                      }
                                    });
                                    if (prices.length === 0) return null;
                                    return Math.min(...prices);
                                  } catch { return null; }
                                };
                                const nextBodySeatsOptions = Array.from(new Set(normalizedFiltered
                                  .filter((n) => n.body && n.seats)
                                  .map((n) => `${n.body}|${n.seats}`)));
                                const bodySeatsWithPrice2 = nextBodySeatsOptions.map((opt) => ({ opt, price: mp(
                                  (pair => { const [b,s] = String(pair).split('|'); return normalizedFiltered.filter((n)=> String(n.body)===String(b||'') && String(n.seats)===String(s||'')); })(opt)
                                ) }));
                                bodySeatsWithPrice2.sort((a,b)=>{
                                  const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
                                  const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
                                  return va - vb;
                                });
                                const bestBodySeats = bodySeatsWithPrice2[0]?.opt;
                                const listAfterBody = bestBodySeats ? ((pair)=>{ const [b,s]=String(pair).split('|'); return normalizedFiltered.filter((n)=> String(n.body)===String(b||'') && String(n.seats)===String(s||'')); })(bestBodySeats) : normalizedFiltered;
                                const fuelOpts2 = Array.from(new Set(listAfterBody.map((n)=>n.fuel).filter((v)=> v != null && String(v).trim()!=='')));
                                const fuelWithPrice2 = fuelOpts2.map((opt)=>({ opt, price: mp(listAfterFuel.filter((n)=> String(n.fuel??'')===String(opt))) }));
                                fuelWithPrice2.sort((a,b)=>{
                                  const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
                                  const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
                                  return va - vb;
                                });
                                const bestFuel = fuelWithPrice2[0]?.opt;
                                const listAfterFuel = bestFuel ? listAfterBody.filter((n)=> String(n.fuel??'')===String(bestFuel)) : listAfterBody;
                                const mbPairs2 = Array.from(new Set(listAfterFuel.filter((n)=> n.model != null || n.brand != null).map((n)=> `${n.model || ''}|${n.brand || ''}`)));
                                const mbWithPrice2 = mbPairs2.map((opt)=>{
                                  const [m,b] = String(opt).split('|');
                                  const lst = listAfterFuel.filter((n)=> String(n.model)===String(m||'') && String(n.brand)===String(b||''));
                                  return { opt, price: mp(lst) };
                                });
                                mbWithPrice2.sort((a,b)=>{
                                  const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
                                  const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
                                  return va - vb;
                                });
                                const bestModelBrand = mbWithPrice2[0]?.opt;

                                setAttrSelections({});
                                setTaxiSelections((prev) => ({
                                  ...prev,
                                  [lvl1.id]: {
                                    lvl2: next?.id,
                                    lvl3: (Array.isArray(next?.children) && next.children[0]?.id) || undefined,
                                    bodySeats: bestBodySeats,
                                    fuelType: bestFuel,
                                    modelBrand: bestModelBrand,
                                  },
                                }));
                              }}
                              style={{
                                padding: '8px 16px',
                                borderRadius: 8,
                                border: isSelected ? '2px solid #059669' : '1px solid #d1d5db',
                                background: isSelected ? '#059669' : '#fff',
                                color: isSelected ? '#fff' : '#374151',
                                cursor: 'pointer',
                                fontSize: 14,
                                fontWeight: 500,
                                transition: 'all 0.2s ease',
                              }}
                            >
                              {kid.name}
                            </button>
                          );
                        })}
                      </div>
                    );
                  }
                  return null;
                } else {
                  // Render dropdown for non-license options or more than 2 options
                  return (
                    <select
                      value={String(selectedLvl2?.id || '')}
                      onChange={(e) => {
                        const next = sortedLvl2Kids.find((c) => String(c.id) === e.target.value) || sortedLvl2Kids[0] || null;
                        // Compute cheapest defaults for Taxi (bodySeats, fuel, modelBrand) under new selection
                        const nextTargetId = String((selectedLvl3 || next || lvl1)?.id || '');
                        const mp = (list) => {
                          try {
                            const prices = [];
                            list.forEach((n) => {
                              const pbr = (n.entry && n.entry.pricesByRow && typeof n.entry.pricesByRow === 'object') ? n.entry.pricesByRow : null;
                              if (!pbr) return;
                              for (const [key, value] of Object.entries(pbr)) {
                                const ids = String(key).split('|');
                                if (ids.some((id) => String(id) === String(nextTargetId))) {
                                  const num = Number(value);
                                  if (!Number.isNaN(num)) prices.push(num);
                                }
                              }
                            });
                            if (prices.length === 0) return null;
                            return Math.min(...prices);
                          } catch { return null; }
                        };
                        const nextBodySeatsOptions = Array.from(new Set(normalizedFiltered
                          .filter((n) => n.body && n.seats)
                          .map((n) => `${n.body}|${n.seats}`)));
                        const bodySeatsWithPrice2 = nextBodySeatsOptions.map((opt) => ({ opt, price: mp(
                          (pair => { const [b,s] = String(pair).split('|'); return normalizedFiltered.filter((n)=> String(n.body)===String(b||'') && String(n.seats)===String(s||'')); })(opt)
                        ) }));
                        bodySeatsWithPrice2.sort((a,b)=>{
                          const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
                          const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
                          return va - vb;
                        });
                        const bestBodySeats = bodySeatsWithPrice2[0]?.opt;
                        const listAfterBody = bestBodySeats ? ((pair)=>{ const [b,s]=String(pair).split('|'); return normalizedFiltered.filter((n)=> String(n.body)===String(b||'') && String(n.seats)===String(s||'')); })(bestBodySeats) : normalizedFiltered;
                        const fuelOpts2 = Array.from(new Set(listAfterBody.map((n)=>n.fuel).filter((v)=> v != null && String(v).trim()!=='')));
                        const fuelWithPrice2 = fuelOpts2.map((opt)=>({ opt, price: mp(listAfterFuel.filter((n)=> String(n.fuel??'')===String(opt))) }));
                        fuelWithPrice2.sort((a,b)=>{
                          const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
                          const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
                          return va - vb;
                        });
                        const bestFuel = fuelWithPrice2[0]?.opt;
                        const listAfterFuel = bestFuel ? listAfterBody.filter((n)=> String(n.fuel??'')===String(bestFuel)) : listAfterBody;
                        const mbPairs2 = Array.from(new Set(listAfterFuel.filter((n)=> n.model != null || n.brand != null).map((n)=> `${n.model || ''}|${n.brand || ''}`)));
                        const mbWithPrice2 = mbPairs2.map((opt)=>{
                          const [m,b] = String(opt).split('|');
                          const lst = listAfterFuel.filter((n)=> String(n.model)===String(m||'') && String(n.brand)===String(b||''));
                          return { opt, price: mp(lst) };
                        });
                        mbWithPrice2.sort((a,b)=>{
                          const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
                          const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
                          return va - vb;
                        });
                        const bestModelBrand = mbWithPrice2[0]?.opt;

                        setAttrSelections({});
                        setTaxiSelections((prev) => ({
                          ...prev,
                          [lvl1.id]: {
                            lvl2: next?.id,
                            lvl3: (Array.isArray(next?.children) && next.children[0]?.id) || undefined,
                            bodySeats: bestBodySeats,
                            fuelType: bestFuel,
                            modelBrand: bestModelBrand,
                          },
                        }));
                      }}
                      style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13 }}
                    >
                      {sortedLvl2Kids.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.name}</option>
                      ))}
                    </select>
                  );
                }
              })()
            ) : null}
          </div>

          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 16,
              padding: 20,
              background: '#D6EEDE',
              width: '100%',
              minHeight: 400,
              height: '100%',
              boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              fontFamily: 'Poppins, sans-serif',
            }}
          >
            <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 600 }}>{displayNode?.name}</h3>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
              {(() => {
                try {
                  const targetId = String((selectedLvl3 || selectedLvl2 || lvl1)?.id || '');
                  const refinedForImages = (() => {
                    const list = filteredByFuel;
                    if (!selState.modelBrand) return list;
                    const [m, b] = String(selState.modelBrand).split('|');
                    return list.filter((n) => String(n.model) === String(m || '') && String(n.brand) === String(b || ''));
                  })();
                  // Build images: prefer inventory entry images, then rowImages, then imageUrl
                  let images = [];
                  refinedForImages.some((n) => {
                    const imgs = Array.isArray(n.entry?.images) ? n.entry.images : [];
                    if (imgs.length) { images = imgs.slice(0, 10); return true; }
                    return false;
                  });
                  if (!images.length) {
                    const rows = Array.isArray(vendor?.rowImages?.[targetId]) ? vendor.rowImages[targetId] : [];
                    if (rows.length) images = rows.slice(0, 10);
                  }
                  if (!images.length && displayNode?.imageUrl) images.push(displayNode.imageUrl);
                  // As a last resort, if no exact row images or inline image, try any rowImages from vendor
                  if (!images.length) {
                    try {
                      const all = vendor?.rowImages || {};
                      for (const k in all) {
                        const rows = Array.isArray(all[k]) ? all[k] : [];
                        if (rows.length) { images = images.concat(rows.slice(0, 10)); break; }
                      }
                    } catch {}
                  }
                  const normImgs = images.map((s) => {
                    const str = String(s);
                    if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:')) return str;
                    return `${ASSET_BASE_URL}${str}`;
                  });
                  if (!normImgs.length) return <div />;
                  const idx = Number(invImgIdx[targetId] || 0) % normImgs.length;
                  return (
                    <div style={{ width: '100%', height: 140, borderRadius: 10, overflow: 'hidden', background: '#f8fafc', position: 'relative' }}>
                      <div style={{ display: 'flex', width: `${normImgs.length * 100}%`, height: '100%', transform: `translateX(-${idx * (100 / normImgs.length)}%)`, transition: 'transform 400ms ease' }}>
                        {normImgs.map((src, i) => (
                          <div key={i} style={{ width: `${100 / normImgs.length}%`, height: '100%', flex: '0 0 auto' }}>
                            <img src={src} alt={`img-${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ))}
                      </div>
                      {normImgs.length > 1 ? (
                        <>
                          <button aria-label="Prev" onClick={() => setInvImgIdx((p) => ({ ...p, [targetId]: ((idx - 1 + normImgs.length) % normImgs.length) }))}
                            style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', width: 22, height: 22, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer' }}>‹</button>
                          <button aria-label="Next" onClick={() => setInvImgIdx((p) => ({ ...p, [targetId]: ((idx + 1) % normImgs.length) }))}
                            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 22, height: 22, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer' }}>›</button>
                          <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, display: 'flex', gap: 6, justifyContent: 'center' }}>
                            {normImgs.map((_, i) => (
                              <button key={i} onClick={() => setInvImgIdx((p) => ({ ...p, [targetId]: i }))} aria-label={`Go to ${i+1}`}
                                style={{ width: i===idx?8:6, height: i===idx?8:6, borderRadius: 999, border: 'none', background: i===idx ? '#fff' : 'rgba(255,255,255,0.6)', cursor: 'pointer' }} />
                            ))}
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                } catch { return <div />; }
              })()}
              {attrAwarePrice != null ? (
                <div className="unified-price">₹ {attrAwarePrice}</div>
              ) : null}
            </div>

            {sortedLvl3Kids.length > 0 ? uiRow('Options', (
              <select
                value={String(selectedLvl3?.id || '')}
                onChange={(e) => {
                  const next = sortedLvl3Kids.find((c) => String(c.id) === e.target.value) || sortedLvl3Kids[0] || null;
                  setTaxiSelections((prev) => ({
                    ...prev,
                    [lvl1.id]: { ...(prev[lvl1.id] || {}), lvl3: next?.id },
                  }));
                  setSelectedLeaf(next || selectedLvl2 || lvl1);
                }}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13 }}
              >
                {sortedLvl3Kids.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.name}</option>
                ))}
              </select>
            )) : null}

            {sortedBodySeatsOptions.length > 0 ? uiRow('Body Type + Seats', (
              <select
                value={String(selState.bodySeats || '')}
                onChange={(e) => {
                  const val = e.target.value || undefined;
                  setTaxiSelections((prev) => ({ ...prev, [lvl1.id]: { ...(prev[lvl1.id] || {}), bodySeats: val, fuelType: undefined, modelBrand: undefined } }));
                }}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13 }}
              >
                <option value="">Any</option>
                {sortedBodySeatsOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt.replace('|', ' | ')}</option>
                ))}
              </select>
            )) : null}

            {sortedFuelOptions.length > 0 ? uiRow('Fuel Type', (
              <select
                value={String(selState.fuelType || '')}
                onChange={(e) => {
                  const val = e.target.value || undefined;
                  setTaxiSelections((prev) => ({ ...prev, [lvl1.id]: { ...(prev[lvl1.id] || {}), fuelType: val, modelBrand: undefined } }));
                }}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', fontSize: 13 }}
              >
                <option value="">Any</option>
                {sortedFuelOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )) : null}

            {sortedModelBrandOptions.length > 0 ? uiRow('Brand + Model', (
              <select
                value={String(selState.modelBrand || '')}
                onChange={(e) => {
                  const val = e.target.value || undefined;
                  setTaxiSelections((prev) => ({ ...prev, [lvl1.id]: { ...(prev[lvl1.id] || {}), modelBrand: val } }));
                }}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', fontSize: 13 }}
              >
                <option value="">Any</option>
                {sortedModelBrandOptions.map((opt) => {
                  const [model, brand] = String(opt).split('|');
                  const display = [brand, model].filter(v => v && String(v).trim()).join(' | ') || '(No details)';
                  return (
                    <option key={opt} value={opt}>{display}</option>
                  );
                })}
              </select>
            )) : null}

            <button
              onClick={handleOpenOtpModal}
              style={{
                marginTop: 'auto',
                width: '100%',
                padding: '10px 14px',
                borderRadius: 28,
                border: 'none',
                background: 'rgb(245 158 11)',
                color: '#111827',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'Poppins, sans-serif',
              }}
            >
              {(() => {
                try {
                  const basePrice = attrAwarePrice != null ? Number(attrAwarePrice) : Number(livePrice);
                  if (!Number.isNaN(basePrice) && basePrice > 0) {
                    return (packagesAddon && typeof packagesAddon.buttonLabel === 'string' && packagesAddon.buttonLabel.trim())
                      ? packagesAddon.buttonLabel.trim()
                      : 'Enroll Now';
                  }
                } catch {}
                return 'Contact for Price';
              })()}
            </button>
          </div>
        </section>
      );
    })}
  </div>
);

}

  const minPriceInSubtree = (n) => {
    let best = null;
    const visit = (x) => {
      if (!x) return;
      const p = x.vendorPrice ?? x.price;
      if (p != null && (best == null || p < best)) best = p;
      if (Array.isArray(x.children) && x.children.length) x.children.forEach(visit);
    };
    visit(n);
    return best;
  };

  // Build simple inventory leaves under a subcategory for given families
  function makeLeavesForFamilies(famList, priceSeed, termsSeed, subNodeId) {
    try {
      const famSet = new Set(Array.isArray(famList) ? famList.map(String) : []);
      const list = (vendor?.inventorySelections?.[categoryId] || []).filter((e) => famSet.has(String(e?.scopeFamily || '')));
      const buckets = new Map(); // attrKey -> { name, price, terms, attributes, scopeFamily }
      list.forEach((entry, idx) => {
        const sel = entry?.selections?.[entry?.scopeFamily] || {};
        const parts = Object.values(sel).filter((v) => v != null && String(v).trim() !== "");
        const name = parts.join(" ") || "Item";
        let leafPrice = null;
        let hasRowForSubNode = false;
        try {
          const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
          if (pbr && subNodeId != null) {
            for (const [rk, val] of Object.entries(pbr)) {
              const ids = String(rk).split('|');
              if (ids.some((id) => String(id) === String(subNodeId))) {
                hasRowForSubNode = true;
                // Only consider rows whose pricingStatusByRow is Active
                if (rowPricingIsActive(entry, rk)) {
                  const n = Number(val);
                  if (!Number.isNaN(n)) { leafPrice = n; break; }
                }
              }
            }
          }
        } catch {}
        // If there are explicit rows for this subNodeId but none are Active,
        // skip this entry entirely so inactive items do not appear in preview.
        if (hasRowForSubNode && leafPrice == null) return;

        // Backward compatibility: if there is no row specifically targeting this
        // subNodeId, fall back to entry.price / priceSeed as before.
        if (!hasRowForSubNode) {
          if (leafPrice == null && entry && entry.price != null && entry.price !== '') {
            const n = Number(entry.price);
            if (!Number.isNaN(n)) leafPrice = n;
          }
          if (leafPrice == null) leafPrice = priceSeed ?? null;
        }

        // Build attribute key for grouping: stable key order
        try {
          const fam = String(entry?.scopeFamily || '');
          const kv = Object.entries(sel)
            .filter(([_, v]) => v != null && String(v).trim() !== '')
            .sort(([a], [b]) => String(a).localeCompare(String(b)))
            .map(([k, v]) => `${k}:${v}`)
            .join('|');
          const attrKey = `${fam}|${kv}`;
          const prev = buckets.get(attrKey);
          if (!prev || (prev.price == null || (leafPrice != null && leafPrice < prev.price))) {
            buckets.set(attrKey, { name, price: leafPrice, terms: termsSeed || "", attributes: sel, scopeFamily: fam });
          }
        } catch {
          // fallback: unique per entry
          const attrKey = `raw-${entry?.scopeFamily || 'fam'}-${entry?.at || idx}`;
          const prev = buckets.get(attrKey);
          if (!prev || (prev.price == null || (leafPrice != null && leafPrice < prev.price))) {
            buckets.set(attrKey, { name, price: leafPrice, terms: termsSeed || "", attributes: sel, scopeFamily: String(entry?.scopeFamily || '') });
          }
        }
      });
      // Emit cheapest per attribute combo, sorted by price asc
      const out = Array.from(buckets.entries())
        .map(([key, v], i) => ({
          id: `inv-${key}-${i}`.replace(/\s+/g, '-'),
          name: v.name,
          children: [],
          vendorPrice: v.price,
          price: v.price,
          terms: v.terms,
          attributes: v.attributes || {},
          scopeFamily: v.scopeFamily || '',
        }))
        .sort((a, b) => {
          const pa = a.vendorPrice == null ? Number.POSITIVE_INFINITY : Number(a.vendorPrice);
          const pb = b.vendorPrice == null ? Number.POSITIVE_INFINITY : Number(b.vendorPrice);
          return pa - pb;
        });
      return out;
    } catch {
      return [];
    }
  }

  const rowPricingIsActive = (entry, key) => {
    try {
      const map =
        entry && entry.pricingStatusByRow && typeof entry.pricingStatusByRow === "object"
          ? entry.pricingStatusByRow
          : {};

      // If a status is defined for this row, only treat it as active when it is "Active".
      // If no explicit status is present, default to active so legacy data still works.
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        const raw = String(map[key] || "").trim().toLowerCase();
        return raw === "active";
      }
      return !isDummyMode;
    } catch {
      return false;
    }
  };

  // Helper: deepest first child
  const deepestFirstChild = (n) => (!n?.children?.length ? n : deepestFirstChild(n.children[0]));

  const enrichNode = (node) => {
    const nodeId = String(node?.id || node?._id || "");
    const famsForNode = new Set([
      ...(familiesByTarget.get(nodeId) || new Set()),
      ...(familiesByTarget.get("ALL") || new Set()),
    ]);
    const famList = Array.from(famsForNode);

    const newChildren = Array.isArray(node?.children)
      ? node.children.map((c) => {
          const priceForC = minPriceInSubtree(c) ?? (c.vendorPrice ?? c.price) ?? null;
          const termsForC = c.terms ?? node.terms ?? "";
          const invLeaves = makeLeavesForFamilies(famList, priceForC, termsForC, c.id);
          const mergedChildren = Array.isArray(c.children) && c.children.length > 0
            ? [...c.children, ...invLeaves]
            : [...invLeaves];
          return { ...c, children: mergedChildren };
        })
      : [];

    return { ...node, children: newChildren };
  };

  // First-level headings only (but hide heading if lvl1 has only flat children-as-cards)
  const renderedTree = root.children.map((lvl1) => {
    const enriched = enrichNode(lvl1);
    const children = Array.isArray(enriched?.children) ? enriched.children : [];
    const hasDeeperLevels = children.some((c) => Array.isArray(c?.children) && c.children.length > 0);
    // SIMPLIFIED: Show all nodes without filtering

    const serviceKey = makeServiceKey(lvl1?.name);
    if (isDummyMode && !(isNodePricingActive(enriched) || hasActivePricingForNode(enriched))) return null;
    return (
      <section
        key={lvl1.id}
        id={serviceKey ? `service-${serviceKey}` : undefined}
        style={{ marginBottom: 16 }}
      >
        {hasDeeperLevels && (
          <h2
            style={{
              margin: "0 0 12px",
              textTransform: "Capitalize",
              fontSize: "18px",
              fontWeight: 600,
            }}
          >
            {lvl1.name}
          </h2>
        )}
        <div
          className="first-level-card-row"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            alignItems: 'stretch',
            justifyContent: 'center',
          }}
        >
          {(() => {
            const mapModeToDt = (m) => {
              const x = String(m || '').toLowerCase();
              if (x === 'card') return 'card';
              if (x === 'dropdown' || x === 'select') return 'dropdown';
              if (x === 'button' || x === 'buttons') return 'buttons';
              return null;
            };

            const renderNode = (child, parentNode) => {
              if (isDummyMode && !(isNodePricingActive(child) || hasActivePricingForNode(child))) return null;
              const pick = (arr) => Array.isArray(arr) && arr.length > 0 ? String(arr[0]).toLowerCase() : null;
              // Precedence: node.displayType -> parent.displayType -> root.displayType -> card
              let dt = pick(child?.displayType) || pick(parentNode?.displayType) || pick(lvl1?.displayType) || 'card';

              // Debug trace

              // Card: keep existing rich card behavior
              if (dt === 'card') {
                let livePrice = null;
                const priceRows = vendor?.inventorySelections?.[categoryId] || [];
                for (const entry of priceRows) {
                  const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
                  if (!pbr) continue;
                  for (const [key, value] of Object.entries(pbr)) {
                    const ids = String(key).split('|');
                    if (ids.some((id) => String(id) === String(child.id))) { livePrice = Number(value); break; }
                  }
                  if (livePrice != null) break;
                }
                if (livePrice == null) {
                  livePrice = vendor?.pricing?.[child.id] ?? vendor?.pricing?.[parentNode?.id] ?? child.vendorPrice ?? child.price ?? null;
                }
                const nodeWithLivePrice = { ...child, vendorPrice: livePrice, price: livePrice };
                return (
                  <ParentWithSizesCard
                    key={child.id}
                    node={nodeWithLivePrice}
                    selection={cardSelections[child.id]}
                    onSelectionChange={(parent, leaf) => {
                      setCardSelections((prev) => ({ ...prev, [child.id]: { parent, child: leaf } }));
                      // Reset attribute selections when parent changes to avoid stale values
                      setAttrSelections({});
                    }}
                    onLeafSelect={(leaf) => setSelectedLeaf(leaf)}
                    mode={'buttons'}
                    includeLeafChildren={Boolean(child?.uiRules?.includeLeafChildren ?? true)}
                  />
                );
              }

              const kids = Array.isArray(child.children) ? child.children : [];
              if (kids.length === 0) {
                // Render standalone card with price/terms/image when a first-level child has no children
                let livePrice = null;
                try {
                  const priceRows = vendor?.inventorySelections?.[categoryId] || [];
                  for (const entry of priceRows) {
                    const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
                    if (!pbr) continue;
                    for (const [key, value] of Object.entries(pbr)) {
                      const ids = String(key).split('|');
                      if (ids.some((id) => String(id) === String(child.id))) { livePrice = Number(value); break; }
                    }
                    if (livePrice != null) break;
                  }
                } catch {}
                if (livePrice == null) {
                  livePrice = vendor?.pricing?.[child.id] ?? vendor?.pricing?.[parentNode?.id] ?? child.vendorPrice ?? child.price ?? null;
                }
                const imgSrc = (() => {
                  const s = String(child?.imageUrl || '');
                  if (!s) return null;
                  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) return s;
                  if (s.startsWith('/')) return `${ASSET_BASE_URL}${s}`;
                  return `${ASSET_BASE_URL}/${s}`;
                })();
                const termsRaw = child?.terms || '';
                const termsArr = Array.isArray(termsRaw)
                  ? termsRaw
                  : String(termsRaw || '')
                      .split(/\r?\n|,|;|\u2022/g)
                      .map((s) => s.trim())
                      .filter(Boolean);
                const terms = termsArr.join(', ');
                return (
                  <section key={child.id} style={{ flex: '1 1 320px', minWidth: 300 }}>
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff', display: 'flex', flexDirection: 'column', gap: 10, width: '100%', minHeight: 400, justifyContent: 'flex-start', height: '100%' }}>
                      <h3 style={{ margin: 0 }}>{child.name}</h3>
                      {imgSrc ? (
                        <img src={imgSrc} alt={child.name} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 8 }} />
                      ) : null}
                      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {livePrice != null ? (
                          <div className="unified-price">₹{Number(livePrice)}</div>
                        ) : null}
                        {terms ? (
                          <div style={{ fontSize: 12, color: '#6b7280' }}>{terms}</div>
                        ) : null}
                        <button
                          onClick={async () => {
                            try {
                              const allow = await guardEnrollClick();
                              if (!allow) return;
                              const priceNumber = livePrice == null ? null : Number(livePrice);
                              const pathNames = [categoryTree?.name, child?.name].filter(Boolean);
                              const pathIds = [categoryId, child?.id].filter(Boolean);
                              const childAttrs = child?.attributes || {};
                              // Use inventoryName if already set, otherwise build from brand/model
                              let childInvName = childAttrs.inventoryName || '';
                              if (!childInvName) {
                                const childBrand =
                                  (typeof childAttrs.brand === "string" && childAttrs.brand.trim()) ||
                                  (typeof childAttrs.bikeBrand === "string" && childAttrs.bikeBrand.trim()) ||
                                  "";
                                const childModel =
                                  (typeof childAttrs.model === "string" && childAttrs.model.trim()) ||
                                  (typeof childAttrs.modelName === "string" && childAttrs.modelName.trim()) ||
                                  "";
                                childInvName = [childBrand, childModel].filter(Boolean).join(" ");
                              }
                              const childAttrsWithImage = {
                                ...childAttrs,
                                parentSelectorLabel: childLabelForCard || labelForCard || parentSelectorLabel || "",
                              };
                              if (!childAttrsWithImage.imageUrl) {
                                const imgCandidate = child?.imageUrl || child?.iconUrl || "";
                                if (imgCandidate) childAttrsWithImage.imageUrl = imgCandidate;
                              }

                              await postEnquiry({
                                source: "individual",
                                serviceName: child?.name || "",
                                price: Number.isNaN(priceNumber) ? null : priceNumber,
                                terms: terms || "",
                                categoryPath: pathNames,
                                categoryIds: pathIds,
                                attributes: childInvName
                                  ? { ...childAttrsWithImage, inventoryName: childInvName }
                                  : childAttrsWithImage,
                              });
                            } catch (e) {
                              console.error("Enroll Now enquiry error", e);
                            }
                          }}
                          style={{ width: '100%', padding: '10px 14px', borderRadius: 28, border: 'none', background: 'rgb(245 158 11)', color: '#111827', fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
                        >
                          {(() => {
                            try {
                              const num = Number(livePrice);
                              if (!Number.isNaN(num) && num > 0) {
                                if (individualAddon && typeof individualAddon.buttonLabel === 'string' && individualAddon.buttonLabel.trim()) {
                                  return individualAddon.buttonLabel.trim();
                                }
                                return 'Enroll Now';
                              }
                            } catch {}
                            return 'Contact for Price';
                          })()}
                        </button>
                      </div>
                    </div>
                  </section>
                );
              }

              const selectedId = nodeSelections[child.id] || kids[0]?.id;
              const selected = kids.find((k) => String(k.id) === String(selectedId)) || kids[0];

              if (dt === 'buttons' || dt === 'button') {
                return (
                  <div key={child.id} style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 260 }}>
                    <div style={{ fontWeight: 600 }}>{child.name}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {kids.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setNodeSelections((p) => ({ ...p, [child.id]: opt.id }));
                            const leaf = deepestFirstChild(opt);
                            if (leaf) setSelectedLeaf(leaf);
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 999,
                            border: String(selected?.id) === String(opt.id) ? '2px solid #2563eb' : '1px solid #d1d5db',
                            background: String(selected?.id) === String(opt.id) ? '#2563eb' : '#f9fafb',
                            color: String(selected?.id) === String(opt.id) ? '#fff' : '#111827',
                            cursor: 'pointer',
                            fontSize: 13,
                          }}
                        >
                          {opt.name}
                        </button>
                      ))}
                    </div>
                    {selected ? renderNode(selected, child) : null}
                  </div>
                );
              }

              if (dt === 'dropdown' || dt === 'select') {
                return (
                  <div key={child.id} style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 260 }}>
                    <div style={{ fontWeight: 600 }}>{child.name}</div>
                    <select
                      value={String(selected?.id || '')}
                      onChange={(e) => {
                        const next = kids.find((c) => String(c.id) === e.target.value) || kids[0];
                        setNodeSelections((p) => ({ ...p, [child.id]: next?.id }));
                        const leaf = deepestFirstChild(next);
                        if (leaf) setSelectedLeaf(leaf);
                      }}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13 }}
                    >
                      {kids.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.name}</option>
                      ))}
                    </select>
                    {selected ? renderNode(selected, child) : null}
                  </div>
                );
              }

              // fallback to card if unknown
              return renderNode({ ...child, displayType: ['Card'] }, parentNode);
            };

            const kidsTop = Array.isArray(enriched.children) ? enriched.children : [];
            if (kidsTop.length === 0) {
              // Render the first-level node itself as a card (leaf L1)
              const hasCategoryActiveLeaf = isNodePricingActive(enriched);
              const hasInventoryActiveLeaf = false; // Inventory active check is done via hasActivePricingForNode
              let livePrice = null;
              try {
                const priceRows = vendor?.inventorySelections?.[categoryId] || [];
                for (const entry of priceRows) {
                  const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
                  if (!pbr) continue;
                  for (const [key, value] of Object.entries(pbr)) {
                    const ids = String(key).split('|');
                    if (ids.some((id) => String(id) === String(enriched.id))) { livePrice = Number(value); break; }
                  }
                  if (livePrice != null) break;
                }
              } catch {}
              if (livePrice == null) {
                livePrice = vendor?.pricing?.[enriched.id] ?? vendor?.pricing?.[root?.id] ?? enriched.vendorPrice ?? enriched.price ?? null;
              }
              if (!hasCategoryActiveLeaf && !hasInventoryActiveLeaf && !hasActivePricingForNode(enriched)) return null;
              const imgSrc = (() => {
                const s = String(enriched?.imageUrl || '');
                if (!s) return null;
                if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) return s;
                if (s.startsWith('/')) return `${ASSET_BASE_URL}${s}`;
                return `${ASSET_BASE_URL}/${s}`;
              })();
              const termsRaw = enriched?.terms || '';
              const termsArr = Array.isArray(termsRaw)
                ? termsRaw
                : String(termsRaw || '')
                    .split(/\r?\n|,|;|\u2022/g)
                    .map((s) => s.trim())
                    .filter(Boolean);
              const terms = termsArr.join(', ');
              return [
                (
                  <section key={enriched.id} style={{ flex: '1 1 320px', minWidth: 300 }}>
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff', display: 'flex', flexDirection: 'column', gap: 10, width: '100%', minHeight: 400, justifyContent: 'flex-start', height: '100%' }}>
                      <h3 style={{ margin: 0 }}>{enriched.name}</h3>
                      {imgSrc ? (
                        <img src={imgSrc} alt={enriched.name} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 8 }} />
                      ) : null}
                      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {livePrice != null ? (
                          <div className="unified-price">₹{Number(livePrice)}</div>
                        ) : null}
                        {terms ? (
                          <div style={{ fontSize: 12, color: '#6b7280' }}>{terms}</div>
                        ) : null}
                        <button
                          onClick={async () => {
                            try {
                              const allow = await guardEnrollClick();
                              if (!allow) return;
                              const priceNumber = livePrice == null ? null : Number(livePrice);
                              const pathNames = [categoryTree?.name, enriched?.name].filter(Boolean);
                              const pathIds = [categoryId, enriched?.id].filter(Boolean);
                              const pkgAttrs = enriched?.attributes || {};
                              // Use inventoryName if already set, otherwise build from brand/model
                              let pkgInvName = pkgAttrs.inventoryName || '';
                              if (!pkgInvName) {
                                const pkgBrand =
                                  (typeof pkgAttrs.brand === "string" && pkgAttrs.brand.trim()) ||
                                  (typeof pkgAttrs.bikeBrand === "string" && pkgAttrs.bikeBrand.trim()) ||
                                  "";
                                const pkgModel =
                                  (typeof pkgAttrs.model === "string" && pkgAttrs.model.trim()) ||
                                  (typeof pkgAttrs.modelName === "string" && pkgAttrs.modelName.trim()) ||
                                  "";
                                pkgInvName = [pkgBrand, pkgModel].filter(Boolean).join(" ");
                              }
                              await postEnquiry({
                                source: "package",
                                serviceName: enriched?.name || "",
                                price: Number.isNaN(priceNumber) ? null : priceNumber,
                                terms: terms || "",
                                categoryPath: pathNames,
                                categoryIds: pathIds,
                                attributes: pkgInvName
                                  ? { ...pkgAttrs, inventoryName: pkgInvName }
                                  : pkgAttrs,
                              });
                            } catch (e) {
                              console.error("Enroll Now enquiry error (package)", e);
                            }
                          }}
                          style={{ width: '100%', padding: '10px 14px', borderRadius: 28, border: 'none', background: 'rgb(245 158 11)', color: '#111827', fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
                        >
                          {(packagesAddon && typeof packagesAddon.buttonLabel === 'string' && packagesAddon.buttonLabel.trim())
                            ? packagesAddon.buttonLabel.trim()
                            : (() => {
                                try {
                                  const num = Number(livePrice);
                                  if (!Number.isNaN(num) && num > 0) return 'Enroll Now';
                                } catch {}
                                return 'Contact for Price';
                              })()}
                        </button>
                      </div>
                    </div>
                  </section>
                )
              ];
            }
            
            // If ALL children are leaves, render a single parent card with inline buttons (sizes)
            const allKidsAreLeaves =
              kidsTop.length > 0 &&
              kidsTop.every((k) => !Array.isArray(k.children) || k.children.length === 0);
            if (allKidsAreLeaves) {
              const hasCategoryActiveLeaf = isNodePricingActive(enriched);
              const hasInventoryActiveLeaf = false; // Inventory active check is done via hasActivePricingForNode
              let livePrice = null;
              try {
                const priceRows = vendor?.inventorySelections?.[categoryId] || [];
                for (const entry of priceRows) {
                  const pbr =
                    entry && entry.pricesByRow && typeof entry.pricesByRow === 'object'
                      ? entry.pricesByRow
                      : null;
                  if (!pbr) continue;
                  for (const [key, value] of Object.entries(pbr)) {
                    const ids = String(key).split('|');
                    if (!ids.some((id) => String(id) === String(enriched.id))) continue;
                    if (!rowPricingIsActive(entry, key)) continue;
                    livePrice = Number(value);
                    break;
                  }
                  if (livePrice != null) break;
                }
              } catch {}
              if (livePrice == null) {
                livePrice =
                  vendor?.pricing?.[enriched.id] ??
                  vendor?.pricing?.[root?.id] ??
                  enriched.vendorPrice ??
                  enriched.price ??
                  null;
              }
              if (!hasCategoryActiveLeaf && !hasInventoryActiveLeaf && !hasActivePricingForNode(enriched)) return null;
              const nodeWithLivePrice = { ...enriched, vendorPrice: livePrice, price: livePrice };
              return (
                <ParentWithSizesCard
                  key={`parent-${enriched.id}`}
                  node={nodeWithLivePrice}
                  selection={cardSelections[enriched.id]}
                  onSelectionChange={(parent, leaf) => {
                    setCardSelections((prev) => ({ ...prev, [enriched.id]: { parent, child: leaf } }));
                    // Reset attribute selections when parent changes to avoid stale values
                    setAttrSelections({});
                  }}
                  onLeafSelect={(leaf) => setSelectedLeaf(leaf)}
                  mode={'buttons'}
                  includeLeafChildren={true}
                />
              );
            }

            // Sort children by minimum price in their subtree
            // Filter out inactive children for accepted vendors
            const filteredKids = kidsTop.filter((child) => {
              try {
                return isNodePricingActive(child) || hasActivePricingForNode(child);
              } catch {
                return false;
              }
            });
            const sortedKids = [...filteredKids].sort((a, b) => {
              const pa = minPriceInSubtree(a);
              const pb = minPriceInSubtree(b);
              const va = pa == null ? Number.POSITIVE_INFINITY : Number(pa);
              const vb = pb == null ? Number.POSITIVE_INFINITY : Number(pb);
              return va - vb;
            });
            if (sortedKids.length === 0) return null; // Hide section if no active children
            return sortedKids.map((child) => renderNode(child, enriched));
          })()}
        </div>
      </section>
    );
  });

  return renderedTree;
};

  const isDrivingSchool = String(categoryTree?.name || "").toLowerCase() === "driving school";

  const inventoryLabelsFromMeta = (() => {
    try {
      if (Array.isArray(inventoryLabelsList) && inventoryLabelsList.length) {
        return inventoryLabelsList;
      }
      const out = [];
      const push = (v) => {
        if (v == null) return;
        const t = String(v).trim();
        if (!t) return;
        if (!out.includes(t)) out.push(t);
      };

      // Gather labels from linkedAttributes *:inventoryLabels arrays
      const linked = (categoryTree && categoryTree.linkedAttributes && typeof categoryTree.linkedAttributes === "object")
        ? categoryTree.linkedAttributes
        : {};
      Object.entries(linked).forEach(([k, v]) => {
        if (!String(k || "").endsWith(":inventoryLabels")) return;
        if (!Array.isArray(v)) return;
        v.forEach(push);
      });

      // Fallbacks: inventoryLabel on tree, ui.inventoryLabel, and inventoryLabelName from wmJson
      push(categoryTree?.inventoryLabel);
      push(categoryTree?.ui?.inventoryLabel);
      push(inventoryLabelName);

      return out;
    } catch {
      return [];
    }
  })();

  const inventoryLabelFromMeta = inventoryLabelsFromMeta.length > 0 ? inventoryLabelsFromMeta[0] : null;

  const handleOpenVendorPricingNonCombos = (labelFromDropdown) => {
    try {
      if (!vendorId || !categoryId || typeof window === "undefined") return;
      const base = window.location.origin.replace(/\/$/, "");
      const safeLabel = encodeURIComponent(String(labelFromDropdown || "").trim());
      const url = safeLabel
        ? `${base}/preview/${vendorId}/${categoryId}/my-prices/${safeLabel}`
        : `${base}/preview/${vendorId}/${categoryId}/my-prices`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {}
  };

  const handleOpenVendorPricingCombos = (labelFromDropdown) => {
    try {
      if (!vendorId || !categoryId || typeof window === "undefined") return;
      const base = window.location.origin.replace(/\/$/, "");
      // For combos, open the dedicated packages flow; the label from the
      // dropdown is not needed here because the list page will show all
      // relevant packages.
      const url = `${base}/preview/${vendorId}/${categoryId}/my-prices-packages`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {}
  };

  const handleSaveHomeLocation = async (pos) => {
    try {
      if (!pos || typeof pos.lat !== "number" || typeof pos.lng !== "number") return;
      if (!vendorId) return;

      const areaCity = typeof pos.label === "string" ? pos.label.trim() : "";

      const res = await fetch(`${API_BASE_URL}/api/vendors/${vendorId}/location`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: pos.lat, lng: pos.lng, areaCity, address: areaCity }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data || !data.location) {
        alert("Failed to save location");
        return;
      }

      const mergedLocation = {
        ...(data.location || {}),
        lat: pos.lat,
        lng: pos.lng,
        ...(areaCity ? { areaCity, address: areaCity } : {}),
      };

      setLocation(mergedLocation);
      setVendor((prev) => (prev ? { ...prev, location: mergedLocation } : prev));

      // Best-effort sync to dummy-vendor location so DummyVendorStatusListPage table reflects the same home location
      (async () => {
        try {
          let nearbyLocations = [];
          try {
            const cur = await fetch(`${API_BASE_URL}/api/dummy-vendors/${vendorId}/location`);
            const curJson = await cur.json().catch(() => ({}));
            nearbyLocations = curJson?.location?.nearbyLocations || [];
          } catch {}

          await fetch(`${API_BASE_URL}/api/dummy-vendors/${vendorId}/location`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: pos.lat,
              lng: pos.lng,
              nearbyLocations,
              ...(areaCity ? { areaCity, address: areaCity } : {}),
            }),
          });
        } catch {}
      })();

      setShowHomeLocationModal(false);
    } catch (err) {
      console.error("Error saving home location", err);
      alert("Error saving location");
    }
  };

  const handleNavHomeLocation = () => {
    try {
      if (!vendorId) return;
      setShowHomeLocationModal(true);
    } catch {}
  };

  const handleNavBusinessLocation = () => {
    try {
      if (!vendorId) return;
      setShowBusinessLocationModal(true);
    } catch {}
  };

  const handleNavBusinessHours = () => {
    try {
      setShowBusinessHoursModal(true);
      const hours = vendor?.businessHours || vendor?.timings || null;
      console.log("Business Hours clicked", hours);
    } catch {}
  };

  const handleNavInventory = (labelFromDropdown) => {
    try {
      // Even if isInventoryModel flag is false, if there are inventory labels configured
      // we still want to open the popup so the vendor can see existing data.
      const la = linkedAttributes || {};
      const normLabel = (v) => String(v || "").trim().toLowerCase();
      let foundScope = null;
      Object.entries(la).forEach(([key, value]) => {
        if (foundScope) return;
        if (!String(key || "").endsWith(":inventoryLabels")) return;
        const fam = String(key).split(":")[0];
        const arr = Array.isArray(value) ? value : [];
        arr.forEach((lbl) => {
          if (foundScope) return;
          if (normLabel(lbl) === normLabel(labelFromDropdown)) {
            foundScope = { family: fam, label: lbl };
          }
        });
      });
      if (!foundScope && inventoryLabelName) {
        foundScope = { family: "inventory", label: inventoryLabelName };
      }
      // If still nothing, fall back to a generic "inventory" family using the clicked label
      if (!foundScope) {
        const safeLabel = String(labelFromDropdown || inventoryLabelName || "Inventory").trim() || "Inventory";
        foundScope = { family: "inventory", label: safeLabel };
      }
      setActiveInvScope(foundScope);
      setShowLinkedModal(true);
      try {
        fetchModelsForFamily(foundScope.family);
      } catch {}
    } catch {}
  };

  return (
    <div id="preview-page" style={{ padding: 0, background: "#F0FDF4" }}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/redesignr.css?v=23" />
      </Head>
      <style jsx global>{`
        @keyframes setupTimerPulse {
          0% { transform: scale(1); opacity: 0.75; }
          50% { transform: scale(1.55); opacity: 0.2; }
          100% { transform: scale(1); opacity: 0.75; }
        }
        @keyframes setupTimerSlideIn {
          from { transform: translateY(-6px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      {setupCreationFinalMs != null && (
        <div
          style={{
            position: "fixed",
            top: 96,
            right: 16,
            zIndex: 2600,
            background: "linear-gradient(135deg, #ffffff, #ecfdf5)",
            border: "1px solid rgba(16,185,129,0.25)",
            borderRadius: 12,
            boxShadow: "0 18px 40px rgba(15,23,42,0.18)",
            padding: "12px 12px",
            fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 250,
            animation: "setupTimerSlideIn 220ms ease-out",
          }}
        >
          <div
            style={{
              width: 10,
              height: 42,
              borderRadius: 999,
              background: "linear-gradient(180deg, #10b981, #06b6d4)",
              boxShadow: "0 10px 18px rgba(16,185,129,0.25)",
              flexShrink: 0,
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <div style={{ fontSize: 12, color: "#065f46", fontWeight: 700 }}>
              Preview ready
            </div>
            <div
              style={{
                fontSize: 14,
                color: "#0f172a",
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: 0.2,
              }}
            >
              {formatElapsed(setupCreationFinalMs)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              try {
                setSetupCreationFinalMs(null);
                setSetupCreationTimerKey("");
              } catch {}
            }}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "#6b7280",
              fontSize: 18,
              lineHeight: 1,
              padding: "2px 6px",
              borderRadius: 8,
            }}
          >
            ×
          </button>
        </div>
      )}
      {loading ? (
        <FullPageShimmer />
      ) : (
        <>
          <TopNavBar
            businessName={vendor?.businessName || "Loading..."}
            identityRole={navIdentity.role}
            identityDisplayName={navIdentity.displayName}
            identityLoggedIn={navIdentity.loggedIn}
            vendor={vendor}
            hasCombos={hasPackagesForNav}
            inventoryLabel={inventoryLabelFromMeta}
            inventoryLabels={inventoryLabelsFromMeta}
            isInventoryModel={isInventoryModel}
            onNavigateMyPricesCombos={handleOpenVendorPricingCombos}
            onNavigateMyPricesNonCombos={handleOpenVendorPricingNonCombos}
            onNavigateHomeLocation={handleNavHomeLocation}
            onNavigateBusinessLocation={handleNavBusinessLocation}
            onNavigateBusinessHours={handleNavBusinessHours}
            onNavigateInventory={handleNavInventory}
            onNavigateMyEnquiries={async () => {
              try {
                if (!vendorId || !categoryId) return;
                setMyEnquiriesLoading(true);
                setMyEnquiriesError("");
                const params = new URLSearchParams();
                params.set("vendorId", String(vendorId));
                params.set("categoryId", String(categoryId));
                const res = await fetch(`${API_BASE_URL}/api/enquiries?${params.toString()}`, {
                  cache: "no-store",
                });
                const list = await res.json().catch(() => []);
                setMyEnquiries(Array.isArray(list) ? list : []);
                setExpandedEnquiryGroup(null); // Reset expanded group when opening modal
                setShowMyEnquiriesModal(true);
              } catch (e) {
                setMyEnquiries([]);
                setMyEnquiriesError(e?.message || "Failed to load enquiries");
                setExpandedEnquiryGroup(null); // Reset expanded group when opening modal
                setShowMyEnquiriesModal(true);
              } finally {
                setMyEnquiriesLoading(false);
              }
            }}
            onOpenLogin={handleOpenOtpModal}
            onOpenSetupBusiness={handleOpenSetupBusiness}
            onLogout={handleLogout}
            services={serviceLabels}
            categoryTree={categoryTree}
            selectedLeaf={selectedLeaf}
            onLeafSelect={setSelectedLeaf}
            hasPackages={hasPackagesForNav}
            webMenu={webMenu}
            servicesNavLabel={servicesNavLabel}
            socialHandles={socialHandles}
          />
          <HomeSection
            businessName={vendor?.businessName || "Loading..."}
            profilePictures={
              (Array.isArray(vendor?.profilePictures) && vendor.profilePictures.length
                ? vendor.profilePictures
                : categoryProfilePictures) || []
            }
            heroTitle={heroTitle || router?.query?.ft1 || vendor?.freeTexts?.[0] || vendor?.customFields?.freeText1 || vendor?.ui?.heroTitle}
            heroDescription={
              heroDescription ||
              router?.query?.ft2 ||
              vendor?.freeTexts?.[1] ||
              vendor?.customFields?.freeText2 ||
              vendor?.ui?.heroDescription
            }
            homePopup={homePopup}
            vendorAddonTitle={vendorAddonTitle}
            vendorAddonDescription={vendorAddonDescription}
          />
          <main id="products" style={{ padding: "20px", marginTop: "10px" }}>
            {hasPackagesForNav && Array.isArray(combos) && combos.length > 0 ? (
              <section style={{ marginBottom: 8 }}>
                {isDrivingSchool ? (
                  <div style={{ textAlign: "center", marginBottom: 16, fontFamily: "Poppins, sans-serif" }}>
                    <h2 style={{ margin: 0, fontSize: 30, fontWeight: 700 }}>
                      {(packagesAddon && typeof packagesAddon.heading === 'string' && packagesAddon.heading.trim())
                        ? packagesAddon.heading.trim()
                        : 'Explore Our Driving Packages'}
                    </h2>
                    <p style={{ margin: "6px 0 0", fontSize: 18, color: "#4b5563" }}>
                      {(packagesAddon && typeof packagesAddon.description === 'string' && packagesAddon.description.trim())
                        ? packagesAddon.description.trim()
                        : 'Comprehensive bundles designed to give you the best value and a complete learning experience.'}
                    </p>
                  </div>
                ) : null}
                {/* <h2 style={{ margin: '0 0 10px 0' }}>Packages</h2> */}
                <div
                  className="combos-card-row"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: "16px",
                    alignItems: 'stretch',
                    justifyContent: 'center',
                  }}
                >
                  {combos.map((combo, idx) => {
                    const name = combo?.name || 'Package';
                    // Be very tolerant about where the combo image might live
                    const comboImageCandidates = (() => {
                      try {
                        const out = [];
                        const push = (v) => { if (v) out.push(v); };
                        push(combo?.imageUrl);
                        push(combo?.image);
                        if (Array.isArray(combo?.images)) combo.images.forEach(push);
                        if (Array.isArray(combo?.imageUrls)) combo.imageUrls.forEach(push);
                        if (Array.isArray(combo?.photos)) combo.photos.forEach(push);
                        if (Array.isArray(combo?.pictures)) combo.pictures.forEach(push);
                        return out;
                      } catch { return []; }
                    })();
                    const img = comboImageCandidates.find((v) => v) || null;
                    const items = Array.isArray(combo?.items) ? combo.items : [];
                    const perSizeArr = Array.isArray(combo?.perSize) ? combo.perSize : [];
                    // Compute best price from variants across items, fallback to basePrice
                    let variantPrices = [];
                    try {
                      items.forEach((it) => {
                        const vs = Array.isArray(it?.variants) ? it.variants : [];
                        vs.forEach((v) => {
                          const p = v?.price;
                          if (p !== undefined && p !== null && String(p) !== '' && !Number.isNaN(Number(p))) {
                            variantPrices.push(Number(p));
                          }
                        });
                      });
                    } catch {}
                    // Build includes label from parent services (Step 2 selections)
                    const includesLabel = (() => {
                      try {
                        const pickId = (n) => String(n?.id || n?._id || '');
                        const findParentName = (node, targetId, parentName = '') => {
                          if (!node) return '';
                          const id = pickId(node);
                          if (id === String(targetId)) return parentName || '';
                          const children = Array.isArray(node.children) ? node.children : [];
                          for (const ch of children) {
                            const res = findParentName(ch, targetId, node?.name || parentName || '');
                            if (res) return res;
                          }
                          return '';
                        };
                        const seen = new Set();
                        const names = [];
                        items.forEach((it) => {
                          let nm = '';
                          if (it?.kind === 'custom') nm = it?.name || 'Custom';
                          else if (it?.categoryId) {
                            const pidName = findParentName(categoryTree, String(it.categoryId));
                            nm = pidName || 'Service';
                          }
                          nm = String(nm || '').trim();
                          const key = nm.toLowerCase();
                          if (nm && !seen.has(key)) { seen.add(key); names.push(nm); }
                        });
                        return names.join(', ');
                      } catch { return ''; }
                    })();
                    const comboId = combo._id?.$oid || combo._id || combo.id;
                    const rawSizes = (() => {
                      try {
                        const set = new Set();
                        // If no items, add a default placeholder
                        if (items.length === 0) {
                          set.add('—');
                        }
                        items.forEach((it) => {
                          const vs = Array.isArray(it?.variants) ? it.variants : [];
                          if (vs.length === 0) {
                            set.add('—');
                          }
                          vs.forEach((v) => {
                            const s = v?.size || '—';
                            set.add(s);
                          });
                        });
                        return Array.from(set);
                      } catch { return ['—']; }
                    })();
                    const baseStatusMap =
                      combo && combo.pricingStatusPerSize && typeof combo.pricingStatusPerSize === 'object'
                        ? combo.pricingStatusPerSize
                        : {};
                    const statusMap = (() => {
                      try {
                        const out = { ...(baseStatusMap || {}) };
                        if (vendorComboOverrides && comboId) {
                          Object.entries(vendorComboOverrides).forEach(([key, ov]) => {
                            const [cid, sk] = String(key).split('|');
                            if (String(cid) !== String(comboId)) return;
                            const status = ov && ov.status ? String(ov.status).trim() : '';
                            if (!status) return;
                            out[sk || 'default'] = status;
                          });
                        }
                        return out;
                      } catch { return baseStatusMap || {}; }
                    })();
                    // Treat only non-placeholder entries as real combo types for the UI selector
                    // and hide any size that is explicitly marked as inactive in pricingStatusPerSize.
                    const sizes = rawSizes.filter((s) => {
                      const v = String(s || '').trim();
                      if (!v) return false;

                      const isPlaceholder = (() => {
                        const x = v.toLowerCase();
                        return x === '—' || x === '-' || x === 'na' || x === 'n/a' || x === 'none';
                      })();

                      // Check if this size is marked as Active in pricingStatusPerSize
                      const sizeKey = isPlaceholder ? 'default' : v;
                      const sizeStatus = String(statusMap[sizeKey] || '').trim().toLowerCase();

                      // Require explicit Active
                      if (sizeStatus === 'active') return true;
                      return false;
                    });
                    
                    // No fallback - only show active sizes
                    const effectiveSizes = sizes;
                    
                    // Skip rendering this combo if no active sizes
                    if (effectiveSizes.length === 0) return null;
                    
                    // Check if all sizes are just placeholders (should hide Size section)
                    const hasRealSizes = effectiveSizes.some((s) => {
                      const v = String(s || '').trim();
                      return v && v !== '—' && v.toLowerCase() !== 'na' && v.toLowerCase() !== 'n/a';
                    });
                    const base = (combo && combo.basePrice != null && combo.basePrice !== '') ? Number(combo.basePrice) : null;
                    const selectedSize = (packageSelections[idx]?.size != null)
                      ? packageSelections[idx].size
                      : (effectiveSizes[0] ?? null);
                    const sizeKey = selectedSize || 'default';
                    const comboStatus = String(statusMap[sizeKey] || 'Inactive').trim().toLowerCase();
                    const priceBySize = (() => {
                      try {
                        if (!selectedSize) return null;
                        const prices = [];
                        items.forEach((it) => {
                          const vs = Array.isArray(it?.variants) ? it.variants : [];
                          vs.forEach((v) => {
                            const match = (v?.size || '—') === selectedSize;
                            if (match) {
                              const p = v?.price;
                              if (p !== undefined && p !== null && String(p) !== '' && !Number.isNaN(Number(p))) prices.push(Number(p));
                            }
                          });
                        });
                        if (prices.length) return Math.min(...prices);
                        return null;
                      } catch { return null; }
                    })();
                    const bestVar = variantPrices.length ? Math.min(...variantPrices) : null;
                    const vendorOverrideKey = `${comboId}|${sizeKey}`;
                    const vendorOverride = vendorComboOverrides?.[vendorOverrideKey];
                    const overridePrice =
                      vendorOverride && vendorOverride.price != null && !Number.isNaN(vendorOverride.price)
                        ? vendorOverride.price
                        : null;
                    const price =
                      overridePrice != null
                        ? overridePrice
                        : (priceBySize != null ? priceBySize : (bestVar != null ? bestVar : base));
                    const priceNode = (price != null && !Number.isNaN(price)) ? (
                      <div
                        className="font-extrabold text-emerald-600 unified-price"
                        style={{ marginBottom: 8, fontSize: 16, textAlign: 'center' }}
                      >
                        ₹{price}
                      </div>
                    ) : null;
                    const termsRaw = combo?.terms || combo?.term || '';
                    const termsArr = Array.isArray(termsRaw)
                      ? termsRaw
                      : String(termsRaw || '')
                          .split(/\r?\n|,|;|\u2022/g)
                          .map((s) => s.trim())
                          .filter(Boolean);
                    const terms = termsArr.join(', ');
                    const imgSrc = (() => {
                      const isValidImg = (val) => {
                        if (!val) return false;
                        const s = String(val || '');
                        if (!s) return false;
                        // Ignore broken dummy upload paths
                        if (s.includes('/uploads/undefined')) return false;
                        return true;
                      };

                      const normalize = (val) => {
                        const s = String(val || '');
                        // For absolute/S3 URLs, append a cache-buster so updated images are fetched fresh
                        if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) {
                          try {
                            const url = new URL(s);
                            // Use combo.updateAt/updatedAt or Date.now() as a cache buster
                            const ts = combo?.updatedAt || combo?.updateAt || undefined;
                            if (ts) {
                              url.searchParams.set('t', String(ts));
                            }
                            return url.toString();
                          } catch {
                            return s;
                          }
                        }
                        if (s.startsWith('/')) return `${ASSET_BASE_URL}${s}`;
                        return `${ASSET_BASE_URL}/${s}`;
                      };

                      // 1) If combo types/perSize exist, always use perSize image as single source of truth
                      try {
                        if (perSizeArr && perSizeArr.length) {
                          let ps = null;
                          if (selectedSize) {
                            ps = perSizeArr.find((p) => String(p?.size || '') === String(selectedSize)) || null;
                          }
                          if (!ps) {
                            ps = perSizeArr[0] || null;
                          }
                          if (ps && isValidImg(ps.imageUrl || ps.iconUrl)) {
                            return normalize(ps.imageUrl || ps.iconUrl);
                          }
                        }
                      } catch {}

                      // 2) Legacy fallback when no perSize images exist: combo-level then variants
                      try {
                        const direct = combo?.imageUrl || combo?.iconUrl;
                        if (isValidImg(direct)) return normalize(direct);
                      } catch {}

                      try {
                        const pickVariantImg = (preferSize) => {
                          for (const it of items) {
                            const vs = Array.isArray(it?.variants) ? it.variants : [];
                            for (const v of vs) {
                              if (preferSize && String(v?.size || '—') !== String(preferSize)) continue;
                              const cand = v?.imageUrl || v?.image || it?.imageUrl || it?.image;
                              if (isValidImg(cand)) return normalize(cand);
                            }
                          }
                          return null;
                        };

                        if (selectedSize) {
                          const fromSelected = pickVariantImg(selectedSize);
                          if (fromSelected) return fromSelected;
                        }

                        const anyVariant = pickVariantImg(null);
                        if (anyVariant) return anyVariant;
                      } catch {}

                      const cand = comboImageCandidates.find((v) => isValidImg(v)) || null;
                      if (!cand) return null;
                      return normalize(cand);
                    })();
                    // We already checked hasAnyActive earlier, so don't filter again here
                    // The earlier check at line 5246-5270 handles active/inactive filtering
                    return (
                      <section key={`pkg-${idx}`} style={{ flex: '1 1 320px', minWidth: 300, marginBottom: 0 }}>
                        <div
                          style={{
                            border: '1px solid #e5e7eb',
                            borderRadius: 12,
                            padding: 16,
                            background: '#D6EEDE',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                            width: '100%',
                            minHeight: 420,
                            height: '100%',
                            justifyContent: 'flex-start',
                          }}
                        >
                          <h2 style={{ margin: 0, textAlign: 'center', fontSize: 30, fontWeight: 600 }}>{name}</h2>
                          {imgSrc ? (
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                              <img
                                src={imgSrc}
                                alt={name}
                                style={{ width: '100%', maxWidth: 260, height: 160, objectFit: 'cover', borderRadius: 12 }}
                              />
                            </div>
                          ) : null}
                          {priceNode}
                          {includesLabel ? (
                            <div style={{ fontSize: 16, color: '#374151' }}>
                              <span style={{ fontWeight: 600 }}>Includes: </span>
                              <span>{includesLabel}</span>
                            </div>
                          ) : null}
                          {/* Size selector: only show when there are real combo types (not just placeholders) */}
                          {hasRealSizes && effectiveSizes && effectiveSizes.length ? (
                            <div>
                              {(() => {
                                const raw = combo && typeof combo.heading === 'string' ? combo.heading : '';
                                const trimmed = raw.trim();
                                const fallback =
                                  isDrivingSchool && idx === 0
                                    ? 'Select vehicle type'
                                    : isDrivingSchool && idx === 1
                                    ? 'Select combo type'
                                    : 'Size';
                                const label = trimmed.length ? trimmed : fallback;
                                return (
                                  <div style={{ fontSize: 11, fontWeight: 400, color: "#111827", marginBottom: 6, fontFamily: 'Poppins' }}>
                                    {label}
                                  </div>
                                );
                              })()}
                              {isInventoryModel ? (
                                // Inventory model: keep dropdown UX
                                <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setComboSizeDropdownOpen((prev) => {
                                        const current = prev && prev[idx];
                                        return { ...(prev || {}), [idx]: !current };
                                      })
                                    }
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      gap: 8,
                                      minWidth: 220,
                                      padding: '10px 16px',
                                      borderRadius: 999,
                                      border: '1px solid rgba(148, 163, 184, 0.9)',
                                      background: '#ffffff',
                                      color: '#111827',
                                      boxShadow: '0 6px 18px rgba(15, 23, 42, 0.18)',
                                      cursor: 'pointer',
                                      fontSize: 13,
                                      fontWeight: 600,
                                      letterSpacing: 0.2,
                                      transition: 'transform 160ms ease, box-shadow 160ms ease, background 160ms ease',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.transform = 'translateY(-1px)';
                                      e.currentTarget.style.boxShadow = '0 10px 24px rgba(15, 23, 42, 0.28)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.transform = 'translateY(0)';
                                      e.currentTarget.style.boxShadow = '0 6px 18px rgba(15, 23, 42, 0.18)';
                                    }}
                                  >
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {selectedSize || 'Select size'}
                                    </span>
                                    <span style={{ fontSize: 20, lineHeight: 1 }}>▾</span>
                                  </button>

                                  {!!comboSizeDropdownOpen?.[idx] && (
                                    <div
                                      style={{
                                        marginTop: 8,
                                        zIndex: 1,
                                        width: '100%',
                                        maxHeight: '45vh',
                                        overflowY: 'auto',
                                        padding: 8,
                                        borderRadius: 14,
                                        background: 'rgba(255, 255, 255, 0.98)',
                                        boxShadow: '0 20px 45px rgba(15, 23, 42, 0.25)',
                                        overscrollBehavior: 'contain',
                                      }}
                                    >
                                      {effectiveSizes.map((s) => {
                                        const value = String(s || '');
                                        return (
                                          <button
                                            key={value}
                                            type="button"
                                            onClick={() => {
                                              setPackageSelections((prev) => ({
                                                ...prev,
                                                [idx]: { ...(prev[idx] || {}), size: value },
                                              }));
                                              setComboSizeDropdownOpen((prev) => ({ ...(prev || {}), [idx]: false }));
                                            }}
                                            style={{
                                              width: '100%',
                                              textAlign: 'left',
                                              padding: '8px 10px',
                                              marginBottom: 4,
                                              borderRadius: 10,
                                              border: '1px solid rgba(148, 163, 184, 0.8)',
                                              background: value === String(selectedSize || '') ? '#e5f0ff' : '#ffffff',
                                              color: '#0f172a',
                                              cursor: 'pointer',
                                              fontSize: 12,
                                              transition: 'background 140ms ease, transform 140ms ease, box-shadow 140ms ease',
                                            }}
                                            onMouseEnter={(e) => {
                                              e.currentTarget.style.background = '#e5f0ff';
                                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.18)';
                                              e.currentTarget.style.transform = 'translateY(-1px)';
                                            }}
                                            onMouseLeave={(e) => {
                                              e.currentTarget.style.background = value === String(selectedSize || '') ? '#e5f0ff' : '#ffffff';
                                              e.currentTarget.style.boxShadow = 'none';
                                              e.currentTarget.style.transform = 'translateY(0)';
                                            }}
                                          >
                                            <span
                                              style={{
                                                display: 'block',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                fontWeight: 600,
                                              }}
                                            >
                                              {s}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                // Non-inventory model: render size options as inline selectable buttons (chips)
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                  {sizes.map((s) => {
                                    const value = String(s || '');
                                    const active = value === String(selectedSize || '');
                                    return (
                                      <button
                                        key={value}
                                        type="button"
                                        onClick={() => {
                                          setPackageSelections((prev) => ({
                                            ...prev,
                                            [idx]: { ...(prev[idx] || {}), size: value },
                                          }));
                                        }}
                                        style={{
                                          padding: '6px 16px',
                                          borderRadius: 999,
                                          border: active ? '1px solid #00b060' : '1px solid #e5e7eb',
                                          background: active ? '#00b060' : '#ffffff',
                                          color: active ? '#ffffff' : '#111827',
                                          cursor: 'pointer',
                                          fontSize: 12,
                                          fontWeight: 600,
                                          fontFamily: 'Poppins, sans-serif',
                                          minWidth: 70,
                                          boxShadow: active ? '0 2px 6px rgba(0,176,96,0.25)' : 'none',
                                        }}
                                      >
                                        {s}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ) : null}
                          {termsArr.length ? (
                            <ul style={{ margin: 8, marginTop: 10, paddingLeft: 18, color: '#6b7280', fontSize: 12 }}>
                              {termsArr.map((t, i) => (
                                <li key={i}>{t}</li>
                              ))}
                            </ul>
                          ) : null}
                          <button
                            onClick={async () => {
                              try {
                                const allow = await guardEnrollClick();
                                if (!allow) return;
                                const priceNumber = price == null ? null : Number(price);
                                const pathNames = [categoryTree?.name, name].filter(Boolean);
                                const pathIds = [categoryId, comboId].filter(Boolean);
                                const baseAttrs = {
                                  ...(combo?.attributes || {}),
                                  // For combo/size flows, prefer the size heading label for the
                                  // primary selector shown in My Enquiries.
                                  parentSelectorLabel: (combo?.sizeHeadingLabel || "Select size") || labelForCard || parentSelectorLabel || "",
                                  primaryHeadingLabel: combo?.sizeHeadingLabel || "Select size",
                                };
                                const sizeLabel = selectedSize ? String(selectedSize) : "";
                                const attrsWithImage = { ...baseAttrs };
                                if (!attrsWithImage.imageUrl) {
                                  const comboImg =
                                    combo?.imageUrl ||
                                    combo?.iconUrl ||
                                    (Array.isArray(combo?.images) && combo.images[0]) ||
                                    "";
                                  if (comboImg) attrsWithImage.imageUrl = comboImg;
                                }

                                const finalAttrs = sizeLabel
                                  ? { ...attrsWithImage, inventoryName: sizeLabel, primaryHeadingValue: sizeLabel }
                                  : attrsWithImage;

                                await postEnquiry({
                                  source: "package",
                                  serviceName: name || "",
                                  price: priceNumber == null || Number.isNaN(priceNumber) ? null : priceNumber,
                                  terms: terms || "",
                                  categoryPath: pathNames,
                                  categoryIds: pathIds,
                                  attributes: finalAttrs,
                                });
                              } catch (e) {
                                console.error("Enroll Now enquiry error (package size)", e);
                                try { handleOpenOtpModal(); } catch {}
                              }
                            }}
                            style={{
                              marginTop: 'auto',
                              width: '100%',
                              padding: '10px 14px',
                              borderRadius: 28,
                              border: 'none',
                              background: 'rgb(245 158 11)',
                              color: '#111827',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {(() => {
                              try {
                                const num = Number(price);
                                if (!Number.isNaN(num) && num > 0) {
                                  return (packagesAddon && typeof packagesAddon.buttonLabel === 'string' && packagesAddon.buttonLabel.trim())
                                    ? packagesAddon.buttonLabel.trim()
                                    : 'Enroll Now';
                                }
                              } catch {}
                              return 'Contact for Price';
                            })()}
                          </button>
                        </div>
                      </section>
                    );
                  })}
                </div>
              </section>
            ) : null}
            {/* <h2 style={{ margin: '0', padding: '0 0 10px 0' }}>Individuals</h2> */}
            {isDrivingSchool && hasActiveIndividualsForNav ? (
              <div style={{ textAlign: "center", marginBottom: 20, fontFamily: "Poppins, sans-serif" }}>
                <h2 style={{ margin: 0, fontSize: 30, fontWeight: 700 }}>
                  {(individualAddon && typeof individualAddon.heading === 'string' && individualAddon.heading.trim())
                    ? individualAddon.heading.trim()
                    : 'Individual Driving Courses'}
                </h2>
                <p style={{ margin: "6px 0 0", fontSize: 18, color: "#4b5563" }}>
                  {(individualAddon && typeof individualAddon.description === 'string' && individualAddon.description.trim())
                    ? individualAddon.description.trim()
                    : 'Choose specialized training for specific vehicle types, with or without a license.'}
                </p>
              </div>
            ) : null}
            {renderTree(categoryTree)}
          </main>

          {showSetupCategoryModal && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1400,
              }}
            >
              <div
                style={{
                  width: "90%",
                  maxWidth: 520,
                  maxHeight: "80vh",
                  overflowY: "auto",
                  background: "#ffffff",
                  borderRadius: 16,
                  padding: 20,
                  boxShadow: "0 18px 36px rgba(15,23,42,0.3)",
                  fontFamily: "Poppins, sans-serif",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <h2 style={{ margin: 0, fontSize: 20 }}>Choose a Category</h2>
                    {setupCreationFinalMs != null ? (
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          alignSelf: "flex-start",
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: "linear-gradient(135deg, #ecfdf5, #ffffff)",
                          border: "1px solid rgba(16,185,129,0.25)",
                          color: "#065f46",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: "#10b981",
                            boxShadow: "0 0 0 4px rgba(16,185,129,0.18)",
                          }}
                        />
                        Preview ready in
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>
                          {formatElapsed(setupCreationFinalMs)}
                        </span>
                      </div>
                    ) : setupCreationTimerRunning ? (
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          alignSelf: "flex-start",
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          color: "#0f172a",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        <span style={{ position: "relative", width: 10, height: 10, display: "inline-block" }}>
                          <span
                            style={{
                              position: "absolute",
                              inset: 0,
                              borderRadius: 999,
                              background: "rgba(16,185,129,0.25)",
                              animation: "setupTimerPulse 1.1s ease-in-out infinite",
                            }}
                          />
                          <span
                            style={{
                              position: "absolute",
                              inset: 2,
                              borderRadius: 999,
                              background: "#10b981",
                            }}
                          />
                        </span>
                        Creating preview
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>
                          {formatElapsed(setupCreationElapsedMs)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        if (typeof window !== "undefined" && vendorId && categoryId) {
                          const selectedCategoryId = setupSelectedCategory?._id || setupSelectedCategory?.id || "";
                          if (selectedCategoryId) {
                            const resumeKey = makeSetupResumeKey(vendorId, categoryId);
                            window.localStorage.setItem(
                              resumeKey,
                              JSON.stringify({ selectedCategoryId: String(selectedCategoryId) })
                            );
                          }
                        }
                      } catch {}
                      setShowSetupCategoryModal(false);
                      stopSetupCreationTimer();
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      fontSize: 20,
                      cursor: "pointer",
                    }}
                  >
                    ×
                  </button>
                </div>
                <p style={{ marginTop: 0, marginBottom: 12, fontSize: 13, color: "#6b7280" }}>
                  Select the category that best matches your business. (This is a preview; selection is not saved yet.)
                </p>
                {setupCategoriesLoading && (
                  <div style={{ fontSize: 14, color: "#4b5563" }}>Loading categories...</div>
                )}
                {setupCategoriesError && (
                  <div style={{ fontSize: 13, color: "#b91c1c", marginBottom: 8 }}>
                    {setupCategoriesError}
                  </div>
                )}
                {!setupCategoriesLoading && setupCategories.length === 0 && !setupCategoriesError && (
                  <div style={{ fontSize: 13, color: "#6b7280" }}>No categories found.</div>
                )}
                {setupCategories.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <select
                      value={setupSelectedCategory ? String(setupSelectedCategory._id || setupSelectedCategory.id || "") : ""}
                      onChange={(e) => {
                        const id = e.target.value;
                        const cat = setupCategories.find((c) => String(c._id) === id);
                        if (!cat) return;
                        console.log("Setup My Business - selected category", cat);
                        setSetupSelectedCategory(cat);
                        try {
                          if (typeof window !== "undefined" && vendorId && categoryId) {
                            const selectedCategoryId = cat?._id || cat?.id || "";
                            if (selectedCategoryId) {
                              const resumeKey = makeSetupResumeKey(vendorId, categoryId);
                              window.localStorage.setItem(
                                resumeKey,
                                JSON.stringify({ selectedCategoryId: String(selectedCategoryId) })
                              );
                            }
                          }
                        } catch {}
                      }}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 999,
                        border: "1px solid #e5e7eb",
                        background: "#f9fafb",
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                    >
                      <option value="" disabled>
                        Select a category
                      </option>
                      {setupCategories.map((cat) => (
                        <option key={cat._id} value={cat._id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                    {setupSelectedCategory && (
                      <div
                        style={{
                          marginTop: 12,
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              if (typeof window !== "undefined" && vendorId && categoryId) {
                                const resumeKey = makeSetupResumeKey(vendorId, categoryId);
                                const selectedCategoryId = setupSelectedCategory?._id || setupSelectedCategory?.id || "";
                                if (selectedCategoryId) {
                                  window.localStorage.setItem(
                                    resumeKey,
                                    JSON.stringify({ selectedCategoryId: String(selectedCategoryId) })
                                  );
                                }
                              }
                              setSetupShowPlacesStep(true);
                            } catch {
                              setSetupShowPlacesStep(true);
                            }
                          }}
                          disabled={!setupSelectedCategory}
                          style={{
                            width: "100%",
                            padding: 10,
                            borderRadius: 999,
                            border: "none",
                            background: setupSelectedCategory ? "#2563eb" : "#9ca3af",
                            color: "#ffffff",
                            fontWeight: 600,
                            fontSize: 14,
                            cursor: setupSelectedCategory ? "pointer" : "not-allowed",
                          }}
                        >
                          Connect Your Google Business
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              try {
                                if (typeof window !== "undefined" && vendorId && categoryId) {
                                  const selectedCategoryId = setupSelectedCategory?._id || setupSelectedCategory?.id || "";
                                  if (selectedCategoryId) {
                                    const resumeKey = makeSetupResumeKey(vendorId, categoryId);
                                    window.localStorage.setItem(
                                      resumeKey,
                                      JSON.stringify({ selectedCategoryId: String(selectedCategoryId) })
                                    );
                                  }
                                }
                              } catch {}
                              setSetupMobileFlowOpen(true);
                              setSetupOtpPhoneInfo(null);
                              setSetupOtpSent(false);
                              setSetupOtpSending(false);
                              setSetupOtpSendError("");
                              setSetupOtpCode("");
                              setSetupOtpVerifying(false);
                              setSetupOtpVerifyError("");
                              setSetupOtpVerified(false);
                              setSetupOtpBypass(false);
                              setSetupShowPlacesStep(false);
                            } catch (e) {
                              console.error("Failed to open mobile login from setup modal", e);
                            }
                          }}
                          style={{
                            width: "100%",
                            padding: 10,
                            borderRadius: 999,
                            border: "1px solid #e5e7eb",
                            background: "#ffffff",
                            color: "#111827",
                            fontWeight: 500,
                            fontSize: 14,
                            cursor: "pointer",
                          }}
                        >
                          Continue With Mobile Number
                        </button>
                        {setupMobileFlowOpen && (
                          <div
                            style={{
                              marginTop: 10,
                              padding: 12,
                              borderRadius: 14,
                              border: "1px solid #e5e7eb",
                              background: "#f9fafb",
                            }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 8 }}>
                              Verify your mobile number
                            </div>
                            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                              <select
                                value={setupMobileCountryCode}
                                onChange={(e) => {
                                  const v = String(e.target.value || "").replace(/[^0-9]/g, "");
                                  setSetupMobileCountryCode(v);
                                  setSetupOtpSent(false);
                                  setSetupOtpSendError("");
                                }}
                                disabled={countriesLoading}
                                style={{
                                  width: 140,
                                  padding: 8,
                                  borderRadius: 999,
                                  border: "1px solid #d1d5db",
                                  fontSize: 13,
                                  background: "#ffffff",
                                  cursor: countriesLoading ? "not-allowed" : "pointer",
                                }}
                              >
                                {countries.length === 0 ? (
                                  <option value={setupMobileCountryCode}>+{setupMobileCountryCode}</option>
                                ) : (
                                  countries.map((c) => (
                                    <option key={`${c.code}-${c.name}`} value={c.code}>
                                      +{c.code} {c.name ? `(${c.name})` : ""}
                                    </option>
                                  ))
                                )}
                              </select>
                              <input
                                type="text"
                                value={setupMobilePhone}
                                onChange={(e) => {
                                  const v = String(e.target.value || "").replace(/[^0-9]/g, "");
                                  setSetupMobilePhone(v);
                                  setSetupOtpSent(false);
                                  setSetupOtpSendError("");
                                }}
                                placeholder="Mobile number"
                                style={{
                                  flex: 1,
                                  padding: 8,
                                  borderRadius: 999,
                                  border: "1px solid #d1d5db",
                                  fontSize: 13,
                                  background: "#ffffff",
                                }}
                              />
                            </div>
                            {!setupOtpSent ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    try {
                                      const cc = String(setupMobileCountryCode || "").trim();
                                      const ph = String(setupMobilePhone || "").trim();
                                      if (!cc || !ph) {
                                        setSetupOtpSendError("Please enter country code and phone");
                                        return;
                                      }
                                      const info = { countryCode: cc, phone: ph, full: `+${cc}${ph}` };
                                      setSetupOtpPhoneInfo(info);
                                      setSetupOtpBypass(false);
                                      setSetupOtpVerified(false);
                                      handleSetupSendOtp(info);
                                    } catch {}
                                  }}
                                  disabled={setupOtpSending || setupOtpBypass}
                                  style={{
                                    padding: "8px 14px",
                                    borderRadius: 999,
                                    border: "none",
                                    background: "#059669",
                                    color: "#fff",
                                    fontSize: 13,
                                    fontWeight: 600,
                                    cursor: setupOtpSending || setupOtpBypass ? "not-allowed" : "pointer",
                                  }}
                                >
                                  {setupOtpSending ? "Sending..." : "Send OTP"}
                                </button>
                                <label
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    marginTop: 10,
                                    fontSize: 12,
                                    color: "#111827",
                                    userSelect: "none",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={setupOtpBypass}
                                    onChange={(e) => {
                                      const checked = !!e.target.checked;
                                      setSetupOtpBypass(checked);
                                      if (!checked) {
                                        if (!setupGeneratedDummyVendorId) {
                                          setSetupOtpVerified(false);
                                          setSetupVerifiedCustomerId("");
                                          setSetupVerifiedToken("");
                                        }
                                        return;
                                      }

                                      try {
                                        const cc = String(setupMobileCountryCode || "").trim();
                                        const ph = String(setupMobilePhone || "").trim();
                                        if (!cc || !ph) {
                                          setSetupOtpSendError("Please enter country code and phone");
                                          setSetupOtpBypass(false);
                                          return;
                                        }
                                        const info = { countryCode: cc, phone: ph, full: `+${cc}${ph}` };
                                        setSetupOtpPhoneInfo(info);
                                        setSetupOtpSent(false);
                                        setSetupOtpSending(false);
                                        setSetupOtpSendError("");
                                        setSetupOtpCode("");
                                        setSetupOtpVerifyError("");
                                        setSetupOtpVerified(false);
                                        handleSetupBypassOtp(info);
                                      } catch {}
                                    }}
                                  />
                                  Bypass OTP
                                </label>
                              </>
                            ) : (
                              <>
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                  <input
                                    type="text"
                                    value={setupOtpCode}
                                    onChange={(e) => setSetupOtpCode(e.target.value)}
                                    placeholder="Enter OTP"
                                    maxLength={6}
                                    disabled={setupOtpBypass}
                                    style={{
                                      flex: 1,
                                      padding: 8,
                                      borderRadius: 999,
                                      border: "1px solid #d1d5db",
                                      fontSize: 13,
                                      background: "#ffffff",
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={handleSetupVerifyOtp}
                                    disabled={setupOtpVerifying || setupOtpBypass}
                                    style={{
                                      padding: "8px 14px",
                                      borderRadius: 999,
                                      border: "none",
                                      background: "#2563eb",
                                      color: "#fff",
                                      fontSize: 13,
                                      fontWeight: 600,
                                      cursor: setupOtpVerifying || setupOtpBypass ? "not-allowed" : "pointer",
                                    }}
                                  >
                                    {setupOtpVerifying ? "Verifying..." : "Verify"}
                                  </button>
                                </div>
                                <label
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    marginTop: 10,
                                    fontSize: 12,
                                    color: "#111827",
                                    userSelect: "none",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={setupOtpBypass}
                                    onChange={(e) => {
                                      const checked = !!e.target.checked;
                                      setSetupOtpBypass(checked);
                                      if (!checked) {
                                        if (!setupGeneratedDummyVendorId) {
                                          setSetupOtpVerified(false);
                                          setSetupVerifiedCustomerId("");
                                          setSetupVerifiedToken("");
                                        }
                                        return;
                                      }

                                      try {
                                        const cc = String(setupMobileCountryCode || "").trim();
                                        const ph = String(setupMobilePhone || "").trim();
                                        if (!cc || !ph) {
                                          setSetupOtpSendError("Please enter country code and phone");
                                          setSetupOtpBypass(false);
                                          return;
                                        }
                                        const info = { countryCode: cc, phone: ph, full: `+${cc}${ph}` };
                                        setSetupOtpPhoneInfo(info);
                                        setSetupOtpSent(false);
                                        setSetupOtpSending(false);
                                        setSetupOtpSendError("");
                                        setSetupOtpCode("");
                                        setSetupOtpVerifyError("");
                                        setSetupOtpVerified(false);
                                        handleSetupBypassOtp(info);
                                      } catch {}
                                    }}
                                  />
                                  Bypass OTP
                                </label>
                              </>
                            )}
                            {setupOtpSendError && (
                              <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 6 }}>
                                {setupOtpSendError}
                              </div>
                            )}
                            {setupOtpVerifyError && (
                              <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 6 }}>
                                {setupOtpVerifyError}
                              </div>
                            )}
                            {setupOtpVerified && (
                              <div style={{ color: "#065f46", fontSize: 12, marginTop: 8, fontWeight: 700 }}>
                                ✓ Phone verified
                              </div>
                            )}
                          </div>
                        )}
                        {setupShowPlacesStep && (!setupMobileFlowOpen || setupOtpVerified || setupOtpBypass) && (
                          <div
                            style={{
                              marginTop: 12,
                              paddingTop: 12,
                              borderTop: "1px solid #e5e7eb",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 500,
                                marginBottom: 6,
                                color: "#111827",
                              }}
                            >
                              Enter your business name to find it on Google
                            </div>
                            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                              <input
                                type="text"
                                value={setupPlaceQuery}
                                onChange={(e) => setSetupPlaceQuery(e.target.value)}
                                placeholder="e.g. Tirumala Motor Driving School"
                                style={{
                                  flex: 1,
                                  padding: 8,
                                  borderRadius: 999,
                                  border: "1px solid #d1d5db",
                                  fontSize: 13,
                                }}
                              />
                              <button
                                type="button"
                                onClick={handleSetupPlacesSearch}
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: 999,
                                  border: "none",
                                  background: "#059669",
                                  color: "#ffffff",
                                  fontSize: 13,
                                  fontWeight: 500,
                                  cursor: "pointer",
                                }}
                              >
                                {setupPlaceLoading ? "Searching..." : "Search"}
                              </button>
                            </div>
                            {setupPlaceError && (
                              <div style={{ fontSize: 12, color: "#b91c1c", marginBottom: 4 }}>
                                {setupPlaceError}
                              </div>
                            )}
                            {setupPlaceResults.length > 0 && (
                              <div
                                style={{
                                  maxHeight: 140,
                                  overflowY: "auto",
                                  fontSize: 12,
                                  borderRadius: 12,
                                  border: "1px solid #e5e7eb",
                                  padding: 6,
                                  background: "#f9fafb",
                                }}
                              >
                                {setupPlaceResults.map((r) => (
                                  <div
                                    key={r.placeId}
                                    style={{
                                      padding: "6px 4px",
                                      borderBottom: "1px solid #e5e7eb",
                                      cursor: "pointer",
                                    }}
                                    onClick={() => handleSetupSelectPlace(r.placeId)}
                                  >
                                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                                    <div style={{ color: "#6b7280" }}>{r.address}</div>
                                    <div style={{ color: "#9ca3af" }}>
                                      Rating: {r.rating ?? "-"} ({r.userRatingsTotal ?? 0} reviews)
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {setupSelectedPlace && (
                              <div
                                style={{
                                  marginTop: 8,
                                  padding: 8,
                                  borderRadius: 12,
                                  background: "#f3f4f6",
                                  fontSize: 12,
                                }}
                              >
                                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                                  Auto-populated details
                                </div>
                                <div style={{ color: "#111827" }}>
                                  <strong>Business Name:</strong> {setupSelectedPlace.name || "-"}
                                </div>
                                <div style={{ color: "#111827" }}>
                                  <strong>Category:</strong> {setupSelectedCategory?.name || "-"}
                                </div>
                                <div style={{ color: "#111827" }}>
                                  <strong>Address:</strong> {setupSelectedPlace.address || "-"}
                                </div>
                                <div style={{ color: "#111827" }}>
                                  <strong>Latitude / Longitude:</strong>{" "}
                                  {setupSelectedPlace.location
                                    ? `${setupSelectedPlace.location.lat}, ${setupSelectedPlace.location.lng}`
                                    : "-"}
                                </div>
                                <div style={{ color: "#111827" }}>
                                  <strong>Phone:</strong> {setupSelectedPlace.phone || "-"}
                                </div>
                                <div style={{ color: "#111827" }}>
                                  <strong>Website:</strong>{" "}
                                  {setupSelectedPlace.website || "-"}
                                </div>
                                <div style={{ color: "#111827" }}>
                                  <strong>Google Rating:</strong>{" "}
                                  {setupSelectedPlace.rating != null ? setupSelectedPlace.rating : "-"}
                                </div>
                                <div style={{ color: "#111827" }}>
                                  <strong>Total Ratings:</strong>{" "}
                                  {setupSelectedPlace.userRatingsTotal != null ? setupSelectedPlace.userRatingsTotal : "-"}
                                </div>

                                {/* OTP Verification Section */}
                                {!setupMobileFlowOpen && setupOtpPhoneInfo && !setupOtpVerified && (
                                  <div
                                    style={{
                                      marginTop: 12,
                                      paddingTop: 12,
                                      borderTop: "1px solid #d1d5db",
                                    }}
                                  >
                                    <div style={{ fontWeight: 600, marginBottom: 6, color: "#111827" }}>
                                      Verify Phone: +{setupOtpPhoneInfo.countryCode}{setupOtpPhoneInfo.phone}
                                    </div>
                                    {!setupOtpSent ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleSetupSendOtp()}
                                          disabled={setupOtpSending || setupOtpBypass}
                                          style={{
                                            padding: "8px 14px",
                                            borderRadius: 999,
                                            border: "none",
                                            background: "#059669",
                                            color: "#fff",
                                            fontSize: 13,
                                            fontWeight: 500,
                                            cursor: setupOtpSending ? "not-allowed" : "pointer",
                                          }}
                                        >
                                          {setupOtpSending ? "Sending..." : "Send OTP"}
                                        </button>
                                        <label
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                            marginTop: 10,
                                            fontSize: 12,
                                            color: "#111827",
                                            userSelect: "none",
                                          }}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={setupOtpBypass}
                                            onChange={(e) => {
                                              const checked = !!e.target.checked;
                                              setSetupOtpBypass(checked);
                                              if (checked) {
                                                setSetupOtpSent(false);
                                                setSetupOtpSending(false);
                                                setSetupOtpSendError("");
                                                setSetupOtpCode("");
                                                setSetupOtpVerifying(false);
                                                setSetupOtpVerifyError("");
                                                (async () => {
                                                  try {
                                                    if (!setupOtpPhoneInfo) {
                                                      setSetupOtpSendError("Phone number not available from Google");
                                                      return;
                                                    }
                                                    const bypassRes = await fetch(`/api/customers/bypass-otp`, {
                                                      method: "POST",
                                                      headers: { "Content-Type": "application/json" },
                                                      body: JSON.stringify({
                                                        countryCode: setupOtpPhoneInfo.countryCode,
                                                        phone: setupOtpPhoneInfo.phone,
                                                      }),
                                                    });
                                                    const bypassJson = await bypassRes.json().catch(() => ({}));
                                                    if (!bypassRes.ok) {
                                                      const msg =
                                                        bypassJson?.message ||
                                                        `OTP bypass failed (status ${bypassRes.status})`;
                                                      throw new Error(msg);
                                                    }

                                                    const customerId = bypassJson?.customer?._id || bypassJson?.customer?.id || null;
                                                    const catId = setupSelectedCategory?._id || setupSelectedCategory?.id || null;
                                                    const businessName = setupSelectedPlace?.name || "";
                                                    const placeLocation = setupSelectedPlace?.location || null;
                                                    const placeAddress = setupSelectedPlace?.address || "";
                                                    const openingHoursText = Array.isArray(setupSelectedPlace?.openingHoursText)
                                                      ? setupSelectedPlace.openingHoursText
                                                      : [];
                                                    const phoneFull = setupOtpPhoneInfo
                                                      ? `+${setupOtpPhoneInfo.countryCode}${setupOtpPhoneInfo.phone}`
                                                      : "";

                                                    if (customerId && catId && businessName && phoneFull) {
                                                      const dvRes = await fetch(`${API_BASE_URL}/api/dummy-vendors`, {
                                                        method: "POST",
                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({
                                                          customerId: String(customerId),
                                                          phone: String(phoneFull),
                                                          businessName: String(businessName),
                                                          contactName: String(businessName),
                                                          categoryId: String(catId),
                                                          status: "Registered",
                                                          location: {
                                                            lat: typeof placeLocation?.lat === "number" ? placeLocation.lat : undefined,
                                                            lng: typeof placeLocation?.lng === "number" ? placeLocation.lng : undefined,
                                                            address: String(placeAddress || ""),
                                                          },
                                                          openingHoursText,
                                                        }),
                                                      });
                                                      const dvJson = await dvRes.json().catch(() => ({}));
                                                      const dvId = dvJson?._id || dvJson?.id || "";
                                                      if (dvId) {
                                                        setSetupGeneratedDummyVendorId(String(dvId));
                                                        try {
                                                          if (typeof window !== "undefined") {
                                                            const token = bypassJson && bypassJson.token ? String(bypassJson.token) : "";
                                                            if (token) {
                                                              window.localStorage.setItem(`previewToken:${dvId}:${catId}`, token);
                                                            }
                                                            const identityKey = `previewIdentity:${dvId}:${catId}`;
                                                            const existingIdentity = window.localStorage.getItem(identityKey);
                                                            if (!existingIdentity) {
                                                              window.localStorage.setItem(
                                                                identityKey,
                                                                JSON.stringify({
                                                                  role: "vendor",
                                                                  displayName: businessName || "Vendor",
                                                                  loggedIn: true,
                                                                })
                                                              );
                                                            }
                                                          }
                                                        } catch {}
                                                      }
                                                    }

                                                    setSetupOtpVerified(true);
                                                    setShowSetupPreviewPrompt(true);
                                                  } catch (err) {
                                                    console.error("Bypass OTP flow failed", err);
                                                    setSetupOtpSendError(err?.message || "OTP bypass failed");
                                                    setSetupOtpBypass(false);
                                                    setSetupOtpVerified(false);
                                                  }
                                                })();
                                              } else {
                                                setSetupOtpVerified(false);
                                              }
                                            }}
                                          />
                                          Bypass OTP
                                        </label>
                                        {setupOtpSendError && (
                                          <div style={{ color: "#b91c1c", fontSize: 11, marginTop: 4 }}>
                                            {setupOtpSendError}
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                                          <input
                                            type="text"
                                            value={setupOtpCode}
                                            onChange={(e) => setSetupOtpCode(e.target.value)}
                                            placeholder="Enter OTP"
                                            maxLength={6}
                                            style={{
                                              flex: 1,
                                              padding: 8,
                                              borderRadius: 999,
                                              border: "1px solid #d1d5db",
                                              fontSize: 13,
                                            }}
                                          />
                                          <button
                                            type="button"
                                            onClick={handleSetupVerifyOtp}
                                            disabled={setupOtpVerifying}
                                            style={{
                                              padding: "8px 14px",
                                              borderRadius: 999,
                                              border: "none",
                                              background: "#2563eb",
                                              color: "#fff",
                                              fontSize: 13,
                                              fontWeight: 500,
                                              cursor: setupOtpVerifying ? "not-allowed" : "pointer",
                                            }}
                                          >
                                            {setupOtpVerifying ? "Verifying..." : "Verify"}
                                          </button>
                                        </div>
                                        {setupOtpVerifyError && (
                                          <div style={{ color: "#b91c1c", fontSize: 11 }}>
                                            {setupOtpVerifyError}
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                )}
                                {setupOtpVerified && (
                                  <div
                                    style={{
                                      marginTop: 12,
                                      padding: 8,
                                      borderRadius: 8,
                                      background: "#d1fae5",
                                      color: "#065f46",
                                      fontSize: 12,
                                      fontWeight: 600,
                                    }}
                                  >
                                    ✓ Phone verified successfully!
                                  </div>
                                )}

                                {setupGeneratePreviewError && (
                                  <div style={{ color: "#b91c1c", fontSize: 11, marginTop: 10 }}>
                                    {setupGeneratePreviewError}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          <BenefitsSection
            categoryName={String(categoryTree?.name || "").toLowerCase()}
            businessName={vendor?.businessName}
            whyUs={whyUs}
          />
          <AboutSection
            categoryName={String(categoryTree?.name || "").toLowerCase()}
            businessName={vendor?.businessName}
            about={about}
          />
          <ContactSection
            contactNumber={vendor?.customerId?.fullNumber || vendor?.phone || "-"}
            countryCode={vendor?.customerId?.countryCode || ""}
            location={location}
            vendorId={vendorId}
            businessHours={vendor?.businessHours || []}
            contact={contact}
            onLocationUpdate={(newLoc) => {
              setLocation(newLoc);
              setVendor((prev) => ({ ...prev, location: newLoc }));
            }}
          />
          {showSetupPreviewPrompt && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 2500,
              }}
            >
              <div
                style={{
                  width: 360,
                  maxWidth: "92vw",
                  borderRadius: 16,
                  background: "#ffffff",
                  padding: "18px 16px 14px",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
                  fontFamily: "Poppins, sans-serif",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, color: "#111827" }}>
                  Your profile has been registered
                </div>
                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 14 }}>
                  Continue to select your services.
                </div>
                {setupPreviewPromptError && (
                  <div style={{ color: "#b91c1c", fontSize: 12, marginBottom: 10 }}>
                    {setupPreviewPromptError}
                  </div>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    onClick={handleSetupPreviewPromptNo}
                    disabled={setupPreviewPromptLoading}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #d1d5db",
                      background: "#ffffff",
                      color: "#111827",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: setupPreviewPromptLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSetupPreviewPromptYes}
                    disabled={setupPreviewPromptLoading}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "none",
                      background: "#111827",
                      color: "#ffffff",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: setupPreviewPromptLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    {setupPreviewPromptLoading ? "Please wait..." : "Next"}
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Subcategory Selection Popup for Generate Preview Page */}
          {showSubcategoryPopup && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 2400,
              }}
              onClick={() => setShowSubcategoryPopup(false)}
            >
              <div
                style={{
                  background: "#fff",
                  padding: 24,
                  borderRadius: 16,
                  width: 420,
                  maxHeight: "80vh",
                  overflowY: "auto",
                  fontFamily: "Poppins, sans-serif",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ margin: 0, marginBottom: 16, fontSize: 18, fontWeight: 600, color: "#111827" }}>
                  Select Services to Show
                </h3>
                <p style={{ margin: 0, marginBottom: 16, fontSize: 13, color: "#6b7280" }}>
                  Choose which services you want to display on your preview page. Only selected services will be shown as active.
                </p>
                {setupSubcategoriesLoading ? (
                  <div style={{ textAlign: "center", padding: 20, color: "#6b7280" }}>Loading services...</div>
                ) : setupSubcategories.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 20, color: "#6b7280" }}>No services found for this category.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {setupSubcategories.map((subcat) => {
                      const id = subcat._id || subcat.id;
                      const name = subcat.name || "Unnamed Service";
                      const isChecked = !!setupSelectedSubcategories[id];
                      return (
                        <label
                          key={id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: isChecked ? "2px solid #2563eb" : "1px solid #e5e7eb",
                            background: isChecked ? "#eff6ff" : "#fff",
                            cursor: "pointer",
                            transition: "all 0.15s",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSetupSelectedSubcategories((prev) => ({
                                ...prev,
                                [id]: !prev[id],
                              }));
                            }}
                            style={{ width: 18, height: 18, accentColor: "#2563eb" }}
                          />
                          <span style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>{name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button
                    type="button"
                    onClick={() => setShowSubcategoryPopup(false)}
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#374151",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={Object.values(setupSelectedSubcategories).filter(Boolean).length === 0}
                    onClick={async () => {
                      try {
                        const dvId = setupGeneratedDummyVendorId;
                        const catId = setupSelectedCategory?._id || setupSelectedCategory?.id;
                        if (!dvId || !catId) {
                          setSetupGeneratePreviewError("Preview link not ready");
                          setShowSubcategoryPopup(false);
                          return;
                        }
                        // Check if selected category is inventory model
                        const rawModels = Array.isArray(setupSelectedCategory?.categoryModel)
                          ? setupSelectedCategory.categoryModel
                          : setupSelectedCategory?.categoryModel
                          ? [setupSelectedCategory.categoryModel]
                          : [];
                        const normModels = rawModels
                          .map((m) => (m == null ? "" : String(m)))
                          .map((s) => s.trim().toLowerCase())
                          .filter(Boolean);
                        const isInventory = normModels.includes("inventory");

                        // Check if parent category has linkedAttributes or inventoryLabelName
                        const parentLinkedAttr = setupSelectedCategory?.linkedAttributes;
                        const parentHasLinkedAttr = parentLinkedAttr && typeof parentLinkedAttr === 'object' && Object.keys(parentLinkedAttr).length > 0;
                        const parentInvLabel = setupSelectedCategory?.inventoryLabelName;
                        const parentHasInvLabel = typeof parentInvLabel === 'string' && parentInvLabel.trim() !== '';

                        if (isInventory && (parentHasLinkedAttr || parentHasInvLabel)) {
                          // Get all selected services
                          const selectedServices = setupSubcategories.filter((subcat) => {
                            const id = subcat._id || subcat.id;
                            return !!setupSelectedSubcategories[id];
                          });

                          if (selectedServices.length > 0) {
                            // Initialize vehicle counts for all selected services
                            const initialCounts = {};
                            selectedServices.forEach((subcat) => {
                              const id = subcat._id || subcat.id;
                              initialCounts[id] = 1; // default count
                            });
                            setSetupVehicleCounts(initialCounts);
                            setShowSubcategoryPopup(false);
                            setShowVehicleCountPopup(true);
                            return;
                          }
                        }

                        // Non-inventory model or no services with inventory config - proceed directly
                        // Build nodePricingStatus map: selected = Active, unselected = Inactive
                        const nodePricingStatus = {};
                        setupSubcategories.forEach((subcat) => {
                          const id = subcat._id || subcat.id;
                          if (id) {
                            nodePricingStatus[id] = setupSelectedSubcategories[id] ? "Active" : "Inactive";
                          }
                        });
                        // Save nodePricingStatus to dummy vendor
                        try {
                          await fetch(`${API_BASE_URL}/api/dummy-vendors/${dvId}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ nodePricingStatus }),
                          });
                        } catch (e) {
                          console.error("Failed to save nodePricingStatus", e);
                        }
                        // Set vendor identity in localStorage so the new tab logs in as vendor
                        const identityKey = `previewIdentity:${dvId}:${catId}`;
                        const vendorIdentity = {
                          role: "vendor",
                          displayName: setupSelectedPlace?.name || setupBusinessName || "Vendor",
                          loggedIn: true,
                        };
                        try {
                          window.localStorage.setItem(identityKey, JSON.stringify(vendorIdentity));
                        } catch {}
                        // Build URL same as DummyVendorCategoriesDetailPage Preview button
                        const homeLocs = Array.isArray(setupSelectedPlace?.nearbyLocations)
                          ? setupSelectedPlace.nearbyLocations.filter(Boolean)
                          : [];
                        const params = new URLSearchParams();
                        params.set("mode", "dummy");
                        if (setupCreationTimerKey) {
                          params.set("setupTimerKey", String(setupCreationTimerKey));
                        }
                        if (homeLocs.length) {
                          params.set("homeLocs", JSON.stringify(homeLocs));
                        }
                        params.set("t", String(Date.now()));
                        const url = `/preview/${dvId}/${catId}?${params.toString()}`;
                        setShowSubcategoryPopup(false);
                        window.open(url, "_blank");
                      } catch (e) {
                        setSetupGeneratePreviewError("Failed to generate preview");
                        setShowSubcategoryPopup(false);
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "none",
                      background: Object.values(setupSelectedSubcategories).filter(Boolean).length === 0 ? "#9ca3af" : "#111827",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: Object.values(setupSelectedSubcategories).filter(Boolean).length === 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Vehicle Count Popup for inventory model categories */}
          {showVehicleCountPopup && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 2500,
              }}
              onClick={() => setShowVehicleCountPopup(false)}
            >
              <div
                style={{
                  background: "#fff",
                  padding: 24,
                  borderRadius: 16,
                  width: 420,
                  maxHeight: "80vh",
                  overflowY: "auto",
                  fontFamily: "Poppins, sans-serif",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ margin: 0, marginBottom: 16, fontSize: 18, fontWeight: 600, color: "#111827" }}>
                  Vehicle Count
                </h3>
                <p style={{ margin: 0, marginBottom: 16, fontSize: 13, color: "#6b7280" }}>
                  Enter the number of vehicle types for each service (max 3).
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {setupSubcategories
                    .filter((subcat) => {
                      const id = subcat._id || subcat.id;
                      if (!setupSelectedSubcategories[id]) return false;
                      // Only show subcategories that have inventoryLabels mapping in linkedAttributes
                      const parentLinkedAttr = setupSelectedCategory?.linkedAttributes || {};
                      let hasInventoryLabel = false;
                      Object.entries(parentLinkedAttr).forEach(([key, value]) => {
                        if (!String(key || "").endsWith(":inventoryLabels:linkedSubcategory")) return;
                        const arr = Array.isArray(value) ? value : [];
                        if (arr.some((v) => String(v) === String(id))) {
                          hasInventoryLabel = true;
                        }
                      });
                      return hasInventoryLabel;
                    })
                    .map((subcat) => {
                      const id = subcat._id || subcat.id;
                      const name = subcat.name || "Unnamed Service";
                      // Look up inventory label from linkedAttributes based on subcategory ID
                      const parentLinkedAttr = setupSelectedCategory?.linkedAttributes || {};
                      let invLabel = "";
                      // Find the inventory label that maps to this subcategory ID
                      Object.entries(parentLinkedAttr).forEach(([key, value]) => {
                        if (!String(key || "").endsWith(":inventoryLabels:linkedSubcategory")) return;
                        const arr = Array.isArray(value) ? value : [];
                        if (arr.some((v) => String(v) === String(id))) {
                          // Found matching subcategory, get the family name and look up its inventoryLabels
                          const fam = String(key).split(":")[0];
                          const labelsKey = `${fam}:inventoryLabels`;
                          const labels = parentLinkedAttr[labelsKey];
                          if (Array.isArray(labels) && labels.length > 0) {
                            invLabel = String(labels[0]);
                          }
                        }
                      });
                      const currentCount = setupVehicleCounts[id] || 1;
                      return (
                        <div
                          key={id}
                          style={{
                            padding: "12px 14px",
                            borderRadius: 8,
                            border: "1px solid #e5e7eb",
                            background: "#f9fafb",
                          }}
                        >
                          <div style={{ fontSize: 14, fontWeight: 500, color: "#111827", marginBottom: 8 }}>
                            How many {name} {invLabel} type do you have?
                          </div>
                          <input
                            type="number"
                            min={1}
                            max={3}
                            value={currentCount}
                            onChange={(e) => {
                              let val = parseInt(e.target.value, 10);
                              if (isNaN(val) || val < 1) val = 1;
                              if (val > 3) val = 3;
                              setSetupVehicleCounts((prev) => ({ ...prev, [id]: val }));
                            }}
                            style={{
                              width: "100%",
                              padding: "8px 12px",
                              borderRadius: 6,
                              border: "1px solid #d1d5db",
                              fontSize: 14,
                              outline: "none",
                            }}
                          />
                        </div>
                      );
                    })}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowVehicleCountPopup(false);
                      setShowSubcategoryPopup(true);
                    }}
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#374151",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const dvId = setupGeneratedDummyVendorId;
                        const catId = setupSelectedCategory?._id || setupSelectedCategory?.id;
                        if (!dvId || !catId) {
                          setSetupGeneratePreviewError("Preview link not ready");
                          setShowVehicleCountPopup(false);
                          return;
                        }
                        // Build nodePricingStatus map: selected = Active, unselected = Inactive
                        const nodePricingStatus = {};
                        setupSubcategories.forEach((subcat) => {
                          const id = subcat._id || subcat.id;
                          if (id) {
                            nodePricingStatus[id] = setupSelectedSubcategories[id] ? "Active" : "Inactive";
                          }
                        });
                        // Save nodePricingStatus and vehicleCounts to dummy vendor
                        try {
                          await fetch(`${API_BASE_URL}/api/dummy-vendors/${dvId}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ nodePricingStatus, vehicleCounts: setupVehicleCounts }),
                          });
                        } catch (e) {
                          console.error("Failed to save nodePricingStatus/vehicleCounts", e);
                        }

                        // Build inventory scopes for services that have inventoryLabels mapping
                        const parentLinkedAttr = setupSelectedCategory?.linkedAttributes || {};
                        const scopes = [];
                        setupSubcategories
                          .filter((subcat) => {
                            const id = subcat._id || subcat.id;
                            if (!setupSelectedSubcategories[id]) return false;
                            // Check if this subcategory has inventoryLabels mapping
                            let hasMapping = false;
                            Object.entries(parentLinkedAttr).forEach(([key, value]) => {
                              if (!String(key || "").endsWith(":inventoryLabels:linkedSubcategory")) return;
                              const arr = Array.isArray(value) ? value : [];
                              if (arr.some((v) => String(v) === String(id))) {
                                hasMapping = true;
                              }
                            });
                            return hasMapping;
                          })
                          .forEach((subcat) => {
                            const id = subcat._id || subcat.id;
                            const name = subcat.name || "Unnamed Service";
                            const maxCount = setupVehicleCounts[id] || 1;
                            // Find the family and label for this subcategory
                            Object.entries(parentLinkedAttr).forEach(([key, value]) => {
                              if (!String(key || "").endsWith(":inventoryLabels:linkedSubcategory")) return;
                              const arr = Array.isArray(value) ? value : [];
                              if (arr.some((v) => String(v) === String(id))) {
                                const fam = String(key).split(":")[0];
                                const labelsKey = `${fam}:inventoryLabels`;
                                const labels = parentLinkedAttr[labelsKey];
                                const label = Array.isArray(labels) && labels.length > 0 ? String(labels[0]) : fam;
                                scopes.push({ serviceId: id, serviceName: name, family: fam, label, maxCount });
                              }
                            });
                          });

                        if (scopes.length > 0) {
                          // Show inventory selection popup
                          setSetupInventoryScopes(scopes);
                          setSetupCurrentScopeIndex(0);
                          setSetupInventoryItems({});
                          setSetupInventoryDraft({});
                          setShowVehicleCountPopup(false);
                          setShowSetupInventoryPopup(true);
                          // Fetch models for the first scope
                          try {
                            await fetchSetupModelsForFamily(scopes[0].family);
                          } catch {}
                        } else {
                          // No inventory scopes, go directly to preview
                          const identityKey = `previewIdentity:${dvId}:${catId}`;
                          const vendorIdentity = {
                            role: "vendor",
                            displayName: setupSelectedPlace?.name || setupBusinessName || "Vendor",
                            loggedIn: true,
                          };
                          try {
                            window.localStorage.setItem(identityKey, JSON.stringify(vendorIdentity));
                          } catch {}
                          const homeLocs = Array.isArray(setupSelectedPlace?.nearbyLocations)
                            ? setupSelectedPlace.nearbyLocations.filter(Boolean)
                            : [];
                          const params = new URLSearchParams();
                          params.set("mode", "dummy");
                          if (setupCreationTimerKey) {
                            params.set("setupTimerKey", String(setupCreationTimerKey));
                          }
                          if (homeLocs.length) {
                            params.set("homeLocs", JSON.stringify(homeLocs));
                          }
                          params.set("t", String(Date.now()));
                          const url = `/preview/${dvId}/${catId}?${params.toString()}`;
                          setShowVehicleCountPopup(false);
                          window.open(url, "_blank");
                        }
                      } catch (e) {
                        setSetupGeneratePreviewError("Failed to generate preview");
                        setShowVehicleCountPopup(false);
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "none",
                      background: "#111827",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Setup Inventory Selection Popup (after Vehicle Count) */}
          {showSetupInventoryPopup && setupInventoryScopes.length > 0 && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 2200,
              }}
            >
              <div
                style={{
                  background: "#ffffff",
                  padding: 16,
                  borderRadius: 10,
                  width: "95vw",
                  maxWidth: 800,
                  maxHeight: "85vh",
                  overflow: "auto",
                  fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
                }}
              >
                {(() => {
                  const currentScope = setupInventoryScopes[setupCurrentScopeIndex];
                  if (!currentScope) return null;
                  const { serviceId, serviceName, family, label, maxCount } = currentScope;
                  const currentItems = setupInventoryItems[serviceId] || [];
                  const parentLinkedAttr = setupSelectedCategory?.linkedAttributes || {};
                  const { fields, listsByField } = getSetupCascadeLists(family, parentLinkedAttr);
                  const curr = setupInventoryDraft[family] || {};

                  return (
                    <>
                      <h3 style={{ marginTop: 0, marginBottom: 8 }}>
                        {label} - {serviceName}
                      </h3>
                      <p style={{ margin: 0, marginBottom: 12, fontSize: 13, color: "#6b7280" }}>
                        Select up to {maxCount} {label.toLowerCase()} for this service ({currentItems.length}/{maxCount} added)
                      </p>

                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: 8,
                            padding: 10,
                          }}
                        >
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>{family}</div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                              gap: 10,
                            }}
                          >
                            {fields.map((heading) => {
                              const values = Array.isArray(listsByField[heading]) ? listsByField[heading] : [];
                              const val = curr[heading] || "";
                              const hLower = String(heading).toLowerCase().replace(/[^a-z0-9]/g, "");
                              const isBrand = hLower.endsWith("brand");
                              const isModel = hLower.endsWith("model") || hLower === "model";
                              const brandSelected = Boolean(
                                curr.bikeBrand || curr.brand || curr.Brand || curr.make || curr.Make
                              );
                              const isDisabled = isModel && !brandSelected;
                              return (
                                <label
                                  key={`${family}:${heading}`}
                                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                                >
                                  <span style={{ fontSize: 12, color: "#475569" }}>{heading}</span>
                                  <select
                                    value={val}
                                    disabled={isDisabled}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setSetupInventoryDraft((prev) => {
                                        const nextFam = { ...(prev[family] || {}), [heading]: v };
                                        if (isBrand) {
                                          delete nextFam.model;
                                          delete nextFam.Model;
                                          delete nextFam.transmission;
                                          delete nextFam.bodyType;
                                        } else if (isModel) {
                                          delete nextFam.transmission;
                                          delete nextFam.bodyType;
                                        }
                                        return { ...prev, [family]: nextFam };
                                      });
                                      if (isBrand) {
                                        try {
                                          fetchSetupModelsForFamily(family);
                                        } catch {}
                                      }
                                    }}
                                    style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
                                  >
                                    <option value="">Select</option>
                                    {values.map((v) => (
                                      <option key={`${family}:${heading}:${v}`} value={v}>
                                        {v}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Selected Data Table */}
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Selected Data</div>
                        {currentItems.length === 0 ? (
                          <div
                            style={{
                              fontSize: 13,
                              color: "#64748b",
                              padding: "20px",
                              textAlign: "center",
                              background: "#f8fafc",
                              borderRadius: 8,
                            }}
                          >
                            No items added yet. Make selections above and data will be added automatically.
                          </div>
                        ) : (
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "600px" }}>
                              <thead>
                                <tr style={{ background: "#f1f5f9" }}>
                                  <th style={{ border: "1px solid #e2e8f0", padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>No</th>
                                  <th style={{ border: "1px solid #e2e8f0", padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>Scope</th>
                                  {fields.map((heading) => (
                                    <th key={heading} style={{ border: "1px solid #e2e8f0", padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>
                                      {heading}
                                    </th>
                                  ))}
                                  <th style={{ border: "1px solid #e2e8f0", padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>Images</th>
                                  <th style={{ border: "1px solid #e2e8f0", padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {currentItems.map((it, idx) => {
                                  const rowData = it.selections?.[family] || {};
                                  const images = Array.isArray(it.images) ? it.images : [];
                                  return (
                                    <tr key={it.at || idx} style={{ borderBottom: "1px solid #e2e8f0" }}>
                                      <td style={{ border: "1px solid #e2e8f0", padding: "10px 12px" }}>{idx + 1}</td>
                                      <td style={{ border: "1px solid #e2e8f0", padding: "10px 12px" }}>{family}</td>
                                      {fields.map((heading) => (
                                        <td key={heading} style={{ border: "1px solid #e2e8f0", padding: "10px 12px" }}>
                                          {rowData[heading] || "—"}
                                        </td>
                                      ))}
                                      <td style={{ border: "1px solid #e2e8f0", padding: "10px 12px" }}>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                            {images.map((src, i) => {
                                              const raw = String(src || "");
                                              const url = raw.startsWith("http") ? raw : `${ASSET_BASE_URL || API_BASE_URL}${raw}`;
                                              return (
                                                <div key={i} style={{ position: "relative", width: 40 }}>
                                                  <img
                                                    src={url}
                                                    alt={`img-${i}`}
                                                    style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, border: "1px solid #eee" }}
                                                  />
                                                  <button
                                                    type="button"
                                                    title="Delete image"
                                                    onClick={() => {
                                                      setSetupInventoryItems((prev) => ({
                                                        ...prev,
                                                        [serviceId]: (prev[serviceId] || []).map((item, itemIdx) =>
                                                          itemIdx === idx
                                                            ? { ...item, images: (item.images || []).filter((_, imgIdx) => imgIdx !== i) }
                                                            : item
                                                        ),
                                                      }));
                                                    }}
                                                    style={{
                                                      position: "absolute",
                                                      top: 0,
                                                      right: 0,
                                                      padding: 1,
                                                      borderRadius: 3,
                                                      border: "none",
                                                      background: "rgba(255,255,255,0.9)",
                                                      cursor: "pointer",
                                                      fontSize: 8,
                                                    }}
                                                  >
                                                    🗑️
                                                  </button>
                                                </div>
                                              );
                                            })}
                                          </div>
                                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                            <span style={{ fontSize: 10, color: "#475569" }}>
                                              {images.length}/5
                                            </span>
                                            <input
                                              type="file"
                                              accept="image/*"
                                              multiple
                                              disabled={images.length >= 5}
                                              onChange={(e) => {
                                                const remaining = Math.max(0, 5 - images.length);
                                                const files = Array.from(e.target.files || []).slice(0, remaining);
                                                if (!files.length) return;
                                                // Convert files to base64 for local preview (will be uploaded on save)
                                                Promise.all(
                                                  files.map(
                                                    (f) =>
                                                      new Promise((resolve) => {
                                                        const reader = new FileReader();
                                                        reader.onload = () => resolve({ dataUrl: reader.result, file: f });
                                                        reader.readAsDataURL(f);
                                                      })
                                                  )
                                                ).then((results) => {
                                                  setSetupInventoryItems((prev) => ({
                                                    ...prev,
                                                    [serviceId]: (prev[serviceId] || []).map((item, itemIdx) =>
                                                      itemIdx === idx
                                                        ? {
                                                            ...item,
                                                            images: [...(item.images || []), ...results.map((r) => r.dataUrl)],
                                                            pendingFiles: [...(item.pendingFiles || []), ...results.map((r) => r.file)],
                                                          }
                                                        : item
                                                    ),
                                                  }));
                                                });
                                                e.target.value = "";
                                              }}
                                              style={{ fontSize: 10, width: 80 }}
                                            />
                                          </div>
                                        </div>
                                      </td>
                                      <td style={{ border: "1px solid #e2e8f0", padding: "10px 12px" }}>
                                        <div style={{ display: "flex", gap: 4, flexDirection: "column" }}>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              // Edit: populate draft with this item's data
                                              setSetupInventoryDraft((prev) => ({
                                                ...prev,
                                                [family]: { ...rowData },
                                              }));
                                              // Remove this item (will be re-added when user clicks Add Data)
                                              setSetupInventoryItems((prev) => ({
                                                ...prev,
                                                [serviceId]: (prev[serviceId] || []).filter((_, i) => i !== idx),
                                              }));
                                            }}
                                            style={{
                                              padding: "4px 8px",
                                              borderRadius: 4,
                                              border: "1px solid #3b82f6",
                                              background: "#eff6ff",
                                              color: "#3b82f6",
                                              fontSize: 11,
                                              cursor: "pointer",
                                            }}
                                          >
                                            Edit
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSetupInventoryItems((prev) => ({
                                                ...prev,
                                                [serviceId]: (prev[serviceId] || []).filter((_, i) => i !== idx),
                                              }));
                                            }}
                                            style={{
                                              padding: "4px 8px",
                                              borderRadius: 4,
                                              border: "1px solid #ef4444",
                                              background: "#fef2f2",
                                              color: "#ef4444",
                                              fontSize: 11,
                                              cursor: "pointer",
                                            }}
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Navigation Buttons */}
                      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (setupCurrentScopeIndex > 0) {
                              setSetupCurrentScopeIndex((prev) => prev - 1);
                              const prevScope = setupInventoryScopes[setupCurrentScopeIndex - 1];
                              if (prevScope) {
                                try {
                                  fetchSetupModelsForFamily(prevScope.family);
                                } catch {}
                              }
                            } else {
                              setShowSetupInventoryPopup(false);
                              setShowVehicleCountPopup(true);
                            }
                          }}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 6,
                            background: "#e5e7eb",
                            border: "none",
                            cursor: "pointer",
                            fontSize: 13,
                          }}
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (setupCurrentScopeIndex < setupInventoryScopes.length - 1) {
                              // Move to next scope
                              setSetupCurrentScopeIndex((prev) => prev + 1);
                              const nextScope = setupInventoryScopes[setupCurrentScopeIndex + 1];
                              if (nextScope) {
                                try {
                                  await fetchSetupModelsForFamily(nextScope.family);
                                } catch {}
                              }
                            } else {
                              // All scopes done, save inventory and show profile setup confirmation
                              try {
                                const dvId = setupGeneratedDummyVendorId;
                                const catId = setupSelectedCategory?._id || setupSelectedCategory?.id;
                                console.log("Next clicked - saving profile", { dvId, catId, setupGeneratedDummyVendorId, setupSelectedCategory });
                                if (!dvId || !catId) {
                                  console.error("Preview link not ready", { dvId, catId });
                                  setSetupGeneratePreviewError("Preview link not ready");
                                  setShowSetupInventoryPopup(false);
                                  return;
                                }

                                // Build nodePricingStatus map: selected = Active, unselected = Inactive
                                const nodePricingStatus = {};
                                setupSubcategories.forEach((subcat) => {
                                  const sid = subcat._id || subcat.id;
                                  if (sid) {
                                    nodePricingStatus[sid] = setupSelectedSubcategories[sid] ? "Active" : "Inactive";
                                  }
                                });

                                // Save all vendor data (business name, phone, location, hours, services)
                                const businessName = setupSelectedPlace?.name || setupBusinessName || "";
                                const placeLocation = setupSelectedPlace?.location || null;
                                const placeAddress = setupSelectedPlace?.address || "";
                                const openingHoursText = Array.isArray(setupSelectedPlace?.openingHoursText)
                                  ? setupSelectedPlace.openingHoursText
                                  : [];
                                const phoneFull = setupOtpPhoneInfo
                                  ? `+${setupOtpPhoneInfo.countryCode}${setupOtpPhoneInfo.phone}`
                                  : "";

                                console.log("Saving vendor data...", { businessName, phoneFull, placeLocation, placeAddress, nodePricingStatus, setupVehicleCounts });
                                try {
                                  const vendorRes = await fetch(`${API_BASE_URL}/api/dummy-vendors/${dvId}`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      businessName: String(businessName),
                                      contactName: String(businessName),
                                      phone: String(phoneFull),
                                      location: {
                                        lat: typeof placeLocation?.lat === "number" ? placeLocation.lat : undefined,
                                        lng: typeof placeLocation?.lng === "number" ? placeLocation.lng : undefined,
                                        address: String(placeAddress || ""),
                                      },
                                      openingHoursText,
                                      nodePricingStatus,
                                      vehicleCounts: setupVehicleCounts,
                                    }),
                                  });
                                  console.log("Vendor data save response:", vendorRes.status, await vendorRes.text().catch(() => ""));
                                } catch (e) {
                                  console.error("Failed to save vendor data", e);
                                }

                                // Save all inventory items to dummy vendor using same format as existing inventory modal
                                const allItems = [];
                                Object.entries(setupInventoryItems).forEach(([svcId, items]) => {
                                  const scope = setupInventoryScopes.find((s) => s.serviceId === svcId);
                                  if (scope && Array.isArray(items)) {
                                    items.forEach((item) => {
                                      // Ensure item has categoryId and correct structure
                                      const itemWithCatId = {
                                        at: item.at || Date.now(),
                                        categoryId: catId,
                                        selections: item.selections || {},
                                        scopeFamily: scope.family,
                                        scopeLabel: scope.label,
                                        images: item.images || [],
                                      };
                                      allItems.push(itemWithCatId);
                                    });
                                  }
                                });

                                console.log("Saving inventory items:", allItems);
                                if (allItems.length > 0) {
                                  try {
                                    // Use same format as saveDummyInventorySelections: inventorySelections: { [categoryId]: items }
                                    const inventoryRes = await fetch(`${API_BASE_URL}/api/dummy-vendors/${dvId}`, {
                                      method: "PUT",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ inventorySelections: { [catId]: allItems } }),
                                    });
                                    console.log("Inventory save response:", inventoryRes.status);
                                  } catch (e) {
                                    console.error("Failed to save inventory", e);
                                  }
                                }

                                // Update vendor status to "Profile Setup"
                                try {
                                  await fetch(`${API_BASE_URL}/api/dummy-vendors/${dvId}`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ status: "Profile Setup" }),
                                  });
                                  console.log("Status updated to Profile Setup");
                                } catch (e) {
                                  console.error("Failed to update status to Profile Setup", e);
                                }

                                // Close inventory popup and show profile setup confirmation
                                setShowSetupInventoryPopup(false);
                                setSetupProfileStatus("profile_setup");
                                setShowProfileSetupConfirm(true);
                              } catch (e) {
                                console.error("Next button error:", e);
                                setSetupGeneratePreviewError("Failed to save profile");
                                setShowSetupInventoryPopup(false);
                              }
                            }
                          }}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 6,
                            background: "#111827",
                            color: "#fff",
                            border: "none",
                            cursor: "pointer",
                            fontSize: 13,
                          }}
                        >
                          {setupCurrentScopeIndex < setupInventoryScopes.length - 1 ? "Next Service" : "Next"}
                        </button>
                      </div>

                      {/* Progress indicator */}
                      <div style={{ marginTop: 12, fontSize: 12, color: "#6b7280", textAlign: "center" }}>
                        Service {setupCurrentScopeIndex + 1} of {setupInventoryScopes.length}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
          {/* Profile Setup Confirmation Popup */}
          {showProfileSetupConfirm && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10000,
              }}
            >
              <div
                style={{
                  background: "#fff",
                  padding: 24,
                  borderRadius: 12,
                  width: 380,
                  fontFamily: "Poppins, sans-serif",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
                  textAlign: "center",
                }}
              >
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#111827" }}>
                    Your profile has been set!
                  </h3>
                  <p style={{ margin: "8px 0 0", fontSize: 14, color: "#6b7280" }}>
                    Your business profile and inventory have been saved successfully.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                  <button
                    type="button"
                    onClick={() => {
                      // Cancel - just close popup, status stays as profile_setup
                      setShowProfileSetupConfirm(false);
                    }}
                    style={{
                      padding: "10px 24px",
                      borderRadius: 8,
                      background: "#f3f4f6",
                      color: "#374151",
                      border: "1px solid #d1d5db",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // Next - close this popup and show preview confirmation
                      setShowProfileSetupConfirm(false);
                      setShowPreviewConfirm(true);
                    }}
                    style={{
                      padding: "10px 24px",
                      borderRadius: 8,
                      background: "#111827",
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Preview Confirmation Popup */}
          {showPreviewConfirm && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10000,
              }}
            >
              <div
                style={{
                  background: "#fff",
                  padding: 24,
                  borderRadius: 12,
                  width: 380,
                  fontFamily: "Poppins, sans-serif",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
                  textAlign: "center",
                }}
              >
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>👁️</div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#111827" }}>
                    Do you want to preview?
                  </h3>
                  <p style={{ margin: "8px 0 0", fontSize: 14, color: "#6b7280" }}>
                    Preview your business page to see how it looks to customers.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                  <button
                    type="button"
                    onClick={() => {
                      // No - just close popup, do nothing
                      setShowPreviewConfirm(false);
                    }}
                    style={{
                      padding: "10px 24px",
                      borderRadius: 8,
                      background: "#f3f4f6",
                      color: "#374151",
                      border: "1px solid #d1d5db",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      // Yes - update status to Preview and open preview page
                      const dvId = setupGeneratedDummyVendorId;
                      const catId = setupSelectedCategory?._id || setupSelectedCategory?.id;
                      
                      // Update vendor status to "Preview"
                      if (dvId) {
                        try {
                          await fetch(`${API_BASE_URL}/api/dummy-vendors/${dvId}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "Preview" }),
                          });
                          console.log("Status updated to Preview");
                        } catch (e) {
                          console.error("Failed to update status to Preview", e);
                        }
                      }
                      
                      setShowPreviewConfirm(false);
                      setSetupProfileStatus("preview");
                      
                      // Open preview page
                      if (dvId && catId) {
                        const identityKey = `previewIdentity:${dvId}:${catId}`;
                        const vendorIdentity = {
                          role: "vendor",
                          displayName: setupSelectedPlace?.name || setupBusinessName || "Vendor",
                          loggedIn: true,
                        };
                        try {
                          window.localStorage.setItem(identityKey, JSON.stringify(vendorIdentity));
                        } catch {}
                        const homeLocs = Array.isArray(setupSelectedPlace?.nearbyLocations)
                          ? setupSelectedPlace.nearbyLocations.filter(Boolean)
                          : [];
                        const params = new URLSearchParams();
                        params.set("mode", "dummy");
                        if (setupCreationTimerKey) {
                          params.set("setupTimerKey", String(setupCreationTimerKey));
                        }
                        if (homeLocs.length) {
                          params.set("homeLocs", JSON.stringify(homeLocs));
                        }
                        params.set("t", String(Date.now()));
                        const url = `/preview/${dvId}/${catId}?${params.toString()}`;
                        console.log("Opening preview URL:", url);
                        window.open(url, "_blank");
                      }
                    }}
                    style={{
                      padding: "10px 24px",
                      borderRadius: 8,
                      background: "#111827",
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                  >
                    Yes
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* OTP Modal for preview booking (login dialog) */}
          {showOtpModal && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  background: "#fff",
                  padding: 24,
                  borderRadius: 16,
                  width: 380,
                  fontFamily: "Poppins, sans-serif",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
                }}
              >
                {otpStep === 1 && (
                  <>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
                        Log in
                      </div>
                      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#065f46" }}>
                        Welcome to {vendor?.businessName || "our services"}
                      </h2>
                      <p style={{ margin: "6px 0 0", fontSize: 13, color: "#4b5563" }}>
                        {loginSubtitle}
                      </p>
                    </div>

                    {!loginAsAdmin && (
                      <>
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#374151" }}>
                            Mobile number
                          </label>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              borderRadius: 999,
                              border: "1px solid #e5e7eb",
                              padding: "4px 10px",
                              background: "#f9fafb",
                            }}
                          >
                            <select
                              value={countryCode}
                              onChange={(e) => setCountryCode(e.target.value)}
                              style={{
                                border: "none",
                                background: "transparent",
                                fontSize: 13,
                                color: "#6b7280",
                                paddingRight: 6,
                                outline: "none",
                              }}
                            >
                              {countries.length === 0 ? (
                                <option value={countryCode}>+{countryCode}</option>
                              ) : (
                                countries.map((c) => (
                                  <option key={c.code} value={c.code}>
                                    +{c.code}
                                  </option>
                                ))
                              )}
                            </select>
                            <span style={{ color: "#d1d5db", margin: "0 6px" }}>|</span>
                            <input
                              type="text"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                              placeholder="Mobile number"
                              style={{
                                flex: 1,
                                border: "none",
                                outline: "none",
                                background: "transparent",
                                fontSize: 14,
                              }}
                            />
                          </div>
                        </div>

                        <div style={{ marginTop: 4, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            id="login-as-admin-checkbox"
                            type="checkbox"
                            checked={loginAsAdmin}
                            onChange={(e) => {
                              setLoginAsAdmin(e.target.checked);
                              setOtpError("");
                            }}
                            style={{ width: 14, height: 14 }}
                          />
                          <label
                            htmlFor="login-as-admin-checkbox"
                            style={{ fontSize: 12, color: "#374151", cursor: "pointer" }}
                          >
                            Login as Admin
                          </label>
                        </div>

                        {otpError && (
                          <div style={{ color: "#b91c1c", marginBottom: 8, fontSize: 13 }}>{otpError}</div>
                        )}

                        <button
                          type="button"
                          onClick={requestOtp}
                          style={{
                            width: "100%",
                            marginTop: 8,
                            padding: 10,
                            borderRadius: 999,
                            border: "none",
                            background: "#059669",
                            color: "#fff",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontSize: 14,
                          }}
                          disabled={otpLoading}
                        >
                          {otpLoading ? "Sending..." : "Continue"}
                        </button>
                      </>
                    )}

                    {loginAsAdmin && (
                      <>
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#374151" }}>
                            Enter Admin Passcode
                          </label>
                          <input
                            type="password"
                            maxLength={4}
                            value={adminPasscodeInput}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[^0-9]/g, "");
                              setAdminPasscodeInput(v.slice(0, 4));
                            }}
                            placeholder="4-digit code"
                            style={{
                              width: "100%",
                              padding: 10,
                              borderRadius: 999,
                              border: "1px solid #e5e7eb",
                              textAlign: "center",
                              letterSpacing: 4,
                              fontSize: 16,
                            }}
                          />
                        </div>

                        {otpError && (
                          <div style={{ color: "#b91c1c", marginBottom: 8, fontSize: 13 }}>{otpError}</div>
                        )}

                        <button
                          type="button"
                          onClick={handleAdminLogin}
                          style={{
                            width: "100%",
                            marginTop: 8,
                            padding: 10,
                            borderRadius: 999,
                            border: "none",
                            background: "#059669",
                            color: "#fff",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontSize: 14,
                          }}
                          disabled={otpLoading}
                        >
                          {otpLoading ? "Checking..." : "Login as Admin"}
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={handleCloseOtpModal}
                      style={{
                        width: "100%",
                        marginTop: 8,
                        padding: 8,
                        borderRadius: 999,
                        border: "none",
                        background: "transparent",
                        color: "#6b7280",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </>
                )}

                {otpStep === 2 && (
                  <>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
                        Verify OTP
                      </div>
                      <p style={{ marginTop: 0, marginBottom: 4, fontSize: 13, color: "#4b5563" }}>
                        We sent a one-time password to
                      </p>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#065f46" }}>
                        +{countryCode}
                        {phone.replace(/\D/g, "")}
                      </p>
                    </div>

                    <input
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="Enter OTP"
                      style={{
                        width: "100%",
                        padding: 10,
                        borderRadius: 999,
                        border: "1px solid #e5e7eb",
                        marginBottom: 12,
                        textAlign: "center",
                        letterSpacing: 4,
                        fontSize: 16,
                      }}
                    />

                    {otpError && (
                      <div style={{ color: "#b91c1c", marginBottom: 8, fontSize: 13 }}>{otpError}</div>
                    )}

                    <button
                      type="button"
                      onClick={verifyOtp}
                      style={{
                        width: "100%",
                        padding: 10,
                        borderRadius: 999,
                        border: "none",
                        background: "#059669",
                        color: "#fff",
                        fontWeight: 600,
                        cursor: "pointer",
                        fontSize: 14,
                        marginBottom: 8,
                      }}
                      disabled={otpLoading}
                    >
                      {otpLoading ? "Verifying..." : "Verify & Continue"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setOtpStep(1);
                        setOtp("");
                        setOtpError("");
                      }}
                      style={{
                        width: "100%",
                        padding: 8,
                        borderRadius: 999,
                        border: "none",
                        background: "transparent",
                        color: "#6b7280",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Back
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          <Footer
            businessName={vendor?.businessName}
            categoryName={categoryTree?.name || "Driving School"}
            navLinks={[
              { label: "Home", href: "#home" },
              { label: "Our Services", href: "#products" },
              { label: "Why Us", href: "#benefits" },
              { label: "About", href: "#about" },
              { label: "Contact", href: "#contact" },
            ]}
            popularCourses={serviceLabels}
            reachUs={{
              phone: vendor?.customerId?.fullNumber || vendor?.phone || "-",
              address:
                location
                  ? (() => {
                      try {
                        const loc = location || {};
                        const primary = (loc.areaCity || "").trim();
                        if (primary) return primary;

                        const text = [
                          loc.area,
                          loc.city,
                          loc.address,
                          loc.addressLine1,
                        ]
                          .map((v) => (v || "").trim())
                          .filter(Boolean)
                          .join(", ");
                        if (text) return text;

                        const plat = Number(loc.lat);
                        const plng = Number(loc.lng);
                        if (Number.isFinite(plat) && Number.isFinite(plng)) {
                          return `${plat.toFixed(4)}, ${plng.toFixed(4)}`;
                        }
                        return "-";
                      } catch {
                        return "-";
                      }
                    })()
                  : "-",
              hours: (vendor?.businessHours && vendor.businessHours[0]?.hours) ||
                "Mon-Fri: 8:00 AM - 8:00 PM",
            }}
            contact={contact}
            vendorId={vendorId}
            socialHandles={socialHandles}
          />

          {showHomeLocationModal && (
            <LocationPickerModal
              show={showHomeLocationModal}
              onClose={() => setShowHomeLocationModal(false)}
              onSave={handleSaveHomeLocation}
              initialPosition={(() => {
                try {
                  const loc = location || vendor?.location || null;
                  if (!loc) return null;
                  const plat = Number(loc.lat);
                  const plng = Number(loc.lng);
                  if (Number.isFinite(plat) && Number.isFinite(plng)) {
                    return [plat, plng];
                  }
                  return null;
                } catch {
                  return null;
                }
              })()}
              title="Set Home Location"
            />
          )}

          {showBusinessHoursModal && vendor && (
            <BusinessHoursModal
              show={showBusinessHoursModal}
              vendor={vendor}
              onClose={() => setShowBusinessHoursModal(false)}
              onUpdated={(data) => {
                try {
                  const next = data?.businessHours || data?.vendor?.businessHours || null;
                  if (next) {
                    setVendor((prev) => (prev ? { ...prev, businessHours: next } : prev));
                  }
                } catch {}
                setShowBusinessHoursModal(false);
              }}
            />
          )}

          {showBusinessLocationModal && (
            <BusinessLocationModal
              show={showBusinessLocationModal}
              onClose={() => setShowBusinessLocationModal(false)}
              vendorId={vendorId}
              onUpdated={async () => {
                try {
                  const res = await fetch(`${API_BASE_URL}/api/vendors/${vendorId}/location`, { cache: "no-store" });
                  const data = await res.json().catch(() => ({}));
                  const loc = data?.location || data || null;
                  if (loc) {
                    setLocation(loc);
                    setVendor((prev) => (prev ? { ...prev, location: loc } : prev));
                  }
                } catch (err) {
                  console.error("Failed to refresh business location", err);
                }
                setShowBusinessLocationModal(false);
              }}
            />
          )}

          {showLinkedModal && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 2200,
              }}
            >
              <div
                style={{
                  background: "#ffffff",
                  padding: 16,
                  borderRadius: 10,
                  width: "95vw",
                  maxWidth: 800,
                  maxHeight: "85vh",
                  overflow: "auto",
                  fontFamily:
                    "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
                }}
              >
                <h3 style={{ marginTop: 0 }}>
                  {activeInvScope?.label || inventoryLabelName || "Inventory"}
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {(() => {
                    if (!activeInvScope) return null;
                    const familyKey = String(activeInvScope.family);
                    const { fields, listsByField } = getCascadeLists(familyKey);
                    const curr = draftSelections[familyKey] || {};
                    return (
                      <div
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: 8,
                          padding: 10,
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>
                          {familyKey}
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fill, minmax(220px, 1fr))",
                            gap: 10,
                          }}
                        >
                          {fields.map((heading) => {
                            const values = Array.isArray(listsByField[heading])
                              ? listsByField[heading]
                              : [];
                            const val = curr[heading] || "";
                            const hLower = String(heading)
                              .toLowerCase()
                              .replace(/[^a-z0-9]/g, "");
                            const isBrand = hLower.endsWith("brand");
                            const isModel = hLower.endsWith("model");
                            const brandSelected = Boolean(
                              curr.bikeBrand ||
                                curr.brand ||
                                curr.Brand ||
                                curr.make ||
                                curr.Make
                            );
                            const isDisabled = isModel && !brandSelected;
                            return (
                              <label
                                key={`${familyKey}:${heading}`}
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 6,
                                }}
                              >
                                <span
                                  style={{ fontSize: 12, color: "#475569" }}
                                >
                                  {heading}
                                </span>
                                <select
                                  value={val}
                                  disabled={isDisabled}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setDraftSelections((prev) => {
                                      const nextFam = {
                                        ...(prev[familyKey] || {}),
                                        [heading]: v,
                                      };
                                      if (isBrand) {
                                        delete nextFam.model;
                                        delete nextFam.Model;
                                        delete nextFam.modelName;
                                        delete nextFam.model_name;
                                        delete nextFam.name;
                                        delete nextFam.variant;
                                        delete nextFam.Variant;
                                        delete nextFam.trim;
                                        delete nextFam.Trim;
                                        delete nextFam.transmission;
                                        delete nextFam.Transmission;
                                        delete nextFam.gearbox;
                                        delete nextFam.gear_type;
                                        delete nextFam.gearType;
                                        delete nextFam.fuelType;
                                        delete nextFam.FuelType;
                                        delete nextFam.fueltype;
                                        delete nextFam.Fuel;
                                        delete nextFam.fuel_type;
                                        delete nextFam.bodyType;
                                        delete nextFam.BodyType;
                                        delete nextFam.body_type;
                                        delete nextFam.type;
                                        delete nextFam.seats;
                                        delete nextFam.Seats;
                                        delete nextFam.seatCapacity;
                                        delete nextFam.SeatCapacity;
                                        delete nextFam.seatingCapacity;
                                        delete nextFam.SeatingCapacity;
                                      } else if (isModel) {
                                        delete nextFam.variant;
                                        delete nextFam.Variant;
                                        delete nextFam.trim;
                                        delete nextFam.Trim;
                                        delete nextFam.transmission;
                                        delete nextFam.Transmission;
                                        delete nextFam.gearbox;
                                        delete nextFam.gear_type;
                                        delete nextFam.gearType;
                                        delete nextFam.fuelType;
                                        delete nextFam.FuelType;
                                        delete nextFam.fueltype;
                                        delete nextFam.Fuel;
                                        delete nextFam.fuel_type;
                                        delete nextFam.bodyType;
                                        delete nextFam.BodyType;
                                        delete nextFam.body_type;
                                        delete nextFam.type;
                                        delete nextFam.seats;
                                        delete nextFam.Seats;
                                        delete nextFam.seatCapacity;
                                        delete nextFam.SeatCapacity;
                                        delete nextFam.seatingCapacity;
                                        delete nextFam.SeatingCapacity;
                                      }
                                      return { ...prev, [familyKey]: nextFam };
                                    });
                                    if (isBrand) {
                                      try {
                                        fetchModelsForFamily(familyKey);
                                      } catch {}
                                    }
                                  }}
                                  style={{
                                    padding: 8,
                                    border: "1px solid #ddd",
                                    borderRadius: 6,
                                  }}
                                >
                                  <option value="">Select</option>
                                  {values.map((v) => (
                                    <option
                                      key={`${familyKey}:${heading}:${v}`}
                                      value={v}
                                    >
                                      {v}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    Selected Data
                  </div>
                  {(() => {
                    const list = Array.isArray(invItems) ? invItems : [];
                    const filtered = activeInvScope
                      ? list.filter(
                          (it) =>
                            String(it.scopeFamily) ===
                              String(activeInvScope.family) &&
                            String(it.scopeLabel) ===
                              String(activeInvScope.label)
                        )
                      : list;

                    const allKeys = new Set();
                    filtered.forEach((item) => {
                      Object.values(item.selections || {}).forEach((fields) => {
                        Object.keys(fields || {}).forEach((key) => {
                          const fn = String(key)
                            .toLowerCase()
                            .replace(/[^a-z0-9]/g, "");
                          if (fn !== "modelfields") allKeys.add(key);
                        });
                      });
                    });
                    let dynamicHeadings = Array.from(allKeys);
                    if (
                      activeInvScope &&
                      String(activeInvScope.family).toLowerCase() === "bikes"
                    ) {
                      const hasBikeBrand = dynamicHeadings.some(
                        (h) => String(h).toLowerCase() === "bikebrand"
                      );
                      if (hasBikeBrand)
                        dynamicHeadings = dynamicHeadings.filter(
                          (h) => String(h).toLowerCase() !== "brand"
                        );
                    }

                    if (filtered.length === 0) {
                      return (
                        <div
                          style={{
                            fontSize: 13,
                            color: "#64748b",
                            padding: "20px",
                            textAlign: "center",
                            background: "#f8fafc",
                            borderRadius: 8,
                          }}
                        >
                          No items added yet. Make selections above and data will be added
                          automatically.
                        </div>
                      );
                    }

                    return (
                      <div style={{ overflowX: "auto" }}>
                        <table
                          style={{
                            borderCollapse: "collapse",
                            width: "100%",
                            minWidth: "720px",
                          }}
                        >
                          <thead>
                            <tr style={{ background: "#f1f5f9" }}>
                              <th
                                style={{
                                  border: "1px solid #e2e8f0",
                                  padding: "10px 12px",
                                  textAlign: "left",
                                  fontWeight: 600,
                                }}
                              >
                                No
                              </th>
                              <th
                                style={{
                                  border: "1px solid #e2e8f0",
                                  padding: "10px 12px",
                                  textAlign: "left",
                                  fontWeight: 600,
                                }}
                              >
                                Scope
                              </th>
                              {dynamicHeadings.map((heading) => (
                                <th
                                  key={heading}
                                  style={{
                                    border: "1px solid #e2e8f0",
                                    padding: "10px 12px",
                                    textAlign: "left",
                                    fontWeight: 600,
                                  }}
                                >
                                  {heading}
                                </th>
                              ))}
                              <th
                                style={{
                                  border: "1px solid #e2e8f0",
                                  padding: "10px 12px",
                                  textAlign: "left",
                                  fontWeight: 600,
                                }}
                              >
                                Images
                              </th>
                              <th
                                style={{
                                  border: "1px solid #e2e8f0",
                                  padding: "10px 12px",
                                  textAlign: "left",
                                  fontWeight: 600,
                                }}
                              >
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((it, idx) => {
                              const key = it._id || it.at || idx;
                              const scopeText = `${it.scopeFamily || "-"}`;
                              const rowData = new Map();
                              Object.values(it.selections || {}).forEach(
                                (fields) => {
                                  dynamicHeadings.forEach((heading) => {
                                    if (fields && fields[heading] != null) {
                                      rowData.set(
                                        heading,
                                        String(fields[heading])
                                      );
                                    }
                                  });
                                }
                              );
                              return (
                                <tr
                                  key={key}
                                  style={{
                                    borderBottom: "1px solid #e2e8f0",
                                  }}
                                >
                                  <td
                                    style={{
                                      border: "1px solid #e2e8f0",
                                      padding: "10px 12px",
                                    }}
                                  >
                                    {idx + 1}
                                  </td>
                                  <td
                                    style={{
                                      border: "1px solid #e2e8f0",
                                      padding: "10px 12px",
                                    }}
                                  >
                                    {scopeText}
                                  </td>
                                  {dynamicHeadings.map((heading) => (
                                    <td
                                      key={heading}
                                      style={{
                                        border: "1px solid #e2e8f0",
                                        padding: "10px 12px",
                                      }}
                                    >
                                      {rowData.get(heading) || "—"}
                                    </td>
                                  ))}
                                  <td
                                    style={{
                                      border: "1px solid #e2e8f0",
                                      padding: "10px 12px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 6,
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: "flex",
                                          gap: 8,
                                          flexWrap: "wrap",
                                        }}
                                      >
                                        {(Array.isArray(it.images)
                                          ? it.images
                                          : []
                                        ).map((src, i) => {
                                          const raw = String(src || "");
                                          const url = raw.startsWith("http")
                                            ? raw
                                            : `${ASSET_BASE_URL || API_BASE_URL}${raw}`;
                                          return (
                                            <div
                                              key={i}
                                              style={{
                                                position: "relative",
                                                width: 56,
                                              }}
                                            >
                                              <img
                                                src={url}
                                                alt={`img-${i}`}
                                                style={{
                                                  width: 56,
                                                  height: 56,
                                                  objectFit: "cover",
                                                  borderRadius: 6,
                                                  border: "1px solid #eee",
                                                }}
                                              />
                                              <button
                                                type="button"
                                                title="Delete image"
                                                onClick={async () => {
                                                  try {
                                                    const keyId = String(
                                                      it._id || it.at
                                                    );
                                                    const res = await fetch(
                                                      `${API_BASE_URL}/api/dummy-vendors/${vendorId}/inventory/${categoryId}/${keyId}/images/${i}`,
                                                      {
                                                        method: "DELETE",
                                                      }
                                                    );
                                                    const json = await res
                                                      .json()
                                                      .catch(() => ({}));
                                                    const imgs = Array.isArray(
                                                      json.images
                                                    )
                                                      ? json.images
                                                      : [];
                                                    setInvItems((prev) =>
                                                      (Array.isArray(prev)
                                                        ? prev
                                                        : []
                                                      ).map((p) =>
                                                        String(
                                                          p._id || p.at
                                                        ) === keyId
                                                          ? {
                                                              ...p,
                                                              images: imgs,
                                                            }
                                                          : p
                                                      )
                                                    );
                                                  } catch {
                                                    // ignore
                                                  }
                                                }}
                                                style={{
                                                  position: "absolute",
                                                  top: 2,
                                                  right: 2,
                                                  padding: 2,
                                                  borderRadius: 4,
                                                  border: "none",
                                                  background:
                                                    "rgba(255,255,255,0.9)",
                                                  cursor: "pointer",
                                                  fontSize: 10,
                                                }}
                                              >
                                                🗑️
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                      <div
                                        style={{
                                          display: "flex",
                                          gap: 6,
                                          alignItems: "center",
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontSize: 12,
                                            color: "#475569",
                                          }}
                                        >
                                          Uploaded:{" "}
                                          {Array.isArray(it.images)
                                            ? it.images.length
                                            : 0}
                                          /5
                                        </span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          multiple
                                          onChange={async (e) => {
                                            try {
                                              const existing = Array.isArray(
                                                it.images
                                              )
                                                ? it.images.length
                                                : 0;
                                              const remaining = Math.max(
                                                0,
                                                5 - existing
                                              );
                                              const files = Array.from(
                                                e.target.files || []
                                              ).slice(0, remaining);
                                              if (!files.length) return;
                                              const form = new FormData();
                                              files.forEach((f) =>
                                                form.append("images", f)
                                              );
                                              const keyId = String(
                                                it._id || it.at
                                              );
                                              const res = await fetch(
                                                `${API_BASE_URL}/api/dummy-vendors/${vendorId}/inventory/${categoryId}/${keyId}/images`,
                                                {
                                                  method: "POST",
                                                  body: form,
                                                }
                                              );
                                              const json = await res
                                                .json()
                                                .catch(() => ({}));
                                              const imgs = Array.isArray(
                                                json.images
                                              )
                                                ? json.images
                                                : [];
                                              setInvItems((prev) =>
                                                (Array.isArray(prev)
                                                  ? prev
                                                  : []
                                                ).map((p) =>
                                                  String(
                                                    p._id || p.at
                                                  ) === keyId
                                                    ? {
                                                        ...p,
                                                        images: imgs,
                                                      }
                                                    : p
                                                )
                                              );
                                            } catch {
                                              // ignore
                                            }
                                            // eslint-disable-next-line no-param-reassign
                                            e.target.value = "";
                                          }}
                                        />
                                      </div>
                                    </div>
                                  </td>
                                  <td
                                    style={{
                                      border: "1px solid #e2e8f0",
                                      padding: "10px 12px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 6,
                                      }}
                                    >
                                      <button
                                        type="button"
                                        title="Edit"
                                        onClick={() => {
                                          try {
                                            const fam = String(
                                              activeInvScope?.family ||
                                                it.scopeFamily ||
                                                ""
                                            );
                                            const fields =
                                              (it.selections || {})[fam] ||
                                              {};
                                            setEditingItemKey(
                                              it._id || it.at || null
                                            );
                                            setDraftSelections((prev) => ({
                                              ...prev,
                                              [fam]: { ...fields },
                                            }));
                                          } catch {
                                            // ignore
                                          }
                                        }}
                                        style={{
                                          padding: "6px 8px",
                                          borderRadius: 6,
                                          border: "1px solid #e5e7eb",
                                          background: "#fff",
                                          cursor: "pointer",
                                        }}
                                      >
                                        ✎
                                      </button>
                                      <button
                                        type="button"
                                        title="Delete"
                                        onClick={async () => {
                                          try {
                                            const next = (Array.isArray(
                                              invItems
                                            )
                                              ? invItems
                                              : []
                                            ).filter(
                                              (p) =>
                                                (p._id || p.at) !==
                                                (it._id || it.at)
                                            );
                                            setInvItems(next);
                                            if (vendorId && categoryId) {
                                              await saveDummyInventorySelections(
                                                vendorId,
                                                categoryId,
                                                next
                                              );
                                            }
                                            if (
                                              editingItemKey &&
                                              editingItemKey ===
                                                (it._id || it.at)
                                            ) {
                                              setEditingItemKey(null);
                                            }
                                          } catch {
                                            // ignore
                                          }
                                        }}
                                        style={{
                                          padding: "6px 8px",
                                          borderRadius: 6,
                                          border: "1px solid #fecaca",
                                          background: "#fee2e2",
                                          color: "#ef4444",
                                          cursor: "pointer",
                                        }}
                                      >
                                        🗑️
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "flex-end",
                    marginTop: 12,
                  }}
                >
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const scope = activeInvScope || null;
                        if (!scope) return;
                        const fam = String(scope.family);
                        const sel = draftSelections[fam] || {};
                        const hasAny = Object.values(sel).some(
                          (v) => v != null && String(v).trim() !== ""
                        );
                        if (!hasAny) return;
                        const keyNow = editingItemKey || Date.now();
                        const famLower = String(fam).toLowerCase();
                        let selNorm = { ...sel };
                        if (famLower === "bikes") {
                          if (selNorm.brand && !selNorm.bikeBrand) {
                            selNorm = { ...selNorm, bikeBrand: selNorm.brand };
                          }
                          if (selNorm.brand) {
                            const { brand, ...rest } = selNorm;
                            selNorm = rest;
                          }
                        }
                        const snapshot = {
                          at: keyNow,
                          categoryId,
                          selections: { [fam]: selNorm },
                          scopeFamily: scope.family,
                          scopeLabel: scope.label,
                        };
                        let nextItems;
                        if (editingItemKey) {
                          nextItems = (Array.isArray(invItems)
                            ? invItems
                            : []
                          ).map((p) =>
                            (p._id || p.at) === editingItemKey
                              ? { ...snapshot, _id: p._id }
                              : p
                          );
                        } else {
                          nextItems = [
                            ...(Array.isArray(invItems) ? invItems : []),
                            snapshot,
                          ];
                        }
                        setInvItems(nextItems);
                        if (vendorId && categoryId) {
                          await saveDummyInventorySelections(
                            vendorId,
                            categoryId,
                            nextItems
                          );
                          await ensureLinkedSubcategoryForScope(
                            categoryId,
                            scope.family,
                            scope.label
                          );
                        }
                        setDraftSelections((prev) => ({ ...prev, [fam]: {} }));
                        setEditingItemKey(null);
                      } catch {
                        // ignore
                      }
                    }}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      background: "#16a34a",
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Add Data
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowLinkedModal(false);
                      setDraftSelections({});
                      setEditingItemKey(null);
                    }}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      background: "#e5e7eb",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

        </>
      )}
      {sessionExpired && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              width: 280,
              borderRadius: 16,
              background: "#ffffff",
              padding: "20px 16px 12px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              textAlign: "center",
            }}
          >
            <div
              style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}
            >
              Session Expired
            </div>
            <div
              style={{
                fontSize: 14,
                color: "#4b5563",
                marginBottom: 16,
              }}
            >
              Please log in again.
            </div>
            <button
              type="button"
              onClick={() => {
                try {
                  if (vendorId && categoryId) {
                    window.location.href = `/preview/${vendorId}/${categoryId}`;
                  } else {
                    window.location.href = "/";
                  }
                } catch {
                  window.location.href = "/";
                }
              }}
              style={{
                minWidth: 80,
                padding: "8px 24px",
                borderRadius: 999,
                border: "none",
                background: "#16a34a",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
      {enquirySubmitted && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              width: 280,
              borderRadius: 16,
              background: "#ffffff",
              padding: "20px 16px 12px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              textAlign: "center",
              fontFamily:
                "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
            }}
          >
            <div
              style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}
            >
              Enquiry submitted
            </div>
            <div
              style={{
                fontSize: 14,
                color: "#4b5563",
                marginBottom: 16,
              }}
            >
              {(() => {
                const base = "Your enquiry has been submitted.";
                const path = String(lastEnquiryPath || "").trim();
                if (!path) return base;
                return `Your enquiry for ${path} has been submitted.`;
              })()}
            </div>
            <button
              type="button"
              onClick={() => setEnquirySubmitted(false)}
              style={{
                minWidth: 80,
                padding: "8px 24px",
                borderRadius: 999,
                border: "none",
                background: "#16a34a",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {contactInfoModal && contactInfoModal.enquiry && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
        >
          <div
            style={{
              width: 300,
              borderRadius: 16,
              background: "#ffffff",
              padding: "20px 16px 16px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
              textAlign: "center",
              fontFamily:
                "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
            }}
          >
            <div
              style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}
            >
              Contact Info
            </div>
            <div
              style={{
                fontSize: 14,
                color: "#4b5563",
                marginBottom: 4,
              }}
            >
              Customer number
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "#111827",
                marginBottom: 16,
              }}
            >
              {contactInfoModal.enquiry.phone || "-"}
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  const modal = contactInfoModal;
                  const nextStatus = modal?.nextStatus;
                  const enq = modal?.enquiry;
                  if (nextStatus && enq && enq._id) {
                    try {
                      await fetch(`${API_BASE_URL}/api/enquiries/${enq._id}/status`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: nextStatus }),
                      });
                    } catch {}

                    try {
                      const params = new URLSearchParams();
                      params.set("vendorId", String(vendorId));
                      params.set("categoryId", String(categoryId));
                      const res = await fetch(`${API_BASE_URL}/api/enquiries?${params.toString()}`, {
                        cache: "no-store",
                      });
                      const list = await res.json().catch(() => []);
                      setMyEnquiries(Array.isArray(list) ? list : []);
                    } catch {}
                  }
                } finally {
                  setContactInfoModal(null);
                }
              }}
              style={{
                minWidth: 80,
                padding: "8px 24px",
                borderRadius: 999,
                border: "none",
                background: "#2563eb",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
