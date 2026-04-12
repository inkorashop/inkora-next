'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Fuse from 'fuse.js';
import { supabase } from '@/lib/supabase';
import AuthModal from '@/components/AuthModal';


const SearchIconWhite = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="6.5" cy="6.5" r="4.5" stroke="white" strokeWidth="1.5"/>
    <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP;

function generateCode() {
  const year = new Date().getFullYear();
  const num = String(Math.floor(Math.random() * 9000) + 1000);
  return `INK-${year}-${num}`;
}

function useWindowWidth() {
  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 768);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return width;
}

export default function Home() {
  const [products, setProducts] = useState([]);
  const [activeProductId, setActiveProductId] = useState(null);
  const [designsByProduct, setDesignsByProduct] = useState({});
  const [gridOpacity, setGridOpacity] = useState(1);
  const [gridTransition, setGridTransition] = useState('opacity 0.2s ease');
  const [cart, setCart] = useState({});
  const [filter, setFilter] = useState('todos');
  const [notes, setNotes] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [orderCode] = useState(generateCode());
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [success, setSuccess] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState({ items: [], total: 0, form: {} });
  const [loading, setLoading] = useState(false);
  const [cartPanelOpen, setCartPanelOpen] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stickySearchVisible, setStickySearchVisible] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const inlineSearchRef = useRef(null);
  const [qtyAnim, setQtyAnim] = useState({});
  const [cardPulse, setCardPulse] = useState({});
  const [cardHover, setCardHover] = useState({});
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [priceTiers, setPriceTiers] = useState([]);

  const width = useWindowWidth();
  const isMobile = width < 768;

  const activeProduct = products.find(p => p.id === activeProductId) || null;
  const designs = useMemo(() => designsByProduct[activeProductId] ?? [], [designsByProduct, activeProductId]);

  useEffect(() => {
    document.body.style.paddingBottom = '1px';
    loadProducts();

    // getSession lee desde storage local — funciona correctamente post-OAuth redirect
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) loadProfile(u.id);
    });

    // onAuthStateChange captura SIGNED_IN tras el redirect de Google OAuth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) loadProfile(u.id); else { setProfile(null); setPriceTiers([]); }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile(userId) {
    const { data } = await supabase.from('profiles').select('*, localities(*)').eq('id', userId).single();
    setProfile(data);
    console.log('[PRICING] profile:', data);
    console.log('[PRICING] locality_id:', data?.locality_id);
    if (data?.locality_id) {
      const { data: tiers, error: tiersError } = await supabase
        .from('price_tiers').select('*').eq('locality_id', data.locality_id).order('min_quantity');
      console.log('[PRICING] tiers loaded:', tiers, 'error:', tiersError);
      setPriceTiers(tiers || []);
    } else {
      console.log('[PRICING] no locality_id — skipping tiers load');
      setPriceTiers([]);
    }
  }

  function switchProduct(id) {
    if (id === activeProductId) return;
    setGridTransition('opacity 0.15s ease');
    setGridOpacity(0);
    setTimeout(() => {
      setActiveProductId(id);
      setFilter('todos');
      setSearchQuery('');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setGridTransition('opacity 0.2s ease');
        setGridOpacity(1);
      }));
    }, 160);
  }

  useEffect(() => {
    const getScrollY = () => document.documentElement.scrollTop || document.body.scrollTop;
    let lastY = getScrollY();
    const handler = () => {
      const currentY = getScrollY();
      if (currentY < 10) { setHeaderVisible(true); }
      else if (currentY > lastY) { setHeaderVisible(false); }
      else if (currentY < lastY) { setHeaderVisible(true); }
      lastY = currentY;
    };
    document.addEventListener('scroll', handler, { passive: true });
    return () => document.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    if (isMobile) return;
    const el = inlineSearchRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStickySearchVisible(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isMobile]);

  async function loadProducts() {
    const { data } = await supabase.from('products').select('*').eq('active', true).order('created_at');
    if (data && data.length > 0) {
      setProducts(data);
      setActiveProductId(data[0].id);
      loadAllDesigns(data);
    }
  }

  async function loadAllDesigns(productList) {
    const results = await Promise.all(
      productList.map(p =>
        supabase.from('designs').select('*').eq('active', true).eq('product_id', p.id).order('created_at')
      )
    );
    const map = {};
    productList.forEach((p, i) => {
      if (results[i].data) map[p.id] = results[i].data;
    });
    setDesignsByProduct(map);
  }

  const fuse = useMemo(() => new Fuse(designs, {
    keys: ['name'],
    threshold: 0.6,
    distance: 100,
    ignoreLocation: true,
    minMatchCharLength: 1,
  }), [designs]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return designs;
    return fuse.search(searchQuery.trim()).map(r => r.item);
  }, [searchQuery, fuse, designs]);

  const categories = ['todos', ...new Set(designs.map(d => d.category))];
  const filtered = searchQuery.trim()
    ? (filter === 'todos' ? searchResults : searchResults.filter(d => d.category === filter))
    : (filter === 'todos' ? designs : designs.filter(d => d.category === filter));
  const showPrices = !!user;
  const cartItems = Object.values(cart);

  // Cantidad total por producto en el carrito (para calcular tier correcto)
  const cartByProduct = cartItems.reduce((acc, item) => {
    acc[item.product_id] = (acc[item.product_id] || 0) + item.qty;
    return acc;
  }, {});
  // Cantidad mínima requerida por el tier más bajo del producto (null si no hay tiers)
  function getProductMinQty(productId) {
    const tiers = priceTiers.filter(t => t.product_id === productId);
    if (tiers.length === 0) return null;
    return Math.min(...tiers.map(t => Number(t.min_quantity)));
  }

  // Precio unitario efectivo según tiers — null si qty < mínimo del tier más bajo
  function getUnitPrice(productId) {
    const totalQty = cartByProduct[productId] || 0;
    const productTiers = priceTiers
      .filter(t => t.product_id === productId)
      .sort((a, b) => Number(a.min_quantity) - Number(b.min_quantity));

    if (productTiers.length > 0) {
      const minRequired = Number(productTiers[0].min_quantity);
      if (totalQty < minRequired) return null;
      const applicable = productTiers
        .filter(t => Number(t.min_quantity) <= totalQty)
        .sort((a, b) => Number(b.min_quantity) - Number(a.min_quantity));
      if (applicable.length > 0) return Number(applicable[0].price_per_unit);
    }

    return Number(products.find(p => p.id === productId)?.price_per_unit ?? 0);
  }

  const total = cartItems
    .filter(i => i.showPrice !== false)
    .reduce((s, i) => {
      const price = getUnitPrice(i.product_id);
      return s + (price !== null ? i.qty * price : 0);
    }, 0);
  const showTotal = showPrices && cartItems.some(i => {
    const price = getUnitPrice(i.product_id);
    return i.showPrice !== false && price !== null && price > 0;
  });
  const totalItems = cartItems.reduce((s, i) => s + i.qty, 0);

  const gridCols = isMobile
    ? `repeat(${activeProduct?.columns_mobile ?? 2}, 1fr)`
    : `repeat(${activeProduct?.columns_desktop ?? 5}, 1fr)`;
  const cardAspectRatio = activeProduct?.aspect_ratio ?? '2/3';

  function addToCart(design) {
    const product = products.find(p => p.id === design.product_id);
    setCart(prev => ({
      ...prev,
      [design.id]: {
        ...design,
        qty: 1,
        pricePerUnit: product?.price_per_unit ?? 0,
        showPrice: product?.show_price !== false,
      },
    }));
    triggerQtyAnim(design.id, 'pop');
    triggerCardPulse(design.id);
  }

  function changeQty(id, delta) {
    setCart(prev => {
      const item = prev[id];
      if (!item) return prev;
      const newQty = item.qty + delta;
      if (newQty <= 0) { const next = { ...prev }; delete next[id]; return next; }
      return { ...prev, [id]: { ...item, qty: newQty } };
    });
    triggerQtyAnim(id, delta > 0 ? 'pop' : 'shrink');
    triggerCardPulse(id);
  }

  function openModal() {
    if (user) {
      setForm({
        name: profile?.name || '',
        email: user.email || '',
        phone: profile?.phone || '',
      });
    }
    setModalOpen(true);
  }

  function removeFromCart(id) {
    setCart(prev => { const next = { ...prev }; delete next[id]; return next; });
  }

  function triggerQtyAnim(id, type) {
    setQtyAnim(prev => ({ ...prev, [id]: type }));
    setTimeout(() => setQtyAnim(prev => { const n = { ...prev }; delete n[id]; return n; }), 200);
  }

  function triggerCardPulse(id) {
    setCardPulse(prev => ({ ...prev, [id]: true }));
    setTimeout(() => setCardPulse(prev => { const n = { ...prev }; delete n[id]; return n; }), 350);
  }

  async function submitOrder() {
    if (!form.name || !form.phone || !form.email) {
      alert('Por favor completá todos los campos.');
      return;
    }
    setLoading(true);
    try {
      await supabase.from('orders').insert({
        order_code: orderCode,
        customer_name: form.name,
        customer_phone: form.phone,
        customer_email: form.email,
        items: cartItems,
        total,
        notes,
        status: 'pending'
      });

      await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderCode, form, cartItems, total, notes })
      });

      setConfirmedOrder({ items: cartItems, total, form });
      setSuccess(true);
      setCart({});
      setNotes('');
    } catch (e) {
      alert('Hubo un error. Intentá de nuevo.');
    }
    setLoading(false);
  }

  const s = styles;

  return (
    <div style={s.app}>
      <style>{`
        @keyframes qty-pop { 0% { transform: scale(1); } 45% { transform: scale(1.3); } 100% { transform: scale(1); } }
        @keyframes qty-shrink { 0% { transform: scale(1); } 45% { transform: scale(0.8); } 100% { transform: scale(1); } }
        @keyframes card-pulse { 0% { border-color: rgba(27,47,94,0.12); box-shadow: 0 2px 8px rgba(27,47,94,0.08), inset 0 1px 0 rgba(255,255,255,0.8); } 35% { border-color: #2D6BE4; box-shadow: 0 0 0 3px rgba(45,107,228,0.25), 0 2px 8px rgba(27,47,94,0.08); } 100% { border-color: rgba(27,47,94,0.12); box-shadow: 0 2px 8px rgba(27,47,94,0.08), inset 0 1px 0 rgba(255,255,255,0.8); } }
        .qty-pop { animation: qty-pop 200ms ease-out; }
        .qty-shrink { animation: qty-shrink 200ms ease-out; }
        .card-pulse { animation: card-pulse 350ms ease-out; }
        input::placeholder { color: rgba(255,255,255,0.6); }
      `}</style>
      <header style={{...s.header, transform: isMobile ? 'translateY(0)' : (headerVisible ? 'translateY(0)' : 'translateY(-100%)'), transition: 'transform 0.3s ease'}}>
        <div style={{...s.headerInner, padding: isMobile ? '0 16px' : '0 24px'}}>
          <div style={s.logoWrap}>
            <img src="https://ylawwaoznxzxwetlkjel.supabase.co/storage/v1/object/public/assets/Logo%20nuevo.png" alt="INKORA" style={{height: 40, filter: 'brightness(0) invert(1)'}} />
          </div>
          <div style={s.headerActions}>
            {user ? (
              <div style={{position:'relative'}}>
                <button style={s.btnUserHeader} onClick={() => setUserMenuOpen(v => !v)}>
                  {profile?.name || user.email?.split('@')[0]} ▾
                </button>
                {userMenuOpen && (
                  <div style={{position:'absolute', top:'calc(100% + 6px)', right:0, background:'white', border:'1.5px solid #dde1ef', borderRadius:10, boxShadow:'0 4px 16px rgba(27,47,94,0.12)', minWidth:160, zIndex:200, overflow:'hidden'}} onClick={() => setUserMenuOpen(false)}>
                    <a href="/dashboard" style={{display:'block', padding:'10px 16px', fontSize:13, fontWeight:600, color:'#1B2F5E', textDecoration:'none', borderBottom:'1px solid #eef0f6'}}>Mi cuenta</a>
                    <button style={{display:'block', width:'100%', padding:'10px 16px', fontSize:13, fontWeight:600, color:'#e53e3e', background:'none', border:'none', cursor:'pointer', textAlign:'left'}} onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
                  </div>
                )}
              </div>
            ) : (
              <button style={s.btnLoginHeader} onClick={() => setAuthModalOpen(true)}>
                Ingresar
              </button>
            )}
          </div>
        </div>
      </header>

      {isMobile && (
        <div style={{...s.mobileSearchBar, top: headerVisible ? 64 : 0, transition: 'top 0.3s ease'}}>
          <span style={s.searchIcon}><SearchIconWhite /></span>
          <input
            style={s.mobileSearchInput}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar diseño..."
          />
          {searchQuery && (
            <button style={{...s.searchClear, color: 'rgba(255,255,255,0.7)'}} onClick={() => setSearchQuery('')}>✕</button>
          )}
        </div>
      )}

      <div style={{
        ...s.layout,
        alignItems: 'start',
        flex: 1,
        width: '100%',
        minHeight: 'calc(100vh - 64px)',
        gridTemplateColumns: '1fr',
        padding: isMobile ? 16 : 24,
        paddingRight: isMobile ? 16 : 388,
        paddingTop: isMobile ? 72 : 24,
        paddingBottom: isMobile ? 88 : 24,
        transition: isMobile ? 'padding-top 0.3s ease' : undefined,
      }}>
        <div style={s.catalogArea}>
          <div style={s.catalogHeader}>
            <h1 style={{...s.h1, fontSize: isMobile ? 22 : 28}}>Catálogo</h1>
            <p style={s.subtitle}>Seleccioná los diseños y armá tu pedido</p>
          </div>

          {/* Product tabs */}
          {products.length > 1 && (
            <div style={s.productTabs}>
              {products.map(p => (
                <button
                  key={p.id}
                  style={{...s.productTab, ...(activeProductId === p.id ? s.productTabActive : {})}}
                  onClick={() => switchProduct(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {/* Category filters */}
          <div style={s.filters}>
            {categories.map(cat => (
              <button key={cat} style={{...s.filterBtn, ...(filter === cat ? s.filterActive : {})}}
                onClick={() => setFilter(cat)}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>

          <div style={{opacity: gridOpacity, transition: gridTransition, minHeight: 'calc(100vh - 300px)', width: '100%'}}>
          {designs.length === 0 ? (
            <div style={s.emptyState}>
              <p>No hay diseños todavía.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={s.emptyState}>
              <p>Sin resultados para &quot;<strong>{searchQuery}</strong>&quot;.</p>
            </div>
          ) : (
            <div style={{...s.grid, gridTemplateColumns: gridCols}}>
              {filtered.map(d => {
                const inCart = cart[d.id];
                const isHovered = cardHover[d.id];
                const isPulsing = cardPulse[d.id];
                return (
                  <div
                    key={d.id}
                    className={isPulsing ? 'card-pulse' : ''}
                    style={{
                      ...s.card,
                      transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
                      boxShadow: isHovered
                        ? '0 6px 20px rgba(27,47,94,0.16), inset 0 1px 0 rgba(255,255,255,0.8)'
                        : '0 2px 8px rgba(27,47,94,0.08), inset 0 1px 0 rgba(255,255,255,0.8)',
                    }}
                    onMouseEnter={() => setCardHover(prev => ({ ...prev, [d.id]: true }))}
                    onMouseLeave={() => setCardHover(prev => ({ ...prev, [d.id]: false }))}
                  >
                    <div style={{...s.cardImg, aspectRatio: cardAspectRatio}}>
                      {d.image_url
                        ? <img src={d.image_url} alt={d.name} style={s.img} />
                        : <span style={{fontSize:36}}>🎨</span>}
                    </div>
                    <div style={s.cardBody}>
                      <div style={s.cardName}>{d.name}</div>
                      <span style={s.catTag}>{d.category}</span>
                      {showPrices && activeProduct?.show_price !== false && (() => {
                        const price = getUnitPrice(activeProductId);
                        if (price !== null && price > 0) {
                          return <div style={s.cardUnitPrice}>${price.toLocaleString()}/u</div>;
                        }
                        return null;
                      })()}
                      <div style={{...s.qtyControl, borderColor: inCart ? '#2D6BE4' : '#dde1ef', background: inCart ? '#1B2F5E' : 'white'}}>
                        <button style={{...s.qtyBtn, color: inCart ? 'white' : '#5a6380'}} onClick={() => changeQty(d.id, -1)}>−</button>
                        <input
                          type="number"
                          className={qtyAnim[d.id] === 'pop' ? 'qty-pop' : qtyAnim[d.id] === 'shrink' ? 'qty-shrink' : ''}
                          style={{...s.qtyNum, color: inCart ? 'white' : '#9aa3bc', background: 'transparent', border: 'none', outline: 'none', WebkitAppearance: 'none', MozAppearance: 'textfield', appearance: 'none', width: 40, textAlign: 'center', fontWeight: 700, padding: 0, cursor: 'text'}}
                          value={inCart ? inCart.qty : 0}
                          onChange={e => {
                            const val = parseInt(e.target.value);
                            if (isNaN(val) || val <= 0) removeFromCart(d.id);
                            else if (!inCart) addToCart(d);
                            else setCart(prev => ({ ...prev, [d.id]: { ...prev[d.id], qty: val } }));
                          }}
                          onBlur={e => {
                            const val = parseInt(e.target.value);
                            if (isNaN(val) || val <= 0) removeFromCart(d.id);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') e.target.blur();
                          }}
                          min="0"
                        />
                        <button style={{...s.qtyBtn, color: inCart ? 'white' : '#5a6380'}} onClick={() => {
                          if (inCart) changeQty(d.id, 1);
                          else addToCart(d);
                        }}>+</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>

        {!isMobile && <>
          <div style={{...s.sidebarSearchBox, position: 'fixed', top: headerVisible ? 64 : 0, right: 24, transition: 'top 0.3s ease'}}>
            <span style={s.searchIcon}><SearchIconWhite /></span>
            <input
              style={s.searchInput}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar diseño..."
            />
            {searchQuery && (
              <button style={s.searchClear} onClick={() => setSearchQuery('')}>✕</button>
            )}
          </div>
          <div style={{...s.sidebar, position: 'fixed', top: headerVisible ? 139 : 75, right: 24, width: 340, transition: 'top 0.3s ease'}}>
            <div style={s.sidebarHeader}>
              <span style={s.sidebarTitle}>Tu Pedido</span>
              <span style={s.badge}>{totalItems} ítems</span>
            </div>
            <div style={s.sidebarBody}>
              {cartItems.length === 0 ? (
                <div style={s.cartEmpty}>
                  <p>Tu pedido está vacío.<br/>Agregá diseños del catálogo.</p>
                </div>
              ) : (
                cartItems.map(item => (
                  <div key={item.id} style={s.cartItem}>
                    <div style={s.cartItemInfo}>
                      <div style={s.cartItemName}>{item.name}</div>
                    </div>
                    <div style={s.cartItemRight}>
                      <span style={s.cartQty}>×{item.qty}</span>
                      {showPrices && item.showPrice !== false && (() => {
                        const price = getUnitPrice(item.product_id);
                        const minQty = getProductMinQty(item.product_id);
                        if (price === null) return null;
                        if (price !== null && price > 0) return <span style={s.cartPrice}>${(item.qty * price).toLocaleString()}</span>;
                        return null;
                      })()}
                    </div>
                    <button style={s.removeBtn} onClick={() => removeFromCart(item.id)}>✕</button>
                  </div>
                ))
              )}
            </div>
            <div style={s.sidebarFooter}>
              <div style={s.totalRow}>
                <span>Total</span>
                <span style={s.totalAmount}>{showTotal ? `$${total.toLocaleString()}` : '—'}</span>
              </div>
              <textarea style={s.notes} value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Notas adicionales..." rows={2} />
              <button style={{...s.confirmBtn, opacity: cartItems.length === 0 ? 0.5 : 1}}
                disabled={cartItems.length === 0} onClick={openModal}>
                Confirmar pedido →
              </button>
            </div>
          </div>
        </>}
      </div>

      {isMobile && (
        <>
          {cartPanelOpen && (
            <div style={s.cartPanelBackdrop} onClick={() => setCartPanelOpen(false)} />
          )}

          <div style={{...s.cartPanel, transform: cartPanelOpen ? 'translateY(0)' : 'translateY(100%)'}}>
            <div style={s.cartPanelHeader}>
              <span style={s.cartPanelTitle}>Tu Pedido</span>
              <button style={s.cartPanelClose} onClick={() => setCartPanelOpen(false)}>✕</button>
            </div>
            <div style={s.cartPanelBody}>
              {cartItems.length === 0 ? (
                <div style={s.cartEmpty}>
                  <p>Tu pedido está vacío.<br/>Agregá diseños del catálogo.</p>
                </div>
              ) : (
                cartItems.map(item => (
                  <div key={item.id} style={s.cartItem}>
                    <div style={s.cartItemInfo}>
                      <div style={s.cartItemName}>{item.name}</div>
                    </div>
                    <div style={s.cartItemRight}>
                      <span style={s.cartQty}>×{item.qty}</span>
                      {showPrices && item.showPrice !== false && (() => {
                        const price = getUnitPrice(item.product_id);
                        const minQty = getProductMinQty(item.product_id);
                        if (price === null) return null;
                        if (price !== null && price > 0) return <span style={s.cartPrice}>${(item.qty * price).toLocaleString()}</span>;
                        return null;
                      })()}
                    </div>
                    <button style={s.removeBtn} onClick={() => removeFromCart(item.id)}>✕</button>
                  </div>
                ))
              )}
            </div>
            <div style={s.cartPanelFooter}>
              <div style={s.totalRow}>
                <span>Total</span>
                <span style={s.totalAmount}>{showTotal ? `$${total.toLocaleString()}` : '—'}</span>
              </div>
              <textarea style={s.notes} value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Notas adicionales..." rows={2} />
              <button
                style={{...s.confirmBtn, opacity: cartItems.length === 0 ? 0.5 : 1}}
                disabled={cartItems.length === 0}
                onClick={() => { setCartPanelOpen(false); openModal(); }}
              >
                Confirmar pedido →
              </button>
            </div>
          </div>

          <div style={s.mobileBar}>
            <button style={s.mobileBarLeft} onClick={() => setCartPanelOpen(o => !o)}>
              <span style={s.mobileBadge}>{totalItems}</span>
              <span style={s.mobileTotal}>{showTotal ? `$${total.toLocaleString()}` : `${totalItems} item${totalItems !== 1 ? 's' : ''}`}</span>
              <span style={s.mobileBarChevron}>{cartPanelOpen ? '▼' : '▲'}</span>
            </button>
            <button
              style={{...s.mobileConfirmBtn, ...(cartItems.length === 0 ? s.mobileConfirmBtnDisabled : {})}}
              disabled={cartItems.length === 0}
              onClick={openModal}
            >
              Confirmar →
            </button>
          </div>
        </>
      )}

      {modalOpen && (
        <div style={s.overlay} onClick={e => { if(e.target === e.currentTarget) setModalOpen(false); }}>
          <div style={s.modal}>
            {!success ? (
              <>
                <div style={s.modalHeader}>
                  <span>Confirmar Pedido</span>
                  <button style={s.closeBtn} onClick={() => setModalOpen(false)}>✕</button>
                </div>
                <div style={s.modalBody}>
                  <div style={s.codeBanner}>
                    <small style={s.codeLabel}>Código de pedido</small>
                    <strong style={s.codeValue}>{orderCode}</strong>
                  </div>
                  {user ? (
                    <div style={{...s.notice, background:'#f0fdf4', border:'1px solid #bbf7d0', color:'#15803d'}}>
                      ✓ Pedido como cliente registrado.
                    </div>
                  ) : (
                    <div style={s.notice}>
                      ⚠️ <strong>Cliente no registrado.</strong> Vamos a pedirte confirmación por WhatsApp antes de procesar el pedido.
                    </div>
                  )}
                  <div style={{...s.formRow, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr'}}>
                    <div style={s.formGroup}>
                      <label style={s.label}>Nombre *</label>
                      <input style={s.input} value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Tu nombre" />
                    </div>
                    <div style={s.formGroup}>
                      <label style={s.label}>Teléfono *</label>
                      <input style={s.input} value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="3764000000" />
                    </div>
                  </div>
                  <div style={s.formGroup}>
                    <label style={s.label}>Email *</label>
                    <input style={s.input} value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="tu@email.com" />
                  </div>
                  <div style={s.orderSummary}>
                    {cartItems.map(i => (
                      <div key={i.id} style={s.summaryItem}>
                        <span>{i.name} × {i.qty}</span>
                        {showPrices && i.showPrice !== false && (() => {
                          const price = getUnitPrice(i.product_id);
                          const minQty = getProductMinQty(i.product_id);
                          if (price === null) return null;
                          if (price !== null && price > 0) return <span>${(i.qty * price).toLocaleString()}</span>;
                          return null;
                        })()}
                      </div>
                    ))}
                    <div style={{...s.summaryItem, fontWeight:700, borderTop:'1px solid #dde1ef', paddingTop:8, marginTop:4}}>
                      <span>Total</span>
                      <span>{showTotal ? `$${total.toLocaleString()}` : '—'}</span>
                    </div>
                  </div>
                  <div style={s.modalActions}>
                    <button style={s.btnSecondary} onClick={() => setModalOpen(false)}>Cancelar</button>
                    <button style={s.btnPrimary} onClick={submitOrder} disabled={loading}>
                      {loading ? 'Enviando...' : 'Enviar pedido'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={s.successScreen}>
                <div style={s.successIcon}>✓</div>
                <h3 style={s.successTitle}>¡Pedido enviado!</h3>
                <p>Código de tu pedido:</p>
                <div style={s.successCode}>{orderCode}</div>
                <p>Te enviamos la confirmación a tu email.</p>
                <a href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(
                  `Hola INKORA! Quiero confirmar mi pedido\nCódigo: ${orderCode}\nNombre: ${confirmedOrder.form.name}\nItems:\n${confirmedOrder.items.map(i => `- ${i.name} × ${i.qty}`).join('\n')}${showTotal ? `\nTotal: $${confirmedOrder.total.toLocaleString()}` : ''}`
                )}`} target="_blank" rel="noreferrer" style={s.btnWaConfirm}>
                  💬 Confirmar por WhatsApp
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      <a
        href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Hola! Vengo desde la página. ')}`}
        target="_blank"
        rel="noreferrer"
        style={{...s.waFab, bottom: isMobile ? 80 : 24, right: isMobile ? 16 : 24}}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        <svg viewBox="0 0 24 24" fill="white" width="28" height="28">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.025.507 3.934 1.395 5.604L0 24l6.532-1.372A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.007-1.368l-.36-.214-3.724.782.795-3.632-.235-.374A9.818 9.818 0 012.182 12C2.182 6.578 6.578 2.182 12 2.182S21.818 6.578 21.818 12 17.422 21.818 12 21.818z"/>
        </svg>
      </a>

      <footer style={{...s.footer, paddingBottom: isMobile ? 84 : 20}}>
        <strong>INKORA®</strong> Soluciones Gráficas — Todos los derechos reservados © 2026
      </footer>

      {authModalOpen && (
        <AuthModal
          onClose={() => setAuthModalOpen(false)}
          onSuccess={() => setAuthModalOpen(false)}
        />
      )}
    </div>
  );
}

const styles = {
  app: { fontFamily: "'Barlow', sans-serif", minHeight: '100vh', background: '#f7f8fc', display: 'flex', flexDirection: 'column' },
  header: { background: '#1B2F5E', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 16px rgba(27,47,94,0.25)' },
  headerInner: { maxWidth: 1400, margin: '0 auto', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoWrap: { display: 'flex', alignItems: 'center', gap: 12 },
  headerActions: { display: 'flex', alignItems: 'center', gap: 10 },
  btnLoginHeader: { background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnUserHeader: { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer' },
  priceHint: { fontSize: 12, color: '#9aa3bc', textAlign: 'center', marginBottom: 8, fontStyle: 'italic' },
  sidebarSearchBox: { width: 340, background: 'rgba(27,47,94,0.95)', borderRadius: 10, padding: '10px 16px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8 },
  btnWa: { background: '#25D366', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 },
  btnSearchToggle: { background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', borderRadius: 8, width: 36, height: 36, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  mobileSearchBar: { position: 'fixed', top: 64, right: 12, width: 180, zIndex: 90, background: 'rgba(27,47,94,0.95)', borderRadius: 10, padding: '6px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', gap: 6 },
  mobileSearchInput: { border: 'none', borderRadius: 8, padding: '8px 12px', outline: 'none', flex: 1, background: 'rgba(255,255,255,0.15)', fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'white', minWidth: 0, WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none' },
  layout: { maxWidth: 1400, margin: '0 auto', display: 'grid', gap: 24, alignItems: 'start', alignContent: 'start' },
  catalogArea: { minHeight: '70vh', flex: 1, width: '100%', alignSelf: 'flex-start' },
  catalogHeader: { marginBottom: 16 },
  h1: { fontWeight: 700, color: '#1B2F5E', marginBottom: 4 },
  subtitle: { color: '#5a6380', fontSize: 14 },
  productTabs: { display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none', flexWrap: 'nowrap' },
  productTab: { background: 'white', border: '1.5px solid #dde1ef', color: '#5a6380', borderRadius: 10, padding: '8px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
  productTabActive: { background: '#1B2F5E', borderColor: '#1B2F5E', color: 'white' },
  searchWrap: { position: 'relative', display: 'flex', alignItems: 'center', marginBottom: 12 },
  searchIcon: { display: 'flex', alignItems: 'center', flexShrink: 0, pointerEvents: 'none' },
  searchInput: { border: 0, outline: 'none', flex: 1, background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 10px', fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'white', minWidth: 0, WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none' },
  searchClear: { background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: 14, padding: 4, lineHeight: 1, display: 'flex', alignItems: 'center', flexShrink: 0 },
  filters: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 },
  filterBtn: { background: 'white', border: '1.5px solid #dde1ef', color: '#5a6380', borderRadius: 20, padding: '6px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  filterActive: { background: '#1B2F5E', borderColor: '#1B2F5E', color: 'white' },
  grid: { display: 'grid', gap: 14 },
  card: { background: 'linear-gradient(145deg, rgba(27,47,94,0.08) 0%, rgba(27,47,94,0.15) 100%)', borderRadius: 12, overflow: 'hidden', border: '1.5px solid rgba(27,47,94,0.12)', boxShadow: '0 2px 8px rgba(27,47,94,0.08), inset 0 1px 0 rgba(255,255,255,0.8)', transition: 'transform 0.15s ease, box-shadow 0.15s ease' },
  cardImg: { background: '#eef0f6', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  img: { width: '100%', height: '100%', objectFit: 'cover' },
  catTag: { alignSelf: 'flex-start', background: 'rgba(27,47,94,0.15)', color: '#1B2F5E', fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' },
  cardBody: { padding: '10px 10px 12px', display: 'flex', flexDirection: 'column', gap: 8 },
  cardName: { fontSize: 13, fontWeight: 600, color: '#2d3352' },
  cardUnitPrice: { fontSize: 11, color: '#2D6BE4', fontWeight: 600 },
  cardMinQty: { fontSize: 11, color: '#9aa3bc', fontWeight: 500 },
  cartMinQty: { fontSize: 11, color: '#9aa3bc', fontStyle: 'italic' },
  qtyControl: { display: 'flex', alignItems: 'center', border: '1.5px solid #2D6BE4', borderRadius: 8, overflow: 'hidden' },
  qtyBtn: { background: 'none', border: 'none', width: 32, height: 32, cursor: 'pointer', fontSize: 18, color: '#5a6380' },
  qtyNum: { flex: 1, textAlign: 'center', fontWeight: 700, color: '#1B2F5E' },
  emptyState: { textAlign: 'center', padding: 40, color: '#9aa3bc' },
  sidebar: { background: 'white', borderRadius: 14, border: '1.5px solid #dde1ef', overflow: 'hidden' },
  sidebarHeader: { background: '#1B2F5E', color: 'white', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  sidebarTitle: { fontWeight: 700, fontSize: 16, letterSpacing: 1 },
  badge: { background: '#2D6BE4', color: 'white', fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 10 },
  sidebarSearch: { padding: '12px 20px', borderBottom: '1.5px solid #dde1ef', position: 'relative', display: 'flex', alignItems: 'center' },
  sidebarBody: { padding: '16px 20px', maxHeight: 400, overflowY: 'auto' },
  cartEmpty: { textAlign: 'center', padding: '32px 16px', color: '#9aa3bc', fontSize: 14 },
  cartItem: { display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: '#f7f8fc', borderRadius: 8, marginBottom: 8 },
  cartItemInfo: { flex: 1, minWidth: 0 },
  cartItemName: { fontSize: 12, fontWeight: 600, color: '#2d3352' },
  cartItemRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 },
  cartQty: { fontSize: 12, fontWeight: 700, color: '#1B2F5E', background: '#e8eef9', borderRadius: 6, padding: '2px 8px' },
  cartPrice: { fontSize: 12, color: '#5a6380' },
  removeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#9aa3bc', fontSize: 14 },
  sidebarFooter: { padding: '16px 20px', borderTop: '1.5px solid #eef0f6' },
  totalRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontWeight: 700, color: '#1B2F5E', fontSize: 16 },
  totalAmount: { fontSize: 20, fontWeight: 700 },
  notes: { width: '100%', border: '1.5px solid #dde1ef', borderRadius: 8, padding: '10px 12px', fontFamily: 'Barlow, sans-serif', fontSize: 13, resize: 'none', marginBottom: 12, boxSizing: 'border-box' },
  confirmBtn: { width: '100%', background: '#1B2F5E', color: 'white', border: 'none', borderRadius: 10, padding: 13, fontSize: 16, fontWeight: 700, cursor: 'pointer', letterSpacing: 1 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(17,32,64,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { background: 'white', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' },
  modalHeader: { background: '#1B2F5E', color: 'white', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: 18 },
  closeBtn: { background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 30, height: 30, borderRadius: 6, cursor: 'pointer', fontSize: 16 },
  modalBody: { padding: 24 },
  codeBanner: { background: '#e8eef9', border: '1.5px solid #2D6BE4', borderRadius: 10, padding: '12px 16px', textAlign: 'center', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 4 },
  codeLabel: { fontSize: 11, color: '#2D6BE4', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' },
  codeValue: { fontSize: 22, fontWeight: 700, color: '#1B2F5E', letterSpacing: 2 },
  notice: { background: '#fff8e1', border: '1.5px solid #f6c200', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 12, color: '#7a5800' },
  formRow: { display: 'grid', gap: 12 },
  formGroup: { marginBottom: 14 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  input: { width: '100%', border: '1.5px solid #dde1ef', borderRadius: 8, padding: '10px 12px', fontFamily: 'Barlow, sans-serif', fontSize: 14, color: '#2d3352', boxSizing: 'border-box' },
  orderSummary: { background: '#f7f8fc', borderRadius: 10, padding: 12, marginBottom: 16, maxHeight: 160, overflowY: 'auto' },
  summaryItem: { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid #eef0f6' },
  modalActions: { display: 'flex', gap: 10 },
  btnSecondary: { flex: 1, background: 'white', border: '1.5px solid #dde1ef', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 600, color: '#5a6380', cursor: 'pointer' },
  btnPrimary: { flex: 2, background: '#1B2F5E', border: 'none', borderRadius: 10, padding: 12, fontSize: 16, fontWeight: 700, color: 'white', cursor: 'pointer' },
  successScreen: { textAlign: 'center', padding: '32px 24px' },
  successIcon: { width: 64, height: 64, background: '#18a36a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28, color: 'white' },
  successTitle: { fontSize: 22, fontWeight: 700, color: '#1B2F5E', marginBottom: 8 },
  successCode: { fontSize: 24, fontWeight: 700, color: '#2D6BE4', letterSpacing: 2, margin: '12px 0' },
  btnWaConfirm: { display: 'inline-flex', alignItems: 'center', gap: 8, background: '#25D366', color: 'white', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 16, textDecoration: 'none' },
  waFab: { position: 'fixed', zIndex: 150, width: 56, height: 56, borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(37,211,102,0.4)', transition: 'transform 0.2s ease', textDecoration: 'none' },
  footer: { background: '#112040', color: 'rgba(255,255,255,0.45)', textAlign: 'center', padding: 20, paddingBottom: 64, fontSize: 12, marginTop: 40 },
  mobileBar: { position: 'fixed', bottom: 0, left: 0, right: 0, height: 64, background: '#1B2F5E', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', zIndex: 160, boxShadow: '0 -2px 16px rgba(27,47,94,0.3)' },
  mobileBarLeft: { display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  mobileBadge: { background: '#2D6BE4', color: 'white', fontSize: 13, fontWeight: 700, padding: '3px 10px', borderRadius: 12 },
  mobileTotal: { color: 'white', fontWeight: 700, fontSize: 18 },
  mobileBarChevron: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  mobileConfirmBtn: { background: 'white', color: '#1B2F5E', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5 },
  mobileConfirmBtnDisabled: { background: '#4a5a7a', color: 'rgba(255,255,255,0.4)', cursor: 'not-allowed' },
  cartPanelBackdrop: { position: 'fixed', inset: 0, background: 'rgba(17,32,64,0.45)', zIndex: 140 },
  cartPanel: { position: 'fixed', bottom: 64, left: 0, right: 0, height: '55vh', background: 'white', borderRadius: '16px 16px 0 0', zIndex: 150, display: 'flex', flexDirection: 'column', transition: 'transform 0.3s ease', boxShadow: '0 -4px 24px rgba(27,47,94,0.2)' },
  cartPanelHeader: { background: '#1B2F5E', borderRadius: '16px 16px 0 0', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 },
  cartPanelTitle: { color: 'white', fontWeight: 700, fontSize: 16, letterSpacing: 0.5 },
  cartPanelClose: { background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  cartPanelBody: { flex: 1, overflowY: 'auto', padding: '12px 16px' },
  cartPanelFooter: { padding: '12px 16px', borderTop: '1.5px solid #eef0f6', flexShrink: 0 },
};
