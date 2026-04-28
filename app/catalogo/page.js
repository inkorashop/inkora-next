'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Fuse from 'fuse.js';
import { supabase } from '@/lib/supabase';
import AuthModal from '@/components/AuthModal';
import ModelViewer from '@/components/ModelViewer';
import { useCart } from '@/contexts/CartContext';
import Header from '@/components/Header';

const SearchIconWhite = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="6.5" cy="6.5" r="4.5" stroke="white" strokeWidth="1.5"/>
    <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP;

function generateCode() {
  const ts = Date.now().toString(36).toUpperCase().slice(-4);
  const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
  return 'INK-' + ts + rand;
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

function toSlug(name) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function ModelViewerWithFallback({ url, autoRotate, modelConfig, imageUrl }) {
  const [ready, setReady] = useState(false);
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {!ready && imageUrl && (
        <img src={imageUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', zIndex: 1 }} />
      )}
      <div style={{ position: 'absolute', inset: 0, zIndex: 2 }}>
        <ModelViewer url={url} autoRotate={autoRotate} modelConfig={modelConfig} hideHint={true} onReady={() => setReady(true)} />
      </div>
    </div>
  );
}

function LazyModelViewer({ url, autoRotate, modelConfig, isHovered, imageUrl }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const [cachedUrl, setCachedUrl] = useState(null);
  const displayMode = modelConfig?.display_mode || 'hover';

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { setVisible(entry.isIntersecting); },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Precargar el archivo en memoria cuando la card es visible
  useEffect(() => {
    if (!visible || !url || cachedUrl) return;
    fetch(url)
      .then(r => r.blob())
      .then(blob => {
        const ext = url.split('?')[0].split('.').pop().toLowerCase();
        const mimeType = ext === '3mf' ? 'application/octet-stream' : 'model/gltf-binary';
        const namedBlob = new Blob([blob], { type: mimeType });
        const localUrl = URL.createObjectURL(namedBlob);
        // Guardamos la URL original para que Three.js detecte la extensión
        setCachedUrl(url);
        // Pre-fetch completado, el archivo ya está en caché del browser
      })
      .catch(() => {});
  }, [visible, url]);

  const showModel = displayMode === 'hover' ? isHovered : visible;
  const modelUrl = cachedUrl || url;

  return (
    <div ref={ref} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eef0f6' }}>
      {imageUrl && !showModel && (
        <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      )}
      {showModel && (
        <ModelViewerWithFallback url={modelUrl} autoRotate={autoRotate} modelConfig={modelConfig} imageUrl={imageUrl} />
      )}
      {!showModel && !imageUrl && <span style={{ fontSize: 36 }}>🖨️</span>}
    </div>
  );
}

export default function Home() {
  const [products, setProducts] = useState([]);
  const [activeProductId, setActiveProductId] = useState(null);
  const [designsByProduct, setDesignsByProduct] = useState({});
  const [gridOpacity, setGridOpacity] = useState(1);
  const [gridTransition, setGridTransition] = useState('opacity 0.2s ease');
  const [filter, setFilter] = useState('Todos');
  const [notes, setNotes] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [orderCode, setOrderCode] = useState(generateCode());
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [success, setSuccess] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState({ items: [], total: 0, form: {} });
  const [loading, setLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stickySearchVisible, setStickySearchVisible] = useState(false);
  const [cartPanelOpen, setCartPanelOpen] = useState(false);
  const inlineSearchRef = useRef(null);
  const [qtyAnim, setQtyAnim] = useState({});
  const [cardPulse, setCardPulse] = useState({});
  const [cardHover, setCardHover] = useState({});
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [priceTiers, setPriceTiers] = useState([]);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [uiSettings, setUiSettings] = useState({});

  const { cart, cartItems, totalItems, addToCart: addToCartCtx, changeQty: changeQtyCtx, removeFromCart, clearCart, setCartItem } = useCart();

  const width = useWindowWidth();
  const isMobile = width < 768;

  const activeProduct = products.find(p => p.id === activeProductId) || null;
  const designs = useMemo(() => designsByProduct[activeProductId] ?? [], [designsByProduct, activeProductId]);

  useEffect(() => {
    document.body.style.paddingBottom = '1px';
    loadProducts();

    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) loadProfile(u.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) loadProfile(u.id); else { setProfile(null); setPriceTiers([]); }
    });

    supabase.from('settings').select('*')
      .then(({ data }) => {
        if (data) {
          const map = {};
          data.forEach(s => { map[s.key] = s.value; });
          setUiSettings(map);
          // Sincronizar google_login_hint a localStorage para que lib/auth.js lo lea
          const hintEnabled = map['google_login_hint'] === 'true';
          localStorage.setItem('inkora_google_hint_enabled', hintEnabled ? 'true' : 'false');
        }
      });

    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);

    let tabInterval;
    let tabToggle = false;

    function startTabAnim(cfg) {
      const text = cfg.tab_text || 'INKORA 🔷';
      const interval = parseInt(cfg.tab_interval) || 1000;
      const onAway = cfg.tab_on_away === 'true';
      const onActive = cfg.tab_on_active === 'true';
      clearInterval(tabInterval);

      if (!onAway && !onActive) return;

      function animate() {
        clearInterval(tabInterval);
        tabInterval = setInterval(() => {
          document.title = tabToggle ? 'INKORA' : text;
          tabToggle = !tabToggle;
        }, interval);
      }

      function stop() {
        clearInterval(tabInterval);
        tabToggle = false;
        document.title = 'INKORA';
      }

      if (onAway && onActive) {
        animate();
      } else {
        function handleVisibility() {
          if (document.hidden && onAway) { animate(); }
          else if (!document.hidden && onActive) { animate(); }
          else { stop(); }
        }
        document.addEventListener('visibilitychange', handleVisibility);
        if (onActive && !document.hidden) animate();
      }
    }

    supabase.from('settings').select('*').in('key', ['catalogo_tab_text', 'catalogo_tab_interval', 'catalogo_tab_on_away', 'catalogo_tab_on_active'])
      .then(({ data }) => {
        if (data) {
          const cfg = {};
          data.forEach(s => { cfg[s.key.replace('catalogo_', '')] = s.value; });
          startTabAnim(cfg);
        }
      });

    return () => {
      subscription.unsubscribe();
      clearInterval(tabInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile(userId) {
    const { data } = await supabase.from('profiles').select('*, localities(*), sellers(id, name, phone)').eq('id', userId).single();
    setProfile(data);
    if (data?.locality_id) {
      const { data: tiers } = await supabase.from('price_tiers').select('*').eq('locality_id', data.locality_id).order('min_quantity');
      setPriceTiers(tiers || []);
    } else {
      const { data: tiers } = await supabase.from('price_tiers').select('*').is('locality_id', null).order('min_quantity');
      setPriceTiers(tiers || []);
    }
  }

  function switchProduct(id) {
    if (id === activeProductId) return;
    setGridTransition('opacity 0.15s ease');
    setGridOpacity(0);
    setTimeout(() => {
      setActiveProductId(id);
      setFilter('Todos');
      setSearchQuery('');
      const product = products.find(p => p.id === id);
      if (product) {
        const slug = toSlug(product.name);
        window.history.replaceState(null, '', '/catalogo?producto=' + slug);
      }
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

  const activeProductIdRef = useRef(activeProductId);
  useEffect(() => { activeProductIdRef.current = activeProductId; }, [activeProductId]);

  useEffect(() => {
    function handleClick(e) {
      const xPercent = parseFloat(((e.clientX / window.innerWidth) * 100).toFixed(3));
      const yPercent = parseFloat(((e.clientY / window.innerHeight) * 100).toFixed(3));
      const elemento = (e.target?.tagName?.toLowerCase() || '') + (e.target?.className ? '.' + String(e.target.className).split(' ').filter(Boolean).slice(0, 3).join('.') : '');
      supabase.from('click_events').insert({
        x_percent: xPercent,
        y_percent: yPercent,
        elemento: elemento.slice(0, 200),
        producto_activo: activeProductIdRef.current || null,
        timestamp: new Date().toISOString(),
      }).then(() => {});
    }
    document.addEventListener('click', handleClick, { passive: true });
    return () => document.removeEventListener('click', handleClick);
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
    const { data } = await supabase.from('products').select('*').eq('active', true).order('sort_order', { nullsFirst: false }).order('created_at');
    if (data && data.length > 0) {
      setProducts(data);
      const params = new URLSearchParams(window.location.search);
      const slug = params.get('producto');
      const match = slug ? data.find(p => toSlug(p.name) === slug) : null;
      setActiveProductId(match ? match.id : data[0].id);
      loadAllDesigns(data);
    }
  }

  async function loadAllDesigns(productList) {
    const results = await Promise.all(
      productList.map(p =>
        supabase.from('designs').select('*').eq('active', true).eq('product_id', p.id).order('sort_order', { nullsFirst: false }).order('created_at').limit(10000)
      )
    );
    const map = {};
    productList.forEach((p, i) => {
      if (results[i].data) map[p.id] = results[i].data;
    });
    setDesignsByProduct(map);
  }

  const fuse = useMemo(() => new Fuse(designs, {
    keys: ['name', 'tags'],
    threshold: 0.6,
    distance: 100,
    ignoreLocation: true,
    minMatchCharLength: 1,
  }), [designs]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return designs;
    return fuse.search(searchQuery.trim()).map(r => r.item);
  }, [searchQuery, fuse, designs]);

  
  const categories = ['Todos', ...(Array.isArray(activeProduct?.categories) && activeProduct.categories.length > 0
    ? activeProduct.categories
    : [...new Set(designs.map(d => d.category).filter(c => c && c !== 'Sin categoria'))])];
  const filtered = searchQuery.trim()
    ? (filter === 'Todos' ? searchResults : searchResults.filter(d => d.category === filter && d.category !== 'Sin categoria'))
    : (filter === 'Todos' ? designs : designs.filter(d => {
        const cats = Array.isArray(d.categories) && d.categories.length > 0 ? d.categories : (d.category ? [d.category] : []);
        return cats.includes(filter);
      }));
  const showPrices = !!user;

  const cartByProduct = cartItems.reduce((acc, item) => {
    acc[item.product_id] = (acc[item.product_id] || 0) + item.qty;
    return acc;
  }, {});

  function getProductMinQty(productId) {
    const tiers = priceTiers.filter(t => t.product_id === productId);
    if (tiers.length === 0) return null;
    return Math.min(...tiers.map(t => Number(t.min_quantity)));
  }

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
    return null;
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

  const cardWidth = isMobile
    ? (activeProduct?.card_width_mobile ?? 160)
    : (activeProduct?.card_width_desktop ?? 180);
  const sidebarWidth = isMobile ? 0 : (sidebarCollapsed ? 48 : 388);
  const availableWidth = width - sidebarWidth - (isMobile ? 32 : 48);
  const colCount = Math.max(1, Math.floor(availableWidth / cardWidth));
  const gridCols = `repeat(${colCount}, minmax(${cardWidth}px, 1fr))`;
  const cardAspectRatio = activeProduct?.aspect_ratio ?? '2/3';

  function addToCart(design) {
    const product = products.find(p => p.id === design.product_id);
    addToCartCtx(design, product);
    triggerQtyAnim(design.id, 'pop');
    triggerCardPulse(design.id);
  }

  function changeQty(id, delta) {
    changeQtyCtx(id, delta);
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

  function closeModal() {
    setModalOpen(false);
    setSuccess(false);
    setConfirmedOrder({ items: [], total: 0, form: {} });
    setOrderCode(generateCode());
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
      alert('Por favor completa todos los campos.');
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
        body: JSON.stringify({ orderCode, form, cartItems: cartItems.map(i => ({ ...i, pricePerUnit: getUnitPrice(i.product_id) ?? i.pricePerUnit })), total, notes, sellerName: profile?.sellers?.name || null, sendConfirmation: profile?.send_confirmation_email !== false })
      });

      setConfirmedOrder({ items: cartItems, total, form });
      setSuccess(true);
      clearCart();
      setNotes('');
    } catch (e) {
      alert('Hubo un error. Intenta de nuevo.');
    }
    setLoading(false);
  }

  const s = styles;
const DEFAULT_WA = process.env.NEXT_PUBLIC_WHATSAPP || '3765211017';
const rawWA = profile?.sellers?.phone?.replace(/\D/g, '') || DEFAULT_WA;
const waNumber = rawWA.startsWith('549') ? rawWA : `549${rawWA}`;

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
        .desktop-search-input::placeholder { color: rgba(255,255,255,0.5); }
        .qty-input::placeholder { color: #9aa3bc; }
        .qty-input:focus::placeholder { color: transparent; }

        .prod-tab { transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease, border-color 0.18s ease; will-change: transform; border: 2.5px solid transparent; box-shadow: 0 2px 6px rgba(27,47,94,0.12); opacity: 0.72; }
        .prod-tab:hover { transform: scale(1.06); opacity: 1; }
        .prod-tab-active { border-color: #2D6BE4 !important; box-shadow: 0 4px 14px rgba(45,107,228,0.35) !important; transform: scale(1.04); opacity: 1 !important; }
        *:focus { outline: none !important; box-shadow: none !important; }
        *:focus-visible { outline: none !important; box-shadow: none !important; }
      `}</style>

      <Header headerVisible={headerVisible} showCart={false} page="catalogo" />

      {isMobile && (
        <div style={{...s.mobileSearchBar, top: headerVisible ? 64 : 0, transition: 'top 0.3s ease'}}>
          <span style={s.searchIcon}><SearchIconWhite /></span>
          <input
            className="desktop-search-input"
            style={{ border: 'none', background: 'transparent', color: 'white', outline: 'none', flex: 1, fontSize: 14, fontFamily: 'Barlow, sans-serif', minWidth: 0 }}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar diseño..."
          />
          {searchQuery && (
            <button style={{...s.searchClear, color: 'rgba(255,255,255,0.8)', background: 'none', border: 'none'}} onClick={() => setSearchQuery('')}>X</button>
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
        paddingRight: isMobile ? 16 : (sidebarCollapsed ? 48 : 388),
        paddingTop: isMobile ? 72 : 24,
        paddingBottom: isMobile ? 88 : 24,
        transition: isMobile ? 'padding-top 0.3s ease' : undefined,
      }}>
        <div style={s.catalogArea}>
          <div style={s.catalogHeader}>
            <h1 style={{...s.h1, fontSize: isMobile ? 22 : 28}}>Catalogo</h1>
            <p style={s.subtitle}>Selecciona los diseños y arma tu pedido</p>
          </div>

          {products.length > 1 && (
            <div style={s.productTabs}>
              {products.map(p => {
                const isActive = activeProductId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => switchProduct(p.id)}
                    className={isActive ? 'prod-tab prod-tab-active' : 'prod-tab'}
                    style={{
                      position: 'relative',
                      width: 140,
                      height: 56,
                      borderRadius: 10,
                      overflow: 'hidden',
                      padding: 0,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {p.landing_image
                      ? <img src={p.landing_image} alt={p.name} style={{position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', display:'block'}} />
                      : <div style={{position:'absolute', inset:0, background:'linear-gradient(135deg, #1B2F5E 0%, #2D6BE4 100%)'}} />
                    }
                    <div style={{position:'absolute', inset:0, background:'linear-gradient(to top, rgba(10,20,50,0.82) 0%, rgba(10,20,50,0.2) 100%)'}} />
                    <span style={{position:'absolute', bottom:7, left:9, right:9, color:'white', fontSize:12, fontWeight:700, textAlign:'left', lineHeight:1.2, textShadow:'0 1px 3px rgba(0,0,0,1), 0 2px 8px rgba(0,0,0,0.9)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                      {p.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div style={s.filters}>
            {categories.map(cat => {
              const activeProd = products.find(p => p.id === activeProductId);
              const savedColor = activeProd?.category_colors?.[cat];
              const bg = savedColor || '#e8eef9';
              let textColor = '#2D6BE4';
              if (savedColor) {
                const hex = savedColor.replace('#', '');
                const r = parseInt(hex.slice(0, 2), 16);
                const g = parseInt(hex.slice(2, 4), 16);
                const b = parseInt(hex.slice(4, 6), 16);
                textColor = (r * 299 + g * 587 + b * 114) / 1000 > 100 ? '#000000' : '#ffffff';
              }
              const isActive = filter === cat;
              return (
                <button
                  key={cat}
                  className="filter-btn"
                  style={{
                    ...s.filterBtn,
                    background: isActive ? '#1B2F5E' : bg,
                    color: isActive ? 'white' : textColor,
                    transform: isActive ? 'scale(1.06)' : 'scale(1)',
                    boxShadow: isActive ? '0 2px 8px rgba(27,47,94,0.35)' : 'none',
                    transition: 'all 0.15s ease',
                    opacity: isActive ? 1 : 0.85,
                  }}
                  onClick={() => setFilter(cat)}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {!isMobile && (
            <div style={{position:'sticky', top: headerVisible ? 64 : 0, zIndex:90, marginBottom:16, transition:'top 0.3s ease'}}>
              <div style={{...s.sidebarSearchBox, position:'relative', top:'auto', right:'auto', width:'100%', boxSizing:'border-box'}}>
                <span style={s.searchIcon}><SearchIconWhite /></span>
                <input
                  className="desktop-search-input"
                  style={{ border: 'none', background: 'transparent', color: 'white', outline: 'none', flex: 1, fontSize: 14, fontFamily: 'Barlow, sans-serif' }}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar diseño..."
                />
                {searchQuery && (
                  <button style={{...s.searchClear, color: 'rgba(255,255,255,0.8)', background: 'none', border: 'none'}} onClick={() => setSearchQuery('')}>X</button>
                )}
              </div>
            </div>
          )}

          <div style={{opacity: gridOpacity, transition: gridTransition, minHeight: 'calc(100vh - 300px)', width: '100%'}}>
          {designs.length === 0 ? (
            <div style={s.emptyState}><p>No hay diseños todavia.</p></div>
          ) : filtered.length === 0 ? (
            <div style={s.emptyState}><p>Sin resultados para <strong>{searchQuery}</strong>.</p></div>
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
                      {d.model_url
                        ? <LazyModelViewer url={d.model_url} autoRotate={activeProduct?.allow_3d === true} modelConfig={activeProduct?.model_config || null} isHovered={isHovered} imageUrl={d.image_url} />
                        : d.image_url
                        ? <img src={d.image_url} alt={d.name} style={{...s.img, objectFit: 'contain'}} />
                        : <span style={{fontSize:36}}>🎨</span>}
                    </div>
                    <div style={s.cardBody}>
                      <div style={s.cardName}>{d.name}</div>
                      {d.category !== 'Sin categoria' && <span style={s.catTag}>{d.category}</span>}
                      {showPrices && activeProduct?.show_price !== false && (() => {
                        const price = getUnitPrice(activeProductId);
                        if (price !== null && price > 0) {
                          return <div style={s.cardUnitPrice}>${price.toLocaleString()}/u</div>;
                        }
                        const minQty = getProductMinQty(activeProductId);
                        const currentQty = cartByProduct[activeProductId] || 0;
                        if (minQty && currentQty > 0 && currentQty < minQty) {
                          return <div style={{...s.cardUnitPrice, color: '#e53e3e'}}>Mín. {minQty}u.</div>;
                        }
                        return null;
                      })()}
                      <div style={{...s.qtyControl, borderColor: inCart ? '#2D6BE4' : '#dde1ef', background: inCart ? '#1B2F5E' : 'white', marginTop: 'auto'}}>
                        <button style={{...s.qtyBtn, color: inCart ? 'white' : '#5a6380'}} onClick={() => changeQty(d.id, -1)}>-</button>
                        <input
                          type="number"
                          className={'qty-input' + (qtyAnim[d.id] === 'pop' ? ' qty-pop' : qtyAnim[d.id] === 'shrink' ? ' qty-shrink' : '')}
                          style={{...s.qtyNum, color: inCart ? 'white' : '#9aa3bc', background: 'transparent', border: 'none', outline: 'none', WebkitAppearance: 'none', MozAppearance: 'textfield', appearance: 'none', width: 40, textAlign: 'center', fontWeight: 700, padding: 0, cursor: 'text'}}
                          value={inCart ? inCart.qty : ''}
                          placeholder="0"
                          onFocus={e => { if (!inCart) e.target.value = ''; else e.target.select(); }}
                          onChange={e => {
                            const val = parseInt(e.target.value);
                            if (isNaN(val) || val <= 0) removeFromCart(d.id);
                            else if (!inCart) addToCart(d);
                            else setCartItem(d.id, val);
                          }}
                          onBlur={e => {
                            const val = parseInt(e.target.value);
                            if (isNaN(val) || val <= 0) removeFromCart(d.id);
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
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

        {!isMobile && (
          <div style={{...s.sidebar, position: 'fixed', top: headerVisible ? 64 : 0, right: 24, width: 340, transition: 'top 0.3s ease', bottom: 'max(24px, min(100px, 8vh))', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 14, zIndex: 98}}>
            {sidebarCollapsed ? (
              <div
                onClick={() => setSidebarCollapsed(false)}
                style={{flex:1, background:'#1B2F5E', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', writingMode:'vertical-rl', color:'rgba(255,255,255,0.7)', fontSize:11, fontWeight:700, letterSpacing:2, userSelect:'none', gap:8, flexDirection:'column'}}
              >
                <span style={{fontSize:14, writingMode:'horizontal-tb'}}>◀</span>
                <span>TU PEDIDO</span>
                {cartItems.length > 0 && <span style={{background:'#2D6BE4', color:'white', borderRadius:10, padding:'3px 6px', fontSize:10, writingMode:'horizontal-tb'}}>{cartItems.length}</span>}
              </div>
            ) : (
              <>
                <div style={s.sidebarHeader}>
                  <span style={s.sidebarTitle}>Tu Pedido</span>
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    {cartItems.length > 0 && <button onClick={() => setClearConfirmOpen(true)} style={{background:'rgba(255,255,255,0.15)', border:'none', color:'rgba(255,255,255,0.8)', borderRadius:6, padding:'3px 8px', fontSize:11, cursor:'pointer', fontFamily:'Barlow, sans-serif'}}>Limpiar</button>}
                    <span style={s.badge}>{cartItems.length} {cartItems.length === 1 ? 'producto' : 'productos'}</span>
                  </div>
                </div>
                <div style={s.sidebarBody}>
                  {cartItems.length === 0 ? (
                    <div style={s.cartEmpty}><p>Tu pedido esta vacio.<br/>Agrega diseños del catalogo.</p></div>
                  ) : (
                    cartItems.map(item => (
                      <div key={item.id} style={s.cartItem}>
                        {item.image_url && (
                          <img src={item.image_url} alt={item.name} style={{width: 36, height: 36, objectFit: 'cover', borderRadius: 6, flexShrink: 0, border: '1px solid #dde1ef'}} />
                        )}
                        <div style={s.cartItemInfo}>
                          <div style={s.cartItemName}>{item.name}</div>
                          {showPrices && item.showPrice !== false && (() => {
                            const price = getUnitPrice(item.product_id);
                            if (price !== null && price > 0) return <div style={s.cartItemUnitPrice}>c/u ${price.toLocaleString()}</div>;
                            const minQty = getProductMinQty(item.product_id);
                            const currentQty = cartByProduct[item.product_id] || 0;
                            if (minQty && currentQty < minQty) return <div style={{...s.cartItemUnitPrice, color:'#e53e3e'}}>Mín. {minQty}u.</div>;
                            return null;
                          })()}
                        </div>
                        <div style={s.cartItemRight}>
                          <span style={s.cartQty}>x{item.qty}</span>
                          {showPrices && item.showPrice !== false && (() => {
                            const price = getUnitPrice(item.product_id);
                            if (price !== null && price > 0) return <span style={s.cartPrice}>${(item.qty * price).toLocaleString()}</span>;
                            return null;
                          })()}
                        </div>
                        <button style={s.removeBtn} onClick={() => removeFromCart(item.id)}>X</button>
                      </div>
                    ))
                  )}
                </div>
                <div style={s.sidebarFooter}>
                  {showPrices && products.filter(p => cartByProduct[p.id] > 0).length > 0 && (
                    <div style={{marginBottom:12, display:'flex', flexDirection:'column', gap:4}}>
                      {products.filter(p => cartByProduct[p.id] > 0).map(p => {
                        const qty = cartByProduct[p.id] || 0;
                        const minQty = getProductMinQty(p.id);
                        const reached = !minQty || qty >= minQty;
                        return (
                          <div key={p.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:11, padding:'4px 8px', borderRadius:6, background: reached ? '#f0fdf4' : '#fef2f2', border: `1px solid ${reached ? '#bbf7d0' : '#fecaca'}`}}>
                            <span style={{color: reached ? '#15803d' : '#dc2626', fontWeight:600}}>{p.name}</span>
                            <span style={{color: reached ? '#15803d' : '#dc2626', fontWeight:700}}>
                              {qty}{minQty && !reached ? ` / ${minQty} mín.` : 'u.'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={s.totalRow}>
                    <span>Total</span>
                    <span style={s.totalAmount}>{showTotal ? '$' + total.toLocaleString() : '-'}</span>
                  </div>
                  <textarea style={s.notes} value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Notas adicionales..." rows={2} />
                  <button style={{...s.confirmBtn, opacity: cartItems.length === 0 ? 0.5 : 1}}
                    disabled={cartItems.length === 0} onClick={openModal}>
                    Confirmar pedido →
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {isMobile && (
        <>
          {cartPanelOpen && (
            <div style={s.cartPanelBackdrop} onClick={() => setCartPanelOpen(false)} />
          )}
          <div style={{...s.cartPanel, transform: cartPanelOpen ? 'translateY(0)' : 'translateY(100%)'}}>
            <div style={s.cartPanelHeader}>
              <span style={s.cartPanelTitle}>Tu Pedido</span>
              <button style={s.cartPanelClose} onClick={() => setCartPanelOpen(false)}>X</button>
            </div>
            <div style={s.cartPanelBody}>
              {cartItems.length === 0 ? (
                <div style={s.cartEmpty}><p>Tu pedido esta vacio.<br/>Agrega diseños del catalogo.</p></div>
              ) : (
                cartItems.map(item => (
                  <div key={item.id} style={s.cartItem}>
                    {item.image_url && (
                      <img src={item.image_url} alt={item.name} style={{width: 36, height: 36, objectFit: 'cover', borderRadius: 6, flexShrink: 0, border: '1px solid #dde1ef'}} />
                    )}
                    <div style={s.cartItemInfo}>
                      <div style={s.cartItemName}>{item.name}</div>
                      {showPrices && item.showPrice !== false && (() => {
                        const price = getUnitPrice(item.product_id);
                        if (price !== null && price > 0) return <div style={s.cartItemUnitPrice}>c/u ${price.toLocaleString()}</div>;
                        return null;
                      })()}
                    </div>
                    <div style={s.cartItemRight}>
                      <span style={s.cartQty}>x{item.qty}</span>
                      {showPrices && item.showPrice !== false && (() => {
                        const price = getUnitPrice(item.product_id);
                        if (price !== null && price > 0) return <span style={s.cartPrice}>${(item.qty * price).toLocaleString()}</span>;
                        return null;
                      })()}
                    </div>
                    <button style={s.removeBtn} onClick={() => removeFromCart(item.id)}>X</button>
                  </div>
                ))
              )}
            </div>
            <div style={s.cartPanelFooter}>
              {showPrices && products.filter(p => cartByProduct[p.id] > 0).length > 0 && (
                <div style={{marginBottom:12, display:'flex', flexDirection:'column', gap:4}}>
                  {products.filter(p => cartByProduct[p.id] > 0).map(p => {
                    const qty = cartByProduct[p.id] || 0;
                    const minQty = getProductMinQty(p.id);
                    const reached = !minQty || qty >= minQty;
                    return (
                      <div key={p.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:11, padding:'4px 8px', borderRadius:6, background: reached ? '#f0fdf4' : '#fef2f2', border: `1px solid ${reached ? '#bbf7d0' : '#fecaca'}`}}>
                        <span style={{color: reached ? '#15803d' : '#dc2626', fontWeight:600}}>{p.name}</span>
                        <span style={{color: reached ? '#15803d' : '#dc2626', fontWeight:700}}>
                          {qty}{minQty && !reached ? ` / ${minQty} mín.` : 'u.'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={s.totalRow}>
                <span>Total</span>
                <span style={s.totalAmount}>{showTotal ? '$' + total.toLocaleString() : '-'}</span>
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
              <span style={s.mobileTotal}>{showTotal ? '$' + total.toLocaleString() : totalItems + ' producto' + (totalItems !== 1 ? 's' : '')}</span>
              <span style={s.mobileBarChevron}>{cartPanelOpen ? 'v' : '^'}</span>
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
        <div style={s.overlay} onClick={e => { if(e.target === e.currentTarget) closeModal(); }}>
          <div style={s.modal}>
            {!success ? (
              <>
                <div style={s.modalHeader}>
                  <span>Confirmar Pedido</span>
                  <button style={s.closeBtn} onClick={closeModal}>X</button>
                </div>
                <div style={s.modalBody}>
                  <div style={s.codeBanner}>
                    <small style={s.codeLabel}>Codigo de pedido</small>
                    <strong style={s.codeValue}>{orderCode}</strong>
                  </div>
                  {user ? (
                    <div style={{...s.notice, background:'#f0fdf4', border:'1px solid #bbf7d0', color:'#15803d'}}>
                      Pedido como cliente registrado.
                    </div>
                  ) : (
                    <div style={s.notice}>
                      <strong>Cliente no registrado.</strong> Vamos a pedirte confirmacion por WhatsApp antes de procesar el pedido.
                    </div>
                  )}
                  <div style={{...s.formRow, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr'}}>
                    <div style={s.formGroup}>
                      <label style={s.label}>Nombre *</label>
                      <input style={s.input} value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Tu nombre" />
                    </div>
                    <div style={s.formGroup}>
                      <label style={s.label}>Telefono *</label>
                      <input style={s.input} type="tel" inputMode="numeric" value={form.phone} onChange={e => setForm({...form, phone: e.target.value.replace(/[^0-9]/g, '')})} placeholder="3764000000" />
                    </div>
                  </div>
                  <div style={s.formGroup}>
                    <label style={s.label}>Email *</label>
                    <input style={s.input} value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="tu@email.com" />
                  </div>
                  <div style={s.orderSummary}>
                    {cartItems.map(i => (
                      <div key={i.id} style={s.summaryItem}>
                        <span>{i.name} x {i.qty}</span>
                        {showPrices && i.showPrice !== false && (() => {
                          const price = getUnitPrice(i.product_id);
                          if (price === null) return null;
                          if (price > 0) return <span>${(i.qty * price).toLocaleString()}</span>;
                          return null;
                        })()}
                      </div>
                    ))}
                    <div style={{...s.summaryItem, fontWeight:700, borderTop:'1px solid #dde1ef', paddingTop:8, marginTop:4}}>
                      <span>Total</span>
                      <span>{showTotal ? '$' + total.toLocaleString() : '-'}</span>
                    </div>
                  </div>
                  <div style={{...s.modalActions, position:'sticky', bottom:0, background:'white', paddingTop:12, marginTop:8, borderTop:'1.5px solid #eef0f6', marginLeft:-24, marginRight:-24, paddingLeft:24, paddingRight:24, paddingBottom:24}}>
                    <button style={s.btnSecondary} onClick={closeModal}>Cancelar</button>
                    <button style={s.btnPrimary} onClick={submitOrder} disabled={loading}>
                      {loading ? 'Enviando...' : 'Enviar pedido'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={s.successScreen}>
                <div style={s.successIcon}>✓</div>
                <h3 style={s.successTitle}>Pedido enviado!</h3>
                <p>Codigo de tu pedido:</p>
                <div style={s.successCode}>{orderCode}</div>
                <p>Te enviamos la confirmacion a tu email.</p>
                <div style={{display:'flex', gap:10, marginTop:16, justifyContent:'center'}}>
                  <a href={"https://wa.me/" + waNumber + "?text=" + encodeURIComponent(
                    "Hola INKORA! Quiero confirmar mi pedido\nCodigo: " + orderCode + "\nNombre: " + confirmedOrder.form.name + "\nItems:\n" + confirmedOrder.items.map(i => "- " + i.name + " x " + i.qty).join('\n') + (confirmedOrder.total > 0 ? "\nTotal: $" + confirmedOrder.total.toLocaleString() : '')
                  )} target="_blank" rel="noreferrer" style={{...s.btnWaConfirm, marginTop:0, background:'rgba(37,211,102,0.15)', color:'#18a36a', border:'1.5px solid #25D366'}} onClick={closeModal}>
                    Confirmar por WhatsApp
                  </a>
                  <button style={{background:'#1B2F5E', border:'none', color:'white', borderRadius:10, padding:'12px 24px', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'Barlow, sans-serif'}} onClick={closeModal}>
                    Listo ✓
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {uiSettings['catalogo_show_whatsapp'] !== 'false' && (
        <a
          href={"https://wa.me/" + waNumber + "?text=" + encodeURIComponent('Hola! Vengo desde la pagina. ')}
          target="_blank"
          rel="noreferrer"
          style={{...s.waFab, bottom: isMobile ? 80 : 24, right: isMobile ? 16 : undefined, left: isMobile ? undefined : 24}}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <svg viewBox="0 0 24 24" fill="white" width="28" height="28">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.025.507 3.934 1.395 5.604L0 24l6.532-1.372A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.007-1.368l-.36-.214-3.724.782.795-3.632-.235-.374A9.818 9.818 0 012.182 12C2.182 6.578 6.578 2.182 12 2.182S21.818 6.578 21.818 12 17.422 21.818 12 21.818z"/>
          </svg>
        </a>
      )}

      <footer style={{...s.footer, paddingBottom: isMobile ? 84 : 20}}>
        <strong>INKORA</strong> Soluciones Graficas - Todos los derechos reservados 2026
      </footer>

      {clearConfirmOpen && (
        <div style={s.overlay} onClick={() => setClearConfirmOpen(false)}>
          <div style={{background:'white', borderRadius:16, padding:24, maxWidth:320, width:'100%', textAlign:'center'}} onClick={e => e.stopPropagation()}>
            <div style={{fontSize:32, marginBottom:12}}>🗑️</div>
            <h3 style={{color:'#1B2F5E', fontWeight:700, marginBottom:8}}>Limpiar pedido?</h3>
            <p style={{color:'#5a6380', fontSize:14, marginBottom:20}}>Se van a eliminar todos los diseños del carrito.</p>
            <div style={{display:'flex', gap:10}}>
              <button style={s.btnSecondary} onClick={() => setClearConfirmOpen(false)}>Cancelar</button>
              <button style={s.btnPrimary} onClick={() => { clearCart(); setClearConfirmOpen(false); }}>Limpiar</button>
            </div>
          </div>
        </div>
      )}

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
  mobileSearchBar: { position: 'fixed', top: 64, right: 12, width: 180, zIndex: 90, background: 'rgba(27,47,94,0.85)', borderRadius: 10, padding: '8px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', gap: 8 },
  mobileSearchInput: { border: 'none', borderRadius: 8, padding: '8px 12px', outline: 'none', flex: 1, background: 'rgba(255,255,255,0.15)', fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'white', minWidth: 0 },
  layout: { display: 'grid', gap: 24, alignItems: 'start', alignContent: 'start' },
  catalogArea: { minHeight: '70vh', flex: 1, width: '100%', alignSelf: 'flex-start' },
  catalogHeader: { marginBottom: 16 },
  h1: { fontWeight: 700, color: '#1B2F5E', marginBottom: 4 },
  subtitle: { color: '#5a6380', fontSize: 14 },
  productTabs: { display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  productTab: { background: 'white', border: 'none', color: '#5a6380', borderRadius: 10, padding: '8px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
  productTabActive: { background: '#1B2F5E', borderColor: '#1B2F5E', color: 'white' },
  searchIcon: { display: 'flex', alignItems: 'center', flexShrink: 0, pointerEvents: 'none' },
  searchClear: { background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: 14, padding: 4, lineHeight: 1, display: 'flex', alignItems: 'center', flexShrink: 0 },
  sidebarSearchBox: { width: 340, background: 'rgba(27,47,94,0.85)', borderRadius: 10, padding: '8px 14px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8, backdropFilter: 'blur(8px)' },
  filters: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 },
  filterBtn: { background: '#e8eef9', border: 'none', color: '#2D6BE4', borderRadius: 20, padding: '6px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  filterActive: { background: '#1B2F5E', borderColor: '#1B2F5E', color: 'white' },
  grid: { display: 'grid', gap: 14 },
  card: { background: 'linear-gradient(145deg, rgba(27,47,94,0.08) 0%, rgba(27,47,94,0.15) 100%)', borderRadius: 12, overflow: 'hidden', border: '1.5px solid rgba(27,47,94,0.12)', boxShadow: '0 2px 8px rgba(27,47,94,0.08), inset 0 1px 0 rgba(255,255,255,0.8)', transition: 'transform 0.15s ease, box-shadow 0.15s ease', display: 'flex', flexDirection: 'column' },
  cardImg: { background: '#eef0f6', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  img: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },
  catTag: { alignSelf: 'flex-start', background: 'rgba(27,47,94,0.15)', color: '#1B2F5E', fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' },
  cardBody: { padding: '10px 10px 12px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 },
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
  sidebarBody: { padding: '16px 20px', flex: 1, overflowY: 'auto', minHeight: 0 },
  cartEmpty: { textAlign: 'center', padding: '32px 16px', color: '#9aa3bc', fontSize: 14 },
  cartItem: { display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: '#f7f8fc', borderRadius: 8, marginBottom: 8 },
  cartItemInfo: { flex: 1, minWidth: 0 },
  cartItemName: { fontSize: 12, fontWeight: 600, color: '#2d3352' },
  cartItemUnitPrice: { fontSize: 10, color: '#2D6BE4', fontWeight: 600 },
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
  modal: { background: 'white', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'hidden', overflowX: 'hidden', display: 'flex', flexDirection: 'column' },
  modalHeader: { background: '#1B2F5E', color: 'white', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: 16 },
  closeBtn: { background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 26, height: 26, borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  modalBody: { padding: '12px 16px', overflowY: 'auto', flex: 1 },
  codeBanner: { background: '#e8eef9', border: '1.5px solid #2D6BE4', borderRadius: 8, padding: '6px 12px', textAlign: 'center', marginBottom: 8, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  codeLabel: { fontSize: 10, color: '#2D6BE4', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', whiteSpace: 'nowrap' },
  codeValue: { fontSize: 18, fontWeight: 700, color: '#1B2F5E', letterSpacing: 2 },
  notice: { background: '#fff8e1', border: '1.5px solid #f6c200', borderRadius: 6, padding: '6px 10px', marginBottom: 8, fontSize: 11, color: '#7a5800' },
  formRow: { display: 'grid', gap: 8 },
  formGroup: { marginBottom: 8 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  input: { width: '100%', border: '1.5px solid #dde1ef', borderRadius: 7, padding: '7px 10px', fontFamily: 'Barlow, sans-serif', fontSize: 13, color: '#2d3352', boxSizing: 'border-box' },
  orderSummary: { background: '#f7f8fc', borderRadius: 8, padding: '6px 10px', marginBottom: 8, maxHeight: 120, overflowY: 'auto' },
  summaryItem: { display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px solid #eef0f6' },
  modalActions: { display: 'flex', gap: 8 },
  btnSecondary: { flex: 1, background: 'white', border: '1.5px solid #dde1ef', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontWeight: 600, color: '#5a6380', cursor: 'pointer' },
  btnPrimary: { flex: 2, background: '#1B2F5E', border: 'none', borderRadius: 8, padding: '9px 12px', fontSize: 14, fontWeight: 700, color: 'white', cursor: 'pointer' },
  successScreen: { textAlign: 'center', padding: '32px 24px', overflowX: 'hidden' },
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