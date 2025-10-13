// components/FullPageShimmer.jsx
import React from "react";

export default function FullPageShimmer() {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "#f0fdf4", // light green background to match page
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
      }}
    >
      {/* Shimmer Loader */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "linear-gradient(90deg, #e2e8f0 25%, #34d399 50%, #e2e8f0 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.2s infinite",
        }}
      ></div>

      <style jsx>{`
        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
      `}</style>
    </div>
  );
}
