import { useState, useEffect } from "react";
import API_BASE_URL from "../config";

function ChipSelect({ label, options = [], value = [], onChange, placeholder = "Select", multi = true, includeSelectAll = true }) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((o) => !o);
  const close = () => setOpen(false);
  const isSelected = (opt) => value.includes(opt);
  const selectAll = () => onChange([...options]);
  const clearAll = () => onChange([]);
  const handleOptionClick = (opt) => {
    if (multi) {
      if (isSelected(opt)) onChange(value.filter((v) => v !== opt));
      else onChange([...value, opt]);
    } else {
      onChange([opt]);
      close();
    }
  };
  return (
    <div style={{ position: "relative" }}>
      {label && <h4 style={labelStyle}>{label}</h4>}
      <div
        onClick={toggle}
        style={{
          ...inputStyle,
          minHeight: 40,
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
          cursor: "pointer",
        }}
      >
        {value.length === 0 ? (
          <span style={{ color: "#888" }}>{placeholder}</span>
        ) : (
          value.map((v) => (
            <span
              key={v}
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 8px",
                background: "#eef6ff",
                border: "1px solid #cce4ff",
                borderRadius: 14,
                color: "#1170cf",
                fontSize: 12,
              }}
            >
              {v}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value.filter((x) => x !== v));
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#1170cf",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                ×
              </button>
            </span>
          ))
        )}
        <span style={{ marginLeft: "auto", color: "#666" }}>▾</span>
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 3000,
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 10,
            boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
            marginTop: 6,
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", padding: 8, borderBottom: "1px solid #eee" }}>
            {includeSelectAll && multi && (
              <button type="button" onClick={selectAll} style={{ background: "transparent", border: "none", color: "#0078d7", cursor: "pointer", fontWeight: 600 }}>
                Select All
              </button>
            )}
            <button type="button" onClick={clearAll} style={{ background: "transparent", border: "none", color: "#d9534f", cursor: "pointer", fontWeight: 600 }}>
              Clear
            </button>
          </div>
          {options.map((opt) => (
            <div
              key={opt}
              onClick={() => handleOptionClick(opt)}
              style={{
                padding: "8px 10px",
                cursor: "pointer",
                background: isSelected(opt) ? "#e8f2ff" : "#fff",
                color: isSelected(opt) ? "#0f69c9" : "#333",
              }}
            >
              {multi && (
                <input type="checkbox" readOnly checked={isSelected(opt)} style={{ marginRight: 8 }} />
              )}
              {opt}
            </div>
          ))}
          <div style={{ padding: 8, borderTop: "1px solid #eee", textAlign: "right" }}>
            <button type="button" onClick={close} style={{ background: "#0078d7", color: "#fff", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DummyCreateCategoryModal({
  show,
  onClose,
  parentId = null,
  parentCategoryType = null,
  initialData = null,
  onCreated,
  parentEnableFreeText = false,
}) {
  const [name, setName] = useState("");
  const [image, setImage] = useState(null);
  const [price, setPrice] = useState("");
  const [terms, setTerms] = useState("");
  const [visibleToUser, setVisibleToUser] = useState(false);
  const [visibleToVendor, setVisibleToVendor] = useState(false);
  const [sequence, setSequence] = useState(0);
  const [freeText, setFreeText] = useState("");
  const [enableFreeText, setEnableFreeText] = useState(false);
  const [categoryType, setCategoryType] = useState("Services");
  const [availableForCart, setAvailableForCart] = useState(false);
  const [seoKeywords, setSeoKeywords] = useState("");
  const [postRequestsDeals, setPostRequestsDeals] = useState(false);
  const [loyaltyPoints, setLoyaltyPoints] = useState(false);
  const [linkAttributesPricing, setLinkAttributesPricing] = useState(false);
  const [freeTexts, setFreeTexts] = useState(Array(10).fill(""));
  const [icon, setIcon] = useState(null);
  const [colorSchemes, setColorSchemes] = useState([]);
  const [categoryVisibility, setCategoryVisibility] = useState([]);
  const [categoryModel, setCategoryModel] = useState([]);
  const [categoryPricing, setCategoryPricing] = useState([]);
  const [socialHandle, setSocialHandle] = useState([]);
  const [displayType, setDisplayType] = useState([]);
  const [allMasters, setAllMasters] = useState([]);
  const [webMenuItems, setWebMenuItems] = useState([]);
  const [linkedAttributes, setLinkedAttributes] = useState({});
  const [inventoryLabelName, setInventoryLabelName] = useState("");
  const [showInventoryLabelSection, setShowInventoryLabelSection] = useState(false);
  const [visibilityOptions, setVisibilityOptions] = useState([]);
  const [modelOptions, setModelOptions] = useState([]);
  const [pricingOptions, setPricingOptions] = useState([]);
  const [socialHandleOptions, setSocialHandleOptions] = useState([]);
  const [displayTypeOptions, setDisplayTypeOptions] = useState([]);
  const [signupLevelOptions, setSignupLevelOptions] = useState([]);
  const [businessFieldOptions, setBusinessFieldOptions] = useState([]);
  const [signupLevels, setSignupLevels] = useState([]);
  const [signupLevelDetails, setSignupLevelDetails] = useState({});
  const [showMasterSelector, setShowMasterSelector] = useState(false);
  const [showHomePopup, setShowHomePopup] = useState(false);
  const [homeTagline, setHomeTagline] = useState("");
  const [homeDescription, setHomeDescription] = useState("");
  const [homeButton1Label, setHomeButton1Label] = useState("");
  const [homeButton2Label, setHomeButton2Label] = useState("");
  const [homeButton1Icon, setHomeButton1Icon] = useState(null);
  const [homeButton2Icon, setHomeButton2Icon] = useState(null);
  const [showWhyUsPopup, setShowWhyUsPopup] = useState(false);
  const [whyUsHeading, setWhyUsHeading] = useState("");
  const [whyUsSubHeading, setWhyUsSubHeading] = useState("");
  const [whyUsCards, setWhyUsCards] = useState(
    Array.from({ length: 6 }, () => ({ title: "", description: "", iconFile: null }))
  );
const [selectedMasterIndex, setSelectedMasterIndex] = useState(0);
// Subcategory linking modal state (dummy)
const [showSubcatSelector, setShowSubcatSelector] = useState(false);
const [subcatKey, setSubcatKey] = useState("");
const [subcategories, setSubcategories] = useState([]);
const [selectedSubcategoryId, setSelectedSubcategoryId] = useState("");
const [subcategoryNameById, setSubcategoryNameById] = useState({});

  // Models cache and helpers for vehicle families (Cars/Bikes/Tempo...)
  const [modelsByFamily, setModelsByFamily] = useState({});
  const familyToModelCategory = {
    cars: 'car',
    car: 'car',
    bikes: 'bike',
    bike: 'bike',
    tempobus: 'tempoBus',
    tempoBus: 'tempoBus',
    tempoMinibuses: 'tempoBus',
    'tempo minibuses': 'tempoBus',
  };
  const fetchModelsForFamily = async (familyKey) => {
    try {
      const exact = String(familyKey || '').trim();
      if (!exact) return [];
      if (modelsByFamily[exact]) return modelsByFamily[exact];
      const normalized = exact.toLowerCase();
      const category = familyToModelCategory[exact] || familyToModelCategory[normalized] || exact;
      const url = `${API_BASE_URL}/api/models?category=${encodeURIComponent(category)}`;
      const res = await fetch(url);
      const data = res.ok ? await res.json() : [];
      const models = Array.isArray(data) ? data.map((d) => ({
        name: d?.name || d?.model || d?.title || '',
        raw: d,
      })) : [];
      setModelsByFamily((prev) => ({ ...prev, [exact]: models }));
      return models;
    } catch {
      return [];
    }
  };
  const getSelectedModelFields = (fam) => {
    const famKey = String(fam || '');
    const perFam = linkedAttributes?.[`${famKey}:modelFields`];
    if (Array.isArray(perFam)) return perFam;
    const global = linkedAttributes?.['model'];
    return Array.isArray(global) ? global : [];
  };

  useEffect(() => {
    if (!show) return;

    if (initialData) {
      setName(initialData.name || "");
      setImage(null);
      setIcon(null);
      setPrice(initialData.price ?? "");
      setTerms(initialData.terms ?? "");
      setVisibleToUser(Boolean(initialData.visibleToUser));
      setVisibleToVendor(Boolean(initialData.visibleToVendor));
      setSequence(Number(initialData.sequence ?? 0));
      setFreeText(initialData.freeText || "");
      setEnableFreeText(Boolean(initialData.enableFreeText));
      setCategoryType(initialData.categoryType || "Services");
      setAvailableForCart(Boolean(initialData.availableForCart));
      setSeoKeywords(initialData.seoKeywords || "");
      setPostRequestsDeals(Boolean(initialData.postRequestsDeals));
      setLoyaltyPoints(Boolean(initialData.loyaltyPoints));
      setLinkAttributesPricing(Boolean(initialData.linkAttributesPricing));
      setColorSchemes(
        Array.isArray(initialData.colorSchemes) && initialData.colorSchemes.length > 0
          ? initialData.colorSchemes.map((scheme) => ({
              name: scheme.name || "",
              primary: scheme.primary || "#000000",
              accent: scheme.accent || "#ffffff",
              background: scheme.background || "#ffffff",
              cardBg: scheme.cardBg || "#ffffff",
              text: scheme.text || "#000000",
            }))
          : []
      );
      setFreeTexts(
        Array.isArray(initialData.freeTexts)
          ? initialData.freeTexts
          : Array(10).fill("")
      );
      // Fix legacy off-by-one (previous backend saved freeText1..10 into indices 1..10, leaving index 0 empty)
      try {
        const arr = Array.isArray(initialData.freeTexts) ? initialData.freeTexts : [];
        if (
          Array.isArray(arr) && arr.length === 10 &&
          (arr[0] == null || arr[0] === "") &&
          (arr[1] != null && String(arr[1]).trim() !== "")
        ) {
          const shifted = [...arr.slice(1), ""];
          setFreeTexts(shifted);
        }
      } catch {}
      setInventoryLabelName(initialData.inventoryLabelName || "");
      setLinkedAttributes(
        initialData.linkedAttributes && typeof initialData.linkedAttributes === 'object'
          ? initialData.linkedAttributes
          : {}
      );
      setCategoryVisibility(Array.isArray(initialData.categoryVisibility) ? initialData.categoryVisibility : initialData.categoryVisibility ? [initialData.categoryVisibility] : []);
      setCategoryModel(Array.isArray(initialData.categoryModel) ? initialData.categoryModel : initialData.categoryModel ? [initialData.categoryModel] : []);
      setCategoryPricing(Array.isArray(initialData.categoryPricing) ? initialData.categoryPricing : initialData.categoryPricing ? [initialData.categoryPricing] : []);
      setSocialHandle(Array.isArray(initialData.socialHandle) ? initialData.socialHandle : initialData.socialHandle ? [initialData.socialHandle] : []);
      setDisplayType(Array.isArray(initialData.displayType) ? initialData.displayType : initialData.displayType ? [initialData.displayType] : []);
      setWebMenuItems(Array.isArray(initialData.webMenu) ? initialData.webMenu : initialData.webMenu ? [initialData.webMenu] : []);
      if (initialData.homePopup && typeof initialData.homePopup === 'object') {
        setHomeTagline(initialData.homePopup.tagline || "");
        setHomeDescription(initialData.homePopup.description || "");
        setHomeButton1Label(initialData.homePopup.button1Label || "");
        setHomeButton2Label(initialData.homePopup.button2Label || "");
      } else {
        setHomeTagline("");
        setHomeDescription("");
        setHomeButton1Label("");
        setHomeButton2Label("");
      }
      setHomeButton1Icon(null);
      setHomeButton2Icon(null);
      if (initialData.whyUs && typeof initialData.whyUs === "object") {
        setWhyUsHeading(initialData.whyUs.heading || "");
        setWhyUsSubHeading(initialData.whyUs.subHeading || "");
        const cards = Array.isArray(initialData.whyUs.cards) ? initialData.whyUs.cards : [];
        const nextCards = Array.from({ length: 6 }, (_, idx) => {
          const c = cards[idx] || {};
          return {
            title: c.title || "",
            description: c.description || "",
            iconFile: null,
          };
        });
        setWhyUsCards(nextCards);
      } else {
        setWhyUsHeading("");
        setWhyUsSubHeading("");
        setWhyUsCards(
          Array.from({ length: 6 }, () => ({ title: "", description: "", iconFile: null }))
        );
      }
      if (Array.isArray(initialData.signupLevels)) {
        const levels = [];
        const details = {};
        initialData.signupLevels.forEach((it) => {
          if (it && it.levelName) {
            levels.push(it.levelName);
            details[it.levelName] = {
              sequence: Number(it.sequence ?? 0),
              businessField: Array.isArray(it.businessField)
                ? it.businessField
                : (it.businessField ? [it.businessField] : []),
            };
          }
        });
        setSignupLevels(levels);
        setSignupLevelDetails(details);
      }
    } else {
      setName("");
      setImage(null);
      setIcon(null);
      setPrice("");
      setTerms("");
      setVisibleToUser(false);
      setVisibleToVendor(false);
      setSequence(0);
      setFreeText("");
      setEnableFreeText(parentEnableFreeText);
      setCategoryType(parentCategoryType || "Services");
      setAvailableForCart(false);
      setSeoKeywords("");
      setPostRequestsDeals(false);
      setLoyaltyPoints(false);
      setLinkAttributesPricing(false);
      setFreeTexts(Array(10).fill(""));
      setSignupLevels([]);
      setSignupLevelDetails({});
      setColorSchemes([]);
      setCategoryVisibility([]);
      setCategoryModel([]);
      setCategoryPricing([]);
      setSocialHandle([]);
      setDisplayType([]);
      setWebMenuItems([]);
      setInventoryLabelName("");
      setLinkedAttributes({});
      setHomeTagline("");
      setHomeDescription("");
      setHomeButton1Label("");
      setHomeButton2Label("");
      setHomeButton1Icon(null);
      setHomeButton2Icon(null);
      setWhyUsHeading("");
      setWhyUsSubHeading("");
      setWhyUsCards(
        Array.from({ length: 6 }, () => ({ title: "", description: "", iconFile: null }))
      );
    }
  }, [show, initialData, parentId, parentCategoryType, parentEnableFreeText]);

  // Whenever the modal is open and Web Menu contains Home, ensure Home popup is visible
  // Do not auto-open the Home popup when the modal is shown.
  // The popup is explicitly opened only when the user newly adds "Home" in Web Menu.
  useEffect(() => {
    if (!show) return;
  }, [show]);

  useEffect(() => {
    if (!show) return;
    const base = `${API_BASE_URL}/api/masters`;

    const datasets = [
      {
        setter: setVisibilityOptions,
        candidates: [
          "Manage Category Visibility",
          "categoryVisibility",
          "visibility",
        ],
      },
      {
        setter: setModelOptions,
        candidates: [
          "categoryModel"  // Only use categoryModel since that's what we have in the backend
        ],
        transform: (items) => items.map(item => item.name), // Extract just the name from the objects
      },
      {
        setter: setPricingOptions,
        candidates: [
          "Manage Category Pricing Models",
          "categoryPricing",
          "pricingModel",
          "pricing",
        ],
      },
      {
        setter: setSocialHandleOptions,
        candidates: [
          "Manage Social Handles",
          "socialHandle",
          "socialHandles",
          "social",
        ],
      },
      {
        setter: setDisplayTypeOptions,
        candidates: [
          "Manage Display Types",
          "displayType",
          "displayTypes",
        ],
      },
      {
        setter: setSignupLevelOptions,
        candidates: [
          "Manage Vendor Signup Levels",
          "vendorSignupLevels",
          "signupLevels",
          "signupLevel",
        ],
      },
      {
        setter: setBusinessFieldOptions,
        candidates: [
          "Manage Business Fields",
          "businessFields",
          "businessField",
        ],
      },
    ];

    const fetchByTypes = async (types) => {
      const results = await Promise.all(
        types.map((t) =>
          fetch(`${base}?type=${encodeURIComponent(t)}`)
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => [])
        )
      );
      const merged = results.flat().filter(Boolean);
      return merged;
    };

    (async () => {
      for (const ds of datasets) {
        const items = await fetchByTypes(ds.candidates);
        const values = ds.transform 
          ? ds.transform(items)
          : Array.from(new Set(items.map(m => m?.name).filter(Boolean)));
        ds.setter(values);
      }
      try {
        const all = await fetch(base).then((r) => (r.ok ? r.json() : []));
        setAllMasters(Array.isArray(all) ? all : []);
      } catch (err) {
        setAllMasters([]);
      }
    })();
  }, [show]);

  // When the master selector is opened or the selection changes, prefetch models for families
  useEffect(() => {
    if (!showMasterSelector) return;
    const masters = Array.isArray(allMasters) ? allMasters : [];
    // rebuild same left list used in render
    const byFamily = new Map();
    masters.forEach((m) => {
      const fam = (m.type || '').toString().trim();
      const ft = (m.fieldType || '').toString().trim();
      if (fam && ft) {
        if (!byFamily.has(fam)) byFamily.set(fam, new Set());
        byFamily.get(fam).add(ft);
      }
    });
    const familyItems = Array.from(byFamily.keys()).map((fam) => ({ _id: `family:${fam}`, __mode: 'family', key: fam }));
    const familyKeys = new Set(byFamily.keys());
    const basicTypes = new Set();
    masters.forEach((m) => {
      const t = (m.type || '').toString().trim();
      const ft = (m.fieldType || '').toString().trim();
      if (t && !ft && !familyKeys.has(t)) basicTypes.add(t);
    });
    const otherTypeItems = Array.from(basicTypes).map((t) => ({ _id: `type:${t}`, __mode: 'type', key: t }));
    const list = [...familyItems, ...otherTypeItems];
    const sel = list[selectedMasterIndex];
    if (sel && sel.__mode === 'family') {
      try { fetchModelsForFamily(sel.key); } catch {}
    }
  }, [showMasterSelector, selectedMasterIndex, allMasters]);

  // Handle 'Link with subcategories' button clicks (dummy)
  useEffect(() => {
    const handler = async (e) => {
      try {
        const key = e?.detail?.key || "";
        if (!key) return;
        if (!(initialData && initialData._id)) return;
        setSubcatKey(String(key));
        const lk = `${String(key)}:linkedSubcategory`;
        const curr = Array.isArray(linkedAttributes?.[lk]) ? String(linkedAttributes[lk][0] || '') : '';
        setSelectedSubcategoryId(curr || 'ALL');
        setSubcategoryNameById((prev)=> ({ ...prev, ALL: 'All' }));
        setShowSubcatSelector(true);
        const url = `${API_BASE_URL}/api/dummy-categories?parentId=${encodeURIComponent(initialData._id)}`;
        const res = await fetch(url);
        const data = res.ok ? await res.json() : [];
        const arr = Array.isArray(data) ? data : [];
        setSubcategories(arr);
        setSubcategoryNameById((prev)=>{
          const next={...prev};
          arr.forEach((c)=>{ if (c && c._id) next[String(c._id)] = c.name || String(c._id); });
          return next;
        });
      } catch {
        setSubcategories([]);
      }
    };
    window.addEventListener('linkWithSubcategories', handler);
    return () => window.removeEventListener('linkWithSubcategories', handler);
  }, [initialData, linkedAttributes]);

  const handleUnlinkSubcategory = async (contextKey) => {
    const lk = `${String(contextKey)}:linkedSubcategory`;
    const next = { ...linkedAttributes };
    delete next[lk];
    setLinkedAttributes(next);
    try {
      if (initialData && initialData._id) {
        const payload = new FormData();
        payload.append('linkedAttributes', JSON.stringify(next || {}));
        await fetch(`${API_BASE_URL}/api/dummy-categories/${initialData._id}`, { method: 'PUT', body: payload });
      }
    } catch {}
  };

  const handleSaveSubcategoryLink = async () => {
    const id = String(selectedSubcategoryId || '').trim();
    if (!id) return;
    const key = `${subcatKey}:linkedSubcategory`;
    const next = { ...linkedAttributes, [key]: [id] };
    setLinkedAttributes(next);
    setSubcategoryNameById((prev)=> ({ ...prev, [id]: prev[id] || (subcategories.find((s)=>String(s._id)===id)?.name || id) }));
    try {
      if (initialData && initialData._id) {
        const payload = new FormData();
        payload.append('linkedAttributes', JSON.stringify(next || {}));
        await fetch(`${API_BASE_URL}/api/dummy-categories/${initialData._id}`, { method: 'PUT', body: payload });
      }
    } catch {}
    setShowSubcatSelector(false);
  };

  const handleSaveLinkedAttributes = async () => {
    try {
      if (initialData && initialData._id) {
        const payload = new FormData();
        try {
          payload.append('linkedAttributes', JSON.stringify(linkedAttributes || {}));
        } catch (e) {
          payload.append('linkedAttributes', JSON.stringify({}));
        }
        await fetch(`${API_BASE_URL}/api/dummy-categories/${initialData._id}`, { method: 'PUT', body: payload });
      }
    } catch (e) {
      // no-op
    } finally {
      setShowMasterSelector(false);
    }
  };

  if (!show) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      alert("Please enter a category name.");
      return;
    }
    try {
      const formData = new FormData();
      formData.append("name", name);
      if (image) formData.append("image", image);
      if (parentId) formData.append("parentId", parentId);
      formData.append("price", price === "" ? "" : price);
      formData.append("sequence", sequence);
      formData.append("terms", terms);
      formData.append("visibleToUser", visibleToUser);
      formData.append("visibleToVendor", visibleToVendor);
      formData.append("freeText", freeText);
      formData.append("categoryType", categoryType);
      formData.append("availableForCart", availableForCart);
      formData.append("seoKeywords", parentId ? "" : seoKeywords);
      formData.append("postRequestsDeals", postRequestsDeals);
      formData.append("loyaltyPoints", loyaltyPoints);
      formData.append("linkAttributesPricing", linkAttributesPricing);
      freeTexts.forEach((txt, index) => {
        formData.append(`freeText${index + 1}`, txt || "");
      });
      if (icon) formData.append("icon", icon);
      formData.append("enableFreeText", parentId ? parentEnableFreeText : enableFreeText);
      formData.append("inventoryLabelName", inventoryLabelName || "");
      if (!parentId) {
        formData.append("colorSchemes", JSON.stringify(colorSchemes));
      }
      try {
        formData.append("linkedAttributes", JSON.stringify(linkedAttributes || {}));
      } catch (e) {
        formData.append("linkedAttributes", JSON.stringify({}));
      }
      formData.append("categoryVisibility", JSON.stringify(categoryVisibility || []));
      formData.append("categoryModel", JSON.stringify(categoryModel || []));
      formData.append("categoryPricing", JSON.stringify(categoryPricing || []));
      formData.append("socialHandle", JSON.stringify(socialHandle || []));
      formData.append("displayType", JSON.stringify(displayType || []));
      formData.append("webMenu", JSON.stringify(webMenuItems || []));
      formData.append("homeTagline", homeTagline || "");
      formData.append("homeDescription", homeDescription || "");
      formData.append("homeButton1Label", homeButton1Label || "");
      formData.append("homeButton2Label", homeButton2Label || "");
      if (homeButton1Icon) formData.append("homeButton1Icon", homeButton1Icon);
      if (homeButton2Icon) formData.append("homeButton2Icon", homeButton2Icon);
      formData.append("whyUsHeading", whyUsHeading || "");
      formData.append("whyUsSubHeading", whyUsSubHeading || "");
      if (Array.isArray(whyUsCards)) {
        whyUsCards.forEach((card, idx) => {
          const index = idx + 1;
          const safe = card || {};
          formData.append(`whyUsCard${index}Title`, safe.title || "");
          formData.append(`whyUsCard${index}Description`, safe.description || "");
          if (safe.iconFile) {
            formData.append(`whyUsCard${index}Icon`, safe.iconFile);
          }
        });
      }
      if (!parentId) {
        const levelsPayload = (signupLevels || []).map((lvl, idx) => ({
          levelName: lvl,
          sequence: Number(signupLevelDetails?.[lvl]?.sequence ?? idx + 1),
          businessField: Array.isArray(signupLevelDetails?.[lvl]?.businessField)
            ? signupLevelDetails[lvl].businessField
            : [],
        }));
        formData.append("signupLevels", JSON.stringify(levelsPayload));
      }
      let url = `${API_BASE_URL}/api/dummy-categories`;
      let method = "POST";
      if (initialData && initialData._id) {
        url += `/${initialData._id}`;
        method = "PUT";
      }
      const res = await fetch(url, { method, body: formData });
      if (!res.ok) {
        let errMsg = "Failed to save category";
        try {
          const errData = await res.json();
          const combined = [errData?.message, errData?.error].filter(Boolean).join(': ');
          errMsg = combined || errMsg;
        } catch {
          try { errMsg = `${res.status} ${res.statusText}`; } catch {}
        }
        throw new Error(errMsg);
      }
      setName("");
      setImage(null);
      setIcon(null);
      setPrice("");
      setTerms("");
      setVisibleToUser(false);
      setVisibleToVendor(false);
      setSequence(0);
      setFreeText("");
      setEnableFreeText(false);
      setCategoryType("Services");
      setCategoryVisibility([]);
      setCategoryModel([]);
      setCategoryPricing([]);
      setSocialHandle([]);
      setDisplayType([]);
      setSeoKeywords("");
      setPostRequestsDeals(false);
      setLoyaltyPoints(false);
      setLinkAttributesPricing(false);
      setFreeTexts(Array(10).fill(""));
      setInventoryLabelName("");
      setHomeTagline("");
      setHomeDescription("");
      setHomeButton1Label("");
      setHomeButton2Label("");
      setHomeButton1Icon(null);
      setHomeButton2Icon(null);
      setWhyUsHeading("");
      setWhyUsSubHeading("");
      setWhyUsCards(
        Array.from({ length: 6 }, () => ({ title: "", description: "", iconFile: null }))
      );
      onCreated?.();
      onClose?.();
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h2 style={titleStyle}>
          {initialData
            ? "✏️ Edit Dummy Category"
            : parentId
            ? "📁 Create Dummy Subcategory"
            : "🗂️ Create Dummy Category"}
        </h2>

        <form onSubmit={handleSubmit} style={formStyle}>
          {parentId && (
            <>
              <h4 style={labelStyle}>Sequence Number</h4>
              <input
                type="number"
                placeholder="Enter Sequence (Order)"
                value={sequence}
                onChange={(e) =>
                  setSequence(e.target.value === "" ? 0 : Number(e.target.value))
                }
                style={inputStyle}
              />
            </>
          )}
          <input
            type="text"
            placeholder={parentId ? "Enter Subcategory Name" : "Enter Category Name"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ ...inputStyle, fontWeight: "600", color: "#0078d7" }}
          />
          <h4 style={labelStyle}>Upload Category Image</h4>
          {initialData?.imageUrl && !image && (
            <div style={{ textAlign: "center", marginBottom: "10px" }}>
              <img
                src={initialData.imageUrl.startsWith("http")
                  ? initialData.imageUrl
                  : `${process.env.NEXT_PUBLIC_BASE_URL || ""}${initialData.imageUrl}`}
                alt="Current"
                className="max-h-32 rounded-lg object-contain mb-2"
              />
              <p style={{ fontSize: "0.85rem", color: "#555" }}>Current Image</p>
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImage(e.target.files[0])}
            style={inputStyle}
          />
          {image && (
            <div style={{ textAlign: "center", marginBottom: "10px" }}>
              <img
                src={URL.createObjectURL(image)}
                alt="New"
                style={{ width: "120px", height: "120px", objectFit: "cover", borderRadius: "10px", border: "2px solid #28a745" }}
              />
              <p style={{ fontSize: "0.85rem", color: "#28a745" }}>New Image Selected</p>
            </div>
          )}
          <h4 style={{ ...labelStyle, marginTop: "15px" }}>Upload Category Icon</h4>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setIcon(e.target.files[0])}
            style={inputStyle}
          />         
          {initialData?.iconUrl && !icon && (
            <div style={{ textAlign: "center", marginBottom: "10px" }}>
              <img
                src={initialData.iconUrl.startsWith("http")
                  ? initialData.iconUrl
                  : `${process.env.NEXT_PUBLIC_BASE_URL || ""}${initialData.iconUrl}`}
                alt="Icon"
                className="max-h-24 rounded-lg object-contain mb-2"
              />
              <p style={{ fontSize: "0.85rem", color: "#28a745" }}>New Icon Selected</p>
            </div>
          )}
          <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
            {(!parentId ? ["Products", "Services", "Products & Services"] : ["Products", "Services"]).map((type) => {
              const isDisabled =
                parentId &&
                ((parentCategoryType === "Products" && type !== "Products") ||
                  (parentCategoryType === "Services" && type !== "Services"));
              return (
                <label key={type} style={{ color: "#444" }}>
                  <input
                    type="radio"
                    value={type}
                    checked={categoryType === type}
                    disabled={isDisabled}
                    onChange={(e) => setCategoryType(e.target.value)}
                    style={{ marginRight: "5px" }}
                  />
                  {type}
                </label>
              );
            })}
          </div>
          <input
            type="text"
            placeholder="Enter SEO Keywords (comma-separated)"
            value={seoKeywords}
            onChange={(e) => setSeoKeywords(e.target.value)}
            style={inputStyle}
          />
          <ChipSelect
            label="Web Menu"
            options={["Home", "Categories", "Why Us", "About", "Contact"]}
            value={webMenuItems}
            onChange={(vals) => {
              const arr = Array.isArray(vals) ? vals : [];
              // Only open popup when Home is newly added (was not selected before)
              const hadHomeBefore = Array.isArray(webMenuItems) && webMenuItems.includes("Home");
              const hasHomeNow = arr.includes("Home");
              const hadWhyUsBefore = Array.isArray(webMenuItems) && webMenuItems.includes("Why Us");
              const hasWhyUsNow = arr.includes("Why Us");
              setWebMenuItems(arr);
              if (!hadHomeBefore && hasHomeNow) {
                setShowHomePopup(true);
              }
              if (!hadWhyUsBefore && hasWhyUsNow) {
                setShowWhyUsPopup(true);
              }
            }}
            placeholder="Select menu items"
            multi
          />
          {!parentId && (
            <>
              <ChipSelect
                label="Set Category Visibility"
                options={visibilityOptions}
                value={categoryVisibility}
                onChange={setCategoryVisibility}
                placeholder="Select"
                multi
              />
              <ChipSelect
                label="Set Category Models"
                options={modelOptions}
                value={categoryModel}
                onChange={(vals) => {
                  const arr = Array.isArray(vals) ? vals : [];
                  setCategoryModel(arr);
                  const hasInventory = arr.includes("Inventory");

                }}
                placeholder="Select"
                multi
              />
              <ChipSelect
                label="Set Category Pricing"
                options={pricingOptions}
                value={categoryPricing}
                onChange={setCategoryPricing}
                placeholder="Select"
                multi
              />
              <ChipSelect
                label="Set Social Handles"
                options={socialHandleOptions}
                value={socialHandle}
                onChange={setSocialHandle}
                placeholder="Select"
                multi
              />
              <ChipSelect
                label="Set Display Types"
                options={displayTypeOptions}
                value={displayType}
                onChange={setDisplayType}
                placeholder="Select"
                multi
              />
              <ChipSelect
                label="Set Signup Levels"
                options={signupLevelOptions}
                value={signupLevels}
                onChange={(vals) => {
                  setSignupLevels(vals);
                  setSignupLevelDetails((prev) => {
                    const next = { ...prev };
                    vals.forEach((lvl, i) => {
                      if (!next[lvl]) next[lvl] = { sequence: i + 1, businessField: [] };
                    });
                    Object.keys(next).forEach((k) => {
                      if (!vals.includes(k)) delete next[k];
                    });
                    return next;
                  });
                }}
                placeholder="Select"
                multi
              />
              {signupLevels.map((lvl) => (
                <div key={lvl} style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fafafa" }}>
                  <div style={{ fontWeight: 700, color: "#444", marginBottom: 8 }}>{lvl}</div>
                  <h4 style={labelStyle}>Sequence</h4>
                  <input
                    type="number"
                    value={Number(signupLevelDetails?.[lvl]?.sequence ?? 0)}
                    onChange={(e) => {
                      const val = e.target.value === "" ? 0 : Number(e.target.value);
                      setSignupLevelDetails((prev) => ({
                        ...prev,
                        [lvl]: { ...prev[lvl], sequence: val },
                      }));
                    }}
                    style={inputStyle}
                  />
                  <h4 style={labelStyle}>Business Fields</h4>
                  <ChipSelect
                    options={businessFieldOptions}
                    value={Array.isArray(signupLevelDetails?.[lvl]?.businessField) ? signupLevelDetails[lvl].businessField : []}
                    onChange={(vals) => {
                      const arr = Array.isArray(vals) ? vals : [];
                      setSignupLevelDetails((prev) => ({
                        ...prev,
                        [lvl]: { ...prev[lvl], businessField: arr },
                      }));
                    }}
                    placeholder="Select"
                    multi
                  />
                </div>
              ))}
            </>
          )}
          {parentId && (
            <>
              <input
                type="number"
                placeholder="Price (Optional)"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={inputStyle}
              />
              <textarea
                placeholder="Terms & Conditions"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                style={textareaStyle}
              />
            </>
          )}
          {!parentId &&
            freeTexts.map((txt, i) => (
              <input
                key={i}
                type="text"
                placeholder={`Free Text ${i + 1}`}
                value={txt}
                onChange={(e) => {
                  const newTexts = [...freeTexts];
                  newTexts[i] = e.target.value;
                  setFreeTexts(newTexts);
                }}
                style={inputStyle}
              />
            ))}
          {parentId && (
            <input
              type="text"
              placeholder="Enter Info Text"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              style={{
                ...inputStyle,
                backgroundColor: "#fff",
                cursor: "text",
              }}
            />
          )}
          {!parentId && (
            <>
              <h4 style={{ ...labelStyle, marginTop: "20px" }}>🎨 Color Schemes</h4>

              {colorSchemes.map((scheme, index) => (
                <div
                  key={index}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: "10px",
                    padding: "10px",
                    marginBottom: "10px",
                    background: "#fafafa",
                  }}
                >
                  <div style={{ marginBottom: "6px", fontWeight: "600", color: "#555" }}>
                    Scheme {index + 1}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(6, 1fr)",
                      gap: "6px",
                      fontSize: "0.8rem",
                      textAlign: "center",
                      color: "#666",
                      marginBottom: "4px",
                    }}
                  >
                    <div>Name</div>
                    <div>Primary</div>
                    <div>Accent</div>
                    <div>Background</div>
                    <div>CardBg</div>
                    <div>Text</div>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(6, 1fr)",
                      gap: "6px",
                      alignItems: "center",
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Name"
                      value={scheme.name}
                      onChange={(e) => {
                        const updated = [...colorSchemes];
                        updated[index].name = e.target.value;
                        setColorSchemes(updated);
                      }}
                      style={{ ...inputStyle, padding: "6px" }}
                    />
                    {["primary", "accent", "background", "cardBg", "text"].map((key) => (
                      <input
                        key={key}
                        type="color"
                        value={scheme[key]}
                        onChange={(e) => {
                          const updated = [...colorSchemes];
                          updated[index][key] = e.target.value;
                          setColorSchemes(updated);
                        }}
                        style={{
                          width: "100%",
                          height: "35px",
                          cursor: "pointer",
                          borderRadius: "6px",
                          border: "1px solid #ccc",
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => {
                  setColorSchemes([
                    ...colorSchemes,
                    {
                      name: "",
                      primary: "#000000",
                      accent: "#ffffff",
                      background: "#ffffff",
                      cardBg: "#ffffff",
                      text: "#000000",
                    },
                  ]);
                }}
                style={{
                  ...submitBtnStyle,
                  background: "#28a745",
                  width: "100%",
                  marginTop: "8px",
                }}
              >
                ➕ Add Color Scheme
              </button>
            </>
          )}
          <label style={checkboxLabel}>
            <input
              type="checkbox"
              checked={enableFreeText}
              disabled={parentId ? !parentEnableFreeText : false}
              onChange={(e) => setEnableFreeText(e.target.checked)}
            />
            Enable Full Free Text / Discount
          </label>
          {!parentId && (
            <>
              <label style={checkboxLabel}>
                <input
                  type="checkbox"
                  checked={availableForCart}
                  onChange={(e) => setAvailableForCart(e.target.checked)}
                />
                Available for Cart
              </label>

              <label style={checkboxLabel}>
                <input
                  type="checkbox"
                  checked={postRequestsDeals}
                  onChange={(e) => setPostRequestsDeals(e.target.checked)}
                />
                Post Requests & Get Deals
              </label>

              <label style={checkboxLabel}>
                <input
                  type="checkbox"
                  checked={loyaltyPoints}
                  onChange={(e) => setLoyaltyPoints(e.target.checked)}
                />
                Loyalty Points Applicable
              </label>

              <label style={checkboxLabel}>
                <input
                  type="checkbox"
                  checked={linkAttributesPricing}
                  onChange={(e) => {
                    const val = e.target.checked;
                    setLinkAttributesPricing(val);
                    if (val) {
                      setShowMasterSelector(true);
                    } else {
                      setLinkedAttributes({});
                    }
                  }}
                />
                Link Attributes for Pricing
              </label>
              {linkAttributesPricing && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setShowMasterSelector(true)}
                    style={{ ...submitBtnStyle, width: "100%" }}
                  >
                    Configure Linked Attributes
                  </button>
                </div>
              )}
            </>
          )}
          <label style={checkboxLabel}>
            <input
              type="checkbox"
              checked={visibleToUser}
              onChange={(e) => setVisibleToUser(e.target.checked)}
            />
            Visible to User
          </label>
          <label style={checkboxLabel}>
            <input
              type="checkbox"
              checked={visibleToVendor}
              onChange={(e) => setVisibleToVendor(e.target.checked)}
            />
            Visible to Vendor
          </label>

          <div style={{ display: "flex", gap: "12px", marginTop: "10px" }}>
            <button type="button" onClick={onClose} style={cancelBtnStyle}>
              Cancel
            </button>
            <button type="submit" style={submitBtnStyle}>
              {initialData ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>

      {showMasterSelector && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 4000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.45)",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              width: 800,
              maxWidth: "95vw",
              maxHeight: "85vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: 14,
                borderBottom: "1px solid #eee",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h3 style={{ margin: 0, color: "#0078d7" }}>
                Link Attributes for Pricing
              </h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowMasterSelector(false)}
                  style={cancelBtnStyle}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => setLinkedAttributes({})}
                  style={{ ...cancelBtnStyle, background: "#ef4444" }}
                >
                  Clear
                </button>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 2fr",
                gap: 0,
                minHeight: 420,
              }}
            >
              {/* Left panel: Families and types list */}
              <div
                style={{
                  borderRight: "1px solid #eee",
                  overflowY: "auto",
                }}
              >
                {(() => {
                  const masters = Array.isArray(allMasters) ? allMasters : [];
                  const titleCase = (key) =>
                    key
                      .replace(/([A-Z])/g, " $1")
                      .replace(/[-_]/g, " ")
                      .replace(/^\s+|\s+$/g, "")
                      .split(" ")
                      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                      .join(" ");
                  // Build families from entries that have fieldType
                  const byFamily = new Map();
                  masters.forEach((m) => {
                    const fam = (m.type || "").toString().trim();
                    const ft = (m.fieldType || "").toString().trim();
                    if (!fam) return;
                    if (ft) {
                      if (!byFamily.has(fam)) byFamily.set(fam, new Set());
                      byFamily.get(fam).add(ft);
                    }
                  });
                  const familyItems = Array.from(byFamily.keys()).map((fam) => ({
                    _id: `family:${fam}`,
                    name: titleCase(fam),
                    __mode: "family",
                    key: fam,
                  }));
                  // Types with no fieldType (basic types)
                  const familyKeys = new Set(byFamily.keys());
                  const basicTypes = new Set();
                  masters.forEach((m) => {
                    const t = (m.type || "").toString().trim();
                    const ft = (m.fieldType || "").toString().trim();
                    if (!t) return;
                    if (!ft && !familyKeys.has(t)) basicTypes.add(t);
                  });
                  const otherTypeItems = Array.from(basicTypes).map((t) => ({
                    _id: `type:${t}`,
                    name: titleCase(t),
                    __mode: "type",
                    key: t,
                  }));
                  const list = [...familyItems, ...otherTypeItems];
                  if (list.length === 0) {
                    return (
                      <div style={{ padding: 10, color: "#64748b" }}>No data found.</div>
                    );
                  }
                  return list.map((it, idx) => {
                    const isSaved = initialData && initialData.linkedAttributes && initialData.linkedAttributes[it.key];
                    return (
                    <div
                      key={it._id}
                      onClick={() => { setSelectedMasterIndex(idx); if (it.__mode === 'family') { try { fetchModelsForFamily(it.key); } catch {} } }}
                      style={{
                        padding: 10,
                        cursor: "pointer",
                        background: selectedMasterIndex === idx ? "#e8f2ff" : "#fff",
                        color: selectedMasterIndex === idx ? "#0f69c9" : "#333",
                        borderBottom: "1px solid #f3f4f6",
                        fontWeight: selectedMasterIndex === idx ? 700 : 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span style={{ flex: 1 }}>{it.name}</span>
                      {isSaved && (
                        <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 10, background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>Saved</span>
                      )}
                    </div>
                  )});
                })()}
              </div>

              {/* Right panel: Items and linked attributes */}
              <div style={{ overflowY: "auto", padding: 10 }}>
                {(() => {
                  const masters = Array.isArray(allMasters) ? allMasters : [];
                  const titleCase = (key) => key
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/[-_]/g, ' ')
                    .replace(/^\s+|\s+$/g, '')
                    .split(' ')
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ');

                  // Rebuild the same left list here to derive current selection
                  const byFamily = new Map();
                  masters.forEach((m) => {
                    const fam = (m.type || '').toString().trim();
                    const ft = (m.fieldType || '').toString().trim();
                    if (!fam) return;
                    if (ft) {
                      if (!byFamily.has(fam)) byFamily.set(fam, new Set());
                      byFamily.get(fam).add(ft);
                    }
                  });
                  const familyItems = Array.from(byFamily.keys()).map((fam) => ({
                    _id: `family:${fam}`,
                    name: titleCase(fam),
                    __mode: 'family',
                    key: fam,
                  }));
                  const familyKeys = new Set(byFamily.keys());
                  const basicTypes = new Set();
                  masters.forEach((m) => {
                    const t = (m.type || '').toString().trim();
                    const ft = (m.fieldType || '').toString().trim();
                    if (!t) return;
                    if (!ft && !familyKeys.has(t)) basicTypes.add(t);
                  });
                  const otherTypeItems = Array.from(basicTypes).map((t) => ({
                    _id: `type:${t}`,
                    name: titleCase(t),
                    __mode: 'type',
                    key: t,
                  }));
                  const list = [...familyItems, ...otherTypeItems];

                  const sel = list[selectedMasterIndex];
                  if (!sel) return <div style={{ color: '#64748b' }}>Select a master type from the left.</div>;

                  if (sel.__mode === 'family') {
                    const familyKey = sel.key;
                    const ftSet = new Set(byFamily.get(familyKey) || []);
                    const models = modelsByFamily[familyKey] || [];
                    const famLc = String(familyKey || '').toLowerCase();
                    // Always show Model for vehicle families; fetch adds subfields when available
                    if (['cars','car','bikes','bike','tempo bus','tempobus','tempominibuses','tempo minibuses','tempominibuses','tempominibuses'].includes(famLc)) {
                      ftSet.add('model');
                    }
                    if (Array.isArray(models) && models.length > 0) ftSet.add('model');
                    const fieldTypes = Array.from(ftSet);
                    const selectedHeadings = Array.isArray(linkedAttributes[familyKey]) ? linkedAttributes[familyKey] : [];

                    // Special-case: Business Field should show its items (data) instead of field type headings
                    if (familyKey === 'businessField') {
                      const items = masters.filter((m) => (m.type || '').toString().trim() === 'businessField');
                      const selectedForType = Array.isArray(linkedAttributes['businessField']) ? linkedAttributes['businessField'] : [];
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {items.sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).map((c) => {
                            const isChecked = selectedForType.includes(c.name);
                            return (
                              <label key={String(c._id) || c.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: '1px dashed #f1f5f9' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    const on = e.target.checked;
                                    setLinkedAttributes((prev) => {
                                      const prevArr = Array.isArray(prev['businessField']) ? prev['businessField'] : [];
                                      const nextArr = on ? Array.from(new Set([...prevArr, c.name])) : prevArr.filter((x) => x !== c.name);
                                      const next = { ...prev };
                                      if (nextArr.length === 0) delete next['businessField']; else next['businessField'] = nextArr;
                                      return next;
                                    });
                                  }}
                                />
                                <span>{c.name}</span>
                              </label>
                            );
                          })}
                          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                            {(() => {
                              const key = `businessField:inventoryLabels`;
                              const labels = Array.isArray(linkedAttributes[key]) ? linkedAttributes[key] : [];
                              const current = labels[0] || '';
                              const editing = false;
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                  <div style={{ fontWeight: 700, fontSize: 14 }}>Inventory Label</div>
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    {current ? (
                                      <>
                                        <span style={{ padding: '6px 10px', border: '1px solid #dbeafe', background: '#f1f5ff', borderRadius: 16 }}>{current}</span>
                                        <button type="button" onClick={() => { setLinkedAttributes((prev)=>{ const next={...prev}; delete next[key]; return next; }); }} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #fecaca', background: '#fee2e2', color: '#ef4444' }}>×</button>
                                      </>
                                    ) : (
                                      <>
                                        <input type="text" value={inventoryLabelName} onChange={(e)=> setInventoryLabelName(e.target.value)} placeholder="Add Inventory Label Name" style={{ padding: '8px 10px', border: '1px solid #cbd5e1', background: '#f8fafc', borderRadius: 8 }} />
                                        <button type="button" onClick={() => { const v=String(inventoryLabelName||'').trim(); if(!v) return; setLinkedAttributes((prev)=> ({ ...prev, [key]: [v] })); }} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#0ea5e9', color: '#fff', fontSize: 12, fontWeight: 600 }}>Add</button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                            <div style={{ marginTop: 6 }}>
                              <button type="button" onClick={() => { const k = `businessField:inventoryLabels`; window.dispatchEvent(new CustomEvent('linkWithSubcategories', { detail: { key: k } })); }} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 600 }}>Link with subcategories</button>
                              {(() => {
                                const lk = `businessField:inventoryLabels:linkedSubcategory`;
                                const id = Array.isArray(linkedAttributes[lk]) ? linkedAttributes[lk][0] : '';
                                if (!id) return null;
                                const nm = subcategoryNameById[String(id)] || String(id);
                                return (
                                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ padding: '4px 8px', borderRadius: 14, background: '#eef6ff', border: '1px solid #cce4ff', color: '#0f69c9' }}>{nm}</span>
                                    <button type="button" onClick={() => handleUnlinkSubcategory(`businessField:inventoryLabels`)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #fecaca', background: '#fee2e2', color: '#ef4444' }}>🗑</button>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Attributes</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                          {fieldTypes.length === 0 && (
                            <div style={{ color: '#64748b' }}>No attributes found for this family.</div>
                          )}
                          {fieldTypes.map((h) => {
                            const checked = selectedHeadings.includes(h);
                            // derive model subfields from fetched models when heading is 'model'
                            let modelSubfields = [];
                            if (String(h).toLowerCase() === 'model') {
                              const canonicalModels = modelsByFamily[familyKey] || [];
                              if (canonicalModels.length > 0) {
                                const exclude = new Set(['_id','id','__v','createdAt','updatedAt','category']);
                                const keys = new Set();
                                canonicalModels.forEach((m) => {
                                  const raw = m.raw || m;
                                  Object.keys(raw || {}).forEach((k) => {
                                    const key = String(k || '').trim();
                                    if (!key || exclude.has(key) || key.startsWith('_')) return;
                                    const v = raw[key];
                                    if (v == null) return;
                                    const t = typeof v;
                                    if (t === 'string' || t === 'number' || t === 'boolean') keys.add(key);
                                  });
                                });
                                modelSubfields = Array.from(keys);
                              }
                              // Fallback common fields for vehicle families
                              if (!modelSubfields.length) {
                                const famLc2 = String(familyKey || '').toLowerCase();
                                const VEHICLE_FIELDS = ['brand','model','variant','transmission','fuelType','bodyType','seats'];
                                if (['cars','car','bikes','bike','tempo bus','tempobus','tempo minibuses','tempominibuses','tempobus'].includes(famLc2)) {
                                  modelSubfields = VEHICLE_FIELDS;
                                }
                              }
                            }
                            const selectedModelFields = getSelectedModelFields(familyKey);
                            return (
                              <div key={h} style={{ display: 'flex', flexDirection: 'column', minWidth: 220, gap: 6 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      const on = e.target.checked;
                                      if (on && String(h).toLowerCase() === 'model') {
                                        try { fetchModelsForFamily(familyKey); } catch {}
                                      }
                                      setLinkedAttributes((prev) => {
                                        const prevArr = Array.isArray(prev[familyKey]) ? prev[familyKey] : [];
                                        const nextArr = on ? Array.from(new Set([...prevArr, h])) : prevArr.filter((x) => x !== h);
                                        const next = { ...prev };
                                        if (nextArr.length === 0) delete next[familyKey]; else next[familyKey] = nextArr;
                                        return next;
                                      });
                                    }}
                                  />
                                  <span>{titleCase(h)}</span>
                                </label>
                                {String(h).toLowerCase() === 'model' && checked && modelSubfields.length > 0 ? (
                                  <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {modelSubfields.map((sf) => {
                                      const sfChecked = selectedModelFields.includes(sf);
                                      return (
                                        <label key={`model-field-${sf}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <input
                                            type="checkbox"
                                            checked={sfChecked}
                                            onChange={(e) => {
                                              const on = e.target.checked;
                                              setLinkedAttributes((prev) => {
                                                const key = `${familyKey}:modelFields`;
                                                const prevArr = Array.isArray(prev[key]) ? prev[key] : [];
                                                const nextArr = on ? Array.from(new Set([...prevArr, sf])) : prevArr.filter((x) => x !== sf);
                                                const next = { ...prev };
                                                if (nextArr.length === 0) delete next[key]; else next[key] = nextArr;
                                                return next;
                                              });
                                            }}
                                          />
                                          <span>{titleCase(sf)}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                ) : (String(h).toLowerCase() === 'model' && checked ? (
                                  <div style={{ marginLeft: 22, color: '#64748b', fontSize: 12 }}>Loading model fields or none available.</div>
                                ) : null)}
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                          {(() => {
                            const key = `${familyKey}:inventoryLabels`;
                            const labels = Array.isArray(linkedAttributes[key]) ? linkedAttributes[key] : [];
                            const current = labels[0] || '';
                            const editing = false;
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <div style={{ fontWeight: 700, fontSize: 14 }}>Inventory Label</div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  {current ? (
                                    <>
                                      <span style={{ padding: '6px 10px', border: '1px solid #dbeafe', background: '#f1f5ff', borderRadius: 16 }}>{current}</span>
                                      <button type="button" onClick={() => { setLinkedAttributes((prev)=>{ const next={...prev}; delete next[key]; return next; }); }} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #fecaca', background: '#fee2e2', color: '#ef4444' }}>×</button>
                                    </>
                                  ) : (
                                    <>
                                      <input type="text" value={inventoryLabelName} onChange={(e)=> setInventoryLabelName(e.target.value)} placeholder="Add Inventory Label Name" style={{ padding: '8px 10px', border: '1px solid #cbd5e1', background: '#f8fafc', borderRadius: 8 }} />
                                      <button type="button" onClick={() => { const v=String(inventoryLabelName||'').trim(); if(!v) return; setLinkedAttributes((prev)=> ({ ...prev, [key]: [v] })); }} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#0ea5e9', color: '#fff', fontSize: 12, fontWeight: 600 }}>Add</button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                          <div style={{ marginTop: 6 }}>
                            <button type="button" onClick={() => { const k = `${familyKey}:inventoryLabels`; window.dispatchEvent(new CustomEvent('linkWithSubcategories', { detail: { key: k } })); }} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 600 }}>Link with subcategories</button>
                            {(() => {
                              const lk = `${familyKey}:inventoryLabels:linkedSubcategory`;
                              const id = Array.isArray(linkedAttributes[lk]) ? linkedAttributes[lk][0] : '';
                              if (!id) return null;
                              const nm = subcategoryNameById[String(id)] || String(id);
                              return (
                                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ padding: '4px 8px', borderRadius: 14, background: '#eef6ff', border: '1px solid #cce4ff', color: '#0f69c9' }}>{nm}</span>
                                  <button type="button" onClick={() => handleUnlinkSubcategory(`${familyKey}:inventoryLabels`)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #fecaca', background: '#fee2e2', color: '#ef4444' }}>🗑</button>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Non-family type: list items and options
                  const children = masters.filter((c) => (c.type || '').toString().trim() === (sel.key || '').toString().trim() && !((c.fieldType || '').toString().trim()));
                  const selected = linkedAttributes[sel.key] || [];
                  return (
                    <div>
                      <div style={{ marginBottom: 8, color: '#475569' }}>Select one or more items under {titleCase(sel.key)}</div>
                      <div>
                        {children
                          .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
                          .map((c) => {
                            const isChecked = selected.includes(c.name);
                            const optKey = `${sel.key}:${c.name}`;
                            const selectedOpts = Array.isArray(linkedAttributes[optKey]) ? linkedAttributes[optKey] : [];
                            return (
                              <div key={String(c._id) || c.name} style={{ padding: '6px 4px', borderBottom: '1px dashed #f1f5f9', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      const on = e.target.checked;
                                      setLinkedAttributes((prev) => {
                                        const prevArr = Array.isArray(prev[sel.key]) ? prev[sel.key] : [];
                                        const nextArr = on ? Array.from(new Set([...prevArr, c.name])) : prevArr.filter((x) => x !== c.name);
                                        const next = { ...prev };
                                        if (nextArr.length === 0) delete next[sel.key]; else next[sel.key] = nextArr;
                                        return next;
                                      });
                                    }}
                                  />
                                  <span>{c.name}</span>
                                </label>
                                {Array.isArray(c.options) && c.options.length > 0 && (
                                  <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {c.options.map((opt) => {
                                      const oc = selectedOpts.includes(opt);
                                      return (
                                        <label key={`${optKey}:${opt}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <input
                                            type="checkbox"
                                            checked={oc}
                                            onChange={(e) => {
                                              const on = e.target.checked;
                                              setLinkedAttributes((prev) => {
                                                const prevArr = Array.isArray(prev[optKey]) ? prev[optKey] : [];
                                                const nextArr = on ? Array.from(new Set([...prevArr, opt])) : prevArr.filter((x) => x !== opt);
                                                const next = { ...prev };
                                                if (nextArr.length === 0) delete next[optKey]; else next[optKey] = nextArr;
                                                return next;
                                              });
                                            }}
                                          />
                                          <span>{opt}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                        {(() => {
                          const key = `${sel.key}:inventoryLabels`;
                          const labels = Array.isArray(linkedAttributes[key]) ? linkedAttributes[key] : [];
                          const current = labels[0] || '';
                          const editing = false;
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                              <div style={{ fontWeight: 700, fontSize: 14 }}>Inventory Label</div>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                {current ? (
                                  <>
                                    <span style={{ padding: '6px 10px', border: '1px solid #dbeafe', background: '#f1f5ff', borderRadius: 16 }}>{current}</span>
                                    <button type="button" onClick={() => { setLinkedAttributes((prev)=>{ const next={...prev}; delete next[key]; return next; }); }} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #fecaca', background: '#fee2e2', color: '#ef4444' }}>×</button>
                                  </>
                                ) : (
                                  <>
                                    <input type="text" value={inventoryLabelName} onChange={(e)=> setInventoryLabelName(e.target.value)} placeholder="Add Inventory Label Name" style={{ padding: '8px 10px', border: '1px solid #cbd5e1', background: '#f8fafc', borderRadius: 8 }} />
                                    <button type="button" onClick={() => { const v=String(inventoryLabelName||'').trim(); if(!v) return; setLinkedAttributes((prev)=> ({ ...prev, [key]: [v] })); }} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#0ea5e9', color: '#fff', fontSize: 12, fontWeight: 600 }}>Add</button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                        <div style={{ marginTop: 6 }}>
                          <button type="button" onClick={() => { const k = `${sel.key}:inventoryLabels`; window.dispatchEvent(new CustomEvent('linkWithSubcategories', { detail: { key: k } })); }} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 600 }}>Link with subcategories</button>
                          {(() => {
                            const lk = `${sel.key}:inventoryLabels:linkedSubcategory`;
                            const id = Array.isArray(linkedAttributes[lk]) ? linkedAttributes[lk][0] : '';
                            if (!id) return null;
                            const nm = subcategoryNameById[String(id)] || String(id);
                            return (
                              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ padding: '4px 8px', borderRadius: 14, background: '#eef6ff', border: '1px solid #cce4ff', color: '#0f69c9' }}>{nm}</span>
                                <button type="button" onClick={() => handleUnlinkSubcategory(`${sel.key}:inventoryLabels`)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #fecaca', background: '#fee2e2', color: '#ef4444' }}>🗑</button>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div style={{ padding: 12, borderTop: '1px solid #eee', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowMasterSelector(false)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff' }}>Close</button>
                <button type="button" onClick={handleSaveLinkedAttributes} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#0078d7', color: '#fff', fontWeight: 700 }}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSubcatSelector ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 420, maxHeight: '70vh', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: 12, borderBottom: '1px solid #eee', fontWeight: 700, color: '#0f172a' }}>Link with subcategories</div>
            <div style={{ padding: 12, maxHeight: '50vh', overflowY: 'auto' }}>
              <div key="__all__" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px', borderBottom: '1px dashed #f1f5f9' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="radio"
                    name="subcatChoice"
                    checked={String(selectedSubcategoryId) === 'ALL'}
                    onChange={() => setSelectedSubcategoryId('ALL')}
                  />
                  <span>All</span>
                </label>
              </div>
              {Array.isArray(subcategories) && subcategories.length > 0 ? (
                subcategories.map((c) => (
                  <div key={String(c._id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px', borderBottom: '1px dashed #f1f5f9' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="radio"
                        name="subcatChoice"
                        checked={String(selectedSubcategoryId) === String(c._id)}
                        onChange={() => setSelectedSubcategoryId(String(c._id))}
                      />
                      <span>{c.name}</span>
                    </label>
                  </div>
                ))
              ) : (
                <div style={{ color: '#64748b' }}>No subcategories found. Create a subcategory first.</div>
              )}
            </div>
            <div style={{ padding: 12, borderTop: '1px solid #eee', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowSubcatSelector(false)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff' }}>Cancel</button>
              <button type="button" onClick={handleSaveSubcategoryLink} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#0078d7', color: '#fff', fontWeight: 700 }}>Save</button>
            </div>
          </div>
        </div>
      ) : null}

      {showHomePopup && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 4000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.45)",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              width: 600,
              maxWidth: "95vw",
              maxHeight: "85vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: 14,
                borderBottom: "1px solid #eee",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h3 style={{ margin: 0, color: "#0078d7" }}>Home Popup Configuration</h3>
              <button
                type="button"
                onClick={() => setShowHomePopup(false)}
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
            <div style={{ padding: 16, overflowY: "auto" }}>
              <div style={{ marginBottom: 12 }}>
                <h4 style={labelStyle}>Tagline</h4>
                <input
                  type="text"
                  value={homeTagline}
                  onChange={(e) => setHomeTagline(e.target.value)}
                  style={inputStyle}
                  placeholder="Enter tagline"
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <h4 style={labelStyle}>Description</h4>
                <textarea
                  value={homeDescription}
                  onChange={(e) => setHomeDescription(e.target.value)}
                  style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
                  placeholder="Enter description"
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <h4 style={labelStyle}>Button Label 1 (Icon + Text)</h4>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setHomeButton1Icon(e.target.files[0] || null)}
                  style={inputStyle}
                />
                <input
                  type="text"
                  value={homeButton1Label}
                  onChange={(e) => setHomeButton1Label(e.target.value)}
                  style={inputStyle}
                  placeholder="Enter button label 1"
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <h4 style={labelStyle}>Button Label 2 (Icon + Text)</h4>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setHomeButton2Icon(e.target.files[0] || null)}
                  style={inputStyle}
                />
                <input
                  type="text"
                  value={homeButton2Label}
                  onChange={(e) => setHomeButton2Label(e.target.value)}
                  style={inputStyle}
                  placeholder="Enter button label 2"
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowHomePopup(false)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setShowHomePopup(false)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: "#0078d7",
                    color: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showWhyUsPopup && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 4000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.45)",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              width: 700,
              maxWidth: "95vw",
              maxHeight: "85vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: 14,
                borderBottom: "1px solid #eee",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h3 style={{ margin: 0, color: "#0078d7" }}>Why Us Configuration</h3>
              <button
                type="button"
                onClick={() => setShowWhyUsPopup(false)}
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
            <div style={{ padding: 16, overflowY: "auto" }}>
              <div style={{ marginBottom: 12 }}>
                <h4 style={labelStyle}>Heading</h4>
                <input
                  type="text"
                  value={whyUsHeading}
                  onChange={(e) => setWhyUsHeading(e.target.value)}
                  style={inputStyle}
                  placeholder="Enter heading"
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <h4 style={labelStyle}>Sub-Heading</h4>
                <input
                  type="text"
                  value={whyUsSubHeading}
                  onChange={(e) => setWhyUsSubHeading(e.target.value)}
                  style={inputStyle}
                  placeholder="Enter sub-heading"
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <h4 style={labelStyle}>Card Section (1 - 6)</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {whyUsCards.map((card, idx) => (
                    <div
                      key={idx}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: 10,
                        background: "#f9fafb",
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>Card {idx + 1}</div>
                      <input
                        type="text"
                        value={card.title}
                        onChange={(e) => {
                          const next = [...whyUsCards];
                          next[idx] = { ...next[idx], title: e.target.value };
                          setWhyUsCards(next);
                        }}
                        placeholder="Title"
                        style={{ ...inputStyle, marginBottom: 6 }}
                      />
                      <textarea
                        value={card.description}
                        onChange={(e) => {
                          const next = [...whyUsCards];
                          next[idx] = { ...next[idx], description: e.target.value };
                          setWhyUsCards(next);
                        }}
                        placeholder="Description"
                        style={{ ...inputStyle, minHeight: 60, marginBottom: 6 }}
                      />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                          const next = [...whyUsCards];
                          next[idx] = { ...next[idx], iconFile: file };
                          setWhyUsCards(next);
                        }}
                        style={inputStyle}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowWhyUsPopup(false)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setShowWhyUsPopup(false)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: "#0078d7",
                    color: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Styles (same as CreateCategoryModal)
const overlayStyle = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.6)",
  backdropFilter: "blur(5px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2000,
};

const modalStyle = {
  background: "linear-gradient(135deg, #ffffff 80%, #f0f8ff)",
  color: "#333",
  padding: "35px 30px",
  borderRadius: "20px",
  width: "450px",
  maxHeight: "85vh",
  overflowY: "auto",
  boxShadow: "0 12px 35px rgba(0,0,0,0.25)",
  transition: "all 0.3s ease-in-out",
};

const titleStyle = {
  marginBottom: "20px",
  textAlign: "center",
  color: "#0078d7",
  fontSize: "1.6rem",
};
const formStyle = { display: "flex", flexDirection: "column", gap: "14px" };
const inputStyle = {
  padding: "10px",
  width: "100%",
  borderRadius: "10px",
  border: "1px solid #ccc",
  background: "#fff",
  color: "#333",
  outline: "none",
  fontSize: "0.95rem",
  boxShadow: "inset 0 1px 3px rgba(0,0,0,0.1)",
};
const textareaStyle = { ...inputStyle, minHeight: "70px", resize: "vertical" };
const checkboxLabel = {
  display: "flex",
  gap: "10px",
  alignItems: "center",
  color: "#444",
  fontSize: "0.9rem",
};
const labelStyle = { fontWeight: "600", color: "#0078d7", marginBottom: "6px" };
const cancelBtnStyle = {
  flex: 1,
  padding: "10px",
  borderRadius: "8px",
  border: "none",
  background: "#d9534f",
  color: "#fff",
  fontWeight: "600",
  cursor: "pointer",
};
const submitBtnStyle = {
  flex: 1,
  padding: "10px",
  borderRadius: "8px",
  border: "none",
  background: "#0078d7",
  color: "#fff",
  fontWeight: "600",
  cursor: "pointer",
};

export default DummyCreateCategoryModal;