'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const CartContext = createContext(null);
const ANON_CART_SESSION_KEY = 'inkora_cart_session_id';
const ANON_CART_STORAGE_KEY = 'inkora_cart_anonymous';
const LEGACY_CART_STORAGE_KEY = 'inkora_cart';
const ACCOUNT_IMPORT_PREFIX = 'inkora_cart_account_initialized_';

function getAnonymousCartSessionId() {
  if (typeof window === 'undefined') return '';
  try {
    let id = localStorage.getItem(ANON_CART_SESSION_KEY);
    if (!id) {
      id = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(ANON_CART_SESSION_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

function readStoredCart(key) {
  if (typeof window === 'undefined') return {};
  try {
    const saved = localStorage.getItem(key);
    const parsed = saved ? JSON.parse(saved) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredCart(key, cart) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(cart || {}));
  } catch {}
}

function getInitialAnonymousCart() {
  const current = readStoredCart(ANON_CART_STORAGE_KEY);
  if (Object.keys(current).length > 0) return current;

  const legacy = readStoredCart(LEGACY_CART_STORAGE_KEY);
  if (Object.keys(legacy).length > 0) {
    writeStoredCart(ANON_CART_STORAGE_KEY, legacy);
    return legacy;
  }

  return {};
}

function itemsToCartMap(items) {
  if (!Array.isArray(items)) return {};
  return items.reduce((acc, item) => {
    const key = item?.id || item?.design_id || item?.designId;
    if (key && Number(item?.qty) > 0) acc[key] = item;
    return acc;
  }, {});
}

function cartMapToItems(cart) {
  return Object.values(cart || {}).filter(item => Number(item?.qty) > 0);
}

function serializeCart(cart) {
  const items = cartMapToItems(cart)
    .map(item => ({ id: item.id || item.design_id || item.designId, qty: Number(item.qty) || 0 }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return JSON.stringify(items);
}

function accountImportKey(userId) {
  return `${ACCOUNT_IMPORT_PREFIX}${userId}`;
}

function isAccountInitialized(userId) {
  try {
    return localStorage.getItem(accountImportKey(userId)) === 'true';
  } catch {
    return false;
  }
}

function markAccountInitialized(userId) {
  try {
    localStorage.setItem(accountImportKey(userId), 'true');
  } catch {}
}

function track(eventType, metadata = {}) {
  if (typeof window !== 'undefined') window.__inkora_track?.(eventType, metadata);
}

export function CartProvider({ children }) {
  const cartRef = useRef({});
  const syncTimerRef = useRef(null);
  const anonSessionIdRef = useRef('');
  const modeRef = useRef('anonymous');
  const currentUserIdRef = useRef(null);
  const hydratedRef = useRef(false);
  const hydratingRef = useRef(false);
  const remoteApplyingRef = useRef(false);
  const accountChannelRef = useRef(null);
  const lastSavedAccountRef = useRef('');
  const lastSavedAnonRef = useRef('');

  const [cart, setCart] = useState(getInitialAnonymousCart);

  async function loadAccountCart(userId) {
    const { data, error } = await supabase
      .from('carts')
      .select('items, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return {
      exists: !!data,
      items: Array.isArray(data?.items) ? data.items.filter(item => Number(item?.qty) > 0) : [],
    };
  }

  async function saveAccountItems(userId, items) {
    if (!userId) return;
    const safeItems = Array.isArray(items) ? items.filter(item => Number(item?.qty) > 0) : [];
    const { error } = await supabase.from('carts').upsert({
      id: userId,
      user_id: userId,
      session_id: null,
      items: safeItems,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) throw error;
    lastSavedAccountRef.current = JSON.stringify(safeItems);
  }

  async function saveAnonymousItems(items) {
    const sessionId = anonSessionIdRef.current;
    if (!sessionId) return;
    const safeItems = Array.isArray(items) ? items.filter(item => Number(item?.qty) > 0) : [];
    const { error } = await supabase.rpc('save_current_cart', {
      p_session_id: sessionId,
      p_items: safeItems,
    });
    if (error && error.code !== 'PGRST202') throw error;
    lastSavedAnonRef.current = JSON.stringify(safeItems);
  }

  async function applyAccountCart(userId, reason = 'load') {
    if (!userId) return;
    hydratingRef.current = true;

    try {
      const accountCart = await loadAccountCart(userId);
      const anonCart = readStoredCart(ANON_CART_STORAGE_KEY);
      const anonItems = cartMapToItems(anonCart);
      const shouldImportAnonymous =
        !accountCart.exists &&
        !isAccountInitialized(userId) &&
        anonItems.length > 0;

      const nextItems = shouldImportAnonymous ? anonItems : accountCart.items;
      const nextCart = itemsToCartMap(nextItems);

      remoteApplyingRef.current = true;
      cartRef.current = nextCart;
      setCart(nextCart);
      lastSavedAccountRef.current = JSON.stringify(nextItems);

      if (shouldImportAnonymous || !accountCart.exists) {
        await saveAccountItems(userId, nextItems);
      }
      markAccountInitialized(userId);
    } catch (error) {
      console.warn(`No se pudo cargar el carrito de la cuenta (${reason}):`, error?.message || error);
      remoteApplyingRef.current = true;
      cartRef.current = {};
      setCart({});
    } finally {
      hydratingRef.current = false;
      hydratedRef.current = true;
    }
  }

  function applyAnonymousCart() {
    hydratingRef.current = true;
    const anonCart = readStoredCart(ANON_CART_STORAGE_KEY);
    remoteApplyingRef.current = true;
    cartRef.current = anonCart;
    setCart(anonCart);
    hydratingRef.current = false;
    hydratedRef.current = true;
    return anonCart;
  }

  function subscribeAccountCart(userId) {
    accountChannelRef.current?.unsubscribe();
    accountChannelRef.current = null;
    if (!userId) return;

    accountChannelRef.current = supabase
      .channel(`cart-account-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'carts', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (currentUserIdRef.current !== userId || modeRef.current !== 'account') return;
          const items = payload.eventType === 'DELETE'
            ? []
            : Array.isArray(payload.new?.items)
              ? payload.new.items.filter(item => Number(item?.qty) > 0)
              : [];
          const nextCart = itemsToCartMap(items);
          if (serializeCart(nextCart) === serializeCart(cartRef.current)) return;
          remoteApplyingRef.current = true;
          cartRef.current = nextCart;
          lastSavedAccountRef.current = JSON.stringify(items);
          setCart(nextCart);
        }
      )
      .subscribe();
  }

  async function enterAccountMode(user, reason) {
    if (!user?.id) return;
    if (modeRef.current === 'account' && currentUserIdRef.current === user.id && hydratedRef.current) {
      return;
    }
    modeRef.current = 'account';
    currentUserIdRef.current = user.id;
    subscribeAccountCart(user.id);
    await applyAccountCart(user.id, reason);
  }

  function enterAnonymousMode() {
    accountChannelRef.current?.unsubscribe();
    accountChannelRef.current = null;
    modeRef.current = 'anonymous';
    currentUserIdRef.current = null;
    const anonCart = applyAnonymousCart();
    saveAnonymousItems(cartMapToItems(anonCart)).catch(error => {
      console.warn('No se pudo sincronizar el carrito anonimo:', error?.message || error);
    });
  }

  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;
    anonSessionIdRef.current = getAnonymousCartSessionId();
    writeStoredCart(ANON_CART_STORAGE_KEY, getInitialAnonymousCart());

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user) enterAccountMode(session.user, 'initial');
      else enterAnonymousMode();
    });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled || event === 'TOKEN_REFRESHED') return;
      setTimeout(() => {
        if (cancelled) return;
        if (session?.user && event !== 'SIGNED_OUT') {
          enterAccountMode(session.user, event);
        } else if (event === 'SIGNED_OUT') {
          enterAnonymousMode();
        }
      }, 0);
    });

    const handleResume = () => {
      if (modeRef.current === 'account' && currentUserIdRef.current) {
        applyAccountCart(currentUserIdRef.current, 'resume');
      }
    };

    const handleStorage = (event) => {
      if (modeRef.current !== 'anonymous') return;
      if (event.key !== ANON_CART_STORAGE_KEY) return;
      applyAnonymousCart();
    };

    window.addEventListener('focus', handleResume);
    window.addEventListener('online', handleResume);
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleResume);

    return () => {
      cancelled = true;
      clearTimeout(syncTimerRef.current);
      data?.subscription?.unsubscribe();
      accountChannelRef.current?.unsubscribe();
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('online', handleResume);
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || hydratingRef.current) return;

    if (remoteApplyingRef.current) {
      remoteApplyingRef.current = false;
      return;
    }

    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(async () => {
      const items = cartMapToItems(cartRef.current);
      try {
        if (modeRef.current === 'account' && currentUserIdRef.current) {
          const serialized = JSON.stringify(items);
          if (serialized !== lastSavedAccountRef.current) {
            await saveAccountItems(currentUserIdRef.current, items);
          }
        } else {
          writeStoredCart(ANON_CART_STORAGE_KEY, cartRef.current);
          const serialized = JSON.stringify(items);
          if (serialized !== lastSavedAnonRef.current) {
            await saveAnonymousItems(items);
          }
        }
      } catch (error) {
        console.warn('No se pudo sincronizar el carrito:', error?.message || error);
      }
    }, 700);

    return () => clearTimeout(syncTimerRef.current);
  }, [cart]);

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
      if (newQty <= 0) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
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
    cartRef.current = {};
    setCart({});
    clearTimeout(syncTimerRef.current);

    if (modeRef.current === 'account' && currentUserIdRef.current) {
      saveAccountItems(currentUserIdRef.current, []).catch(error => {
        console.warn('No se pudo limpiar el carrito de la cuenta:', error?.message || error);
      });
      return;
    }

    writeStoredCart(ANON_CART_STORAGE_KEY, {});
    saveAnonymousItems([]).catch(error => {
      console.warn('No se pudo limpiar el carrito anonimo:', error?.message || error);
    });
  }

  function setCartItem(id, qty) {
    setCart(prev => {
      const item = prev[id];
      if (!item) return prev;
      track('cart_qty_change', {
        design_id: id,
        design_name: item.name,
        product_name: item.productName,
        old_qty: item.qty,
        new_qty: Math.max(0, qty),
        delta: qty - item.qty,
      });
      if (qty <= 0) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: { ...item, qty } };
    });
  }

  const cartItems = Object.values(cart);
  const totalItems = cartItems.reduce((sum, item) => sum + item.qty, 0);

  return (
    <CartContext.Provider value={{ cart, cartItems, totalItems, addToCart, changeQty, removeFromCart, clearCart, setCartItem, track }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
