"use client";
import { useEffect, useState } from "react";
import "./CategoryModal.css";
import { FcGoogle } from "react-icons/fc";
import { useCategoryTree } from "./CategoryModal2";
import './CategoryModal2.css';
import { API_BASE_URL } from "../../config";
import ServiceAreasStep from "../components/ServiceAreasStep";
// adjust path if needed: ../config or ../../config

const CATEGORY_API =
  `${API_BASE_URL}/api/dummy-categories`;

const getSelectedLeafIds = (nodes, selectedIds) => {
  return selectedIds.filter((id) => {
    const node = nodes[id];
    return node && node.children.length === 0;
  });
};


export default function ChooseCategoryModal({ onClose, vendorId: exploreVendorId }) {
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [step, setStep] = useState("CATEGORY");
  const [subdomainSuggestions, setSubdomainSuggestions] = useState([]);
  const [selectedSubdomain, setSelectedSubdomain] = useState(null);
  const [loading, setLoading] = useState(true);

  const [elapsed, setElapsed] = useState(0);
   const [vendorId, setVendorId] = useState(null);
const [serviceAreas, setServiceAreas] = useState(null);										 

  const [businessQuery, setBusinessQuery] = useState("");
  const [googleResults, setGoogleResults] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [activePlaceId, setActivePlaceId] = useState(null);
  const [confirmedCategory, setConfirmedCategory] = useState(null);


  const [syncing, setSyncing] = useState(false);

  const [trustQuestions, setTrustQuestions] = useState([]);
  const [trustAnswers, setTrustAnswers] = useState({});
  const [loadingTrust, setLoadingTrust] = useState(false);

  const [globalLoading, setGlobalLoading] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [captchaInput, setCaptchaInput] = useState(["", "", "", ""]);
  const [captchaError, setCaptchaError] = useState("");
  const [manualBusinessName, setManualBusinessName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [countryCode, setCountryCode] = useState("91");
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [otpAttemptToken, setOtpAttemptToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loadingOtp, setLoadingOtp] = useState(false);

const [bypassOtp, setBypassOtp] = useState(false);

const [showAdminPopup, setShowAdminPopup] = useState(false);
const [adminPasscode, setAdminPasscode] = useState("");
const [verifyingPasscode, setVerifyingPasscode] = useState(false);

  const rating = selectedBusiness?.rating;
  const totalReviews = selectedBusiness?.userRatingsTotal;
  const latitude = selectedBusiness?.location?.lat;
  const longitude = selectedBusiness?.location?.lng;

  const [selectedSearchBusiness, setSelectedSearchBusiness] = useState(null);

  const {
    nodes,
    rootIds,
    toggleNode,
    toggleSelect,
    selectedIds,
  } = useCategoryTree({
    setupSelectedCategory: confirmedCategory,
    overrideCatId: null,
  });

  const countSelectedChildren = (id, nodes, selectedIds) => {
    const node = nodes[id];
    if (!node || !node.children) return 0;

    let count = 0;

    for (const childId of node.children) {
      if (selectedIds.includes(childId)) {
        count++;
      }
      count += countSelectedChildren(childId, nodes, selectedIds);
    }

    return count;
  };



  function CategoryNode({
    id,
    nodes,
    toggleNode,
    toggleSelect,
    selectedIds,
  }) {
    const node = nodes[id];
    if (!node) return null;

    const isChecked = selectedIds.includes(id);
    const isLeaf = node.children.length === 0;
    const directChildCount = node.children.length;

    return (
      <div className="service-node">
        <div className={`service-card ${isChecked ? "active" : ""}`}>
          <label className="service-left">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => toggleSelect(id)}
            />
            <span className="check-ui" />

            <span className="service-name">
              {node.data.name}

              {/* ✅ DIRECT CHILD COUNT */}
              {!isLeaf && (
                <span className="child-count-badge">
                  {directChildCount}
                </span>
              )}
            </span>
          </label>

          {/* ✅ EXPAND ARROW ONLY IF CHILD EXISTS */}
          {!isLeaf && (
            <button
              type="button"
              className="expand-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggleNode(id);
              }}
            >
              {node.expanded ? "▾" : "▸"}
            </button>
          )}
        </div>

        {node.expanded && directChildCount > 0 && (
          <div className="service-children">
            {node.children.map((childId) => (
              <CategoryNode
                key={childId}
                id={childId}
                nodes={nodes}
                toggleNode={toggleNode}
                toggleSelect={toggleSelect}
                selectedIds={selectedIds}
              />
            ))}
          </div>
        )}
      </div>
    );
  }




const normalizePhone = (phone) => {
  const digits = String(phone || "")
    .replace(/\D/g, "")
    .trim();
  return digits.slice(-10);
};
  const toggleTrustMultiSelect = (questionId, option) => {
    setTrustAnswers((prev) => {
      const current = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      const next = current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option];

      return {
        ...prev,
        [questionId]: next,
      };
    });
  };
  const openingHoursText = Array.isArray(selectedBusiness?.openingHoursText)
    ? selectedBusiness.openingHoursText
    : [];

  useEffect(() => {
    if (step === "TRUST" && confirmedCategory?.name) {
      setLoadingTrust(true);

      fetch(
        `${API_BASE_URL}/api/trust/questions?category=${encodeURIComponent(
          confirmedCategory.name
        )}`
      )
        .then((r) => r.json())
        .then((data) => {
          console.log("Trust questions:", data);
          setTrustQuestions(data.questions || []);
        })
        .catch(console.error)
        .finally(() => setLoadingTrust(false));
    }
  }, [step, confirmedCategory]);

  const handleSaveTrust = async () => {
    if (!vendorId) {
      alert("Vendor missing");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/trust/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId,
          categoryId: confirmedCategory?._id,
          answers: trustAnswers,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || "Failed to save trust info");
      }

      setStep("SERVICES_SELECT");
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to save trust info");
    }
  };

  const handleContinueWithoutOtp = async () => {
    if (!selected?._id || !selectedBusiness?.name) {
      alert("Missing required data");
      return;
    }

    const cleanPhone = normalizePhone(phoneNumber || "9999999999");

    try {
      /* ================= 1️⃣ BYPASS OTP ================= */
      const bypassPayload = {
        countryCode: "91",
        phone: cleanPhone,
      };

      const bypassRes = await fetch(
        `${API_BASE_URL}/api/customers/bypass-otp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bypassPayload),
        }
      );

      const bypassJson = await bypassRes.json(); // ✅ FIRST parse response

      if (!bypassRes.ok) {
        alert(bypassJson.message || "OTP bypass failed");
        return;
      }

      // ✅ NOW extract customerId
      const customerId =
        bypassJson?.customer?._id ||
        bypassJson?.customer?.id ||
        "";

      if (!customerId) {
        alert("Customer ID not received from backend");
        return;
      }


      /* ================= 2️⃣ REGISTER VENDOR ================= */
      const vendorPayload = {
        customerId,
        phone: cleanPhone,


        businessName: selectedBusiness?.name || manualBusinessName || "",
        contactName: selectedBusiness?.name || manualBusinessName || "",
        categoryId: selected?._id,

        status: "Registered",

        location: {
          lat: selectedBusiness?.location?.lat ?? null,
          lng: selectedBusiness?.location?.lng ?? null,
          address: selectedBusiness?.address || "",
        },

        openingHoursText: Array.isArray(selectedBusiness?.openingHoursText)
          ? selectedBusiness.openingHoursText
          : [],

        googlePlaceDetails: {
          placeId:
            selectedBusiness?.placeId ||
            selectedSearchBusiness?.placeId ||
            "",

          rating:
            selectedBusiness?.rating ??
            selectedSearchBusiness?.rating ??
            null,

          userRatingsTotal:
            selectedBusiness?.userRatingsTotal ??
            selectedSearchBusiness?.userRatingsTotal ??
            0,

          mapsUrl:
            selectedBusiness?.placeId
              ? `https://www.google.com/maps/place/?q=place_id:${selectedBusiness.placeId}`
              : selectedSearchBusiness?.placeId
                ? `https://www.google.com/maps/place/?q=place_id:${selectedSearchBusiness.placeId}`
                : "",

          types: Array.isArray(selectedBusiness?.types)
            ? selectedBusiness.types
            : selectedSearchBusiness?.types || [],
        },
      };

      const vendorRes = await fetch(
        `${API_BASE_URL}/api/dummy-vendors`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vendorPayload),
        }
      );

      const vendorData = await vendorRes.json();
      if (!vendorRes.ok) {
        alert(vendorData.message || "Vendor registration failed");
        return;
      }

      // ✅ SAVE VENDOR ID
      setVendorId(vendorData.vendor?._id || vendorData._id);

      setStep("SUCCESS");


    } catch (err) {
      console.error(err);
      alert("Network error");
    }
  };



  /* ================= TIMER ================= */
  useEffect(() => {
    const i = setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const minutes = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const seconds = (elapsed % 60).toString().padStart(2, "0");

  /* ================= LOAD CATEGORIES ================= */
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(CATEGORY_API);
        const data = await res.json();
        setCategories(data);
      } finally {

        setLoading(false);
      }
    };

    load();
  }, []);

  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  /* ================= STEP PROGRESS ================= */
  const stepPercent = {
    CATEGORY: 14,
    CONNECT: 28,
    GOOGLE_SEARCH: 42,
    GOOGLE_RESULTS: 56,
    VERIFY_PHONE_FORM: 63,
    VERIFY_PHONE: 70,
    VERIFY_OTP: 75,
    SUCCESS: 85,
    TRUST_QUESTIONS: 92,
    SERVICES_SELECT: 100,
  }[step];


  /* ================= CAPTCHA ================= */
  const generateCaptcha = () => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setCaptcha(code);
    setCaptchaInput(["", "", "", ""]); // ✅ reset properly
    setCaptchaError("");
  };
  const handleCaptchaChange = (value, index) => {
    if (!/^[0-9]?$/.test(value)) return; // only numbers

    const next = [...captchaInput];
    next[index] = value;
    setCaptchaInput(next);

    // move to next box
    if (value && index < 3) {
      document.getElementById(`captcha-${index + 1}`)?.focus();
    }
  };

  const handleCaptchaKeyDown = (e, index) => {
    if (e.key === "Backspace" && !captchaInput[index] && index > 0) {
      document.getElementById(`captcha-${index - 1}`)?.focus();
    }
  };


  useEffect(() => {
    if (step === "GOOGLE_SEARCH") generateCaptcha();
  }, [step]);

  /* ================= GOOGLE SEARCH ================= */
  const handleGoogleSearch = async () => {
    if (businessQuery.trim().length < 3) {
      setCaptchaError("Enter at least 3 characters");
      return;
    }

    // ✅ FIXED CAPTCHA CHECK
    if (captchaInput.join("") !== captcha) {
      setCaptchaError("Captcha does not match");
      return;
    }

    try {
      setGlobalLoading(true);
      const res = await fetch(
        `${API_BASE_URL}/api/google/places/search?query=${encodeURIComponent(
          businessQuery
        )}`
      );

      const data = await res.json();
      setGoogleResults(data.results || []);
      setStep("GOOGLE_RESULTS");
    } catch (err) {
      setCaptchaError("Search failed. Try again.");
    }
    finally {
      setGlobalLoading(false);
    }
  };


  /* ================= SELECT BUSINESS ================= */
  const handleSelectBusiness = (biz) => {
    setSelectedSearchBusiness(biz);   // ⭐ contains rating & reviews
    setActivePlaceId(biz.placeId);
  };


  /* ================= FETCH DETAILS ================= */
  const fetchBusinessDetails = async () => {
    const res = await fetch(
      `${API_BASE_URL}/api/google/places/details?placeId=${activePlaceId}`
    );

    const data = await res.json();

    setSelectedBusiness({
      placeId: selectedSearchBusiness?.placeId,
      name: selectedSearchBusiness?.name,
      address: selectedSearchBusiness?.address,
      location: selectedSearchBusiness?.location,

      rating:
        data.place?.rating ??
        selectedSearchBusiness?.rating ??
        null,

      userRatingsTotal:
        data.place?.userRatingsTotal ??
        selectedSearchBusiness?.userRatingsTotal ??
        0,

      types: Array.isArray(data.place?.types)
        ? data.place.types
        : selectedSearchBusiness?.types || [],

      openingHoursText:
        data.place?.openingHoursText ||
        selectedSearchBusiness?.openingHoursText ||
        [],

      internationalPhoneNumber:
        normalizePhone(data.place?.internationalPhoneNumber || ""),
    });

    setIsEditingInfo(false);
    setStep("VERIFY_PHONE");
  };


  /* ================= BACK ================= */
  const handleBack = () => {
    if (step === "SERVICES_SELECT") setStep("SUCCESS");
    else if (step === "SUCCESS") setStep("VERIFY_PHONE");
    else if (step === "VERIFY_OTP") {
      setOtpSent(false);
      setOtp("");
      setStep("VERIFY_PHONE");
    }
    else if (step === "VERIFY_PHONE") {
      setIsEditingInfo(false);
      setStep(selectedSearchBusiness ? "GOOGLE_RESULTS" : "VERIFY_PHONE_FORM");
    }
    else if (step === "VERIFY_PHONE_FORM") setStep("CONNECT");
    else if (step === "GOOGLE_RESULTS") setStep("GOOGLE_SEARCH");
    else if (step === "GOOGLE_SEARCH") setStep("CONNECT");
    else if (step === "CONNECT") {
      setConfirmedCategory(null);
      setStep("CATEGORY");
    }
    else onClose();
  };



  const phoneNumber =
    selectedBusiness?.internationalPhoneNumber ||
    selectedBusiness?.phone ||
    "";

  const handleBusinessInfoChange = (field, value) => {
    setSelectedBusiness((prev) => ({
      ...(prev || {}),
      [field]: value,
    }));
  };

  const handleSaveBusinessInfo = () => {
    const name = selectedBusiness?.name?.trim() || "";
    const phone = normalizePhone(selectedBusiness?.internationalPhoneNumber || "");

    if (!name) {
      alert("Business name is required");
      return;
    }

    if (!phone || phone.length !== 10) {
      alert("Please enter a valid 10 digit phone number");
      return;
    }

    setSelectedBusiness((prev) => ({
      ...(prev || {}),
      name,
      internationalPhoneNumber: phone,
    }));
    setIsEditingInfo(false);
  };

  const requestOtp = async (phoneOverride = "") => {
    const rawMobile =
      phoneOverride ||
      selectedBusiness?.internationalPhoneNumber ||
      selectedBusiness?.phone ||
      manualPhone ||
      mobile;
    const normalizedMobile = normalizePhone(rawMobile);

    if (!normalizedMobile || normalizedMobile.length !== 10) {
      alert("Enter valid mobile number");
      return;
    }

    try {
      setLoadingOtp(true);
      setMobile(normalizedMobile);
      const otpVendorId = exploreVendorId || vendorId || null;
      const res = await fetch(`${API_BASE_URL}/api/customers/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode,
          phone: normalizedMobile,
          ...(otpVendorId ? { vendorId: otpVendorId } : {}),
          ...(confirmedCategory?._id ? { categoryId: confirmedCategory._id } : {}),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        alert(data.message || "OTP request failed");
        return;
      }

      setOtpAttemptToken(data?.otpAttemptToken || "");
      setOtpSent(true);
      setStep("VERIFY_OTP");
    } catch (err) {
      console.error(err);
      alert("Server error");
    } finally {
      setLoadingOtp(false);
    }
  };
  const verifyAdminPasscode = async () => {
  if (!adminPasscode) {
    alert("Enter admin passcode");
    return;
  }

  try {
    setVerifyingPasscode(true);

    const res = await fetch(
      `${API_BASE_URL}/api/customers/admin-impersonate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
           categoryId: confirmedCategory?._id,
          passcode: adminPasscode,
          vendorId: exploreVendorId,
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "Invalid passcode");
      return;
    }

    // success
    setBypassOtp(true);
    setShowAdminPopup(false);

    // go to next screen (skip OTP)
    await handleContinueWithoutOtp();

  } catch (err) {
    console.error(err);
    alert("Server error");
  } finally {
    setVerifyingPasscode(false);
  }
};

  const verifyOtp = async () => {
    if (!otp || otp.length < 4) {
      alert("Enter valid OTP");
      return;
    }

    const normalizedPhone = normalizePhone(mobile);
    if (!normalizedPhone || normalizedPhone.length !== 10) {
      alert("Please enter a valid 10 digit phone number");
      return;
    }

    try {
      setLoadingOtp(true);
      const otpVendorId = exploreVendorId || vendorId || null;
      const res = await fetch(`${API_BASE_URL}/api/customers/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode,
          phone: normalizedPhone,
          otp,
          ...(otpVendorId ? { vendorId: otpVendorId } : {}),
          ...(confirmedCategory?._id ? { categoryId: confirmedCategory._id } : {}),
          ...(otpAttemptToken ? { otpAttemptToken } : {}),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        alert(data?.message || "OTP verification failed");
        return;
      }

      if (data?.token) {
        localStorage.setItem("otpVerified", "true");
       
      
      }

      setOtpSent(false);
      await handleContinueWithoutOtp();
    } catch (err) {
      console.error(err);
      alert("Server error");
    } finally {
      setLoadingOtp(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="category-modal">

        {/* HEADER */}
        <div className="modal-header">
          <div className="header-left">
            <div className="timer-box">{minutes}:{seconds}</div>
            <button className="back-btn" onClick={handleBack}>←</button>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* STEP INDICATOR */}
        <div className="step-indicator-wrapper">
          <div className="step-line-bg">
            <div
              className="step-line-fill"
              style={{ width: `${stepPercent}%` }}
            />
          </div>

          <div className="step-dots">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <div
                key={n}
                className={`step-dot ${stepPercent >= n * (100 / 7) ? "active" : ""}`}
              >
                {n}
              </div>
            ))}
          </div>

        </div>

        {/* ================= CATEGORY ================= */}
        {step === "CATEGORY" && (
          <>
            <input
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search category..."
            />

           <div className="category-grid">
  {loading ? (
    <div className="category-loader">
      <div className="spinner" />
      <p>Loading categories...</p>
    </div>
  ) : (
    filteredCategories.map((cat) => (
      <div
        key={cat.id || cat._id}
        className={`category-card ${
          selected?.name === cat.name ? "active" : ""
        }`}
        onClick={() => setSelected(cat)}
      >
        <img src={cat.imageUrl} />
        <span>{cat.name}</span>
      </div>
    ))
  )}
</div>

            <button
              className="next-btn"
              disabled={!selected}
              onClick={() => {
                setConfirmedCategory(selected); // ✅ trigger tree build
                setStep("CONNECT");
              }}
            >
              Next
            </button>

          </>
        )}

        {/* ================= CONNECT ================= */}
        {step === "CONNECT" && selected && (
          <div className="connect-section">
            <div className="selected-category-card">
              <img src={selected.imageUrl} />
              <p>{selected.name}</p>
            </div>

            <button className="google-btn google-connect-btn" onClick={() => setStep("GOOGLE_SEARCH")}>
              <FcGoogle size={27} />
              <span>Connect your Google Business</span>
            </button>


            <button className="phone-btn" onClick={() => setStep("VERIFY_PHONE_FORM")}>
              Continue with Mobile Number
            </button>
          </div>
        )}

        {/* ================= VERIFY PHONE FORM ================= */}
        {step === "VERIFY_PHONE_FORM" && (
          <div className="verify-phone-section">
            <p><b>Continue with Mobile Number</b></p>

            <input
              className="google-input"
              placeholder="Business Name"
              value={manualBusinessName}
              onChange={(e) => setManualBusinessName(e.target.value)}
            />

            <div className="phone-input-group">
              <select
                className="country-code-select"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
              >
                <option value="91">🇮🇳 +91</option>
                <option value="1">🇺🇸 +1</option>
                <option value="44">🇬🇧 +44</option>
                <option value="61">🇦🇺 +61</option>
                <option value="971">🇦🇪 +971</option>
              </select>

              <input
                className="google-input phone-number-input"
                placeholder="Mobile Number"
               value={manualPhone}
onChange={(e) =>
  setManualPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
}
              
              />
            </div>

            <button
              className="otp-btn"
              onClick={async () => {
                const cleanBusinessName = manualBusinessName.trim();
                const cleanPhone = normalizePhone(String(manualPhone));

                if (!cleanBusinessName) {
                  alert("Business name is required");
                  return;
                }

                if (!cleanPhone || cleanPhone.length !== 10) {
                  alert("Please enter a valid 10 digit phone number");
                  return;
                }

                setSelectedBusiness((prev) => ({
                  ...(prev || {}),
                  name: cleanBusinessName,
                  internationalPhoneNumber: cleanPhone,
                  phone: cleanPhone,
                  placeId: prev?.placeId || "",
                  address: prev?.address || "",
                  location: {
                    lat: prev?.location?.lat ?? null,
                    lng: prev?.location?.lng ?? null,
                  },
                  rating: prev?.rating ?? null,
                  userRatingsTotal: prev?.userRatingsTotal ?? 0,
                  types: Array.isArray(prev?.types) ? prev.types : [],
                }));

                setMobile(cleanPhone);
                await requestOtp(cleanPhone);
              }}
            >
              Send OTP
            </button>
          </div>
        )}

        {/* ================= GOOGLE SEARCH ================= */}
        {step === "GOOGLE_SEARCH" && (
          <div className="google-search-section">

            {/* BUSINESS INPUT */}
            <input
              className="google-input"
              value={businessQuery}
              onChange={(e) => setBusinessQuery(e.target.value)}
              placeholder="Enter your bussiness name"
            />

            <p className="captcha-helper-text">
              Enter the captcha to continue
            </p>

            {/* CAPTCHA DISPLAY */}
            <div className="captcha-mini-box">
              <span className="captcha-mini-code">{captcha}</span>
              <button type="button" onClick={generateCaptcha}>↻</button>
            </div>

            {/* CAPTCHA INPUT – 4 SEPARATE BOXES */}
            <div className="captcha-input-row">
              {captchaInput.map((digit, i) => (
                <input
                  key={i}
                  id={`captcha-${i}`}
                  className="captcha-digit"
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleCaptchaChange(e.target.value, i)}
                  onKeyDown={(e) => handleCaptchaKeyDown(e, i)}
                />
              ))}
            </div>

            {captchaError && <p className="captcha-error">{captchaError}</p>}

            {/* SEARCH BUTTON */}
            <button
              className="google-search-btn"
              disabled={
                businessQuery.trim().length < 3 ||
                captchaInput.some((d) => d === "")
              }
              onClick={handleGoogleSearch}
            >
              Search
            </button>

          </div>
        )}


        {/* ================= GOOGLE RESULTS ================= */}
        {step === "GOOGLE_RESULTS" && (
          <div className="google-results-section">

            <p className="results-title">Select your business</p>

            {/* SCROLLABLE RESULTS */}
            <div className="google-results-scroll">
              {googleResults.map((biz) => (
                <div
                  key={biz.placeId}
                  className={`google-result-card ${activePlaceId === biz.placeId ? "active" : ""
                    }`}
                  onClick={() => handleSelectBusiness(biz)}
                >
                  <p className="google-result-name">{biz.name}</p>
                  <p className="google-result-address">{biz.address}</p>
                </div>
              ))}
            </div>

            {/* NEXT BUTTON */}
            <button
              className="next-btn"
              disabled={!activePlaceId}
              onClick={fetchBusinessDetails}
            >
              Next
            </button>

          </div>
        )}

        {/* ================= VERIFY PHONE ================= */}
        {step === "VERIFY_PHONE" && selectedBusiness && (
          <div className="verify-phone-section">
            <p className="verify-title">
              Please Confirm your business name and mobile number
            </p>

						   
											 

							  
									  
				 
										   
																			
				  
			  

            <label className="field-label">Business Name</label>
            <input
              className="google-input"
              placeholder="Business Name"
              value={selectedBusiness?.name || ""}
              onChange={(e) =>
                handleBusinessInfoChange("name", e.target.value)
              }
            />

            <label className="field-label">Mobile Number</label>
            <div className="phone-input-group">
              <select
                className="country-code-select"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
              >
                <option value="91">+91</option>
             
              </select>

              <input
                className="google-input phone-number-input"
                placeholder="Mobile Number"
                value={selectedBusiness?.internationalPhoneNumber || ""}
                  onChange={(e) =>
                    handleBusinessInfoChange(
                      "internationalPhoneNumber",
                    e.target.value.replace(/\D/g, "").slice(0, 10)
                    )
                  }
                />
            </div>

            <button
              className="otp-btn"
              onClick={() =>
                requestOtp(
                  selectedBusiness?.internationalPhoneNumber ||
                  selectedBusiness?.phone ||
                  ""
                )
              }
              disabled={loadingOtp}
            >
              {loadingOtp ? "Please wait..." : "Send OTP"}
            </button>
           <label className="bypass-otp-checkbox">
  <input
    type="checkbox"
    checked={bypassOtp}
    onChange={(e) => {
      if (e.target.checked) {
        setShowAdminPopup(true);   // open popup
      } else {
        setBypassOtp(false);
      }
    }}
  />
  Bypass OTP
</label>
{showAdminPopup && (
  <div className="admin-popup-overlay">
    <div className="admin-popup-card">

      <h3>Admin Authorization</h3>
      <p>Enter admin passcode to bypass OTP</p>

      <input
        type="password"
        className="google-input"
        placeholder="Enter passcode"
        value={adminPasscode}
        onChange={(e) => setAdminPasscode(e.target.value)}
      />

     <div className="admin-popup-actions">
  <button
    className="admin-cancel-btn"
    onClick={() => {
      setShowAdminPopup(false);
      setAdminPasscode("");
      setBypassOtp(false);
    }}
  >
    Cancel
  </button>

  <button
    className="admin-continue-btn"
    onClick={verifyAdminPasscode}
    disabled={verifyingPasscode}
  >
    {verifyingPasscode ? "Verifying..." : "Continue"}
  </button>
</div>

    </div>
  </div>
)}
          </div>
        )}

        {/* ================= VERIFY OTP ================= */}
        {step === "VERIFY_OTP" && (
          <div className="verify-phone-section">
            <p><b>Enter OTP</b></p>
            <input
              className="google-input"
              placeholder="Enter OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />

            <button
              className="otp-btn"
              onClick={verifyOtp}
              disabled={!otpSent || loadingOtp}
            >
              {loadingOtp ? "Please wait..." : "Verify OTP"}
            </button>
          </div>
        )}

        {/* ================= SUCCESS ================= */}
        {step === "SUCCESS" && (
          <div className="success-card">

            <h2>Your profile has been registered</h2>
            <p>Continue to select your services.</p>

            <div className="success-actions">
              <button
                className="success-cancel"
                onClick={onClose}
              >
                Cancel
              </button>

              <button
                className="success-next"
                onClick={() => setStep("TRUST")}
              >
                Next
              </button>

            </div>

          </div>
        )}

        {step === "TRUST" && (
          <div className="trust-card">
            <h2>Build customer trust</h2>
            <p>Add a few highlights customers will love</p>

            {trustQuestions.length === 0 ? (
              <p style={{ opacity: 0.7 }}>Loading questions...</p>
            ) : (
              <div className="trust-questions">
                {trustQuestions.map((q) => (
                  <div key={q.id} className="trust-question">
                    <label>{q.id.replace("_", " ")}</label>

                    {/* YEARS DROPDOWN */}
                    {q.type === "years" && (
                      <select
                        value={trustAnswers[q.id] || ""}
                        onChange={(e) =>
                          setTrustAnswers({ ...trustAnswers, [q.id]: e.target.value })
                        }
                      >
                        <option value="">Select years</option>
                        {(q.options?.length
                          ? q.options
                          : Array.from({ length: 51 }, (_, i) => String(i))
                        ).map((option) => (
                          <option key={option} value={option}>
                            {q.options?.length
                              ? option
                              : `${option} ${option === "1" ? "year" : "years"}`}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* RANGE DROPDOWN */}
                    {q.type === "range" && (
                      <select
                        value={trustAnswers[q.id] || ""}
                        onChange={(e) =>
                          setTrustAnswers({ ...trustAnswers, [q.id]: e.target.value })
                        }
                      >
                        <option value="">Select minimum count</option>
                        {(q.options?.length
                          ? q.options
                          : Array.from({ length: 25 }, (_, i) => String(i + 1))
                        ).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    )}

                    {q.type === "select" && (
                      !q.options || q.options.length === 0 ? (
                        <input
                          type="text"
                          placeholder="Enter value"
                          value={trustAnswers[q.id] || ""}
                          onChange={(e) =>
                            setTrustAnswers({ ...trustAnswers, [q.id]: e.target.value })
                          }
                        />
                      ) : (
                        <select
                          value={trustAnswers[q.id] || ""}
                          onChange={(e) =>
                            setTrustAnswers({ ...trustAnswers, [q.id]: e.target.value })
                          }
                        >
                          <option value="">Select option</option>
                          {q.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      )
                    )}

                    {q.type === "multi_select" && (
                      <div className="trust-multi-options">
                        {(q.options || []).map((opt) => {
                          const selectedValues = Array.isArray(trustAnswers[q.id])
                            ? trustAnswers[q.id]
                            : [];
                          const checked = selectedValues.includes(opt);

                          return (
                            <label key={opt} className="trust-multi-option">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleTrustMultiSelect(q.id, opt)}
                              />
                              <span>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="trust-actions">
              <button className="btn secondary" onClick={() => setStep("SUCCESS")}>
                Back
              </button>

              <button
                className="btn primary"
                onClick={async () => {
                  try {
                    setGlobalLoading(true);
                    const response = await fetch(`${API_BASE_URL}/api/trust/save`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        vendorId,
                        category: confirmedCategory?.name,
                        answers: trustAnswers,
                      }),
                    });

                    const data = await response.json().catch(() => ({}));
                    if (!response.ok || data?.success === false) {
                      throw new Error(data?.message || "Failed to save trust info");
                    }

                    setStep("SERVICE_AREAS");
                  } catch (err) {
                    console.error(err);
                    alert(err.message || "Failed to save trust info");
                  }
                  finally {
                    setGlobalLoading(false);
                  }
                }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === "SERVICE_AREAS" && (
          <ServiceAreasStep
            vendor={{
              location: {
                lat: selectedBusiness?.location?.lat,
                lng: selectedBusiness?.location?.lng,
              },
              _id: vendorId, // optional but useful
            }}

            onBack={() => setStep("TRUST")}
            onNext={async (data) => {
              try {
                if (!vendorId) {
                  alert("Vendor not found");
                  return;
                }

                await fetch(`${API_BASE_URL}/api/vendor/service-areas`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    vendorId,
                    primaryLocality: data.primaryLocality,
                    city: data.city,
                    targetAreas: data.targetAreas,
                    autoSuggested: data.autoSuggested ?? true,
                  }),
                });

					 setServiceAreas({
                  primaryLocality: data.primaryLocality,
                  targetAreas: data.targetAreas,
                });			 
														
												
			
                // ✅ Move to services selection
                setStep("SERVICES_SELECT");
              } catch (err) {
                console.error(err);
                alert("Failed to save service areas");
              }
            }}
          />
        )}

        {/* ================= SERVICES SELECT ================= */}


        {step === "SERVICES_SELECT" && (

          <div className="services-select-card">

            <h2 className="services-title">Select Services</h2>

            <div className="services-scroll">
              {rootIds.map((id) => (
                <CategoryNode
                  key={id}
                  id={id}
                  nodes={nodes}
                  toggleNode={toggleNode}
                  toggleSelect={toggleSelect}
                  selectedIds={selectedIds}
                />
              ))}
            </div>

            <div className="services-footer">
              <button
                className="btn secondary"
                onClick={() => setStep("SUCCESS")}
                disabled={syncing}
              >
                Back
              </button>

              <button
                className="btn primary"
                disabled={selectedIds.length === 0 || syncing}
                onClick={async () => {
                  try {
                    setSyncing(true);

                    const leafIds = getSelectedLeafIds(nodes, selectedIds);

                    await fetch(
                      `${API_BASE_URL}/api/vendor-price-nodes/sync`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          vendorId,
                          rootCategoryId: confirmedCategory?._id,
                          activeLeafCategoryIds: leafIds,
                        }),
                      }
                    );

                    await fetch(
                      `${API_BASE_URL}/api/dummy-vendors/${vendorId}`,
                      {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "Profile Setup" }),
                      }
                    );

                    const businessName = selectedBusiness?.name;
                    const locations = [
                      serviceAreas?.primaryLocality,
                      ...(serviceAreas?.targetAreas || []),
                    ].filter(Boolean);

                    const res = await fetch(
                      `${API_BASE_URL}/api/vendor/subdomain-check?businessName=${encodeURIComponent(businessName)}&locations=${encodeURIComponent(locations.join(","))}`
                    );

                    const data = await res.json();
                    setSubdomainSuggestions(data.suggestions || []);

                    setStep("CHOOSE_DOMAIN");
                  } catch (err) {
                    alert("Something went wrong");
                    console.error(err);
                  } finally {
                    setSyncing(false);
                  }
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
        {syncing && (
          <div className="overlay-loader">
            <div className="spinner" />
            <p>Saving services…</p>
          </div>
        )}
        {step === "CHOOSE_DOMAIN" && (
          <div className="domain-card">
            <h2 className="domain-title">Choose your website name</h2>
            <p className="domain-subtitle">
              Your business will be available at:
            </p>

            <div className="domain-list">
              {subdomainSuggestions.map((s) => (
                <button
                  key={s}
                  className={`domain-pill ${selectedSubdomain === s ? "active" : ""
                    }`}
                  onClick={() => setSelectedSubdomain(s)}
                >
                  <span className="domain-name">{s}</span>
                  <span className="domain-suffix">.ynot.co.in</span>
                </button>
              ))}
            </div>

            <div className="domain-actions">
              <button
                className="btn-last"
                onClick={() => setStep("SERVICES_SELECT")}
              >
                Back
              </button>

              <button
                className="btn-last"
                disabled={!selectedSubdomain}
                onClick={async () => {
                  try {
                    const res = await fetch(
                      `${API_BASE_URL}/api/vendor/${vendorId}/set-subdomain`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ subdomain: selectedSubdomain }),
                      }
                    );
                    if (!res.ok) throw new Error("Subdomain save failed");

                    setStep("PREVIEW_CHOICE");
                  } catch (e) {
                    alert("Failed to save website name");
                  }
                }}
              >
                Continue
              </button>
            </div>
          </div>
        )}
        {step === "PREVIEW_CHOICE" && (
          <div className="preview-choice-card">
            <h2>Do you want to preview your profile?</h2>

            <div className="preview-actions">
              <button
                className="btn secondary"
                onClick={onClose}
              >
                No
              </button>

              <button
                className="btn primary"
                onClick={async () => {
                  const subdomain = selectedSubdomain;

                  if (!vendorId || !subdomain) {
                    alert("Missing vendor or subdomain");
                    return;
                  }

                  const PREVIEW_BASE =
                    process.env.NEXT_PUBLIC_HARISH_PREVIEW_BASE_URL ||
                    "http://localhost:4000";

                  const previewUrl = PREVIEW_BASE.replace(
                    "://",
                    `://${subdomain}.`
                  );

                  const win = window.open("about:blank", "_blank");

                  try {
                    await fetch(
                      `${API_BASE_URL}/api/dummy-vendors/${vendorId}`,
                      {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "Preview" }),
                      }
                    );

                    win.location.href = previewUrl;
                  } catch (e) {
                    win.close();
                    alert("Failed to open preview");
                  }
                }}
              >
                Yes, Preview
              </button>

            </div>
          </div>
        )}
      </div>
      {globalLoading && (
        <div className="overlay-loader">
          <div className="spinner" />
          <p>Please wait...</p>
        </div>
      )}
    </div>
  );
}
