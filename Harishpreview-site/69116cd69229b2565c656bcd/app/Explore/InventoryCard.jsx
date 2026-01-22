// "use client";

// import { useMemo, useState } from "react";
// import "./NeonInventoryCard.css";

// const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

// export default function NeonInventoryCard({ items }) {
//   const bikes = Array.isArray(items)
//     ? items.filter((i) => i.scopeFamily === "bikes")
//     : [];

//   if (!bikes.length) return null;

//   const [selectedIndex, setSelectedIndex] = useState(0);
//   const [licenseType, setLicenseType] = useState("with"); // with | without

//   const item = bikes[selectedIndex];
//   const bike = item.selections.bikes;

//   /* ✅ IMAGE FROM API */
//   const imageUrl = item.imgurl || bike.imgurl || "";

//   /* ✅ PRICE BASED ON LICENSE TYPE */
//   const price = useMemo(() => {
//     const rows = Object.entries(item.pricesByRow || {})
//       .filter(([key]) => item.pricingStatusByRow?.[key] === "Active");

//     if (!rows.length) return null;

//     // heuristic: backend encodes license in row key
//     const filtered = rows.filter(([key]) =>
//       licenseType === "with"
//         ? key.toLowerCase().includes("license")
//         : !key.toLowerCase().includes("license")
//     );

//     const prices = (filtered.length ? filtered : rows).map(
//       ([_, price]) => price
//     );

//     return Math.min(...prices);
//   }, [item, licenseType]);

//   if (!price) return null;

//   return (
//     <div className="neon-card">
//       {/* TITLE */}
//       <h2 className="neon-title">Two Wheeler</h2>

//       {/* IMAGE */}
//       {imageUrl && (
//         <div className="neon-image">
//           <img src={imageUrl} alt={bike.model} />
//         </div>
//       )}

//       {/* PRICE */}
//       <div className="neon-price">{inr(price)}</div>

//       {/* LICENSE TOGGLE */}
//       <p className="neon-label">Select course type</p>
//       <div className="neon-toggle">
//         <button
//           className={licenseType === "with" ? "active" : ""}
//           onClick={() => setLicenseType("with")}
//         >
//           With License
//         </button>
//         <button
//           className={licenseType === "without" ? "active" : ""}
//           onClick={() => setLicenseType("without")}
//         >
//           Without License
//         </button>
//       </div>

//       {/* MODEL DROPDOWN */}
//       <p className="neon-label">Select Model</p>
//       <select
//         className="neon-select"
//         value={selectedIndex}
//         onChange={(e) => setSelectedIndex(Number(e.target.value))}
//       >
//         {bikes.map((b, i) => {
//           const v = b.selections.bikes;
//           return (
//             <option key={i} value={i}>
//               {v.bikeBrand} {v.model} ({v.bikeTransmission})
//             </option>
//           );
//         })}
//       </select>

//       {/* FEATURES */}
//       <ul className="neon-list">
//         <li>Per day 6–7 Kms</li>
//         <li>Free Pickup and Drop</li>
//         <li>One Month Course</li>
//         <li>All RTA Works done here</li>
//         <li>By enrolling you agree to T&C</li>
//       </ul>

//       {/* CTA */}
//       <button className="neon-btn">Enroll Now</button>
//     </div>
//   );
// }
