import { useState, useEffect } from "react";

// Lightweight chip-style select with Select All and clear support
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

  // State for the new dropdowns
  const [categoryVisibility, setCategoryVisibility] = useState([]);
  const [categoryModel, setCategoryModel] = useState([]);
  const [categoryPricing, setCategoryPricing] = useState([]);
  const [socialHandle, setSocialHandle] = useState([]);
  const [displayType, setDisplayType] = useState([]);

  // Using chip-style control; default multi-select behavior (arrays)

  // State for dropdown options
  const [visibilityOptions, setVisibilityOptions] = useState([]);
  const [modelOptions, setModelOptions] = useState([]);
  const [pricingOptions, setPricingOptions] = useState([]);
  const [socialHandleOptions, setSocialHandleOptions] = useState([]);
  const [displayTypeOptions, setDisplayTypeOptions] = useState([]);
  const [signupLevelOptions, setSignupLevelOptions] = useState([]);
  const [businessFieldOptions, setBusinessFieldOptions] = useState([]);

  // Signup Levels selections and per-level details
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

  // Initialize form state
  useEffect(() => {
    if (!show) return;

    if (initialData) {
      // Editing existing category
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
    } else {
      // Creating new category
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
    }
  }, [show, initialData, parentId, parentCategoryType, parentEnableFreeText]);

  // Fetch dropdown options from Master data when modal is shown
  useEffect(() => {
    if (!show) return;
    const base = "http://localhost:5000/api/masters";

    // For resilience, try multiple possible type keys for each dataset
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
          "Manage Category Models",
          "categoryModel",
          "categoryModels",
          "models",
        ],
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
      // Merge and dedupe by name
      const merged = results.flat().filter(Boolean);
      const names = Array.from(
        new Set(
          merged
            .map((m) => (m && typeof m === "object" ? m.name : undefined))
            .filter(Boolean)
        )
      );
      return names;
    };

    (async () => {
      for (const ds of datasets) {
        const names = await fetchByTypes(ds.candidates);
        ds.setter(names);
      }
      if (initialData) {
        setCategoryVisibility(Array.isArray(initialData.categoryVisibility) ? initialData.categoryVisibility : initialData.categoryVisibility ? [initialData.categoryVisibility] : []);
        setCategoryModel(Array.isArray(initialData.categoryModel) ? initialData.categoryModel : initialData.categoryModel ? [initialData.categoryModel] : []);
        setCategoryPricing(Array.isArray(initialData.categoryPricing) ? initialData.categoryPricing : initialData.categoryPricing ? [initialData.categoryPricing] : []);
        setSocialHandle(Array.isArray(initialData.socialHandle) ? initialData.socialHandle : initialData.socialHandle ? [initialData.socialHandle] : []);
        setDisplayType(Array.isArray(initialData.displayType) ? initialData.displayType : initialData.displayType ? [initialData.displayType] : []);
        // Initialize signup levels if present
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
      if (!parentId) {
  formData.append("colorSchemes", JSON.stringify(colorSchemes));
}

      // Append dropdown values
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

      // Reset after success
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
          {/* Sequence number for subcategories */}
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

          {/* Category/Subcategory Name */}
          <input
            type="text"
            placeholder={parentId ? "Enter Subcategory Name" : "Enter Category Name"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ ...inputStyle, fontWeight: "600", color: "#0078d7" }}
          />

          {/* Upload Image */}
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

          {/* Upload Icon */}
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

          {/* Category Type Radios */}
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

          {/* SEO Keywords */}
          
            <input
              type="text"
              placeholder="Enter SEO Keywords (comma-separated)"
              value={seoKeywords}
              onChange={(e) => setSeoKeywords(e.target.value)}
              style={inputStyle}
            />
          

          {/* Dropdowns from Master Data - only for main categories */}
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
                onChange={setCategoryModel}
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

              {/* Set Signup Levels */}
              <ChipSelect
                label="Set Signup Levels"
                options={signupLevelOptions}
                value={signupLevels}
                onChange={(vals) => {
                  setSignupLevels(vals);
                  setSignupLevelDetails((prev) => {
                    const next = { ...prev };
                    // Ensure a details entry exists for each selected level
                    vals.forEach((lvl, i) => {
                      if (!next[lvl]) next[lvl] = { sequence: i + 1, businessField: [] };
                    });
                    // Remove entries for unselected levels
                    Object.keys(next).forEach((k) => {
                      if (!vals.includes(k)) delete next[k];
                    });
                    return next;
                  });
                }}
                placeholder="Select"
                multi
              />

              {/* Per-level details */}
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


          {/* Price & Terms for Subcategory */}
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

          {/* Free Text Inputs */}
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

          {/* Subcategory Free Text */}
{/* Subcategory Info Text - always enabled and separate */}
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

{/* 🎨 Color Schemes Section */}
{/* 🎨 Color Schemes Section - only for main categories */}
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

        {/* Column Headings */}
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

        {/* Input Row */}
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



{/* Subcategory Full Free Text - controlled by parentEnableFreeText */}
{/* Subcategory Full Free Text Checkbox Only */}

{/* Full Free Text Checkbox - works for both category and subcategory */}
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
                  onChange={(e) => setLinkAttributesPricing(e.target.checked)}
                />
                Link Attributes for Pricing
              </label>
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
    </div>
  );
}

// Styles
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