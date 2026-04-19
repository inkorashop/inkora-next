'use client';
import { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('inkora_cart');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  useEffect(() => {
    localStorage.setItem('inkora_cart', JSON.stringify(cart));
  }, [cart]);

  function addToCart(design, product) {
    setCart(prev => ({
      ...prev,
      [design.id]: {
        ...design,
        qty: 1,
        pricePerUnit: product?.price_per_unit ?? 0,
        showPrice: product?.show_price !== false,
      },
    }));
  }

  function changeQty(id, delta) {
    setCart(prev => {
      const item = prev[id];
      if (!item) return prev;
      const newQty = item.qty + delta;
      if (newQty <= 0) { const next = { ...prev }; delete next[id]; return next; }
      return { ...prev, [id]: { ...item, qty: newQty } };
    });
  }

  function removeFromCart(id) {
    setCart(prev => { const next = { ...prev }; delete next[id]; return next; });
  }

  function clearCart() {
    setCart({});
  }

  function setCartItem(id, qty) {
    setCart(prev => {
      if (qty <= 0) { const next = { ...prev }; delete next[id]; return next; }
      return { ...prev, [id]: { ...prev[id], qty } };
    });
  }

  const cartItems = Object.values(cart);
  const totalItems = cartItems.reduce((s, i) => s + i.qty, 0);

  return (
    <CartContext.Provider value={{ cart, cartItems, totalItems, addToCart, changeQty, removeFromCart, clearCart, setCartItem }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}