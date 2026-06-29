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
  const initialCartRef = useRef(null);
  if (initialCartRef.current === null) initialCartRef.current = getInitialAnonymousCart();

  const cartRef = useRef(initialCartRef.current);
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
  const localRevisionRef = useRef(0);
  const pendingLocalSaveRef = useRef(false);
  const savingRevisionRef = useRef(null);
  const locallyTouchedIdsRef = useRef(new Set());
  const localClearPendingRef = useRef(false);

  const [cart, setCart] = useState(() => initialCartRef.current);

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
    const updatedAt = new Date().toISOString();
    const { error } = await supabase.from('carts').upsert({
      id: userId,
      user_id: userId,
      session_id: null,
      items: safeItems,
      updated_at: updatedAt,
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

  function commitLocalCart(nextCart, touchedIds = [], options = {}) {
    const safeCart = nextCart && typeof nextCart === 'object' ? nextCart : {};
    cartRef.current = safeCart;
    localRevisionRef.current += 1;
    pendingLocalSaveRef.current = true;
    if (options.replaceAll) localClearPendingRef.current = true;
    touchedIds.forEach(id => {
      if (id) locallyTouchedIdsRef.current.add(String(id));
    });
    if (modeRef.current === 'anonymous') writeStoredCart(ANON_CART_STORAGE_KEY, safeCart);
    setCart(safeCart);
  }

  function mergeRemoteWithPendingLocal(remoteCart) {
    const localCart = cartRef.current || {};
    if (localClearPendingRef.current) return localCart;
    const merged = { ...(remoteCart || {}), ...localCart };
    locallyTouchedIdsRef.current.forEach(id => {
      if (!localCart[id]) delete merged[id];
    });
    return merged;
  }

  function applyRemoteCart(remoteCart, items, source) {
    const hasLocalWork = pendingLocalSaveRef.current || savingRevisionRef.current !== null;
    if (hasLocalWork) {
      const merged = mergeRemoteWithPendingLocal(remoteCart);
      cartRef.current = merged;
      setCart(merged);
      return false;
    }

    remoteApplyingRef.current = true;
    cartRef.current = remoteCart;
    if (source === 'account') lastSavedAccountRef.current = JSON.stringify(items || []);
    if (source === 'anonymous') lastSavedAnonRef.current = JSON.stringify(items || []);
    setCart(remoteCart);
    return true;
  }

  async function persistCurrentCart(reason = 'sync') {
    if (!hydratedRef.current || hydratingRef.current || !pendingLocalSaveRef.current) return;
    if (savingRevisionRef.current !== null) return;

    const saveRevision = localRevisionRef.current;
    const items = cartMapToItems(cartRef.current);
    savingRevisionRef.current = saveRevision;

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

      if (localRevisionRef.current === saveRevision) {
        pendingLocalSaveRef.current = false;
        locallyTouchedIdsRef.current.clear();
        localClearPendingRef.current = false;
      }
    } catch (error) {
      console.warn(`No se pudo sincronizar el carrito (${reason}):`, error?.message || error);
    } finally {
      if (savingRevisionRef.current === saveRevision) savingRevisionRef.current = null;
      if (pendingLocalSaveRef.current && localRevisionRef.current !== saveRevision) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = setTimeout(() => persistCurrentCart('followup'), 80);
      }
    }
  }

  async function applyAccountCart(userId, reason = 'load') {
    if (!userId) return;
    const requestRevision = localRevisionRef.current;
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

      if (localRevisionRef.current !== requestRevision || pendingLocalSaveRef.current || savingRevisionRef.current !== null) {
        const previousSerialized = serializeCart(cartRef.current);
        const mergedCart = mergeRemoteWithPendingLocal(nextCart);
        cartRef.current = mergedCart;
        setCart(mergedCart);
        if (serializeCart(mergedCart) !== previousSerialized) {
          localRevisionRef.current += 1;
          pendingLocalSaveRef.current = true;
        }
      } else {
        applyRemoteCart(nextCart, nextItems, 'account');
      }

      if (shouldImportAnonymous || !accountCart.exists) {
        await saveAccountItems(userId, cartMapToItems(cartRef.current));
      }
      markAccountInitialized(userId);
    } catch (error) {
      console.warn(`No se pudo cargar el carrito de la cuenta (${reason}):`, error?.message || error);
    } finally {
      hydratingRef.current = false;
      hydratedRef.current = true;
      if (pendingLocalSaveRef.current) persistCurrentCart(`hydrate-${reason}`);
    }
  }

  function applyAnonymousCart() {
    if (pendingLocalSaveRef.current || savingRevisionRef.current !== null) return cartRef.current;
    hydratingRef.current = true;
    const anonCart = readStoredCart(ANON_CART_STORAGE_KEY);
    const anonItems = cartMapToItems(anonCart);
    applyRemoteCart(anonCart, anonItems, 'anonymous');
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
          applyRemoteCart(nextCart, items, 'account');
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
      if (document.visibilityState === 'hidden') return;
      if (pendingLocalSaveRef.current || savingRevisionRef.current !== null) return;
      if (modeRef.current === 'account' && currentUserIdRef.current) {
        applyAccountCart(currentUserIdRef.current, 'resume');
      }
    };

    const handleStorage = (event) => {
      if (modeRef.current !== 'anonymous') return;
      if (event.key !== ANON_CART_STORAGE_KEY) return;
      if (pendingLocalSaveRef.current || savingRevisionRef.current !== null) return;
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
    syncTimerRef.current = setTimeout(() => {
      persistCurrentCart('debounced');
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

    commitLocalCart({
      ...(cartRef.current || {}),
      [design.id]: {
        ...design,
        qty: safeQty,
        pricePerUnit: product?.price_per_unit ?? 0,
        showPrice: product?.show_price !== false,
        productName: product?.name ?? '',
      },
    }, [design.id]);
  }

  function changeQty(id, delta) {
    const current = cartRef.current || {};
    const item = current[id];
    if (!item) return;
    const newQty = item.qty + delta;
    track('cart_qty_change', {
      design_id: id,
      design_name: item.name,
      product_name: item.productName,
      old_qty: item.qty,
      new_qty: Math.max(0, newQty),
      delta,
    });
    const next = { ...current };
    if (newQty <= 0) {
      delete next[id];
    } else {
      next[id] = { ...item, qty: newQty };
    }
    commitLocalCart(next, [id]);
  }

  function removeFromCart(id) {
    const current = cartRef.current || {};
    const item = current[id];
    if (!item) return;
    track('cart_remove', { design_id: id, design_name: item.name, product_name: item.productName });
    const next = { ...current };
    delete next[id];
    commitLocalCart(next, [id]);
  }

  function clearCart() {
    clearTimeout(syncTimerRef.current);
    commitLocalCart({}, [], { replaceAll: true });
    persistCurrentCart('clear');
  }

  function setCartItem(id, qty) {
    const current = cartRef.current || {};
    const item = current[id];
    if (!item) return;
    track('cart_qty_change', {
      design_id: id,
      design_name: item.name,
      product_name: item.productName,
      old_qty: item.qty,
      new_qty: Math.max(0, qty),
      delta: qty - item.qty,
    });
    const next = { ...current };
    if (qty <= 0) {
      delete next[id];
    } else {
      next[id] = { ...item, qty };
    }
    commitLocalCart(next, [id]);
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
