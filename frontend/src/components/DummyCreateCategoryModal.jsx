import { useState, useEffect } from "react";

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
  const [linkedAttributes, setLinkedAttributes] = useState({});
  const [inventoryLabelName, setInventoryLabelName] = useState("");
  const [showInventoryLabelPopup, setShowInventoryLabelPopup] = useState(false);
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
const [selectedMasterIndex, setSelectedMasterIndex] = useState(0);

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
    })();
  }, [show]);

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
      let url = "http://localhost:5000/api/dummy-categories";
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
      setSeoKeywords("");
      setPostRequestsDeals(false);
      setLoyaltyPoints(false);
      setLinkAttributesPricing(false);
      setFreeTexts(Array(10).fill(""));
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
                  const hasInventory = arr.includes("Inventory");
                  if (hasInventory && !inventoryLabelName) {
                    setShowInventoryLabelPopup(true);
                  }
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

      {/* Inventory Label Popup */}
      {showInventoryLabelPopup && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 4000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.45)",
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: 20,
              borderRadius: 12,
              width: 360,
            }}
          >
            <h3 style={{ marginTop: 0, color: "#0078d7" }}>
              Inventory Label Name
            </h3>
            <input
              type="text"
              placeholder="Enter Inventory Label Name"
              value={inventoryLabelName}
              onChange={(e) => setInventoryLabelName(e.target.value)}
              style={{ ...inputStyle, marginBottom: 12 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  if (!inventoryLabelName.trim()) {
                    alert(
                      "Please enter a label or press Cancel to deselect Inventory Model."
                    );
                    return;
                  }
                  setShowInventoryLabelPopup(false);
                }}
                style={{ ...submitBtnStyle, flex: 1 }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setCategoryModel((prev) =>
                    Array.isArray(prev)
                      ? prev.filter((p) => p !== "Inventory Model")
                      : []
                  );
                  setInventoryLabelName("");
                  setShowInventoryLabelPopup(false);
                }}
                style={{ ...cancelBtnStyle, flex: 1 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
                  const typesWithFieldTypes = new Set(byFamily.keys());
                  const otherTypesSet = new Set();
                  masters.forEach((m) => {
                    const t = (m.type || "").toString().trim();
                    const ft = (m.fieldType || "").toString().trim();
                    if (t && !ft && !typesWithFieldTypes.has(t)) otherTypesSet.add(t);
                  });
                  const otherItems = Array.from(otherTypesSet).map((t) => ({
                    _id: `type:${t}`,
                    name: titleCase(t),
                    __mode: "type",
                    key: t,
                  }));
                  const items = [...familyItems, ...otherItems];
                  if (items.length === 0)
                    return (
                      <div style={{ padding: 10, color: "#64748b" }}>
                        No data found.
                      </div>
                    );
                  return items.map((m, idx) => (
                    <div
                      key={m._id}
                      onClick={() => {
                        setSelectedMasterIndex(idx);
                      }}
                      style={{
                        padding: 10,
                        cursor: "pointer",
                        background:
                          selectedMasterIndex === idx ? "#e8f2ff" : "#fff",
                        color:
                          selectedMasterIndex === idx ? "#0f69c9" : "#333",
                        borderBottom: "1px solid #f3f4f6",
                      }}
                    >
                      {m.name}
                    </div>
                  ));
                })()}
              </div>

              {/* Right panel: Items and linked attributes */}
              <div style={{ overflowY: "auto", padding: 10 }}>
                {/* The detailed attribute UI would be here, omitted for brevity */}
                {/* You can replicate the logic from CreateCategoryModal's master selector */}
                <div>Configure linked attributes here...</div>
              </div>
            </div>
            <div
              style={{
                padding: 12,
                borderTop: "1px solid #eee",
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={() => setShowMasterSelector(false)}
                style={submitBtnStyle}
              >
                Save
              </button>
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