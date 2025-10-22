"use client";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);

  // Load from localStorage once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("niks_cart");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setItems(parsed);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Persist on change
  useEffect(() => {
    try {
      localStorage.setItem("niks_cart", JSON.stringify(items));
    } catch (e) {
      // ignore
    }
  }, [items]);

  const addItem = (product, quantity = 1) => {
    if (!product) return;
    const id = product._id || product.id;
    if (!id) return;
    const price = product.vendorPrice ?? product.price ?? 0;
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + quantity };
        return updated;
      }
      return [
        ...prev,
        {
          id,
          name: product.name,
          price,
          quantity,
          imageUrl: product.imageUrl || null,
        },
      ];
    });
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  };

  const clear = () => setItems([]);

  const totalItems = useMemo(() => items.reduce((sum, it) => sum + (it.quantity || 0), 0), [items]);
  const totalAmount = useMemo(() => items.reduce((sum, it) => sum + (it.price || 0) * (it.quantity || 0), 0), [items]);

  const value = useMemo(
    () => ({ items, addItem, removeItem, clear, totalItems, totalAmount }),
    [items, totalItems, totalAmount]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}


