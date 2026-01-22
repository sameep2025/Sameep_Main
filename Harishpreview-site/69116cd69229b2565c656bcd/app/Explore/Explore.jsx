"use client";

import { useEffect, useMemo, useState } from "react";
import "./Explore.css";

const API_URL =
  "https://newsameep-backend.go-kar.net/api/dummy-vendors/692693fcc2a260a19e1ffa29/categories";

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

/* ================= CATEGORY CARD ================= */
function CategoryCard({ category }) {
  const [selected, setSelected] = useState(null);

  // Auto-select cheapest option
 useEffect(() => {
  // 1. Try cheapest priced option
  let cheapest = category.children.find(c => typeof c.price === "number");

  // 2. If no price exists, select first option
  if (!cheapest) {
    cheapest = category.children[0];
  }

  setSelected(cheapest?.name || null);
}, [category]);


  const selectedItem = category.children.find(
    (c) => c.name === selected
  );

  return (
    <div className="pkg-card">
      <h3 className="pkg-title">{category.name}</h3>

      <div className="pkg-image">
        <img src={selectedItem?.imageUrl || category.imageUrl} alt="" />
      </div>

      <div className="pkg-price">
        {selectedItem?.price ? inr(selectedItem.price) : "Contact for Price"}
      </div>

      <p className="pkg-subhead">Select course type</p>

      <div className="pkg-chips">
        {category.children.map((c) => (
          <button
            key={c.id}
            className={`pkg-chip ${
              selected === c.name ? "active" : ""
            }`}
            onClick={() => setSelected(c.name)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {selectedItem?.terms && (
        <ul className="pkg-list">
          {selectedItem.terms.split(",").map((t, i) => (
            <li key={i}>{t.trim()}</li>
          ))}
        </ul>
      )}

      <button className="pkg-btn">Enroll Now</button>
    </div>
  );
}

/* ================= PAGE ================= */
export default function Explore() {
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    async function load() {
      const res = await fetch(API_URL, { cache: "no-store" });
      const json = await res.json();
      setCategories(json.categories.children);
    }

    load();
  }, []);

  return (
    <section className="women-styling">
      <div className="ws-grid">
        {categories.map((cat) => (
          <CategoryCard key={cat.id} category={cat} />
        ))}
      </div>
    </section>
  );
}