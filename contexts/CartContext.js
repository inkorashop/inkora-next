'use client';
import { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext(null);

function track(eventType, metadata = {}) {
  if (typeof window !== 'undefined') window.__inkora_track?.(eventType, metadata);
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('inkora_cart');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  useEffect(() => {
    try {
      localStorage.setItem('inkora_cart', JSON.stringify(cart));
    } catch { }
  }, [cart]);

  // Bloquear sincronización de auth de Supabase dentro del iframe
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (window.self !== window.top) return;
    } catch { return; }
  }, []);

  function addToCart(design, product) {
    track('cart_add', {
      design_id: design.id,
      design_name: design.name,
      product_name: product?.name,
      qty: 1,
      price: product?.price_per_unit ?? 0,
    });
    setCart(prev => ({
      ...prev,
      [design.id]: {
        ...design,
        qty: 1,
        pricePerUnit: product?.price_per_unit ?? 0,
        showPrice: product?.show_price !== false,
        productName: product?.name ?? '',
      },
    }));
  }

  function changeQty(id, delta) {
    setCart(prev => {
      const item = prev[id];
      if (!item) return prev;
      const newQty = item.qty + delta;
      track('cart_qty_change', {
        design_id: id,
        design_name: item.name,
        product_name: item.productName,
        old_qty: item.qty,
        new_qty: Math.max(0, newQty),
        delta,
      });
      if (newQty <= 0) { const next = { ...prev }; delete next[id]; return next; }
      return { ...prev, [id]: { ...item, qty: newQty } };
    });
  }

  function removeFromCart(id) {
    setCart(prev => {
      const item = prev[id];
      if (item) track('cart_remove', { design_id: id, design_name: item.name, product_name: item.productName });
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function clearCart() {
    setCart({});
  }

  function setCartItem(id, qty) {
    setCart(prev => {
      const item = prev[id];
      if (item) {
        track('cart_qty_change', {
          design_id: id,
          design_name: item.name,
          product_name: item.productName,
          old_qty: item.qty,
          new_qty: Math.max(0, qty),
          delta: qty - item.qty,
        });
      }
      if (qty <= 0) { const next = { ...prev }; delete next[id]; return next; }
      return { ...prev, [id]: { ...prev[id], qty } };
    });
  }

  const cartItems = Object.values(cart);
  const totalItems = cartItems.reduce((s, i) => s + i.qty, 0);

  return (
    <CartContext.Provider value={{ cart, cartItems, totalItems, addToCart, changeQty, removeFromCart, clearCart, setCartItem, track }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
