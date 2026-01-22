import React from "react";

export default function Breadcrumbs({ paths }) {
  // Fallback if no paths provided
  const fallbackPaths = [{ name: "Home", href: "/" }];

  const breadcrumbPaths = paths && paths.length > 0 ? paths : fallbackPaths;

  return (
    <nav style={{ fontSize: 14, marginBottom: 20, color: "#555" }}>
      {breadcrumbPaths.map((p, index) => (
        <span key={index}>
          {index < breadcrumbPaths.length - 1 ? (
            <a
              href={p.href || "#"}
              onClick={(e) => {
                e.preventDefault();
                if (p.onClick) p.onClick();
              }}
              style={{ textDecoration: "none", color: "#00AEEF", cursor: p.onClick ? "pointer" : "default" }}
            >
              {p.name}
            </a>
          ) : (
            <span>{p.name}</span>
          )}
          {index < breadcrumbPaths.length - 1 && <span style={{ margin: "0 6px" }}>/</span>}
        </span>
      ))}
    </nav>
  );
}
