import React from "react";
import { useNavigate } from "react-router-dom";
import API_BASE_URL from "../config";

function CategoryCard({ category, onEdit, onDelete }) {
  const navigate = useNavigate();

  const handleOpen = () => {
    navigate(`/categories/${category._id}`);
  };

  const termsList = category.terms
    ? category.terms
        .split(",")
        .map((term, index) => <li key={index}>{term.trim()}</li>)
    : null;

  return (
    <div
      className="card"
      style={{
        borderRadius: "8px",
        background: "#fff",
        color: "#333",
        padding: "10px",
        width: "220px",
        boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
      }}
    >
      <img
        src={category?.imageUrl?.startsWith("http") ? category.imageUrl : `${API_BASE_URL}${category.imageUrl || ""}`}
        alt={category.name}
        style={{
          width: "100%",
          height: "140px",
          objectFit: "cover",
          borderRadius: "6px",
        }}
      />

      <h3 style={{ marginTop: "10px", color: "#00AEEF" }}>{category.name}</h3>

      {category.price && (
        <p style={{ color: "#555", margin: "4px 0" }}>
          Price: ₹{category.price}
        </p>
      )}



      {termsList && (
        <div style={{ color: "#555", margin: "4px 0" }}>
          <ul style={{ paddingLeft: "20px", margin: "4px 0" }}>{termsList}</ul>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "8px",
        }}
      >
        {/* Arrow button: black outline, no background */}
        <button
          onClick={handleOpen}
          title="Open Subcategories"
          style={{
            cursor: "pointer",
            background: "none",
            border: "1px solid #000",
            borderRadius: "4px",
            padding: "4px 8px",
            color: "#000",
            fontWeight: "bold",
          }}
        >
          ➡
        </button>

        {/* Edit/Delete: blue icons, no border */}
        <button
          onClick={() => onEdit && onEdit(category)}
          title="Edit"
          style={{
            cursor: "pointer",
            background: "none",
            border: "none",
            color: "#00AEEF",
            fontSize: "16px",
          }}
        >
          ✏️
        </button>

        <button
          onClick={() => onDelete && onDelete(category)}
          title="Delete"
          style={{
            cursor: "pointer",
            background: "none",
            border: "none",
            color: "#00AEEF",
            fontSize: "16px",
          }}
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

export default CategoryCard;
