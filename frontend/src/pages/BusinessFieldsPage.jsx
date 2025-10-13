import { useState, useEffect } from "react";
import axios from "axios";

// Card component
// Card component
function BusinessFieldCard({ field, onEdit, onDelete }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        position: "relative",
        background: "#fff",
        width: 240,
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        display: "flex",
        flexDirection: "column",
        gap: 8, // better spacing between elements
        minHeight: 120,
        boxSizing: "border-box",
      }}
    >
      {/* Edit/Delete icons */}
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "flex",
          gap: 8, // add more spacing between icons
        }}
      >
        <span
          style={{
            cursor: "pointer",
            color: "#00AEEF",
            fontSize: 16,
            lineHeight: 1,
          }}
          onClick={() => onEdit(field)}
        >
          ✏️
        </span>
        <span
          style={{
            cursor: "pointer",
            color: "red",
            fontSize: 16,
            lineHeight: 1,
          }}
          onClick={() => onDelete(field)}
        >
          🗑️
        </span>
      </div>

      {/* Name */}
      <h4
        style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 600,
          color: "#111",
          wordBreak: "break-word",
        }}
      >
        {field.name}
      </h4>

      {/* Field Type */}
      <span style={{ fontSize: 12, color: "#555" }}>Type: {field.fieldType}</span>

      {/* Options */}
      {["select", "radio", "checkbox"].includes(field.fieldType) &&
        field.options?.length > 0 && (
          <div
            style={{
              fontSize: 12,
              color: "#777",
              marginTop: 4,
              wordBreak: "break-word",
            }}
          >
            Options: {field.options.join(", ")}
          </div>
      )}
    </div>
  );
}


// Modal for Add/Edit
function BusinessFieldModal({ show, onClose, onSave, initialData }) {
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState("");
  const [options, setOptions] = useState("");
  const [autoCalc, setAutoCalc] = useState(false);

  useEffect(() => {
    if (show) {
      setName(initialData?.name || "");
      setFieldType(initialData?.fieldType || "");
      setOptions(initialData?.options?.join(", ") || "");
      setAutoCalc(initialData?.autoCalc || false);
    }
  }, [initialData, show]);

  if (!show) return null;

  const submit = (e) => {
    e.preventDefault();
    onSave({
      ...initialData,
      name,
      fieldType,
      options,
      autoCalc,
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "#fff",
          padding: 30,
          borderRadius: 12,
          width: 400,
          boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
        }}
      >
        <h3 style={{ marginTop: 0, color: "#00AEEF" }}>
          {initialData ? "Edit Business Field" : "Add Business Field"}
        </h3>
        <form
          onSubmit={submit}
          style={{ display: "flex", flexDirection: "column", gap: 15 }}
        >
          <label style={{ fontWeight: "bold" }}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Enter field name"
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid #ccc",
              outline: "none",
            }}
          />

          <label style={{ fontWeight: "bold" }}>Field Type</label>
          <select
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value)}
            required
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid #ccc",
            }}
          >
            <option value="" disabled>
              Select field type
            </option>
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="datetime">Date & Time</option>
            <option value="location">Location</option>
            <option value="radio">Radio</option>
            <option value="select">Select</option>
            <option value="checkbox">Checkbox</option>
            <option value="document">Document</option>
          </select>

          {/* Show options only for select, radio, checkbox */}
          {["select", "radio", "checkbox"].includes(fieldType) && (
            <>
              <label style={{ fontWeight: "bold" }}>Options</label>
              <input
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder="option1, option2, option3"
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                  outline: "none",
                }}
              />
            </>
          )}

          {/* Auto-calc only for number */}
          {fieldType === "number" && (
            <label>
              <input
                type="checkbox"
                checked={autoCalc}
                onChange={(e) => setAutoCalc(e.target.checked)}
              />{" "}
              Auto-calculate (e.g., Experience)
            </label>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "none",
                background: "#00AEEF",
                color: "#fff",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Main Page
export default function BusinessFieldsPage() {
  const [fields, setFields] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchFields = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/api/masters",
        { params: { type: "businessField" } }
      );
      setFields(res.data);
    } catch (err) {
      console.error(err);
      alert("Failed to fetch business fields");
    }
  };

  useEffect(() => {
    fetchFields();
  }, []);

  const handleSave = async (data) => {
  try {
    const formData = new FormData();
    formData.append("name", data.name);
    formData.append("type", "businessField");
    formData.append("sequence", 0);
    
    // Convert fieldType "Date & Time" to "date" for backend
    const backendFieldType = data.fieldType === "date & time" ? "date" : data.fieldType;
    formData.append("fieldType", backendFieldType);

    formData.append("options", data.options || "");
    formData.append("autoCalc", data.autoCalc ? "true" : "false");

    if (data.file instanceof File) {
      formData.append("image", data.file);
    }

    // For PUT, include 'value' field to avoid backend 400
    if (data._id) {
      formData.append("value", ""); // empty string for now
      await axios.put(
        `http://localhost:5000/api/masters/${data._id}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
    } else {
      await axios.post(
        "http://localhost:5000/api/masters",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
    }

    fetchFields();
    setShowModal(false);
    setEditing(null);
  } catch (err) {
    console.error(err);
    alert("Failed to save field");
  }
};


  const handleDelete = async (field) => {
    if (!window.confirm("Delete this field?")) return;
    try {
      await axios.delete(`http://localhost:5000/api/masters/${field._id}`);
      fetchFields();
    } catch (err) {
      console.error(err);
      alert("Failed to delete field");
    }
  };

  return (
    <div style={{ padding: 30 }}>
        <div style={{ marginBottom: 10, fontSize: 14, color: "#555" }}>
  <span
    style={{ cursor: "pointer", color: "#00AEEF" }}
    onClick={() => window.history.back()}
  >
    Go back
  </span>{" "}
  &gt; Business Fields
</div>

      <h2 style={{ color: "#00AEEF" }}>Business Fields</h2>
      <button
        onClick={() => { setEditing(null); setShowModal(true); }}
        style={{
          background: "#00AEEF",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "10px 18px",
          cursor: "pointer",
          marginBottom: 20,
          fontWeight: "bold",
        }}
      >
        + Add Business Field
      </button>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        {fields.map((f) => (
          <BusinessFieldCard
            key={f._id}
            field={f}
            onEdit={(f) => { setEditing(f); setShowModal(true); }}
            onDelete={handleDelete}
          />
        ))}
      </div>

      <BusinessFieldModal
        show={showModal}
        onClose={() => { setShowModal(false); setEditing(null); }}
        onSave={handleSave}
        initialData={editing}
      />
    </div>
  );
}
