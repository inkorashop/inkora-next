'use client';
import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const CartContext = createContext(null);
const ANON_CART_SESSION_KEY = 'inkora_cart_session_id';

function getAnonymousCartSessionId() {
  if (typeof window === 'undefined') return '';
  try {
    let id = localStorage.getItem(ANON_CART_SESSION_KEY);
    if (!id) {
      id = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(ANON_CART_SESSION_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

function itemsToCartMap(items) {
  if (!Array.isArray(items)) return {};
  return items.reduce((acc, item) => {
    const key = item?.id || item?.design_id || item?.designId;
    if (key && Number(item?.qty) > 0) acc[key] = item;
    return acc;
  }, {});
}

function track(eventType, metadata = {}) {
  if (typeof window !== 'undefined') window.__inkora_track?.(eventType, metadata);
}

export function CartProvider({ children }) {
  const cartRef = useRef({});
  const hydratedRef = useRef(false);
  const syncCartRef = useRef(null);
  const syncTimerRef = useRef(null);
  const anonSessionIdRef = useRef('');

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

  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;
    let heartbeat = null;
    let authSubscription = null;
    anonSessionIdRef.current = getAnonymousCartSessionId();

    const syncCart = async () => {
      if (!hydratedRef.current) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (cancelled) return;

        const items = Object.values(cartRef.current || {}).filter(item => Number(item.qty) > 0);

        const { error: rpcError } = await supabase.rpc('save_current_cart', {
          p_session_id: anonSessionIdRef.current,
          p_items: items,
        });
        if (!rpcError || cancelled) return;

        if (rpcError.code !== 'PGRST202') {
          console.warn('No se pudo guardar el carrito con RPC:', rpcError.message);
        }

        if (!user) return;

        const fallback = items.length === 0
          ? await supabase.from('carts').delete().eq('user_id', user.id)
          : await supabase.from('carts').upsert({
            id: user.id,
            user_id: user.id,
            items,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });

        if (fallback.error) {
          console.warn('No se pudo guardar el carrito:', fallback.error.message);
        }
      } catch (err) {
        console.warn('No se pudo sincronizar el carrito:', err?.message || err);
      }
    };
    syncCartRef.current = syncCart;

    const hydrateCart = async () => {
      let restoredSavedCart = false;
      try {
        const { data, error } = await supabase.rpc('get_current_cart', {
          p_session_id: anonSessionIdRef.current,
        });
        const row = Array.isArray(data) ? data[0] : data;
        const savedItems = Array.isArray(row?.items) ? row.items.filter(item => Number(item?.qty) > 0) : [];
        const localItems = Object.values(cartRef.current || {}).filter(item => Number(item?.qty) > 0);

        if (!error && savedItems.length > 0 && localItems.length === 0 && !cancelled) {
          setCart(itemsToCartMap(savedItems));
          restoredSavedCart = true;
        } else if (error && error.code !== 'PGRST202') {
          console.warn('No se pudo cargar el carrito guardado:', error.message);
        }
      } catch (err) {
        console.warn('No se pudo cargar el carrito guardado:', err?.message || err);
      } finally {
        hydratedRef.current = true;
        if (!cancelled && !restoredSavedCart) syncCart();
      }
    };

    hydrateCart();
    heartbeat = setInterval(() => {
      if (!document.hidden) syncCart();
    }, 8000);
    const handleResume = () => syncCart();
    window.addEventListener('focus', handleResume);
    window.addEventListener('online', handleResume);
    document.addEventListener('visibilitychange', handleResume);

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && event !== 'SIGNED_OUT') hydrateCart();
      if (event === 'SIGNED_OUT') syncCart();
    });
    authSubscription = data?.subscription || null;

    return () => {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
      if (authSubscription) authSubscription.unsubscribe();
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('online', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncCartRef.current?.();
    }, 1200);
    return () => clearTimeout(syncTimerRef.current);
  }, [cart]);

  // Bloquear sincronización de auth de Supabase dentro del iframe
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (window.self !== window.top) return;
    } catch { return; }
  }, []);

  function addToCart(design, product, qty = 1) {
    const safeQty = Math.max(1, Number(qty) || 1);

    track('cart_add', {
      design_id: design.id,
      design_name: design.name,
      product_name: product?.name,
      qty: safeQty,
      price: product?.price_per_unit ?? 0,
    });

    setCart(prev => ({
      ...prev,
      [design.id]: {
        ...design,
        qty: safeQty,
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
