import { useState, useEffect, useMemo } from "react";
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
function CreateCategoryModal({
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
  const [displayType, setDisplayType] = useState([]);// Master data selector state for "Link Attributes for Pricing"
  const [includeLeafChildren, setIncludeLeafChildren] = useState(true);
  const [allMasters, setAllMasters] = useState([]); // full master records from /api/masters
  const [modelsByFamily, setModelsByFamily] = useState({}); // cache fetched models by family key
  const [invLabelInputs, setInvLabelInputs] = useState({});
  const [invLabelEditing, setInvLabelEditing] = useState({});
  const familyToModelCategory = {
    cars: 'car',
    bikes: 'bike',
    tempobus: 'tempoBus',
    tempoBus: 'tempoBus',
    tempoMinibuses: 'tempoBus',  // map the master data name to the model category
  };
  const fetchModelsForFamily = async (familyKey) => {
    if (!familyKey) return;
    if (modelsByFamily[familyKey]) return modelsByFamily[familyKey];
    const exact = familyKey.toString().trim();
    const normalized = exact.toLowerCase();
    const category = familyToModelCategory[exact] || familyToModelCategory[normalized] || exact;
    try {
      const url = `http://localhost:5000/api/models?category=${encodeURIComponent(category)}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.error('Failed to fetch models for', familyKey, res.status);
        return;
      }
      const data = await res.json();
      const models = Array.isArray(data)
        ? data.map((d) => ({
            _id: d._id,
            name: d.model || d.name || d.modelName || '',
            raw: d,
          }))
        : [];
      setModelsByFamily((prev) => ({ ...prev, [familyKey]: models }));
      return models;
    } catch (err) {
      console.error('fetchModelsForFamily error', err);
    }
  };
  const [showMasterSelector, setShowMasterSelector] = useState(false);
  const [selectedMasterIndex, setSelectedMasterIndex] = useState(null); // index into allMasters
  const [linkedAttributes, setLinkedAttributes] = useState({});
  const [inventoryLabelName, setInventoryLabelName] = useState("");
  const [showInventoryLabelPopup, setShowInventoryLabelPopup] = useState(false);
  const [inventoryFamilyKey, setInventoryFamilyKey] = useState(null);
  const [inventoryBrands, setInventoryBrands] = useState([]);
  const [inventoryTransmissions, setInventoryTransmissions] = useState([]);
  const [selectedBrandForInventory, setSelectedBrandForInventory] = useState("");
  const [selectedTransmissionForInventory, setSelectedTransmissionForInventory] = useState("");
  const [inventoryModelsList, setInventoryModelsList] = useState([]);
  const [inventoryVariantsList, setInventoryVariantsList] = useState([]);
  const [selectedModelForInventory, setSelectedModelForInventory] = useState("");
  const [selectedVariantForInventory, setSelectedVariantForInventory] = useState("");
  // Subcategory linking modal state
  const [showSubcatSelector, setShowSubcatSelector] = useState(false);
  const [subcatKey, setSubcatKey] = useState(""); // e.g., `${familyKey}:inventoryLabels`
  const [subcategories, setSubcategories] = useState([]);
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState("");
  const [subcategoryNameById, setSubcategoryNameById] = useState({});
  // Saved baseline for highlighting (from initialData)
  const savedLinkedAttributes = useMemo(() => {
    return (initialData && initialData.linkedAttributes && typeof initialData.linkedAttributes === 'object')
      ? initialData.linkedAttributes
      : {};
  }, [initialData]);
  const isSavedFamily = (fam) => Array.isArray(savedLinkedAttributes?.[fam]);
  const isSavedHeading = (fam, h) => Array.isArray(savedLinkedAttributes?.[fam]) && savedLinkedAttributes[fam].includes(h);
  const isSavedModelField = (fam, sf) => {
    const key = `${fam}:modelFields`;
    return Array.isArray(savedLinkedAttributes?.[key]) && savedLinkedAttributes[key].includes(sf);
  };
  const isSavedTypeItem = (typeKey, name) => Array.isArray(savedLinkedAttributes?.[typeKey]) && savedLinkedAttributes[typeKey].includes(name);
  const isSavedTypeOption = (typeKey, name, opt) => {
    const key = `${typeKey}:${name}`;
    return Array.isArray(savedLinkedAttributes?.[key]) && savedLinkedAttributes[key].includes(opt);
  };
  // Helper: per-family Model fields selection (Cars/Bikes/TempoMinibuses independent)
  const getSelectedModelFields = (fam) => {
    const famKey = String(fam || '');
    const perFam = linkedAttributes?.[`${famKey}:modelFields`];
    if (Array.isArray(perFam)) return perFam;
    const global = linkedAttributes?.['model'];
    return Array.isArray(global) ? global : [];
  };
  const [visibilityOptions, setVisibilityOptions] = useState([]);
  const [modelOptions, setModelOptions] = useState([]);
  const [pricingOptions, setPricingOptions] = useState([]);
  const [socialHandleOptions, setSocialHandleOptions] = useState([]);
  const [displayTypeOptions, setDisplayTypeOptions] = useState([]);
  const [signupLevelOptions, setSignupLevelOptions] = useState([]);
  const [businessFieldOptions, setBusinessFieldOptions] = useState([]);
  const [signupLevels, setSignupLevels] = useState([]); // array of level names
  const [signupLevelDetails, setSignupLevelDetails] = useState({}); // { [levelName]: { sequence: number, businessField: string } }
const addColorScheme = () => {
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
};
const updateColorScheme = (index, key, value) => {
  const updated = [...colorSchemes];
  updated[index][key] = value;
  setColorSchemes(updated);
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
      setInventoryLabelName(initialData.inventoryLabelName || "");
      setLinkedAttributes(
        initialData.linkedAttributes && typeof initialData.linkedAttributes === 'object'
          ? initialData.linkedAttributes
          : {}
      );
      setIncludeLeafChildren(Boolean(initialData?.uiRules?.includeLeafChildren ?? true));
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
      setInventoryLabelName("");
      setLinkedAttributes({});
      setIncludeLeafChildren(true);
    }
  }, [show, initialData, parentId, parentCategoryType, parentEnableFreeText]);
  useEffect(() => {
    if (!show) return;
    const base = "http://localhost:5000/api/masters";
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
      if (initialData) {
        setCategoryVisibility(Array.isArray(initialData.categoryVisibility) ? initialData.categoryVisibility : initialData.categoryVisibility ? [initialData.categoryVisibility] : []);
        setCategoryModel(Array.isArray(initialData.categoryModel) ? initialData.categoryModel : initialData.categoryModel ? [initialData.categoryModel] : []);
        setCategoryPricing(Array.isArray(initialData.categoryPricing) ? initialData.categoryPricing : initialData.categoryPricing ? [initialData.categoryPricing] : []);
        setSocialHandle(Array.isArray(initialData.socialHandle) ? initialData.socialHandle : initialData.socialHandle ? [initialData.socialHandle] : []);
        setDisplayType(Array.isArray(initialData.displayType) ? initialData.displayType : initialData.displayType ? [initialData.displayType] : []);
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
      }
    })();
  }, [show, initialData]);
  useEffect(() => {
    if (!showInventoryLabelPopup) return;
    // Determine which family is relevant: a type for which 'model' heading is selected
    const masters = Array.isArray(allMasters) ? allMasters : [];
    const typeSet = new Set(masters.map((m) => (m.type || "").toString().trim()).filter(Boolean));
    const candidateFamilies = Object.keys(linkedAttributes || {}).filter((k) => typeSet.has(k));
    const fam = candidateFamilies.find((k) => Array.isArray(linkedAttributes[k]) && linkedAttributes[k].map((x)=>String(x).toLowerCase()).includes('model')) || null;
    setInventoryFamilyKey(fam || null);
    setSelectedBrandForInventory("");
    setSelectedTransmissionForInventory("");
    (async () => {
      if (!fam) { setInventoryBrands([]); setInventoryTransmissions([]); return; }
      const models = await fetchModelsForFamily(fam) || modelsByFamily[fam] || [];
      // Selected model subfields determine which fields to show
      const selectedModelFields = getSelectedModelFields(fam);
      // Try to infer brand/transmission fields from selectedModelFields
      const lc = (s)=>String(s||'').toLowerCase();
      const brandField = selectedModelFields.find((f)=>/brand/.test(lc(f))) || selectedModelFields[0] || '';
      const modelField = selectedModelFields.find((f)=>/model/.test(lc(f))) || selectedModelFields.find((f)=>/name/.test(lc(f))) || '';
      const variantField = selectedModelFields.find((f)=>/variant/.test(lc(f))) || '';
      const transmissionField = selectedModelFields.find((f)=>/trans/.test(lc(f)) || /gear/.test(lc(f))) || '';
      if (!brandField || !transmissionField) { setInventoryBrands([]); setInventoryTransmissions([]); return; }
      // Build unique brands from API data
      const uniq = new Set();
      models.forEach((m)=>{
        const raw = m.raw || m;
        const b = raw?.[brandField];
        if (b != null && b !== '') uniq.add(String(b));
      });
      const brands = Array.from(uniq);
      setInventoryBrands(brands);
      // Build model list and variant list for the first brand
      if (brands.length > 0) {
        const first = brands[0];
        setSelectedBrandForInventory((prev)=>prev || first);
        const modelSet = new Set();
        models.forEach((m)=>{
          const raw = m.raw || m;
          if (String(raw?.[brandField]) === String(first)) {
            const mdl = raw?.[modelField];
            if (mdl != null && mdl !== '') modelSet.add(String(mdl));
          }
        });
        const modelsList = Array.from(modelSet);
        setInventoryModelsList(modelsList);
        // set model default
        if (modelsList.length > 0) setSelectedModelForInventory((prev)=>prev || modelsList[0]);
        // Compute variants for the selected model
        const varSet = new Set();
        models.forEach((m)=>{
          const raw = m.raw || m;
          if (String(raw?.[brandField]) === String(first) && (!selectedModelForInventory || String(raw?.[modelField])===String(modelsList[0]))) {
            const v = raw?.[variantField];
            if (v != null && v !== '') varSet.add(String(v));
          }
        });
        const variantsList = Array.from(varSet);
        setInventoryVariantsList(variantsList);
        if (variantsList.length > 0) setSelectedVariantForInventory((prev)=>prev || variantsList[0]);
        // Compute transmissions for the brand+model+variant context
        const tset = new Set();
        models.forEach((m)=>{
          const raw = m.raw || m;
          if (String(raw?.[brandField]) === String(first)
              && (!modelsList.length || String(raw?.[modelField]) === String(modelsList[0]))
              && (!variantsList.length || String(raw?.[variantField]) === String(variantsList[0]))
          ) {
            const t = raw?.[transmissionField];
            if (t != null && t !== '') tset.add(String(t));
          }
        });
        setInventoryTransmissions(Array.from(tset));
      } else {
        setInventoryTransmissions([]);
      }
    })();
  }, [showInventoryLabelPopup]);
  useEffect(() => {
    // Update transmissions when selected brand changes
    if (!showInventoryLabelPopup) return;
    const fam = inventoryFamilyKey;
    if (!fam) { setInventoryTransmissions([]); return; }
    const models = modelsByFamily[fam] || [];
    const selectedModelFields = getSelectedModelFields(fam);
    const lc = (s)=>String(s||'').toLowerCase();
    const brandField = selectedModelFields.find((f)=>/brand/.test(lc(f))) || selectedModelFields[0] || '';
    const modelField = selectedModelFields.find((f)=>/model/.test(lc(f))) || selectedModelFields.find((f)=>/name/.test(lc(f))) || '';
    const variantField = selectedModelFields.find((f)=>/variant/.test(lc(f))) || '';
    const transmissionField = selectedModelFields.find((f)=>/trans/.test(lc(f)) || /gear/.test(lc(f))) || '';
    if (!brandField || !transmissionField || !selectedBrandForInventory) { setInventoryTransmissions([]); setInventoryModelsList([]); setInventoryVariantsList([]); return; }
    const modelSet = new Set();
    models.forEach((m)=>{
      const raw = m.raw || m;
      if (String(raw?.[brandField]) === String(selectedBrandForInventory)) {
        const mdl = raw?.[modelField];
        if (mdl != null && mdl !== '') modelSet.add(String(mdl));
      }
    });
    const modelsList = Array.from(modelSet);
    setInventoryModelsList(modelsList);
    // Reset model/variant/transmission when brand changes
    setSelectedModelForInventory(modelsList[0] || "");
    setSelectedVariantForInventory("");
    setSelectedTransmissionForInventory("");
    // Also recompute variants and transmissions for first model
    const varSet = new Set();
    models.forEach((m)=>{
      const raw = m.raw || m;
      if (String(raw?.[brandField]) === String(selectedBrandForInventory) && (!modelsList.length || String(raw?.[modelField]) === String(modelsList[0]))) {
        const v = raw?.[variantField];
        if (v != null && v !== '') varSet.add(String(v));
      }
    });
    const variantsList = Array.from(varSet);
    setInventoryVariantsList(variantsList);
    const tset = new Set();
    models.forEach((m)=>{
      const raw = m.raw || m;
      if (String(raw?.[brandField]) === String(selectedBrandForInventory)
          && (!modelsList.length || String(raw?.[modelField]) === String(modelsList[0]))
          && (!variantsList.length || String(raw?.[variantField]) === String(variantsList[0]))
      ) {
        const t = raw?.[transmissionField];
        if (t != null && t !== '') tset.add(String(t));
      }
    });
    setInventoryTransmissions(Array.from(tset));
  }, [showInventoryLabelPopup, inventoryFamilyKey, selectedBrandForInventory]);
  useEffect(() => {
    // When model or variant changes, recompute variant list and transmissions
    if (!showInventoryLabelPopup) return;
    const fam = inventoryFamilyKey;
    if (!fam) return;
    const models = modelsByFamily[fam] || [];
    const selectedModelFields = Array.isArray(linkedAttributes['model']) ? linkedAttributes['model'] : [];
    const lc = (s)=>String(s||'').toLowerCase();
    const brandField = selectedModelFields.find((f)=>/brand/.test(lc(f))) || selectedModelFields[0] || '';
    const modelField = selectedModelFields.find((f)=>/model/.test(lc(f))) || selectedModelFields.find((f)=>/name/.test(lc(f))) || '';
    const variantField = selectedModelFields.find((f)=>/variant/.test(lc(f))) || '';
    const transmissionField = selectedModelFields.find((f)=>/trans/.test(lc(f)) || /gear/.test(lc(f))) || '';
    if (!brandField || !transmissionField || !selectedBrandForInventory) return;
    // Recompute variants for brand + model
    const varSet = new Set();
    models.forEach((m)=>{
      const raw = m.raw || m;
      if (String(raw?.[brandField]) === String(selectedBrandForInventory)
          && (!selectedModelForInventory || String(raw?.[modelField]) === String(selectedModelForInventory))) {
        const v = raw?.[variantField];
        if (v != null && v !== '') varSet.add(String(v));
      }
    });
    const variantsList = Array.from(varSet);
    setInventoryVariantsList(variantsList);
    if (variantsList.length > 0 && !variantsList.includes(selectedVariantForInventory)) {
      setSelectedVariantForInventory(variantsList[0]);
    }
    // Recompute transmissions for brand + model + variant
    const tset = new Set();
    models.forEach((m)=>{
      const raw = m.raw || m;
      if (String(raw?.[brandField]) === String(selectedBrandForInventory)
          && (!selectedModelForInventory || String(raw?.[modelField]) === String(selectedModelForInventory))
          && (!selectedVariantForInventory || String(raw?.[variantField]) === String(selectedVariantForInventory))
      ) {
        const t = raw?.[transmissionField];
        if (t != null && t !== '') tset.add(String(t));
      }
    });
    const tx = Array.from(tset);
    setInventoryTransmissions(tx);
    if (tx.length > 0 && !tx.includes(selectedTransmissionForInventory)) setSelectedTransmissionForInventory(tx[0]);
  }, [showInventoryLabelPopup, inventoryFamilyKey, selectedBrandForInventory, selectedModelForInventory, selectedVariantForInventory]);

  // Handle 'Link with subcategories' button clicks
  useEffect(() => {
    const handler = async (e) => {
      try {
        const key = e?.detail?.key || "";
        if (!key) return;
        // proceed silently only if category id exists
        if (!(initialData && initialData._id)) return;
        setSubcatKey(String(key));
        // Preselect currently linked id if present
        const lk = `${String(key)}:linkedSubcategory`;
        const curr = Array.isArray(linkedAttributes?.[lk]) ? String(linkedAttributes[lk][0] || '') : '';
        setSelectedSubcategoryId(curr || 'ALL');
        setSubcategoryNameById((prev)=> ({ ...prev, ALL: 'All' }));
        setShowSubcatSelector(true);
        // fetch first-level subcategories for current category
        const url = `http://localhost:5000/api/categories?parentId=${encodeURIComponent(initialData._id)}`;
        const res = await fetch(url);
        const data = res.ok ? await res.json() : [];
        const arr = Array.isArray(data) ? data : [];
        setSubcategories(arr);
        // cache names for UI display
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

  const handleDeleteSubcategory = async (id) => {
    if (!id) return;
    const ok = window.confirm('Delete this subcategory?');
    if (!ok) return;
    try {
      const res = await fetch(`http://localhost:5000/api/categories/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSubcategories((prev) => prev.filter((c) => String(c._id) !== String(id)));
        if (String(selectedSubcategoryId) === String(id)) setSelectedSubcategoryId("");
      }
    } catch {}
  };

  const handleEditSubcategory = async (id) => {
    if (!id) return;
    try {
      // try to get current name
      let currName = subcategoryNameById[String(id)];
      if (!currName) {
        try {
          const r = await fetch(`http://localhost:5000/api/categories/${id}`);
          const j = r.ok ? await r.json() : null;
          currName = j?.name || String(id);
        } catch {}
      }
      const nextName = window.prompt('Edit subcategory name:', currName || '');
      if (nextName == null) return; // cancelled
      const trimmed = String(nextName).trim();
      if (!trimmed) return;
      const payload = new FormData();
      payload.append('name', trimmed);
      const res = await fetch(`http://localhost:5000/api/categories/${id}`, { method: 'PUT', body: payload });
      if (res.ok) {
        // update local caches
        setSubcategoryNameById((prev)=> ({ ...prev, [String(id)]: trimmed }));
        setSubcategories((prev)=> prev.map((c)=> String(c._id)===String(id) ? { ...c, name: trimmed } : c));
      } else {
        let msg = 'Failed to update subcategory';
        try { const j = await res.json(); if (j && j.message) msg = j.message; } catch {}
        alert(msg);
      }
    } catch (e) {
      alert('Error updating subcategory');
    }
  };

  const handleUnlinkSubcategory = async (contextKey) => {
    const lk = `${String(contextKey)}:linkedSubcategory`;
    const next = { ...linkedAttributes };
    delete next[lk];
    setLinkedAttributes(next);
    try {
      if (initialData && initialData._id) {
        const payload = new FormData();
        payload.append('linkedAttributes', JSON.stringify(next || {}));
        await fetch(`http://localhost:5000/api/categories/${initialData._id}`, { method: 'PUT', body: payload });
      }
    } catch {}
  };

  const handleSaveSubcategoryLink = async () => {
    const id = String(selectedSubcategoryId || '').trim();
    if (!id) return;
    const key = `${subcatKey}:linkedSubcategory`;
    const next = { ...linkedAttributes, [key]: [id] };
    setLinkedAttributes(next);
    // ensure name cache has entry
    setSubcategoryNameById((prev)=> ({ ...prev, [id]: prev[id] || (subcategories.find((s)=>String(s._id)===id)?.name || id) }));
    try {
      if (initialData && initialData._id) {
        const payload = new FormData();
        payload.append('linkedAttributes', JSON.stringify(next || {}));
        await fetch(`http://localhost:5000/api/categories/${initialData._id}`, { method: 'PUT', body: payload });
      }
    } catch {}
    setShowSubcatSelector(false);
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
      formData.append("availableForCart", availableForCart); // don't force false for parentId
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
      try {
        formData.append("uiRules", JSON.stringify({ includeLeafChildren: !!includeLeafChildren }));
      } catch {
        formData.append("uiRules", JSON.stringify({ includeLeafChildren: true }));
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
      let url = "http://localhost:5000/api/categories";
      let method = "POST";
      if (initialData && initialData._id) {
        url += `/${initialData._id}`;
        method = "PUT";
      }
      const res = await fetch(url, { method, body: formData });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to save category");
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
      setIncludeLeafChildren(true);
      setSeoKeywords("");
      setPostRequestsDeals(false);
      setLoyaltyPoints(false);
      setLinkAttributesPricing(false);
      setFreeTexts(Array(10).fill(""));
      try {
        const saved = await res.json().catch(() => null);
        const savedId = (saved && (saved._id || saved.id)) || (initialData && initialData._id) || null;
        if (savedId) {
          window.dispatchEvent(new CustomEvent('categorySaved', { detail: { categoryId: String(savedId) } }));
        }
      } catch (e) {
        // ignore
      }

      setInventoryLabelName("");
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
            ? "✏️ Edit Category"
            : parentId
            ? "📁 Create Subcategory"
            : "🗂️ Create Category"}
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
          {initialData?.image && !image && (
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
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#444' }}>
                <input
                  type="checkbox"
                  checked={includeLeafChildren}
                  onChange={(e) => setIncludeLeafChildren(e.target.checked)}
                />
                Include children of selected item inside card
              </label>
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
              <ChipSelect
                label="Set Display Types"
                options={displayTypeOptions}
                value={displayType}
                onChange={setDisplayType}
                placeholder="Select"
                multi
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
            onChange={(e) => updateColorScheme(index, "name", e.target.value)}
            style={{ ...inputStyle, padding: "6px" }}
          />
          {["primary", "accent", "background", "cardBg", "text"].map((key) => (
            <input
              key={key}
              type="color"
              value={scheme[key]}
              onChange={(e) => updateColorScheme(index, key, e.target.value)}
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
      onClick={addColorScheme}
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
    disabled={parentId ? !parentEnableFreeText : false} // Subcategory respects parentEnableFreeText
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
                      // open master selector so user can choose attributes
                      setSelectedMasterIndex(0);
                      setShowMasterSelector(true);
                    } else {
                      // clear any previously selected linked attributes
                      setLinkedAttributes({});
                      try {
                        if (initialData && initialData._id) {
                          const payload = new FormData();
                          payload.append('linkedAttributes', JSON.stringify({}));
                          payload.append('linkAttributesPricing', 'false');
                          fetch(`http://localhost:5000/api/categories/${initialData._id}`, { method: 'PUT', body: payload });
                        }
                      } catch {}
                    }
                  }}
                />
                Link Attributes for Pricing
              </label>
              {linkAttributesPricing && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => { setSelectedMasterIndex(0); setShowMasterSelector(true); }}
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
  <div style={{ position: "fixed", inset: 0, zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)" }}>
    <div style={{ background: "#fff", borderRadius: 12, width: 800, maxWidth: "95vw", maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 14, borderBottom: "1px solid #eee", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 style={{ margin: 0, color: "#0078d7" }}>Link Attributes for Pricing</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setShowMasterSelector(false)} style={cancelBtnStyle}>Close</button>
          <button
            type="button"
            onClick={async () => {
              setLinkedAttributes({});
              try {
                if (initialData && initialData._id) {
                  const payload = new FormData();
                  payload.append('linkedAttributes', JSON.stringify({}));
                  await fetch(`http://localhost:5000/api/categories/${initialData._id}`, { method: 'PUT', body: payload });
                }
              } catch {}
            }}
            style={{ ...cancelBtnStyle, background: "#ef4444" }}
          >
            Clear
          </button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 0, minHeight: 420 }}>
        <div style={{ borderRight: "1px solid #eee", overflowY: "auto" }}>
          {(() => {
            const masters = Array.isArray(allMasters) ? allMasters : [];
            const titleCase = (key) => key
              .replace(/([A-Z])/g, ' $1')
              .replace(/[-_]/g, ' ')
              .replace(/^\s+|\s+$/g, '')
              .split(' ')
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' ');
            // Build families purely from API data: type => set of fieldTypes
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
            const familyItems = Array.from(byFamily.keys()).map((fam) => ({ _id: `family:${fam}`, name: titleCase(fam), __mode: 'family', key: fam }));
            // Other datasets: distinct types that have no fieldType entries
            const typesWithFieldTypes = new Set(byFamily.keys());
            const otherTypesSet = new Set();
            masters.forEach((m) => {
              const t = (m.type || '').toString().trim();
              const ft = (m.fieldType || '').toString().trim();
              if (t && !ft && !typesWithFieldTypes.has(t)) otherTypesSet.add(t);
            });
            const otherItems = Array.from(otherTypesSet).map((t) => ({ _id: `type:${t}`, name: titleCase(t), __mode: 'type', key: t }));
            const items = [...familyItems, ...otherItems];
            if (items.length === 0) return <div style={{ padding: 10, color: '#64748b' }}>No data found.</div>;
                return items.map((m, idx) => {
                  const isSelected = linkedAttributes && linkedAttributes[m.key];
                  const isClicked = selectedMasterIndex === idx;
                  const isSaved = initialData && initialData.linkedAttributes && initialData.linkedAttributes[m.key];
                  return (
                    <div
                      key={m._id}
                      onClick={() => {
                        setSelectedMasterIndex(idx);
                        const famKey = m.key;
                        fetchModelsForFamily(famKey).catch(() => {});
                      }}
                      style={{
                        padding: 10,
                        cursor: 'pointer',
                        background: isClicked ? '#e8f2ff' : '#fff',
                        color: isClicked ? '#0f69c9' : '#333',
                        borderBottom: '1px solid #f3f4f6',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span style={{ flex: 1 }}>{m.name}</span>
                      {isSaved && (
                        <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 10, background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>Saved</span>
                      )}
                    </div>
                  );
                });
          })()}
        </div>

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
            // Rebuild same structures as left
            const byFamily = new Map();
            const typeOnlyCounts = new Map();
            masters.forEach((m) => {
              const fam = (m.type || '').toString().trim();
              const ft = (m.fieldType || '').toString().trim();
              if (fam && ft) {
                if (!byFamily.has(fam)) byFamily.set(fam, new Set());
                byFamily.get(fam).add(ft);
              }
              if (fam && !ft) typeOnlyCounts.set(fam, (typeOnlyCounts.get(fam) || 0) + 1);
            });
            const familyItems = Array.from(byFamily.keys()).map((fam) => ({ 
              _id: `family:${fam}`, 
              name: titleCase(fam), 
              __mode: 'family', 
              key: fam.toString().trim()  // ensure consistent key format
            }));
            const otherItems = Array.from(typeOnlyCounts.keys())
              .filter((t) => !byFamily.has(t))
              .map((t) => ({ 
                _id: `type:${t}`, 
                name: titleCase(t), 
                __mode: 'type', 
                key: t.toString().trim()  // ensure consistent key format
              }));
            const categories = [...familyItems, ...otherItems];
            const sel = categories.length > 0 ? categories[Math.min(selectedMasterIndex ?? 0, categories.length - 1)] : null;
            if (!sel) return <div style={{ padding: 10, color: '#64748b' }}>Select a dataset.</div>;

            if (sel.__mode === 'family') {
              // Special-case businessField family: show item names (e.g., 'state') instead of field types
              if (sel.key === 'businessField') {
                const items = masters.filter((m) => (m.type || '').toString().trim() === 'businessField');
                if (items.length === 0) return <div style={{ padding: 10, color: '#64748b' }}>No business fields found.</div>;
                const selectedForType = linkedAttributes['businessField'] || [];
                const familyKey = sel.key;
                return (
                  <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).map((c) => {
                      const isChecked = selectedForType.includes(c.name);
                      return (
                        <label key={String(c._id) || c.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: '1px dashed #f1f5f9' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setLinkedAttributes((prev) => {
                                const prevArr = Array.isArray(prev['businessField']) ? prev['businessField'] : [];
                                const nextArr = checked
                                  ? Array.from(new Set([...prevArr, c.name]))
                                  : prevArr.filter((x) => x !== c.name);
                                const next = { ...prev };
                                if (nextArr.length === 0) delete next['businessField'];
                                else next['businessField'] = nextArr;
                                return next;
                              });
                            }}
                          />
                          <span>{c.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                  {(() => {
                    const key = `${familyKey}:inventoryLabels`;
                    const labels = Array.isArray(linkedAttributes[key]) ? linkedAttributes[key] : [];
                    const current = labels[0] || '';
                    const editing = !!invLabelEditing[key];
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>Inventory Label</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {current && !editing ? (
                            <>
                              <span style={{ padding: '6px 10px', border: '1px solid #dbeafe', background: '#f1f5ff', borderRadius: 16 }}>{current}</span>
                              <button type="button" onClick={() => { setInvLabelInputs((p)=>({ ...p, [key]: current })); setInvLabelEditing((p)=>({ ...p, [key]: true })); }}
                                style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff' }}>✎</button>
                              <button type="button" onClick={() => {
                                setLinkedAttributes((prev)=>{ const next={...prev}; delete next[key]; return next; });
                                setInvLabelInputs((p)=>({ ...p, [key]: '' }));
                                setInvLabelEditing((p)=>{ const n={...p}; delete n[key]; return n; });
                              }}
                                style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #fecaca', background: '#fee2e2', color: '#ef4444' }}>×</button>
                            </>
                          ) : (
                            <>
                              <input
                                type="text"
                                value={invLabelInputs[key] ?? (editing ? current : '')}
                                onChange={(e)=> setInvLabelInputs((p)=>({ ...p, [key]: e.target.value }))}
                                placeholder={current ? 'Edit label' : 'Add Inventory Label Name'}
                                style={{ padding: '8px 10px', border: '1px solid #cbd5e1', background: '#f8fafc', borderRadius: 8 }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const val = String(invLabelInputs[key] || '').trim();
                                  if (!val) return;
                                  setLinkedAttributes((prev)=> ({ ...prev, [key]: [val] }));
                                  setInvLabelInputs((p)=>({ ...p, [key]: '' }));
                                  setInvLabelEditing((p)=>{ const n={...p}; delete n[key]; return n; });
                                }}
                                style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#0ea5e9', color: '#fff', fontSize: 12, fontWeight: 600 }}
                              >
                                {editing ? 'Save' : 'Add'}
                              </button>
                              {editing ? (
                                <button type="button" onClick={() => { setInvLabelEditing((p)=>{ const n={...p}; delete n[key]; return n; }); setInvLabelInputs((p)=>({ ...p, [key]: '' })); }}
                                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff' }}>Cancel</button>
                              ) : null}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  <div style={{ marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const k = `${familyKey}:inventoryLabels`;
                        window.dispatchEvent(new CustomEvent('linkWithSubcategories', { detail: { key: k } }));
                      }}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 600 }}
                    >
                      Link with subcategories
                    </button>
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
                </>
                );
              }

              // Data-driven families: derive headings from masters and include 'model' if models API returns entries
              const familyKey = sel.key;
              const normFam = String(familyKey || '').toLowerCase().trim();
              const typeKeysSet = new Set();
              masters.forEach((m) => {
                const t = (m.type || m.category || '').toString().trim().toLowerCase();
                const ft = (m.fieldType || '').toString().trim();
                if (!ft) return;
                if (t === normFam || t === familyKey.toString().trim().toLowerCase()) typeKeysSet.add(ft);
              });
              let fieldTypes = Array.from(typeKeysSet);
              const canonicalModels = familyKey ? modelsByFamily[familyKey] : null;
              if (canonicalModels && canonicalModels.length && !fieldTypes.some((h) => h.toLowerCase() === 'model')) {
                fieldTypes = ['model', ...fieldTypes];
              }
              const titleCase = (key) => key
                .replace(/([A-Z])/g, ' $1')
                .replace(/[-_]/g, ' ')
                .replace(/^\s+|\s+$/g, '')
                .split(' ')
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');
              const selectedHeadings = Array.isArray(linkedAttributes[familyKey]) ? linkedAttributes[familyKey] : [];
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Attributes</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                    {fieldTypes.map((h) => {
                      const checked = selectedHeadings.includes(h);
                      // compute model subfields dynamically
                      let modelSubfields = [];
                      if (String(h).toLowerCase() === 'model' && canonicalModels && canonicalModels.length) {
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
                      const selectedModelFields = getSelectedModelFields(familyKey);
                      return (
                        <div key={h} style={{ display: 'flex', flexDirection: 'column', minWidth: 220, gap: 6 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const on = e.target.checked;
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
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                    {(() => {
                      const key = `${familyKey}:inventoryLabels`;
                      const labels = Array.isArray(linkedAttributes[key]) ? linkedAttributes[key] : [];
                      const current = labels[0] || '';
                      const editing = !!invLabelEditing[key];
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>Inventory Label</div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {current && !editing ? (
                              <>
                                <span style={{ padding: '6px 10px', border: '1px solid #dbeafe', background: '#f1f5ff', borderRadius: 16 }}>{current}</span>
                                <button type="button" onClick={() => { setInvLabelInputs((p)=>({ ...p, [key]: current })); setInvLabelEditing((p)=>({ ...p, [key]: true })); }}
                                  style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff' }}>✎</button>
                                <button type="button" onClick={() => {
                                  setLinkedAttributes((prev)=>{ const next={...prev}; delete next[key]; return next; });
                                  setInvLabelInputs((p)=>({ ...p, [key]: '' }));
                                  setInvLabelEditing((p)=>{ const n={...p}; delete n[key]; return n; });
                                }}
                                  style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #fecaca', background: '#fee2e2', color: '#ef4444' }}>×</button>
                              </>
                            ) : (
                              <>
                                <input
                                  type="text"
                                  value={invLabelInputs[key] ?? (editing ? current : '')}
                                  onChange={(e)=> setInvLabelInputs((p)=>({ ...p, [key]: e.target.value }))}
                                  placeholder={current ? 'Edit label' : 'Add Inventory Label Name'}
                                  style={{ padding: '8px 10px', border: '1px solid #cbd5e1', background: '#f8fafc', borderRadius: 8 }}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const val = String(invLabelInputs[key] || '').trim();
                                    if (!val) return;
                                    setLinkedAttributes((prev)=> ({ ...prev, [key]: [val] }));
                                    setInvLabelInputs((p)=>({ ...p, [key]: '' }));
                                    setInvLabelEditing((p)=>{ const n={...p}; delete n[key]; return n; });
                                  }}
                                  style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#0ea5e9', color: '#fff', fontSize: 12, fontWeight: 600 }}
                                >
                                  {editing ? 'Save' : 'Add'}
                                </button>
                                {editing ? (
                                  <button type="button" onClick={() => { setInvLabelEditing((p)=>{ const n={...p}; delete n[key]; return n; }); setInvLabelInputs((p)=>({ ...p, [key]: '' })); }}
                                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff' }}>Cancel</button>
                                ) : null}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    <div style={{ marginTop: 6 }}>
                      <button
                        type="button"
                        onClick={() => {
                          const k = `${familyKey}:inventoryLabels`;
                          window.dispatchEvent(new CustomEvent('linkWithSubcategories', { detail: { key: k } }));
                        }}
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 600 }}
                      >
                        Link with subcategories
                      </button>
                      {(() => {
                        const lk = `${familyKey}:inventoryLabels:linkedSubcategory`;
                        const id = Array.isArray(linkedAttributes[lk]) ? linkedAttributes[lk][0] : '';
                        if (!id) return null;
                        const nm = subcategoryNameById[String(id)] || String(id);
                        return (
                          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ padding: '4px 8px', borderRadius: 14, background: '#eef6ff', border: '1px solid #cce4ff', color: '#0f69c9' }}>{nm}</span>
                            <button type="button" onClick={() => handleEditSubcategory(id)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff' }}>✎</button>
                            <button type="button" onClick={() => handleUnlinkSubcategory(`${familyKey}:inventoryLabels`)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #fecaca', background: '#fee2e2', color: '#ef4444' }}>🗑</button>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            }

            // If a non-family type was clicked, show its items
            const children = masters.filter(
              (c) => (c.type || '').toString().trim() === sel.key && !((c.fieldType || '').toString().trim())
            );
            const selected = linkedAttributes[sel.key] || [];
            return (
              <div>
                <div style={{ marginBottom: 8, color: '#475569' }}>
                  Select one or more items under {titleCase(sel.key)}
                </div>
                <div>
                  {children
                    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
                    .map((c) => {
                      const isChecked = selected.includes(c.name);
                      const optKey = `${sel.key}:${c.name}`;
                      const selectedOpts = Array.isArray(linkedAttributes[optKey]) ? linkedAttributes[optKey] : [];
                      return (
                        <div
                          key={String(c._id) || c.name}
                          style={{
                            padding: '6px 4px',
                            borderBottom: '1px dashed #f1f5f9',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                          }}
                        >
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const on = e.target.checked;
                                setLinkedAttributes((prev) => {
                                  const prevArr = Array.isArray(prev[sel.key]) ? prev[sel.key] : [];
                                  const nextArr = on
                                    ? Array.from(new Set([...prevArr, c.name]))
                                    : prevArr.filter((x) => x !== c.name);
                                  const next = { ...prev };
                                  if (nextArr.length === 0) delete next[sel.key];
                                  else next[sel.key] = nextArr;
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
                                          const nextArr = on
                                            ? Array.from(new Set([...prevArr, opt]))
                                            : prevArr.filter((x) => x !== opt);
                                          const next = { ...prev };
                                          if (nextArr.length === 0) delete next[optKey];
                                          else next[optKey] = nextArr;
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
                    const editing = !!invLabelEditing[key];
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>Inventory Label</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {current && !editing ? (
                            <>
                              <span style={{ padding: '6px 10px', border: '1px solid #dbeafe', background: '#f1f5ff', borderRadius: 16 }}>{current}</span>
                              <button type="button" onClick={() => { setInvLabelInputs((p)=>({ ...p, [key]: current })); setInvLabelEditing((p)=>({ ...p, [key]: true })); }}
                                style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff' }}>✎</button>
                              <button type="button" onClick={() => {
                                setLinkedAttributes((prev)=>{ const next={...prev}; delete next[key]; return next; });
                                setInvLabelInputs((p)=>({ ...p, [key]: '' }));
                                setInvLabelEditing((p)=>{ const n={...p}; delete n[key]; return n; });
                              }}
                                style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #fecaca', background: '#fee2e2', color: '#ef4444' }}>×</button>
                            </>
                          ) : (
                            <>
                              <input
                                type="text"
                                value={invLabelInputs[key] ?? (editing ? current : '')}
                                onChange={(e)=> setInvLabelInputs((p)=>({ ...p, [key]: e.target.value }))}
                                placeholder={current ? 'Edit label' : 'Add Inventory Label Name'}
                                style={{ padding: '8px 10px', border: '1px solid #cbd5e1', background: '#f8fafc', borderRadius: 8 }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const val = String(invLabelInputs[key] || '').trim();
                                  if (!val) return;
                                  setLinkedAttributes((prev)=> ({ ...prev, [key]: [val] }));
                                  setInvLabelInputs((p)=>({ ...p, [key]: '' }));
                                  setInvLabelEditing((p)=>{ const n={...p}; delete n[key]; return n; });
                                }}
                                style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#0ea5e9', color: '#fff', fontSize: 12, fontWeight: 600 }}
                              >
                                {editing ? 'Save' : 'Add'}
                              </button>
                              {editing ? (
                                <button type="button" onClick={() => { setInvLabelEditing((p)=>{ const n={...p}; delete n[key]; return n; }); setInvLabelInputs((p)=>({ ...p, [key]: '' })); }}
                                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff' }}>Cancel</button>
                              ) : null}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  <div style={{ marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const k = `${sel.key}:inventoryLabels`;
                        window.dispatchEvent(new CustomEvent('linkWithSubcategories', { detail: { key: k } }));
                      }}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 600 }}
                    >
                      Link with subcategories
                    </button>
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
      </div>
      <div style={{ padding: 12, borderTop: "1px solid #eee", display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={async () => {
            try {
              // If editing an existing category, persist linkedAttributes immediately
              if (initialData && initialData._id) {
                const payload = new FormData();
                try {
                  payload.append("linkedAttributes", JSON.stringify(linkedAttributes || {}));
                } catch {
                  payload.append("linkedAttributes", JSON.stringify({}));
                }
                const res = await fetch(`http://localhost:5000/api/categories/${initialData._id}`, {
                  method: "PUT",
                  body: payload,
                });
                if (res.ok) {
                  const saved = await res.json().catch(() => null);
                  const savedId = (saved && (saved._id || saved.id)) || initialData._id;
                  if (savedId) {
                    window.dispatchEvent(new CustomEvent('categorySaved', { detail: { categoryId: String(savedId) } }));
                  }
                }
              }
            } catch (e) {
              // swallow errors to avoid blocking UI; full save will persist anyway
            } finally {
              setShowMasterSelector(false);
            }
          }}
          style={submitBtnStyle}
        >
          Save
        </button>
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
    </div>
  );
}

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

const titleStyle = { marginBottom: "20px", textAlign: "center", color: "#0078d7", fontSize: "1.6rem" };
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
const checkboxLabel = { display: "flex", gap: "10px", alignItems: "center", color: "#444", fontSize: "0.9rem" };
const labelStyle = { fontWeight: "600", color: "#0078d7", marginBottom: "6px" };
const cancelBtnStyle = { flex: 1, padding: "10px", borderRadius: "8px", border: "none", background: "#d9534f", color: "#fff", fontWeight: "600", cursor: "pointer" };
const submitBtnStyle = { flex: 1, padding: "10px", borderRadius: "8px", border: "none", background: "#0078d7", color: "#fff", fontWeight: "600", cursor: "pointer" };

export default CreateCategoryModal;