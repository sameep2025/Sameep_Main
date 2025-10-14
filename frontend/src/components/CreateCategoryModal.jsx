import { useState, useEffect } from "react";

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
    // ✅ Editing existing category
    setName(initialData.name || "");
    setImage(null); // clear any previous File object
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

    // ✅ Initialize saved color schemes from backend
setColorSchemes(
  Array.isArray(initialData.colorSchemes) && initialData.colorSchemes.length > 0
    ? initialData.colorSchemes.map(scheme => ({
        name: scheme.name || "",
        primary: scheme.primary || "#000000",
        accent: scheme.accent || "#ffffff",
        background: scheme.background || "#ffffff",
        cardBg: scheme.cardBg || "#ffffff",
        text: scheme.text || "#000000",
      }))
    : [] // empty array if no saved schemes
);


    // ✅ Use backend freeTexts if available, else 10 blanks
    setFreeTexts(
      Array.isArray(initialData.freeTexts)
        ? initialData.freeTexts
        : Array(10).fill("")
    );
  } else {
    // ✅ Creating new category
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
  }
}, [show, initialData, parentId, parentCategoryType, parentEnableFreeText]);



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
      formData.append("availableForCart", !parentId ? availableForCart : false);
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

      // Reset form
      setName("");
      setImage(null);
      setPrice("");
      setTerms("");
      setVisibleToUser(false);
      setVisibleToVendor(false);
      setSequence(0);
      setFreeText("");
      setEnableFreeText(false);
      setCategoryType("Services");
      setAvailableForCart(false);
      setSeoKeywords("");
      setPostRequestsDeals(false);
      setLoyaltyPoints(false);
      setLinkAttributesPricing(false);
      setFreeTexts(Array(10).fill(""));
      setIcon(null);

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
