'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import ModelViewer from '@/components/ModelViewer';
import ProductionTab from '@/components/ProductionTab';

const EMPTY_PRODUCT = { name: '', slug: '', card_width_desktop: 180, card_width_mobile: 160, landing_card_width_desktop: 320, landing_card_width_mobile: 280, aspect_ratio: '2/3', max_file_size_kb: 250, landing_max_file_size_kb: 4096, price_per_unit: 0, show_price: true, allow_3d: false, allow_glb: false };
const LOGO = 'https://ylawwaoznxzxwetlkjel.supabase.co/storage/v1/object/public/assets/Logo%20nuevo.png';

function fileToBase64(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(file);
  });
}

function blobToBase64(blob) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

function slugify(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function EyeOpen() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1B2F5E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9aa3bc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" style={{flexShrink:0}}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

function HoldButton({ onConfirm }) {
  const [progress, setProgress] = React.useState(0);
  const intervalRef = React.useRef(null);

  function startHold() {
    intervalRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(intervalRef.current);
          onConfirm();
          return 100;
        }
        return prev + 5;
      });
    }, 100);
  }

  function stopHold() {
    clearInterval(intervalRef.current);
    setProgress(0);
  }

  return (
    <button
      onMouseDown={startHold}
      onMouseUp={stopHold}
      onMouseLeave={stopHold}
      onTouchStart={startHold}
      onTouchEnd={stopHold}
      style={{position:'relative', background:'linear-gradient(135deg, #e53e3e, #c53030)', color:'white', border:'none', borderRadius:10, padding:'8px 20px', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(229,62,62,0.4)', overflow:'hidden', minWidth:140, userSelect:'none'}}
    >
      <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,0.25)', width: progress + '%', transition:'width 0.05s linear'}} />
      <span style={{position:'relative', zIndex:1}}>
        {progress === 0 ? 'Mantené para eliminar' : progress >= 100 ? '✓ Eliminado' : `${Math.round(progress)}%`}
      </span>
    </button>
  );
}

function TrashBtn({ onClick }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      style={{
        background: hovered ? 'rgba(229,62,62,0.25)' : 'rgba(229,62,62,0.12)',
        border: 'none', cursor: 'pointer', borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#e53e3e', fontSize: 14, fontWeight: 600,
        transition: 'background 0.2s', lineHeight: 1, width: 28, height: 28, flexShrink: 0,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >✕</button>
  );
}

export default function Admin() {
  // ── Auth ──
  const [screen, setScreen] = useState('checking'); // 'login' | 'checking' | 'denied' | 'panel'
  const [currentUser, setCurrentUser] = useState(null);
  const TAB_SLUGS = { products: 'productos', designs: 'diseños', orders: 'pedidos', localities: 'escalas', users: 'usuarios', sellers: 'vendedores', admins: 'admins', config: 'configuracion', heatmap: 'actividad', stats: 'estadisticas', production: 'produccion' };
  const SLUG_TABS = Object.fromEntries(Object.entries(TAB_SLUGS).map(([k, v]) => [v, k]));
  const initialTab = () => {
    if (typeof window === 'undefined') return 'products';
    const slug = window.location.pathname.split('/admin/')[1] || '';
    return SLUG_TABS[slug] || 'products';
  };
  const [activeTab, setActiveTab] = useState(initialTab);
  const [tabOrder, setTabOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('admin_tab_order');
      if (saved) {
        const parsed = JSON.parse(saved);
        const all = ['products','designs','orders','localities','users','sellers','admins','config','heatmap','stats','production'];
        if (Array.isArray(parsed) && parsed.length === all.length && all.every(t => parsed.includes(t))) return parsed;
      }
    } catch {}
    return ['products','designs','orders','localities','users','sellers','admins','config','heatmap','stats','production'];
  });
  const [draggingTab, setDraggingTab] = useState(null);
  const [draggingConfigTab, setDraggingConfigTab] = useState(null);
  const [sellers, setSellers] = useState([]);
  const [newSeller, setNewSeller] = useState({ name: '', email: '', phone: '' });
  const [savingSeller, setSavingSeller] = useState(false);

  // Products
  const [products, setProducts] = useState([]);
  const [newProduct, setNewProduct] = useState(EMPTY_PRODUCT);
  const [savingProduct, setSavingProduct] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [productForms, setProductForms] = useState({});
  const [savedProductId, setSavedProductId] = useState(null);
  const [uploadingLandingImage, setUploadingLandingImage] = useState(null);
  const [modelConfigPopup, setModelConfigPopup] = useState(null); // product id
  const [popupPreviewModel, setPopupPreviewModel] = useState(null); // model_url seleccionado
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
  const [liveModelConfig, setLiveModelConfig] = useState(null);
  const cellRefs = useRef([]);
  const [confirmModal, setConfirmModal] = useState({ open: false, message: '', onConfirm: null });

  function askConfirm(message, onConfirm) { setConfirmModal({ open: true, message, onConfirm }); }
  function closeConfirm() { setConfirmModal({ open: false, message: '', onConfirm: null }); }

  // Designs
  const [designs, setDesigns] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [orphanCount, setOrphanCount] = useState(0);
  const [migrating, setMigrating] = useState(false);
  const [designFilterProduct, setDesignFilterProduct] = useState('all');
  const [dragOverId, setDragOverId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const dragSrcIdRef = useRef(null);
  const [dragOverProductId, setDragOverProductId] = useState(null);
  const [draggingProductId, setDraggingProductId] = useState(null);
  const dragSrcProductIdRef = useRef(null);
  const [dragOverCat, setDragOverCat] = useState(null);
  const dragSrcCatRef = useRef(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const lastSelectedIdRef = useRef(null);
  const [newCatInputs, setNewCatInputs] = useState({});
  const [catColorPicker, setCatColorPicker] = useState({});
  const catColorValueRef = useRef({});
  const catColorPickerRef = useRef({});
  const [designSearch, setDesignSearch] = useState('');
  const [designCatFilter, setDesignCatFilter] = useState('');
  const [dragOverLocalityId, setDragOverLocalityId] = useState(null);
  const [draggingLocalityId, setDraggingLocalityId] = useState(null);
  const localityDragSrcIdRef = useRef(null);

  // Localities
  const [localities, setLocalities] = useState([]);
  const [newLocality, setNewLocality] = useState({ name: '' });
  const [savingLocality, setSavingLocality] = useState(false);

  // Users
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const { getStatus } = usePresence(supabase);

  // Admins
  const [admins, setAdmins] = useState([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState(null);

  // Orders
  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState({ landing_mode: 'dark', catalogo_mode: 'dark', landing_show_theme: 'true', landing_show_cart: 'true', landing_show_account: 'true', landing_show_whatsapp: 'true', catalogo_show_theme: 'true', catalogo_show_cart: 'true', catalogo_show_account: 'true', catalogo_show_whatsapp: 'true', landing_tab_text: 'INKORA 🔷', landing_tab_interval: '1000', landing_tab_on_away: 'true', landing_tab_on_active: 'false', catalogo_tab_text: 'INKORA 🔷', catalogo_tab_interval: '1000', catalogo_tab_on_away: 'true', catalogo_tab_on_active: 'false', login_method: 'modal' });
  const [orderSearch, setOrderSearch] = useState('');
  const [orderDetail, setOrderDetail] = useState(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());
  const [expandedOrderNotes, setExpandedOrderNotes] = useState(new Set());
  const lastSelectedOrderIdRef = useRef(null);
  const [orderFilterStatus, setOrderFilterStatus] = useState('all');
  const [orderFilterSeller, setOrderFilterSeller] = useState('all');
  const [orderFilterProduct, setOrderFilterProduct] = useState('all');
  const [orderFilterDateFrom, setOrderFilterDateFrom] = useState('');
  const [orderFilterDateTo, setOrderFilterDateTo] = useState('');

  useEffect(() => {
    function handleOutsideOrderClick(e) {
      if (!e.target.closest('[data-orders-table]')) {
        setSelectedOrderIds(new Set());
        lastSelectedOrderIdRef.current = null;
      }
    }
    document.addEventListener('mousedown', handleOutsideOrderClick);
    return () => document.removeEventListener('mousedown', handleOutsideOrderClick);
  }, []);

  // Price tiers
  const [priceTiers, setPriceTiers] = useState([]);
  const [newTiers, setNewTiers] = useState({});
  const [editingTiers, setEditingTiers] = useState({});
  const [savedTierId, setSavedTierId] = useState(null);
  const [addingTier, setAddingTier] = useState(null);

  // ── Auth listener ──
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        checkAdmin(session.user.email);
      } else {
        setScreen('login');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { setScreen('login'); return; }
      if (event === 'SIGNED_IN' && session?.user?.email) {
        checkAdmin(session.user.email);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const panelLoadedRef = useRef(false);
  useEffect(() => {
    if (screen === 'panel' && !panelLoadedRef.current) {
      panelLoadedRef.current = true;
      loadProducts(); loadDesigns(); loadLocalities(); loadPriceTiers(); loadAdmins(); loadOrders(); loadSettings(); loadSellers();
      loadUsers();
    }
  }, [screen]);


  const popupJustOpenedRef = useRef(false);
  useEffect(() => {
    function handleClickOutside(e) {
      if (popupJustOpenedRef.current) { popupJustOpenedRef.current = false; return; }
      if (e.target.closest('[data-model-popup]')) return;
      setModelConfigPopup(null);
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== 'Escape') return;
      const openKeys = Object.keys(catColorPickerRef.current).filter(k => catColorPickerRef.current[k]);
      if (openKeys.length > 0) {
        e.preventDefault();
        openKeys.forEach(pickerKey => {
          const val = catColorValueRef.current[pickerKey];
          if (val) {
            const [productId, ...catParts] = pickerKey.split(':');
            const cat = catParts.join(':');
            supabase.from('products').select('*').eq('id', productId).single().then(({ data: p }) => {
              const current = p?.category_colors || {};
              supabase.from('products').update({ category_colors: { ...current, [cat]: val } }).eq('id', productId).then(() => loadProducts());
            });
          }
        });
        setCatColorPicker({});
        catColorPickerRef.current = {};
      } else {
        setSelectedIds(new Set());
        setSelectedOrderIds(new Set());
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const forms = {};
    products.forEach(p => {
      if (!productForms[p.id]) {
        forms[p.id] = { name: p.name, card_width_desktop: p.card_width_desktop, card_width_mobile: p.card_width_mobile, landing_card_width_desktop: p.landing_card_width_desktop ?? 320, landing_card_width_mobile: p.landing_card_width_mobile ?? 280, aspect_ratio: p.aspect_ratio, max_file_size_kb: p.max_file_size_kb, landing_max_file_size_kb: p.landing_max_file_size_kb ?? 4096, price_per_unit: p.price_per_unit ?? 0, show_price: p.show_price !== false, allow_3d: p.allow_3d === true, allow_glb: p.allow_glb === true, landing_image: p.landing_image || '', model_config: p.model_config || { mode: 'static', speed: 5 } };
      }
    });
    if (Object.keys(forms).length > 0) setProductForms(prev => ({ ...prev, ...forms }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  // ── Auth functions ──
  async function checkAdmin(email) {
    setScreen('checking');
    const { data } = await supabase.from('admins').select('email').eq('email', email).single();
    if (data) { setCurrentUser(email); setScreen('panel'); }
    else { setScreen('denied'); }
  }

  async function signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'https://www.inkora.com.ar/auth/popup-callback',
        skipBrowserRedirect: true,
      },
    });
    if (error || !data?.url) return;
    const popup = window.open(data.url, 'google-auth', 'width=500,height=600,top=100,left=100');
    window.addEventListener('message', function handler(e) {
      if (e.origin !== 'https://www.inkora.com.ar') return;
      if (e.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        window.removeEventListener('message', handler);
        popup?.close();
        loadCurrentUser();
      }
    });
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setScreen('login');
    setCurrentUser(null);
  }

  // ── Products ──
  async function handleProductDrop(targetId) {
    const srcId = dragSrcProductIdRef.current;
    dragSrcProductIdRef.current = null;
    setDraggingProductId(null);
    setDragOverProductId(null);
    if (!srcId || srcId === targetId) return;
    const srcIdx = products.findIndex(p => p.id === srcId);
    const tgtIdx = products.findIndex(p => p.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    const reordered = [...products];
    const [removed] = reordered.splice(srcIdx, 1);
    reordered.splice(tgtIdx, 0, removed);
    setProducts(reordered);
    await Promise.all(reordered.map((p, i) => supabase.from('products').update({ sort_order: i }).eq('id', p.id)));
  }

  async function loadProducts() {
    const { data } = await supabase.from('products').select('*').order('sort_order', { nullsFirst: false }).order('created_at');
    if (data) setProducts(data);
  }

  function updateProductForm(id, field, value) {
    setProductForms(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function saveProduct(id, overrides = {}) {
    const data = { ...(productForms[id] || {}), ...overrides };
    await supabase.from('products').update(data).eq('id', id);
    setSavedProductId(id);
    setTimeout(() => setSavedProductId(prev => prev === id ? null : prev), 1200);
    loadProducts();
  }

  function handleProductKeyDown(e, rowIdx, colIdx) {
    const NCOLS = 6;
    if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'ArrowRight') {
      if (colIdx + 1 < NCOLS) { e.preventDefault(); cellRefs.current[rowIdx]?.[colIdx + 1]?.focus(); }
    } else if ((e.key === 'Tab' && e.shiftKey) || e.key === 'ArrowLeft') {
      if (colIdx - 1 >= 0) { e.preventDefault(); cellRefs.current[rowIdx]?.[colIdx - 1]?.focus(); }
    } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
      if (rowIdx + 1 < cellRefs.current.length) { e.preventDefault(); cellRefs.current[rowIdx + 1]?.[colIdx]?.focus(); }
    } else if (e.key === 'ArrowUp') {
      if (rowIdx - 1 >= 0) { e.preventDefault(); cellRefs.current[rowIdx - 1]?.[colIdx]?.focus(); }
    }
  }

  async function addProduct() {
    if (!newProduct.name.trim() || !newProduct.slug.trim()) return;
    setSavingProduct(true);
    await supabase.from('products').insert({ ...newProduct, active: true });
    setNewProduct(EMPTY_PRODUCT);
    setSavingProduct(false);
    setShowAddForm(false);
    loadProducts();
  }

  function deleteProduct(id) {
    setConfirmModal({
      open: true,
      message: '¿Seguro que querés eliminar este producto? Los diseños y escalas quedarán en la base de datos pero desvinculados.',
      onConfirm: async () => {
        await supabase.from('products').delete().eq('id', id);
        loadProducts();
      },
      requireHold: true,
    });
  }

  async function toggleProduct(id, active) {
    await supabase.from('products').update({ active: !active }).eq('id', id);
    setSavedProductId(id);
    setTimeout(() => setSavedProductId(prev => prev === id ? null : prev), 1200);
    loadProducts();
  }

  // ── Designs ──
  async function loadDesigns() {
    const { data } = await supabase.from('designs').select('*, products(name)').order('sort_order', { nullsFirst: false }).order('created_at').limit(10000);
    console.log('Diseños cargados:', data?.length, data);
    if (data) { setDesigns(data); setOrphanCount(data.filter(d => !d.product_id && d.active).length); }
  }

  function handleDragStart(e, id) {
    dragSrcIdRef.current = id;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, id) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(id);
  }

  function handleDragLeave() {
    setDragOverId(null);
  }

  async function handleDrop(e, targetId) {
    e.preventDefault();
    setDragOverId(null);
    const srcId = dragSrcIdRef.current;
    dragSrcIdRef.current = null;
    if (!srcId || srcId === targetId) return;

    const filteredDesigns = designs.filter(d => designFilterProduct === 'all' || d.product_id === designFilterProduct);

    if (selectedIds.has(srcId) && selectedIds.size > 1) {
      // Multi-item drag: move all selected to target position maintaining relative order
      const selectedInOrder = filteredDesigns.filter(d => selectedIds.has(d.id));
      const without = filteredDesigns.filter(d => !selectedIds.has(d.id));
      const insertAt = without.findIndex(d => d.id === targetId);
      if (insertAt === -1) return; // target is within the selected group
      const reordered = [...without.slice(0, insertAt), ...selectedInOrder, ...without.slice(insertAt)];
      await Promise.all(reordered.map((d, i) => supabase.from('designs').update({ sort_order: i }).eq('id', d.id)));
      loadDesigns();
    } else {
      // Single-item drag
      const srcIdx = filteredDesigns.findIndex(d => d.id === srcId);
      const tgtIdx = filteredDesigns.findIndex(d => d.id === targetId);
      if (srcIdx === -1 || tgtIdx === -1) return;
      const reordered = [...filteredDesigns];
      const [removed] = reordered.splice(srcIdx, 1);
      reordered.splice(tgtIdx, 0, removed);
      await Promise.all(reordered.map((d, i) => supabase.from('designs').update({ sort_order: i }).eq('id', d.id)));
      loadDesigns();
    }
  }

  function handleDragEnd() {
    dragSrcIdRef.current = null;
    setDragOverId(null);
    setDraggingId(null);
  }

  function handleDesignClick(e, id) {
    if (e.shiftKey && lastSelectedIdRef.current) {
      const visible = designs.filter(d => designFilterProduct === 'all' || d.product_id === designFilterProduct);
      const lastIdx = visible.findIndex(d => d.id === lastSelectedIdRef.current);
      const currIdx = visible.findIndex(d => d.id === id);
      if (lastIdx !== -1 && currIdx !== -1) {
        const [start, end] = lastIdx < currIdx ? [lastIdx, currIdx] : [currIdx, lastIdx];
        setSelectedIds(new Set(visible.slice(start, end + 1).map(d => d.id)));
      }
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      lastSelectedIdRef.current = id;
    } else {
      setSelectedIds(new Set([id]));
      lastSelectedIdRef.current = id;
    }
  }

  function getProductCategories(productId) {
    const p = products.find(pr => pr.id === productId);
    const cats = p?.categories;
    return (Array.isArray(cats) && cats.length > 0) ? cats : ['Todos'];
  }

  async function saveDesignCategory(id, category) {
    const idsToUpdate = selectedIds.has(id) && selectedIds.size > 1 ? [...selectedIds] : [id];
    await Promise.all(idsToUpdate.map(did => supabase.from('designs').update({ category }).eq('id', did)));
    setDesigns(prev => prev.map(d => idsToUpdate.includes(d.id) ? { ...d, category } : d));
  }

  async function reorderProductCategory(productId, srcCat, tgtCat) {
    if (srcCat === tgtCat) return;
    const current = getProductCategories(productId);
    const srcIdx = current.indexOf(srcCat);
    const tgtIdx = current.indexOf(tgtCat);
    if (srcIdx === -1 || tgtIdx === -1) return;
    const reordered = [...current];
    reordered.splice(srcIdx, 1);
    reordered.splice(tgtIdx, 0, srcCat);
    await supabase.from('products').update({ categories: reordered }).eq('id', productId);
    loadProducts();
  }

  async function addProductCategory(productId, cat) {
    const t = cat.trim();
    if (!t) return;
    const normalized = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    const current = getProductCategories(productId);
    if (current.includes(normalized)) return;
    const updated = [...current, normalized];
    await supabase.from('products').update({ categories: updated }).eq('id', productId);
    setNewCatInputs(prev => ({ ...prev, [productId]: '' }));
    loadProducts();
  }

  async function saveCategoryColor(productId, cat, color) {
    const p = products.find(pr => pr.id === productId);
    const current = p?.category_colors || {};
    const updated = { ...current, [cat]: color };
    await supabase.from('products').update({ category_colors: updated }).eq('id', productId);
    loadProducts();
  }

  async function removeProductCategory(productId, cat) {
    const current = getProductCategories(productId);
    if (current.length <= 1) return;
    const updated = current.filter(c => c !== cat);
    await supabase.from('products').update({ categories: updated }).eq('id', productId);
    loadProducts();
  }

  async function toggleDesign(id, active) {
    const idsToUpdate = selectedIds.has(id) && selectedIds.size > 1 ? [...selectedIds] : [id];
    await Promise.all(idsToUpdate.map(did => supabase.from('designs').update({ active: !active }).eq('id', did)));
    loadDesigns();
  }

  async function deleteDesign(id) {
    if (selectedIds.has(id) && selectedIds.size > 1) {
      askConfirm(`¿Eliminar los ${selectedIds.size} diseños seleccionados? Esta acción no se puede deshacer.`, async () => {
        await Promise.all([...selectedIds].map(did => supabase.from('designs').delete().eq('id', did)));
        setSelectedIds(new Set());
        loadDesigns();
      });
    } else {
      await supabase.from('designs').delete().eq('id', id);
      setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      loadDesigns();
    }
  }

  async function migrateOrphans() {
    if (products.length === 0) { alert('Primero creá al menos un producto.'); return; }
    setMigrating(true);
    await supabase.from('designs').update({ product_id: products[0].id }).is('product_id', null).eq('active', true);
    setMigrating(false);
    loadDesigns();
  }

  const selectedProduct = products.find(p => p.id === selectedProductId);
  const maxSizeKb = selectedProduct ? selectedProduct.max_file_size_kb : 250;

  async function handleFileSelect(e) {
    if (!selectedProductId) { alert('Primero seleccioná un producto.'); e.target.value = ''; return; }
    const files = Array.from(e.target.files);
    const defaultCategory = 'Sin categoría';
    const entries = files.map(file => ({
      file, preview: URL.createObjectURL(file),
      name: file.name.replace(/\.[^.]+$/, ''), category: defaultCategory,
      nameExists: false, sizeError: file.size > maxSizeKb * 1024,
      modelFile: null,
    }));
    setPendingFiles(entries);
    e.target.value = '';
    const { data } = await supabase.from('designs').select('name').eq('active', true).eq('product_id', selectedProductId);
    const existing = new Set((data || []).map(d => d.name.toLowerCase()));
    setPendingFiles(prev => prev.map(entry => ({
      ...entry, nameExists: entry.name.length > 2 && existing.has(entry.name.toLowerCase()),
    })));
  }

  const updateEntry = useCallback(async (index, field, value) => {
    setPendingFiles(prev => { const next = [...prev]; next[index] = { ...next[index], [field]: value }; return next; });
    if (field === 'name') {
      if (value.length > 2) {
        const { data } = await supabase.from('designs').select('name').eq('active', true).eq('product_id', selectedProductId);
        const exists = Array.isArray(data) && data.some(d => d.name.toLowerCase() === value.toLowerCase());
        setPendingFiles(prev => { const next = [...prev]; next[index] = { ...next[index], nameExists: exists }; return next; });
      } else {
        setPendingFiles(prev => { const next = [...prev]; next[index] = { ...next[index], nameExists: false }; return next; });
      }
    }
  }, []);

  function removePending(index) {
    setPendingFiles(prev => {
      URL.revokeObjectURL(prev[index].preview);
      URL.revokeObjectURL(prev[index].modelPreview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function addDesigns() {
    setUploading(true);
    let anyError = false;
    for (const entry of pendingFiles) {
      try {
        let imageUrl = null;
        let modelUrl = null;

        // Capturar thumbnail del modelo si no hay imagen
        if (!entry.file && entry.capturedThumb) {
          const base64 = await blobToBase64(entry.capturedThumb);
          const res = await fetch('/api/upload-image', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileBase64: base64, fileName: entry.name + '-thumb.png', mimeType: 'image/png', folder: 'thumbnails' }),
          });
          const data = await res.json();
          if (data.url) imageUrl = data.url;
        }

        // Subir imagen si existe
        if (entry.file) {
          if (entry.file.size > maxSizeKb * 1024) { alert(`"${entry.name}" supera ${maxSizeKb}kb.`); anyError = true; continue; }
          const base64 = await fileToBase64(entry.file);
          const res = await fetch('/api/upload-image', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileBase64: base64, fileName: entry.file.name, mimeType: entry.file.type, folder: 'thumbnails' }),
          });
          const data = await res.json();
          if (data.url) imageUrl = data.url;
          else { alert(`Error al subir "${entry.name}".`); anyError = true; continue; }
        }

        // Subir GLB si existe
        if (entry.modelFile) {
          const modelBase64 = await fileToBase64(entry.modelFile);
          const modelRes = await fetch('/api/upload-image', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileBase64: modelBase64, fileName: entry.modelFile.name, mimeType: 'application/octet-stream', folder: 'models' }),
          });
          const modelData = await modelRes.json();
          if (modelData.url) modelUrl = modelData.url;
        }

        if (imageUrl || modelUrl) {
          await supabase.from('designs').insert({ name: entry.name, category: entry.category, image_url: imageUrl, model_url: modelUrl, active: true, product_id: selectedProductId });
        } else { alert(`"${entry.name}" no tiene imagen ni modelo.`); anyError = true; }
      } catch (err) { alert(`Error al subir "${entry.name}": ${err.message}`); anyError = true; }
    }
    setUploading(false);
    if (!anyError) { pendingFiles.forEach(f => URL.revokeObjectURL(f.preview)); setPendingFiles([]); }
    console.log('Upload completo, recargando diseños...');
    loadDesigns();
  }

  // ── Localities ──
  async function loadLocalities() {
    const { data } = await supabase.from('localities').select('*').order('sort_order').order('created_at');
    if (data) setLocalities(data);
  }

  function handleLocalityDragStart(e, id) {
    localityDragSrcIdRef.current = id;
    setDraggingLocalityId(id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleLocalityDragOver(e, id) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverLocalityId(id);
  }

  function handleLocalityDragLeave() { setDragOverLocalityId(null); }

  async function handleLocalityDrop(e, targetId) {
    e.preventDefault();
    setDragOverLocalityId(null);
    const srcId = localityDragSrcIdRef.current;
    localityDragSrcIdRef.current = null;
    if (!srcId || srcId === targetId) return;
    const srcIdx = localities.findIndex(l => l.id === srcId);
    const tgtIdx = localities.findIndex(l => l.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    const reordered = [...localities];
    const [removed] = reordered.splice(srcIdx, 1);
    reordered.splice(tgtIdx, 0, removed);
    await Promise.all(reordered.map((l, i) => supabase.from('localities').update({ sort_order: i }).eq('id', l.id)));
    loadLocalities();
  }

  function handleLocalityDragEnd() {
    localityDragSrcIdRef.current = null;
    setDragOverLocalityId(null);
    setDraggingLocalityId(null);
  }

  async function addLocality() {
    if (!newLocality.name.trim()) return;
    setSavingLocality(true);
    await supabase.from('localities').insert({ ...newLocality, active: true });
    setNewLocality({ name: '' });
    setSavingLocality(false);
    loadLocalities();
  }

  async function toggleLocality(id, active) {
    await supabase.from('localities').update({ active: !active }).eq('id', id);
    loadLocalities();
  }

  function deleteLocality(id) {
    askConfirm('¿Seguro que querés eliminar esta localidad? Se eliminarán también todas sus escalas de precio.', async () => {
      await supabase.from('price_tiers').delete().eq('locality_id', id);
      await supabase.from('localities').delete().eq('id', id);
      loadLocalities(); loadPriceTiers();
    });
  }

  // ── Users ──
  async function loadUsers() {
    setLoadingUsers(true);
    const { data } = await supabase.rpc('admin_get_profiles');
    if (data) setUsers(data);
    setLoadingUsers(false);
  }

  async function updateUserLocality(userId, localityId) {
    await supabase.rpc('admin_update_user_locality', { p_user_id: userId, p_locality_id: localityId || null });
    loadUsers();
  }

  // ── Price tiers ──
  async function loadPriceTiers() {
    const { data } = await supabase.from('price_tiers').select('*').order('min_quantity');
    if (data) {
      setPriceTiers(data);
      const forms = {};
      data.forEach(t => { forms[t.id] = { min_quantity: t.min_quantity, price_per_unit: t.price_per_unit }; });
      setEditingTiers(prev => ({ ...forms, ...prev }));
    }
  }

  function updateTierForm(id, field, value) {
    setEditingTiers(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function saveTierAuto(id) {
    const ef = editingTiers[id];
    if (!ef) return;
    await supabase.from('price_tiers').update({ min_quantity: Number(ef.min_quantity), price_per_unit: Number(ef.price_per_unit) }).eq('id', id);
    setSavedTierId(id);
    setTimeout(() => setSavedTierId(prev => prev === id ? null : prev), 1200);
  }

  async function addTierMatrix(productId, localityId, key) {
    const t = newTiers[key] || { min_quantity: '', price_per_unit: '' };
    if (!t.min_quantity || !t.price_per_unit) return;
    await supabase.from('price_tiers').insert({ product_id: productId, locality_id: localityId, min_quantity: Number(t.min_quantity), price_per_unit: Number(t.price_per_unit) });
    setNewTiers(prev => ({ ...prev, [key]: { min_quantity: '', price_per_unit: '' } }));
    setAddingTier(null);
    loadPriceTiers();
  }

  function deleteScale(id) {
    askConfirm('¿Eliminar esta escala de precio?', async () => {
      await supabase.from('price_tiers').delete().eq('id', id);
      loadPriceTiers();
    });
  }

  // ── Settings ──
  async function loadSettings() {
    const { data } = await supabase.from('settings').select('*');
    if (data) {
      const map = {};
      data.forEach(s => { map[s.key] = s.value; });
      setSettings(prev => ({ ...prev, ...map }));
    }
  }

  async function saveSetting(key, value) {
    await supabase.from('settings').upsert({ key, value });
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  // ── Orders ──
  async function loadOrders() {
    const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (data) setOrders(data);
  }

  async function deleteOrders(ids) {
    await Promise.all([...ids].map(id => supabase.from('orders').delete().eq('id', id)));
    setOrders(prev => prev.filter(o => !ids.has(o.id)));
    setSelectedOrderIds(new Set());
  }

  async function updateOrderStatus(id, status) {
    await supabase.from('orders').update({ status }).eq('id', id);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
  }

  const ORDER_STATUSES = [
    { value: 'pending',       label: 'Pendiente',      color: '#b45309', bg: '#fef3c7' },
    { value: 'confirmed',     label: 'Confirmado',     color: '#1d4ed8', bg: '#dbeafe' },
    { value: 'in_production', label: 'En producción',  color: '#6d28d9', bg: '#ede9fe' },
    { value: 'ready',         label: 'Listo',          color: '#15803d', bg: '#dcfce7' },
    { value: 'cancelled',     label: 'Cancelado',      color: '#b91c1c', bg: '#fee2e2' },
  ];

  function getStatusCfg(value) {
    return ORDER_STATUSES.find(s => s.value === value) || ORDER_STATUSES[0];
  }

  function summarizeItems(items) {
    if (!Array.isArray(items) || items.length === 0) return '—';
    const byProduct = {};
    items.forEach(i => {
      const p = i.productName || 'Sin producto';
      if (!byProduct[p]) byProduct[p] = [];
      byProduct[p].push(`${i.name} x${i.qty}`);
    });
    return Object.entries(byProduct).map(([product, designs]) => `${product} — ${designs.join(', ')}`).join(' | ');
  }

  const filteredOrders = orders.filter(o => {
    const q = orderSearch.toLowerCase();
    if (q && !(o.order_code || '').toLowerCase().includes(q) && !(o.customer_name || '').toLowerCase().includes(q) && !(o.customer_email || '').toLowerCase().includes(q)) return false;
    if (orderFilterStatus !== 'all' && o.status !== orderFilterStatus) return false;
    if (orderFilterSeller !== 'all') {
      if (orderFilterSeller === 'none' && o.seller_id) return false;
      if (orderFilterSeller !== 'none' && o.seller_id !== orderFilterSeller) return false;
    }
    if (orderFilterProduct !== 'all') {
      const items = Array.isArray(o.items) ? o.items : [];
      if (!items.some(i => i.product_id === orderFilterProduct)) return false;
    }
    if (orderFilterDateFrom && new Date(o.created_at) < new Date(orderFilterDateFrom)) return false;
    if (orderFilterDateTo && new Date(o.created_at) > new Date(orderFilterDateTo + 'T23:59:59')) return false;
    return true;
  });

  // ── Sellers ──
  async function loadSellers() {
    const { data } = await supabase.from('sellers').select('*').order('name');
    if (data) setSellers(data);
  }

  async function addSeller() {
    if (!newSeller.name.trim()) return;
    setSavingSeller(true);
    await supabase.from('sellers').insert({ ...newSeller, active: true });
    setNewSeller({ name: '', email: '', phone: '' });
    setSavingSeller(false);
    loadSellers();
  }

  async function toggleSeller(id, active) {
    await supabase.from('sellers').update({ active: !active }).eq('id', id);
    loadSellers();
  }

  async function deleteSeller(id) {
    askConfirm('¿Eliminar este vendedor?', async () => {
      await supabase.from('sellers').delete().eq('id', id);
      loadSellers();
    });
  }

  async function updateSellerField(id, field, value) {
    await supabase.from('sellers').update({ [field]: value }).eq('id', id);
    loadSellers();
  }

  async function updateUserSeller(userId, sellerId) {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, seller_id: sellerId || null } : u));
    const { error } = await supabase.rpc('admin_update_user_seller', { p_user_id: userId, p_seller_id: sellerId || null });
    if (error) {
      console.error('Error al guardar vendedor:', error);
      loadUsers(); // revertir al estado real si falló
    }
  }

  // ── Admins ──
  async function loadAdmins() {
    const { data } = await supabase.from('admins').select('email').order('email');
    if (data) setAdmins(data);
  }

  async function addAdmin() {
    const email = newAdminEmail.trim().toLowerCase();
    if (!email) return;
    setAddingAdmin(true);
    await supabase.from('admins').insert({ email });
    setNewAdminEmail('');
    setAddingAdmin(false);
    loadAdmins();
  }

  async function deleteAdmin(email) {
    if (email === currentUser) { alert('No podés eliminarte a vos mismo.'); return; }
    await supabase.from('admins').delete().eq('email', email);
    setDeleteConfirmEmail(null);
    loadAdmins();
  }

  const hasDupInBatch = (index, name) => name.length > 0 && pendingFiles.some((f, i) => i !== index && f.name.toLowerCase() === name.toLowerCase());
  const canSubmit = selectedProductId && pendingFiles.length > 0 &&
    pendingFiles.every(f => f.name.trim().length > 0 && !f.nameExists && !f.sizeError && (f.file || f.modelFile)) &&
    !pendingFiles.some((f, i) => hasDupInBatch(i, f.name));

  const s = styles;

  // ── PANTALLAS AUTH ──
  const sessionBar = currentUser ? (
    <div style={{position:'fixed', top:0, left:0, right:0, zIndex:999, background:'rgba(17,32,64,0.92)', backdropFilter:'blur(6px)', padding:'6px 20px', fontSize:12, color:'rgba(255,255,255,0.55)', textAlign:'right'}}>
      {currentUser}
    </div>
  ) : null;

  if (screen === 'login') return (
    <div style={s.loginWrap}>
      {sessionBar}
      <div style={s.loginBox}>
        <img src={LOGO} alt="INKORA" style={{height: 50, marginBottom: 8}} />
        <h2 style={s.loginTitle}>Panel de Administración</h2>
        <button style={s.btnGoogle} onClick={signInWithGoogle}>
          <GoogleIcon />
          Ingresar con Google
        </button>
      </div>
    </div>
  );

  if (screen === 'checking') return (
    <div style={{ minHeight: '100vh', background: '#f7f8fc' }} />
  );

  if (screen === 'denied') return (
    <div style={s.loginWrap}>
      {sessionBar}
      <div style={s.loginBox}>
        <img src={LOGO} alt="INKORA" style={{height: 50, marginBottom: 16}} />
        <div style={{background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '12px 20px', fontSize: 15, fontWeight: 700}}>Acceso denegado</div>
        <p style={{fontSize: 13, color: '#5a6380', textAlign: 'center', margin: '4px 0 8px'}}>Tu cuenta no tiene permisos de administrador.</p>
        <button style={s.btnPrimary} onClick={handleSignOut}>Cerrar sesión</button>
      </div>
    </div>
  );

  // ── PANEL ──
  return (
    <div style={s.wrap}>
      <header style={s.header}>
        <img src={LOGO} alt="INKORA" style={{height: 36, filter: 'brightness(0) invert(1)'}} />
        <span style={s.headerTitle}>Panel de Administración</span>
        <span style={{color: 'rgba(255,255,255,0.45)', fontSize: 12, marginRight: 8}}>{currentUser}</span>
        <button style={s.btnLogout} onClick={handleSignOut}>Cerrar sesión</button>
      </header>

      <div style={s.tabBar}>
        <div style={s.tabBarInner}>
          {(() => {
            const ALL_TABS = { products:'Productos', designs:'Diseños', orders:'Pedidos', localities:'Escalas de precios', users:'Usuarios', sellers:'Vendedores', admins:'Admins', config:'Configuración', heatmap:'Actividad', stats:'Estadísticas', production:'Producción' };
            return tabOrder.map(id => (
              <button
                key={id}
                draggable
                onDragStart={undefined}
                onDragOver={undefined}
                onDragEnd={undefined}
                onClick={() => { setActiveTab(id); window.history.replaceState(null, '', `/admin/${TAB_SLUGS[id]}`); }}
                style={{...s.tab, ...(activeTab === id ? s.tabActive : {})}}
              >
                {ALL_TABS[id]}
                {id === 'designs' && orphanCount > 0 && <span style={s.orphanBadge}>{orphanCount}</span>}
                {id === 'orders' && orders.filter(o => o.status === 'pending').length > 0 && <span style={s.orphanBadge}>{orders.filter(o => o.status === 'pending').length}</span>}
                {id === 'users' && users.length > 0 && <span style={s.userBadge}>{users.length}</span>}
                {id === 'admins' && admins.length > 0 && <span style={s.userBadge}>{admins.length}</span>}
              </button>
            ));
          })()}
        </div>
      </div>

      <div style={s.content}>

        {/* ══ PRODUCTOS ══ */}
        {activeTab === 'products' && (
          <>
            <div style={s.card}>
              <h2 style={s.sectionTitle}>Productos</h2>
              <div style={{overflowX: 'auto'}} data-orders-table>
                <table style={{ ...s.tbl, minWidth: 1080 }}>
                  <thead>
                    <tr>
                      <th style={s.th}>Mostrar</th>
                      <th style={s.th}>Nombre</th>
                      <th style={s.th}>Card catálogo PC (px)</th>
                      <th style={s.th}>Card catálogo Cel (px)</th>
                      <th style={s.th}>Card landing PC (px)</th>
                      <th style={s.th}>Card landing Cel (px)</th>
                      <th style={s.th}>Proporción</th>
                      <th style={s.th}>Tamaño Máx (KB)</th>
                      <th style={s.th}>Precios</th>
                      <th style={s.th}>3D</th>
                      <th style={s.th}>Máx Landing</th>
                      <th style={s.th}>Img Landing</th>
                      <th style={{...s.th, width: 32}}></th>
                      <th style={{...s.th, width: 32}}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p, rowIdx) => {
                      const form = productForms[p.id] || {};
                      const setRef = (colIdx) => (el) => {
                        if (!cellRefs.current[rowIdx]) cellRefs.current[rowIdx] = [];
                        cellRefs.current[rowIdx][colIdx] = el;
                      };
                      return (
                        <tr key={p.id}
                          draggable
                          onDragStart={() => { dragSrcProductIdRef.current = p.id; setDraggingProductId(p.id); }}
                          onDragOver={e => { e.preventDefault(); setDragOverProductId(p.id); }}
                          onDrop={() => handleProductDrop(p.id)}
                          onDragEnd={() => { setDraggingProductId(null); setDragOverProductId(null); dragSrcProductIdRef.current = null; }}
                          style={{opacity: p.active ? 1 : 0.5, cursor: 'grab', background: dragOverProductId === p.id ? '#eef4ff' : 'transparent', outline: dragOverProductId === p.id ? '2px solid #2D6BE4' : 'none'}}>
                          <td style={{...s.td, textAlign:'center'}}>
                            <button style={s.iconBtn} onClick={() => toggleProduct(p.id, p.active)}>{p.active ? <EyeOpen /> : <EyeOff />}</button>
                          </td>
                          <td style={s.td}>
                            <input ref={setRef(0)} style={s.tblInput} value={form.name || ''} onChange={e => updateProductForm(p.id, 'name', e.target.value)} onBlur={() => saveProduct(p.id)} onKeyDown={e => handleProductKeyDown(e, rowIdx, 0)} />
                          </td>
                          <td style={s.td}>
                            <input ref={setRef(1)} style={{...s.tblInput, width: 80}} type="number" min="80" max="600" value={form.card_width_desktop ?? 180} onChange={e => updateProductForm(p.id, 'card_width_desktop', parseInt(e.target.value)||180)} onBlur={() => saveProduct(p.id)} onKeyDown={e => handleProductKeyDown(e, rowIdx, 1)} />
                          </td>
                          <td style={s.td}>
                            <input ref={setRef(2)} style={{...s.tblInput, width: 80}} type="number" min="80" max="400" value={form.card_width_mobile ?? 160} onChange={e => updateProductForm(p.id, 'card_width_mobile', parseInt(e.target.value)||160)} onBlur={() => saveProduct(p.id)} onKeyDown={e => handleProductKeyDown(e, rowIdx, 2)} />
                          </td>
                          <td style={s.td}>
                            <input ref={setRef(3)} style={{...s.tblInput, width: 80}} type="number" min="80" max="800" value={form.landing_card_width_desktop ?? 320} onChange={e => updateProductForm(p.id, 'landing_card_width_desktop', parseInt(e.target.value)||320)} onBlur={() => saveProduct(p.id)} onKeyDown={e => handleProductKeyDown(e, rowIdx, 3)} />
                          </td>
                          <td style={s.td}>
                            <input ref={setRef(4)} style={{...s.tblInput, width: 80}} type="number" min="80" max="600" value={form.landing_card_width_mobile ?? 280} onChange={e => updateProductForm(p.id, 'landing_card_width_mobile', parseInt(e.target.value)||280)} onBlur={() => saveProduct(p.id)} onKeyDown={e => handleProductKeyDown(e, rowIdx, 4)} />
                          </td>
                          <td style={s.td}>
                            <select style={{...s.tblInput, width: 72}} value={form.aspect_ratio || '2/3'} onChange={e => { updateProductForm(p.id, 'aspect_ratio', e.target.value); saveProduct(p.id, { aspect_ratio: e.target.value }); }}>
                              <option value="1/1">1/1</option>
                              <option value="2/3">2/3</option>
                              <option value="3/4">3/4</option>
                              <option value="4/3">4/3</option>
                              <option value="3/2">3/2</option>
                              <option value="16/9">16/9</option>
                            </select>
                          </td>
                          <td style={s.td}>
                            <input ref={setRef(3)} style={{...s.tblInput, width: 80}} type="number" min="50" value={form.max_file_size_kb ?? 250} onChange={e => updateProductForm(p.id, 'max_file_size_kb', parseInt(e.target.value)||250)} onBlur={() => saveProduct(p.id)} onKeyDown={e => handleProductKeyDown(e, rowIdx, 3)} />
                          </td>
                          <td style={{...s.td, textAlign:'center'}}>
                            <button style={s.iconBtn} onClick={() => { const newVal = !form.show_price; updateProductForm(p.id, 'show_price', newVal); saveProduct(p.id, { show_price: newVal }); }}>
                              {form.show_price ? <EyeOpen /> : <EyeOff />}
                            </button>
                          </td>
                          <td style={{...s.td, textAlign:'center', position:'relative'}}>
                            <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:4, flexWrap:'nowrap'}}>
                              <div
                                onClick={() => { const newVal = !form.allow_3d; updateProductForm(p.id, 'allow_3d', newVal); updateProductForm(p.id, 'allow_glb', newVal); saveProduct(p.id, { allow_3d: newVal, allow_glb: newVal }); if (!newVal && p.id === selectedProductId) setPendingFiles([]); }}
                                style={{ width: 36, height: 20, borderRadius: 10, background: form.allow_3d ? '#1B2F5E' : '#dde1ef', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
                                title="3D / GLB"
                              >
                                <div style={{ position: 'absolute', top: 2, left: form.allow_3d ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                              </div>
                              <button
                                onClick={e => { e.stopPropagation(); if (form.allow_3d) { popupJustOpenedRef.current = true; setPopupPreviewModel(null); setLiveModelConfig(form.model_config || { mode: 'static', speed: 5 }); const rect = e.currentTarget.getBoundingClientRect(); setPopupPos({ top: rect.bottom + window.scrollY + 6, left: Math.min(rect.left + window.scrollX, window.innerWidth - 360) }); setModelConfigPopup(modelConfigPopup === p.id ? null : p.id); } }}
                                style={{background:'none', border:'none', cursor: form.allow_3d ? 'pointer' : 'default', padding:2, borderRadius:4, display:'flex', alignItems:'center'}}
                                title={form.allow_3d ? 'Configurar 3D' : '3D deshabilitado'}
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={form.allow_3d ? '#2D6BE4' : '#c4c9d9'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="3"/>
                                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                                </svg>
                              </button>
                            </div>
                            {modelConfigPopup === p.id && createPortal(
                              <div data-model-popup style={{position:'absolute', zIndex:9999, top: popupPos.top, left: popupPos.left, background:'white', border:'1.5px solid #dde1ef', borderRadius:12, boxShadow:'0 8px 32px rgba(27,47,94,0.18)', padding:'16px', width:340, textAlign:'left'}}
                                onClick={e => e.stopPropagation()}
                              >
                                <div style={{fontSize:12, fontWeight:700, color:'#1B2F5E', marginBottom:12}}>Animación 3D — {p.name}</div>

                                <div style={{marginBottom:10}}>
                                  <div style={{fontSize:11, fontWeight:600, color:'#5a6380', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6}}>Mostrar modelo en catálogo</div>
                                  <div style={{display:'flex', flexDirection:'column', gap:4}}>
                                    {[{val:'hover', label:'Al hacer hover', desc:'Imagen estática, 3D al pasar el mouse'}, {val:'scroll', label:'Al hacer scroll', desc:'Se activa cuando la card es visible'}].map(opt => (
                                      <label key={opt.val} style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer', padding:'5px 8px', borderRadius:7, background: (form.model_config?.display_mode || 'hover') === opt.val ? '#eef4ff' : 'transparent', border: (form.model_config?.display_mode || 'hover') === opt.val ? '1.5px solid #2D6BE4' : '1.5px solid transparent'}}>
                                        <input type="radio" name={`display_mode_${p.id}`} value={opt.val} checked={(form.model_config?.display_mode || 'hover') === opt.val}
                                          onChange={() => {
                                            const newConfig = { ...(form.model_config || {}), display_mode: opt.val };
                                            updateProductForm(p.id, 'model_config', newConfig);
                                            saveProduct(p.id, { model_config: newConfig });
                                          }}
                                          style={{accentColor:'#2D6BE4'}}
                                        />
                                        <div>
                                          <div style={{fontSize:12, fontWeight:600, color:'#2d3352'}}>{opt.label}</div>
                                          <div style={{fontSize:10, color:'#9aa3bc'}}>{opt.desc}</div>
                                        </div>
                                      </label>
                                    ))}
                                  </div>
                                </div>

                                <div style={{marginBottom:10}}>
                                  <div style={{fontSize:11, fontWeight:600, color:'#5a6380', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6}}>Modo</div>
                                  <div style={{display:'flex', flexDirection:'column', gap:4}}>
                                    {[{val:'static', label:'Estático', desc:'Sin movimiento'}, {val:'rotate', label:'Rotación 360°', desc:'Gira continuamente'}, {val:'pendulum', label:'Péndulo', desc:'Va y viene mostrando el frente'}].map(opt => (
                                      <label key={opt.val} style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer', padding:'5px 8px', borderRadius:7, background: (form.model_config?.mode || 'static') === opt.val ? '#eef4ff' : 'transparent', border: (form.model_config?.mode || 'static') === opt.val ? '1.5px solid #2D6BE4' : '1.5px solid transparent'}}>
                                        <input type="radio" name={`mode_${p.id}`} value={opt.val} checked={(form.model_config?.mode || 'static') === opt.val}
                                          onChange={() => {
                                            const newConfig = { ...(form.model_config || {}), mode: opt.val };
                                            updateProductForm(p.id, 'model_config', newConfig);
                                            setLiveModelConfig(newConfig);
                                            saveProduct(p.id, { model_config: newConfig });
                                          }}
                                          style={{accentColor:'#2D6BE4'}}
                                        />
                                        <div>
                                          <div style={{fontSize:12, fontWeight:600, color:'#2d3352'}}>{opt.label}</div>
                                          <div style={{fontSize:10, color:'#9aa3bc'}}>{opt.desc}</div>
                                        </div>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                                {(form.model_config?.mode === 'rotate' || form.model_config?.mode === 'pendulum') && (
                                  <div style={{display:'flex', flexDirection:'column', gap:10}}>
                                    <div>
                                      <div style={{fontSize:11, fontWeight:600, color:'#5a6380', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6}}>Velocidad</div>
                                      <div style={{display:'flex', alignItems:'center', gap:8}}>
                                        <input type="range" min="1" max="10" value={form.model_config?.speed ?? 5}
                                          onChange={e => {
                                            const newConfig = { ...(form.model_config || {}), speed: Number(e.target.value) };
                                            updateProductForm(p.id, 'model_config', newConfig);
                                            setLiveModelConfig(newConfig);
                                          }}
                                          onMouseUp={e => saveProduct(p.id, { model_config: { ...(form.model_config || {}), speed: Number(e.target.value) } })}
                                          style={{flex:1, accentColor:'#2D6BE4'}}
                                        />
                                        <span style={{fontSize:12, fontWeight:700, color:'#2d3352', minWidth:16}}>{form.model_config?.speed ?? 5}</span>
                                      </div>
                                      <div style={{display:'flex', justifyContent:'space-between', fontSize:9, color:'#9aa3bc', marginTop:2}}>
                                        <span>Lento</span><span>Rápido</span>
                                      </div>
                                    </div>
                                    {form.model_config?.mode === 'pendulum' && (
                                      <div>
                                        <div style={{fontSize:11, fontWeight:600, color:'#5a6380', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6}}>Amplitud</div>
                                        <div style={{display:'flex', alignItems:'center', gap:8}}>
                                          <input type="range" min="1" max="10" value={form.model_config?.pendulum_amplitude ?? 5}
                                            onChange={e => {
                                              const newConfig = { ...(form.model_config || {}), pendulum_amplitude: Number(e.target.value) };
                                              updateProductForm(p.id, 'model_config', newConfig);
                                              setLiveModelConfig(newConfig);
                                            }}
                                            onMouseUp={e => saveProduct(p.id, { model_config: { ...(form.model_config || {}), pendulum_amplitude: Number(e.target.value) } })}
                                            style={{flex:1, accentColor:'#2D6BE4'}}
                                          />
                                          <span style={{fontSize:12, fontWeight:700, color:'#2d3352', minWidth:16}}>{form.model_config?.pendulum_amplitude ?? 5}</span>
                                        </div>
                                        <div style={{display:'flex', justifyContent:'space-between', fontSize:9, color:'#9aa3bc', marginTop:2}}>
                                          <span>Frontal</span><span>Lateral</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {(() => {
                                  const productModels = designs.filter(d => d.product_id === p.id && d.model_url);
                                  const previewUrl = popupPreviewModel ?? productModels[0]?.model_url ?? null;
                                  return (
                                    <>
                                      {productModels.length > 0 && (
                                        <div style={{marginTop:12, marginBottom:8}}>
                                          {productModels.length > 1 && (
                                            <>
                                              <div style={{fontSize:11, fontWeight:600, color:'#5a6380', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6}}>Modelo de vista previa</div>
                                              <select
                                                value={popupPreviewModel ?? productModels[0]?.model_url ?? ''}
                                                onChange={e => setPopupPreviewModel(e.target.value)}
                                                style={{width:'100%', border:'1.5px solid #dde1ef', borderRadius:7, padding:'5px 8px', fontSize:12, fontFamily:'Barlow, sans-serif', color:'#2d3352', marginBottom:8}}
                                              >
                                                {productModels.map(d => (
                                                  <option key={d.id} value={d.model_url}>{d.name}</option>
                                                ))}
                                              </select>
                                            </>
                                          )}
                                          {previewUrl && (
                                            <div style={{width:'100%', height:200, borderRadius:8, overflow:'hidden', border:'1.5px solid #dde1ef', background:'#f0f2f8'}}>
                                              <ModelViewer
                                                url={previewUrl}
                                                autoRotate={false}
                                                hideHint={true}
                                                modelConfig={liveModelConfig || { mode: 'static', speed: 5 }}
                                              />
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      {!previewUrl && (
                                        <div style={{marginTop:10, marginBottom:8, fontSize:11, color:'#9aa3bc', fontStyle:'italic'}}>No hay modelos GLB cargados para este producto.</div>
                                      )}
                                    </>
                                  );
                                })()}
                                <button onClick={e => { e.stopPropagation(); setModelConfigPopup(null); }} style={{marginTop:12, width:'100%', background:'#f0f2f8', border:'none', borderRadius:7, padding:'6px', fontSize:12, fontWeight:600, color:'#5a6380', cursor:'pointer'}}>Cerrar</button>
                              </div>,
                              document.body
                            )}
                          </td>
                          <td style={s.td}>
                            <input ref={setRef(5)} style={{...s.tblInput, width: 70}} type="number" min="100" value={form.landing_max_file_size_kb ?? 4096} onChange={e => updateProductForm(p.id, 'landing_max_file_size_kb', parseInt(e.target.value)||4096)} onBlur={() => saveProduct(p.id)} onKeyDown={e => handleProductKeyDown(e, rowIdx, 5)} />
                          </td>
                          <td style={s.td}>
                            {!form.landing_image && uploadingLandingImage !== p.id && (
                              <span style={{fontSize:9, color:'#9aa3bc', display:'block', marginBottom:3}}>
                                Máx. {(form.landing_max_file_size_kb ?? 4096) >= 1024 ? ((form.landing_max_file_size_kb ?? 4096)/1024).toFixed(0) + 'MB' : (form.landing_max_file_size_kb ?? 4096) + 'KB'}
                              </span>
                            )}
                            <div style={{display:'flex', alignItems:'center', gap:6}}>
                              {form.landing_image ? (
                                <>
                                  <img src={form.landing_image} style={{width:32, height:32, objectFit:'cover', borderRadius:4, border:'1px solid #dde1ef', flexShrink:0}} />
                                  <button
                                    onClick={() => { updateProductForm(p.id, 'landing_image', ''); saveProduct(p.id, {landing_image: null}); }}
                                    style={{background:'rgba(229,62,62,0.12)', border:'none', color:'#e53e3e', borderRadius:4, width:20, height:20, cursor:'pointer', fontSize:11, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}
                                  >✕</button>
                                </>
                              ) : null}
                              {uploadingLandingImage === p.id ? (
                                <div style={{display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#2D6BE4'}}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2D6BE4" strokeWidth="2.5" strokeLinecap="round" style={{animation:'spin 0.8s linear infinite', flexShrink:0}}>
                                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                                  </svg>
                                  Subiendo...
                                </div>
                              ) : !form.landing_image ? (
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp,image/gif"
                                  style={{fontSize:10, maxWidth:110}}
                                  onChange={async e => {
                                    const file = e.target.files[0];
                                    if (!file) return;
                                    const maxLanding = (form.landing_max_file_size_kb ?? 4096) * 1024;
                                    if (file.size > maxLanding) { alert('La imagen supera ' + (form.landing_max_file_size_kb >= 1024 ? (form.landing_max_file_size_kb/1024).toFixed(0) + 'MB' : form.landing_max_file_size_kb + 'KB') + '.'); e.target.value = ''; return; }
                                    setUploadingLandingImage(p.id);
                                    const base64 = await fileToBase64(file);
                                    const res = await fetch('/api/upload-image', {
                                      method: 'POST', headers: {'Content-Type':'application/json'},
                                      body: JSON.stringify({fileBase64: base64, fileName: file.name, mimeType: file.type, folder: 'landing'}),
                                    });
                                    const data = await res.json();
                                    if (data.url) {
                                      updateProductForm(p.id, 'landing_image', data.url);
                                      saveProduct(p.id, {landing_image: data.url});
                                    } else {
                                      alert('Error al subir la imagen: ' + (data.error || 'desconocido'));
                                    }
                                    setUploadingLandingImage(null);
                                    e.target.value = '';
                                  }}
                                />
                              ) : null}
                            </div>
                          </td>
                          <td style={{...s.td, textAlign:'center', width: 32}}>
                            {savedProductId === p.id && <span style={{color:'#18a36a', fontWeight:700, fontSize:18}}>✓</span>}
                          </td>
                          <td style={{...s.td, textAlign:'center', width: 32}}>
                            <TrashBtn onClick={() => deleteProduct(p.id)} />
                          </td>
                        </tr>
                      );
                    })}
                    {showAddForm && (
                      <tr style={{background:'#f7f8fc'}}>
                        <td style={{...s.td, textAlign:'center', color:'#9aa3bc'}}>—</td>
                        <td style={s.td}><input style={s.tblInput} value={newProduct.name} placeholder="Nombre" onChange={e => { const name = e.target.value; setNewProduct(p => ({...p, name, slug: slugify(name)})); }} /></td>
                        <td style={s.td}><input style={{...s.tblInput, width: 80}} type="number" min="80" max="600" value={newProduct.card_width_desktop} onChange={e => setNewProduct(p => ({...p, card_width_desktop: parseInt(e.target.value)||180}))} /></td>
                        <td style={s.td}><input style={{...s.tblInput, width: 80}} type="number" min="80" max="400" value={newProduct.card_width_mobile} onChange={e => setNewProduct(p => ({...p, card_width_mobile: parseInt(e.target.value)||160}))} /></td>
                        <td style={s.td}><input style={{...s.tblInput, width: 80}} type="number" min="80" max="800" value={newProduct.landing_card_width_desktop} onChange={e => setNewProduct(p => ({...p, landing_card_width_desktop: parseInt(e.target.value)||320}))} /></td>
                        <td style={s.td}><input style={{...s.tblInput, width: 80}} type="number" min="80" max="600" value={newProduct.landing_card_width_mobile} onChange={e => setNewProduct(p => ({...p, landing_card_width_mobile: parseInt(e.target.value)||280}))} /></td>
                        <td style={s.td}>
                          <select style={{...s.tblInput, width: 72}} value={newProduct.aspect_ratio} onChange={e => setNewProduct(p => ({...p, aspect_ratio: e.target.value}))}>
                            <option value="1/1">1/1</option>
                            <option value="2/3">2/3</option>
                            <option value="3/4">3/4</option>
                            <option value="4/3">4/3</option>
                            <option value="3/2">3/2</option>
                            <option value="16/9">16/9</option>
                          </select>
                        </td>
                        <td style={s.td}><input style={{...s.tblInput, width: 80}} type="number" min="50" value={newProduct.max_file_size_kb} onChange={e => setNewProduct(p => ({...p, max_file_size_kb: parseInt(e.target.value)||250}))} /></td>
                        <td style={{...s.td, textAlign:'center'}}>
                          <button style={s.iconBtn} onClick={() => setNewProduct(p => ({...p, show_price: !p.show_price}))}>
                            {newProduct.show_price ? <EyeOpen /> : <EyeOff />}
                          </button>
                        </td>
                        <td style={{...s.td, textAlign:'center'}}>
                          <div
                            onClick={() => setNewProduct(p => ({...p, allow_glb: !p.allow_glb}))}
                            style={{ width: 36, height: 20, borderRadius: 10, background: newProduct.allow_glb ? '#1B2F5E' : '#dde1ef', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
                          >
                            <div style={{ position: 'absolute', top: 2, left: newProduct.allow_glb ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                          </div>
                        </td>
                        <td style={{...s.td, textAlign:'center'}}>
                          <div
                            onClick={() => setNewProduct(p => ({...p, allow_3d: !p.allow_3d}))}
                            style={{ width: 36, height: 20, borderRadius: 10, background: newProduct.allow_3d ? '#1B2F5E' : '#dde1ef', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
                          >
                            <div style={{ position: 'absolute', top: 2, left: newProduct.allow_3d ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                          </div>
                        </td>
                        <td style={s.td}>
                          <button style={{...s.btnPrimary, padding:'6px 14px', fontSize:13, opacity: newProduct.name && !savingProduct ? 1 : 0.5}} disabled={!newProduct.name || savingProduct} onClick={addProduct}>
                            {savingProduct ? '...' : 'Crear'}
                          </button>
                        </td>
                        <td style={s.td}></td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={11} style={{padding:'10px 6px'}}>
                        <button style={{...s.editBtn, width:'100%', textAlign:'center', padding:'8px'}} onClick={() => { setShowAddForm(v => !v); setNewProduct(EMPTY_PRODUCT); }}>
                          {showAddForm ? '✕ Cancelar' : '+ Agregar producto'}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* CATEGORÍAS */}
            <div style={s.card}>
              <h2 style={s.sectionTitle}>Categorías por producto</h2>
              {products.filter(p => p.active).length === 0 ? <p style={s.emptyMsg}>No hay productos activos.</p> : (
                <div style={{display:'flex', flexWrap:'wrap', gap:14, alignItems:'flex-start'}}>
                  {products.filter(p => p.active).map(product => {
                    const cats = getProductCategories(product.id);
                    const newCat = newCatInputs[product.id] || '';
                    return (
                      <div key={product.id} style={{border:'1.5px solid #dde1ef', borderRadius:8, overflow:'hidden', flex:'1 1 200px', minWidth:180}}>
                        <div style={{background:'#1B2F5E', color:'white', padding:'5px 10px', fontSize:12, fontWeight:700, letterSpacing:0.5}}>{product.name}</div>
                        <div style={{padding:'8px 10px', display:'flex', flexWrap:'wrap', gap:4, minHeight:36}}>
                          <span style={{display:'inline-flex', alignItems:'center', background:'#f0f2f8', color:'#9aa3bc', borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:600}}>Sin categoría</span>
                          {cats.map(cat => {
                            const p = products.find(pr => pr.id === product.id);
                            const savedColor = p?.category_colors?.[cat] || '#e8eef9';
                            const pickerKey = `${product.id}:${cat}`;
                            const pickerOpen = catColorPicker[pickerKey];
                            return (
                              <span key={cat}
                                draggable
                                onDragStart={() => { dragSrcCatRef.current = cat; setDragOverCat(null); }}
                                onDragOver={e => { e.preventDefault(); setDragOverCat(cat); }}
                                onDrop={() => { reorderProductCategory(product.id, dragSrcCatRef.current, cat); dragSrcCatRef.current = null; setDragOverCat(null); }}
                                onDragEnd={() => { dragSrcCatRef.current = null; setDragOverCat(null); }}
                                style={{display:'inline-flex', alignItems:'center', gap:3, background: dragOverCat === cat ? '#d0dff7' : '#e8eef9', color:'#1B2F5E', borderRadius:6, padding:'2px 6px 2px 8px', fontSize:11, fontWeight:600, position:'relative', cursor:'grab'}}>
                                {cat}
                                <span
                                  title="Color de la categoría"
                                  onClick={e => { e.stopPropagation(); const pickerOpen = catColorPicker[pickerKey]; setTimeout(() => { e.target.nextSibling?.click(); }, 30); }}
                                  style={{width:12, height:12, borderRadius:'50%', background:savedColor, border:'1.5px solid rgba(0,0,0,0.15)', cursor:'pointer', display:'inline-block', flexShrink:0, marginLeft:2}}
                                />
                                <input
                                  type="color"
                                  defaultValue={savedColor}
                                  style={{position:'absolute', width:0, height:0, border:'none', padding:0, opacity:0, pointerEvents: pickerOpen ? 'auto' : 'none'}}
                                  onChange={e => { catColorValueRef.current[pickerKey] = e.target.value; saveCategoryColor(product.id, cat, e.target.value); }}
                                  onBlur={() => setCatColorPicker(prev => ({...prev, [pickerKey]: false}))}
                                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const val = catColorValueRef.current[pickerKey]; if (val) saveCategoryColor(product.id, cat, val); setCatColorPicker(prev => ({...prev, [pickerKey]: false})); catColorPickerRef.current = {}; e.target.blur(); }}}
                                />
                                <button style={{background:'none', border:'none', cursor:'pointer', color:'#9aa3bc', fontSize:13, lineHeight:1, padding:0, marginLeft:1}} onClick={() => removeProductCategory(product.id, cat)}>×</button>
                              </span>
                            );
                          })}
                        </div>
                        <div style={{padding:'0 8px 8px', display:'flex', gap:4}}>
                          <input
                            style={{...s.tblInput, flex:1, padding:'3px 6px', fontSize:12}}
                            placeholder="Nueva categoría..."
                            value={newCat}
                            onChange={e => setNewCatInputs(prev => ({...prev, [product.id]: e.target.value}))}
                            onKeyDown={e => { if (e.key === 'Enter') addProductCategory(product.id, newCat); }}
                          />
                          <button style={{...s.editBtn, whiteSpace:'nowrap'}} onClick={() => addProductCategory(product.id, newCat)}>+ Agregar</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ESCALAS */}
            <div style={s.card}>
              <h2 style={s.sectionTitle}>Escalas de precio</h2>
              {localities.filter(l => l.active).length === 0 ? <p style={s.emptyMsg}>No hay localidades activas.</p>
              : products.filter(p => p.active).length === 0 ? <p style={s.emptyMsg}>No hay productos activos.</p>
              : (
                <div style={{display:'flex', flexWrap:'wrap', gap:14, alignItems:'flex-start'}}>
                  {products.filter(p => p.active).map(product => {
                    const productTiers = priceTiers.filter(t => t.product_id === product.id);
                    const activeLocalities = localities.filter(l => l.active);

                    const renderLocalityBlock = (localityId, localityName, borderTop) => {
                      const key = `${product.id}_${localityId}`;
                      const tiers = productTiers.filter(t => t.locality_id === localityId).sort((a,b) => Number(a.min_quantity) - Number(b.min_quantity));
                      const nt = newTiers[key] || { min_quantity: '', price_per_unit: '' };
                      const isAdding = addingTier === key;
                      const cellStyle = {padding:'2px 6px', verticalAlign:'middle'};
                      return (
                        <div key={key} style={{borderTop: borderTop ? '1px solid #f0f2f8' : 'none'}}>
                          <div style={{padding:'4px 8px 2px', fontSize:10, fontWeight:700, color:'#9aa3bc', letterSpacing:0.5, textTransform:'uppercase'}}>{localityName}</div>
                          <table style={{width:'100%', borderCollapse:'collapse'}}>
                            <thead>
                              <tr style={{borderBottom:'1px solid #eef0f6'}}>
                                <th style={{padding:'2px 6px', fontSize:10, fontWeight:600, color:'#b0b8d0', textAlign:'left', whiteSpace:'nowrap'}}>Cant. mín.</th>
                                <th style={{padding:'2px 6px', fontSize:10, fontWeight:600, color:'#b0b8d0', textAlign:'left', whiteSpace:'nowrap'}}>Precio/u</th>
                                <th style={{padding:'2px 4px', width:22}}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {tiers.length === 0 && !isAdding && <tr><td colSpan={3} style={{...cellStyle, color:'#c4c9d9', fontSize:11, fontStyle:'italic', textAlign:'center', padding:'4px 6px'}}>Sin escalas</td></tr>}
                              {tiers.map(t => {
                                const ef = editingTiers[t.id] || { min_quantity: t.min_quantity, price_per_unit: t.price_per_unit };
                                return (
                                  <tr key={t.id} style={{borderBottom:'1px solid #f0f2f8'}}>
                                    <td style={cellStyle}>
                                      <input className="tier-input" type="number" min="1" value={ef.min_quantity} onChange={e => updateTierForm(t.id, 'min_quantity', e.target.value)} onBlur={() => saveTierAuto(t.id)} />
                                    </td>
                                    <td style={cellStyle}>
                                      <div style={{display:'flex', alignItems:'center', gap:2}}>
                                        <span style={{fontSize:11, color:'#c4c9d9'}}>$</span>
                                        <input className="tier-input" type="number" min="0" value={ef.price_per_unit} onChange={e => updateTierForm(t.id, 'price_per_unit', e.target.value)} onBlur={() => saveTierAuto(t.id)} />
                                        {savedTierId === t.id && <span style={{color:'#18a36a', fontSize:11, fontWeight:700}}>✓</span>}
                                      </div>
                                    </td>
                                    <td style={{...cellStyle, textAlign:'center'}}>
                                      <TrashBtn onClick={() => deleteScale(t.id)} />
                                    </td>
                                  </tr>
                                );
                              })}
                              {isAdding && (
                                <tr style={{borderBottom:'1px solid #f0f2f8'}}>
                                  <td style={cellStyle}>
                                    <input
                                      className="tier-input"
                                      type="number" min="1" placeholder="Cantidad"
                                      value={nt.min_quantity}
                                      onChange={e => setNewTiers(prev => ({...prev, [key]: {...nt, min_quantity: e.target.value}}))}
                                      onKeyDown={e => { if (e.key === 'Enter') addTierMatrix(product.id, localityId, key); }}
                                    />
                                  </td>
                                  <td style={cellStyle}>
                                    <div style={{display:'flex', alignItems:'center', gap:2}}>
                                      <span style={{fontSize:11, color:'#c4c9d9'}}>$</span>
                                      <input
                                        className="tier-input"
                                        type="number" min="0" placeholder="Precio"
                                        value={nt.price_per_unit}
                                        onChange={e => setNewTiers(prev => ({...prev, [key]: {...nt, price_per_unit: e.target.value}}))}
                                        onBlur={() => addTierMatrix(product.id, localityId, key)}
                                        onKeyDown={e => { if (e.key === 'Enter') addTierMatrix(product.id, localityId, key); }}
                                      />
                                    </div>
                                  </td>
                                  <td style={{...cellStyle, textAlign:'center'}} />
                                </tr>
                              )}
                            </tbody>
                          </table>
                          <div style={{padding:'3px 8px', borderTop:'1px solid #f0f2f8'}}>
                            {isAdding
                              ? <button style={{background:'none', border:'none', cursor:'pointer', color:'#b0b8d0', fontSize:11, padding:0}} onClick={() => setAddingTier(null)}>✕ Cancelar</button>
                              : <button style={{background:'none', border:'none', cursor:'pointer', color:'#b0b8d0', fontSize:11, padding:0, width:'100%', textAlign:'center'}} onClick={() => setAddingTier(key)}>+ escala</button>
                            }
                          </div>
                        </div>
                      );
                    };

                    return (
                      <div key={product.id} style={{border:'1.5px solid #dde1ef', borderRadius:8, overflow:'hidden', flex:'1 1 220px', minWidth:200}}>
                        <div style={{background:'#1B2F5E', color:'white', padding:'5px 10px', fontSize:12, fontWeight:700, letterSpacing:0.5}}>{product.name}</div>
                        {activeLocalities.map((locality, li) => renderLocalityBlock(locality.id, locality.name, li > 0))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ══ DISEÑOS ══ */}
        {activeTab === 'designs' && (
          <>
            <div style={s.card}>
              <h2 style={s.sectionTitle}>Agregar diseños</h2>
              <div style={s.formGroup}>
                <label style={s.label}>Producto *</label>
                <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
                  {products.map(p => (
                    <button key={p.id} onClick={() => { setSelectedProductId(p.id); if (p.id !== selectedProductId) setPendingFiles([]); }} style={{border:'none', borderRadius:7, padding:'6px 14px', fontSize:13, fontWeight:600, cursor:'pointer', background: selectedProductId === p.id ? '#1B2F5E' : '#eef0f6', color: selectedProductId === p.id ? 'white' : '#5a6380', transition:'background 0.15s, color 0.15s'}}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
              {selectedProductId && !selectedProduct?.allow_glb && (
                <div style={s.formGroup}>
                  <label style={s.label}>Imágenes (máx. {maxSizeKb}kb c/u)</label>
                  <input type="file" accept="image/*" multiple style={{...s.input, padding: 6}} onChange={handleFileSelect} />
                </div>
              )}
              {selectedProductId && selectedProduct?.allow_glb && (
                <div style={s.formGroup}>
                  <label style={s.label}>3MF (máx. {maxSizeKb}kb c/u — máx. 10 archivos por vez)</label>
                  <input type="file" accept=".glb,.3mf" multiple style={{...s.input, padding: 6}} onChange={async e => {
                    const files = Array.from(e.target.files);
                    if (files.length > 10) { alert('Podés subir hasta 10 archivos 3D por vez. Seleccioná menos archivos.'); e.target.value = ''; return; }
                    if (!files.length) return;
                    const newEntries = files.map(file => ({
                      file: null, preview: null, modelPreview: URL.createObjectURL(file), name: file.name.replace(/\.[^.]+$/, ''),
                      category: 'Sin categoría', nameExists: false,
                      sizeError: file.size > maxSizeKb * 1024, modelFile: file, fileType: file.name.split('.').pop().toLowerCase(),
                    }));
                    setPendingFiles(prev => {
                      const existingNames = new Set(prev.map(p => p.modelFile?.name));
                      return [...prev, ...newEntries.filter(e => !existingNames.has(e.modelFile.name))];
                    });
                    e.target.value = '';
                    const { data } = await supabase.from('designs').select('name').eq('active', true).eq('product_id', selectedProductId);
                    const existing = new Set((data || []).map(d => d.name.toLowerCase()));
                    setPendingFiles(prev => prev.map(entry => ({
                      ...entry, nameExists: entry.name.length > 2 && existing.has(entry.name.toLowerCase()),
                    })));
                  }} />
                </div>
              )}

              {pendingFiles.length > 0 && (
                <>
                  <div style={s.fileList}>
                    {pendingFiles.map((entry, i) => {
                      const dupInBatch = hasDupInBatch(i, entry.name);
                      const hasError = entry.nameExists || dupInBatch || entry.sizeError;
                      return (
                        <div key={i} style={s.fileRow}>
                          {entry.preview
                            ? <img src={entry.preview} alt="" style={s.fileThumb} />
                            : entry.modelPreview
                              ? <div style={{...s.fileThumb, overflow:'hidden', border: entry.sizeError ? '1px solid #fca5a5' : '1px solid #dde1ef'}}>
                                  <ModelViewer url={entry.modelPreview} autoRotate={false} hideHint={true} modelConfig={{_fileType: entry.fileType}} onCapture={blob => { if (!entry.capturedThumb) updateEntry(i, 'capturedThumb', blob); }} />
                                </div>
                              : <div style={{...s.fileThumb, background:'#e8eef9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'#2D6BE4', fontWeight:700}}>?</div>
                          }
                          <div style={s.fileFields}>
                            <input style={{...s.input, borderColor: hasError ? '#dc2626' : '#dde1ef'}} value={entry.name} onChange={e => updateEntry(i, 'name', e.target.value)} placeholder="Nombre del diseño" />
                            {entry.nameExists && <div style={s.errorMsg}>⚠ Ya existe este diseño</div>}
                            {dupInBatch && <div style={s.errorMsg}>⚠ Nombre duplicado en este lote</div>}
                            {(entry.file || entry.modelFile) && (() => {
                              const f = entry.modelFile || entry.file;
                              const kb = (f.size / 1024).toFixed(0);
                              return entry.sizeError
                                ? <div style={s.errorMsg}>⚠ {kb}kb — supera el máximo de {maxSizeKb}kb</div>
                                : <div style={{fontSize:11, color:'#18a36a', marginTop:3, fontWeight:600}}>✓ {kb}kb</div>;
                            })()}
                          </div>
                          <select style={{...s.input, width: 140, flexShrink: 0}} value={entry.category} onChange={e => updateEntry(i, 'category', e.target.value)}>
                            <option value="Sin categoría">Sin categoría</option>
                            {getProductCategories(selectedProductId).map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          
                          <button style={s.removePendingBtn} onClick={() => removePending(i)}>✕</button>
                        </div>
                      );
                    })}
                  </div>
                  <button style={{...s.btnPrimary, marginTop: 16, opacity: canSubmit && !uploading ? 1 : 0.5}} disabled={!canSubmit || uploading} onClick={addDesigns}>
                    {uploading ? 'Subiendo...' : `Agregar ${pendingFiles.length} diseño${pendingFiles.length !== 1 ? 's' : ''}`}
                  </button>
                </>
              )}
            </div>
            <div style={s.card}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 12}}>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <h2 style={{...s.sectionTitle, marginBottom: 0}}>Diseños actuales ({designs.length})</h2>
                  {selectedIds.size > 1 && <span style={{background:'#2D6BE4', color:'white', borderRadius:10, padding:'2px 10px', fontSize:12, fontWeight:700}}>{selectedIds.size} seleccionados</span>}
                </div>
                {orphanCount > 0 && <button style={{...s.btnWarning, opacity: migrating ? 0.5 : 1}} disabled={migrating} onClick={migrateOrphans}>{migrating ? 'Migrando...' : `Migrar ${orphanCount} sin producto →`}</button>}
              </div>
              <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:16}}>
                {[{id:'all', name:'Todos'}, ...products].map(p => (
                  <button key={p.id} onClick={() => setDesignFilterProduct(p.id)} style={{border:'none', borderRadius:7, padding:'5px 13px', fontSize:12, fontWeight:600, cursor:'pointer', background: designFilterProduct === p.id ? '#1B2F5E' : '#eef0f6', color: designFilterProduct === p.id ? 'white' : '#5a6380', transition:'background 0.15s, color 0.15s'}}>
                    {p.name}
                  </button>
                ))}
              </div>
              <div style={{display:'flex', flexWrap:'wrap', gap:8, marginBottom: 12, alignItems:'center'}}>
                <input
                  style={{...s.input, maxWidth: 220}}
                  placeholder="Buscar diseño..."
                  value={designSearch ?? ''}
                  onChange={e => setDesignSearch(e.target.value)}
                />
                <div style={{display:'flex', flexWrap:'wrap', gap:4}}>
                  <button onClick={() => setDesignCatFilter('')} style={{border:'none', borderRadius:7, padding:'4px 12px', fontSize:12, fontWeight:600, cursor:'pointer', background: !designCatFilter ? '#1B2F5E' : '#eef0f6', color: !designCatFilter ? 'white' : '#5a6380', transition:'background 0.15s'}}>
                    Todas
                  </button>
                  {[...new Set(designs.flatMap(d => Array.isArray(d.categories) && d.categories.length > 0 ? d.categories : (d.category && d.category !== 'Sin categoría' ? [d.category] : [])))].sort().map(c => (
                    <button key={c} onClick={() => setDesignCatFilter(designCatFilter === c ? '' : c)} style={{border:'none', borderRadius:7, padding:'4px 12px', fontSize:12, fontWeight:600, cursor:'pointer', background: designCatFilter === c ? '#1B2F5E' : '#eef0f6', color: designCatFilter === c ? 'white' : '#5a6380', transition:'background 0.15s'}}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div onClick={() => setSelectedIds(new Set())}>
              {designs.filter(d => {
                const cats = Array.isArray(d.categories) && d.categories.length > 0 ? d.categories : (d.category && d.category !== 'Sin categoría' ? [d.category] : []);
                return (designFilterProduct === 'all' || d.product_id === designFilterProduct)
                  && (!designSearch || d.name.toLowerCase().includes(designSearch.toLowerCase()))
                  && (!designCatFilter || cats.includes(designCatFilter));
              }).map(d => (
                <div
                  key={d.id}
                  draggable
                  onDragStart={e => handleDragStart(e, d.id)}
                  onDragOver={e => handleDragOver(e, d.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={e => handleDrop(e, d.id)}
                  onDragEnd={handleDragEnd}
                  onClick={e => { e.stopPropagation(); handleDesignClick(e, d.id); }}
                  style={{
                    ...s.designRow,
                    opacity: !d.active ? 0.45 : (draggingId && selectedIds.has(draggingId) && selectedIds.has(d.id) ? 0.35 : 1),
                    background: dragOverId === d.id ? '#eef4ff' : selectedIds.has(d.id) ? '#f0f5ff' : undefined,
                    borderLeft: dragOverId === d.id ? '3px solid #2D6BE4' : selectedIds.has(d.id) ? '3px solid #2D6BE4' : '3px solid transparent',
                    transition: 'background 0.12s, border-left 0.12s',
                    cursor: draggingId === d.id ? 'grabbing' : 'grab',
                  }}
                >
                  <div style={s.designInfo}>
                    {d.model_url
                      ? <img src={d.image_url} alt={d.name} style={s.designThumb} />
                      : d.image_url && <img src={d.image_url} alt={d.name} style={s.designThumb} />
                    }
                    <div>
                      <input
                        style={{ fontSize: 13, fontWeight: 600, color: '#2d3352', border: '1px solid transparent', borderRadius: 4, padding: '2px 6px', fontFamily: 'Barlow, sans-serif', background: 'transparent', width: '100%' }}
                        value={d.name}
                        onFocus={e => e.target.style.borderColor = '#dde1ef'}
                        onBlur={async e => { e.target.style.borderColor = 'transparent'; await supabase.from('designs').update({ name: e.target.value }).eq('id', d.id); }}
                        onChange={e => setDesigns(prev => prev.map(x => x.id === d.id ? { ...x, name: e.target.value } : x))}
                        onClick={e => e.stopPropagation()}
                        onDragStart={e => e.stopPropagation()}
                      />
                      <div style={{fontSize: 11, color: '#9aa3bc', marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center'}}>
                        {(d.tags || []).map((tag, ti) => (
                          <span key={ti} style={{background: '#f0f2f8', color: '#5a6380', borderRadius: 4, padding: '1px 6px', fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 2}}>
                            {tag}
                            <button style={{background:'none', border:'none', cursor:'pointer', color:'#9aa3bc', fontSize:11, lineHeight:1, padding:0}} onClick={async e => { e.stopPropagation(); const newTags = (d.tags || []).filter((_, i) => i !== ti); await supabase.from('designs').update({ tags: newTags }).eq('id', d.id); setDesigns(prev => prev.map(x => x.id === d.id ? {...x, tags: newTags} : x)); }}>×</button>
                          </span>
                        ))}
                        <input
                          style={{fontSize: 11, border: '1px dashed #dde1ef', borderRadius: 4, padding: '1px 6px', fontFamily: 'Barlow, sans-serif', background: 'transparent', width: 80, color: '#5a6380'}}
                          placeholder="+ tag"
                          onClick={e => e.stopPropagation()}
                          onDragStart={e => e.stopPropagation()}
                          onKeyDown={async e => {
                            if (e.key === 'Enter' && e.target.value.trim()) {
                              const newTag = e.target.value.trim().toLowerCase();
                              const newTags = [...(d.tags || []), newTag];
                              await supabase.from('designs').update({ tags: newTags }).eq('id', d.id);
                              setDesigns(prev => prev.map(x => x.id === d.id ? {...x, tags: newTags} : x));
                              e.target.value = '';
                            }
                          }}
                        />
                      </div>
                      <div style={s.designCat}>
                        {d.products?.name ? <span style={s.productTag}>{d.products.name}</span> : <span style={s.orphanTag}>Sin producto</span>}
                        {' '}
                        {d.product_id ? (
                          <div style={{display:'flex', flexWrap:'wrap', gap:3}} onClick={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
                            {getProductCategories(d.product_id).map(c => {
                              const cats = Array.isArray(d.categories) ? d.categories : (d.category && d.category !== 'Sin categoría' ? [d.category] : []);
                              const active = cats.includes(c);
                              return (
                                <span
                                  key={c}
                                  onClick={async e => {
                                    e.stopPropagation();
                                    const idsToUpdate = selectedIds.has(d.id) && selectedIds.size > 1 ? [...selectedIds] : [d.id];
                                    const newCats = active ? cats.filter(x => x !== c) : [...cats, c];
                                    await Promise.all(idsToUpdate.map(did => supabase.from('designs').update({ categories: newCats, category: newCats[0] || 'Sin categoría' }).eq('id', did)));
                                    setDesigns(prev => prev.map(x => idsToUpdate.includes(x.id) ? {...x, categories: newCats, category: newCats[0] || 'Sin categoría'} : x));
                                  }}
                                  style={{fontSize:10, borderRadius:4, padding:'1px 6px', cursor:'pointer', fontWeight:600, background: active ? '#1B2F5E' : '#f0f2f8', color: active ? 'white' : '#9aa3bc'}}
                                >
                                  {c}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span>{d.category}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{display:'flex', alignItems:'center', gap:4}}>
                    <button style={s.iconBtn} onClick={e => { e.stopPropagation(); toggleDesign(d.id, d.active); }}>{d.active ? <EyeOpen /> : <EyeOff />}</button>
                    <TrashBtn onClick={e => { e.stopPropagation(); deleteDesign(d.id); }} />
                  </div>
                </div>
              ))}
              </div>
            </div>
          </>
        )}

        {/* ══ PEDIDOS ══ */}
        {activeTab === 'orders' && (
          <div style={s.card} onClick={() => setSelectedOrderIds(new Set())}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ ...s.sectionTitle, marginBottom: 0 }}>Pedidos ({filteredOrders.length})</h2>
              {selectedOrderIds.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ background: '#2D6BE4', color: 'white', borderRadius: 10, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>{selectedOrderIds.size} seleccionados</span>
                  <HoldButton onConfirm={() => deleteOrders(selectedOrderIds)} />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
              <input
                style={{ ...s.input, maxWidth: 220 }}
                placeholder="Código, nombre o email..."
                value={orderSearch}
                onChange={e => setOrderSearch(e.target.value)}
              />
              <select value={orderFilterStatus} onChange={e => setOrderFilterStatus(e.target.value)}
                style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '5px 9px', fontSize: 13, fontFamily: 'Barlow, sans-serif', color: '#2d3352' }}>
                <option value="all">Todos los estados</option>
                {ORDER_STATUSES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
              </select>
              <select value={orderFilterSeller} onChange={e => setOrderFilterSeller(e.target.value)}
                style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '5px 9px', fontSize: 13, fontFamily: 'Barlow, sans-serif', color: '#2d3352' }}>
                <option value="all">Todos los vendedores</option>
                <option value="none">Sin vendedor</option>
                {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={orderFilterProduct} onChange={e => setOrderFilterProduct(e.target.value)}
                style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '5px 9px', fontSize: 13, fontFamily: 'Barlow, sans-serif', color: '#2d3352' }}>
                <option value="all">Todos los productos</option>
                {products.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="date" value={orderFilterDateFrom} onChange={e => setOrderFilterDateFrom(e.target.value)}
                  style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '5px 9px', fontSize: 13, fontFamily: 'Barlow, sans-serif' }} />
                <span style={{ fontSize: 12, color: '#9aa3bc' }}>→</span>
                <input type="date" value={orderFilterDateTo} onChange={e => setOrderFilterDateTo(e.target.value)}
                  style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '5px 9px', fontSize: 13, fontFamily: 'Barlow, sans-serif' }} />
              </div>
              {(orderSearch || orderFilterStatus !== 'all' || orderFilterSeller !== 'all' || orderFilterProduct !== 'all' || orderFilterDateFrom || orderFilterDateTo) && (
                <button onClick={() => { setOrderSearch(''); setOrderFilterStatus('all'); setOrderFilterSeller('all'); setOrderFilterProduct('all'); setOrderFilterDateFrom(''); setOrderFilterDateTo(''); }}
                  style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'white', color: '#9aa3bc' }}>
                  ✕ Limpiar filtros
                </button>
              )}
            </div>
            {filteredOrders.length === 0 && <p style={s.emptyMsg}>No hay pedidos.</p>}
            {filteredOrders.length > 0 && (
              <div style={{overflowX: 'auto'}}>
                <table style={s.tbl}>
                  <thead>
                    <tr>
                      <th style={{...s.th, width: 20}}></th>
                      <th style={s.th}>Código</th>
                      <th style={s.th}>Fecha</th>
                      <th style={s.th}>Cliente</th>
                      <th style={s.th}>Email</th>
                      <th style={s.th}>Items</th>
                      <th style={{...s.th, minWidth: 160}}>Notas</th>
                      <th style={s.th}>Total</th>
                      <th style={s.th}>Estado</th>
                      <th style={s.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map(o => {
                      const sc = getStatusCfg(o.status);
                      const notes = String(o.notes || '').trim();
                      const notesExpanded = expandedOrderNotes.has(o.id);
                      const longNotes = notes.length > 70;
                      return (
                        <tr key={o.id}
                          onClick={e => {
                            e.stopPropagation();
                            if (e.shiftKey && lastSelectedOrderIdRef.current) {
                              const ids = filteredOrders.map(x => x.id);
                              const lastIdx = ids.indexOf(lastSelectedOrderIdRef.current);
                              const currIdx = ids.indexOf(o.id);
                              const [start, end] = lastIdx < currIdx ? [lastIdx, currIdx] : [currIdx, lastIdx];
                              setSelectedOrderIds(new Set(ids.slice(start, end + 1)));
                            } else if (e.ctrlKey || e.metaKey) {
                              setSelectedOrderIds(prev => {
                                const next = new Set(prev);
                                if (next.has(o.id)) next.delete(o.id); else next.add(o.id);
                                return next;
                              });
                              lastSelectedOrderIdRef.current = o.id;
                            } else if (selectedOrderIds.has(o.id) && selectedOrderIds.size === 1) {
                              setSelectedOrderIds(new Set());
                              lastSelectedOrderIdRef.current = null;
                            } else {
                              setSelectedOrderIds(new Set([o.id]));
                              lastSelectedOrderIdRef.current = o.id;
                            }
                          }}
                          style={{ cursor: 'pointer', background: selectedOrderIds.has(o.id) ? '#f0f5ff' : undefined, borderLeft: selectedOrderIds.has(o.id) ? '3px solid #2D6BE4' : '3px solid transparent' }}
                        >
                          <td style={s.td}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: selectedOrderIds.has(o.id) ? '#2D6BE4' : '#eef0f6', margin: '0 auto' }} />
                          </td>
                          <td style={s.td}><span style={{fontFamily:'monospace', fontSize:12, fontWeight:700, color:'#1B2F5E'}}>{o.order_code}</span></td>
                          <td style={s.td}><span style={{fontSize:12, color:'#5a6380', whiteSpace:'nowrap'}}>{o.created_at ? new Date(o.created_at).toLocaleDateString('es-AR', {day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit'}) : '—'}</span></td>
                          <td style={s.td}><span style={{fontSize:13, fontWeight:600, color:'#2d3352'}}>{o.customer_name || '—'}</span></td>
                          <td style={s.td}><span style={{fontSize:12, color:'#5a6380'}}>{o.customer_email || '—'}</span></td>
                          <td style={s.td}><span style={{fontSize:12, color:'#5a6380', maxWidth:200, display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{summarizeItems(o.items)}</span></td>
                          <td style={s.td}>
                            {notes ? (
                              <div style={{display:'flex', alignItems: notesExpanded ? 'flex-start' : 'center', gap:6, maxWidth:220}}>
                                <span
                                  title={notes}
                                  style={{
                                    fontSize:12,
                                    color:'#5a6380',
                                    lineHeight:1.35,
                                    display:'block',
                                    maxWidth: longNotes ? 170 : 210,
                                    whiteSpace: notesExpanded ? 'normal' : 'nowrap',
                                    overflow: notesExpanded ? 'visible' : 'hidden',
                                    textOverflow: notesExpanded ? 'clip' : 'ellipsis',
                                  }}
                                >
                                  {notes}
                                </span>
                                {longNotes && (
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      setExpandedOrderNotes(prev => {
                                        const next = new Set(prev);
                                        if (next.has(o.id)) next.delete(o.id); else next.add(o.id);
                                        return next;
                                      });
                                    }}
                                    style={{border:'1.5px solid #dde1ef', background:'white', color:'#2D6BE4', borderRadius:5, padding:'2px 6px', fontSize:11, fontWeight:700, cursor:'pointer', flexShrink:0}}
                                  >
                                    {notesExpanded ? 'Menos' : 'Más'}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span style={{fontSize:12, color:'#c4c9d9'}}>—</span>
                            )}
                          </td>
                          <td style={s.td}><span style={{fontSize:13, fontWeight:700, color:'#2d3352', whiteSpace:'nowrap'}}>{o.total ? `$${Number(o.total).toLocaleString('es-AR')}` : '—'}</span></td>
                          <td style={s.td}>
                            <select
                              value={o.status || 'pending'}
                              onChange={e => updateOrderStatus(o.id, e.target.value)}
                              onClick={e => e.stopPropagation()}
                              style={{border:`1.5px solid ${sc.color}`, background:sc.bg, color:sc.color, borderRadius:6, padding:'3px 7px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Barlow, sans-serif'}}
                            >
                              {ORDER_STATUSES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                            </select>
                          </td>
                          <td style={s.td}>
                            <button style={s.editBtn} onClick={e => { e.stopPropagation(); setOrderDetail(o); }}>Ver</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ LOCALIDADES ══ */}
        {activeTab === 'localities' && (
          <>
            <div style={s.card}>
              <h2 style={s.sectionTitle}>Nueva escala</h2>
              <div style={s.formGroup}>
                <label style={s.label}>Nombre *</label>
                <input style={s.input} value={newLocality.name} onChange={e => setNewLocality(l => ({...l, name: e.target.value}))} placeholder="ej: Posadas" />
              </div>
              <button style={{...s.btnPrimary, opacity: newLocality.name && !savingLocality ? 1 : 0.5}} disabled={!newLocality.name || savingLocality} onClick={addLocality}>
                {savingLocality ? 'Guardando...' : 'Crear localidad'}
              </button>
            </div>
            <div style={s.card}>
              <h2 style={s.sectionTitle}>Localidades ({localities.length})</h2>
              {localities.length === 0 && <p style={s.emptyMsg}>No hay localidades todavía.</p>}
              {localities.map(l => (
                <div
                  key={l.id}
                  draggable
                  onDragStart={e => handleLocalityDragStart(e, l.id)}
                  onDragOver={e => handleLocalityDragOver(e, l.id)}
                  onDragLeave={handleLocalityDragLeave}
                  onDrop={e => handleLocalityDrop(e, l.id)}
                  onDragEnd={handleLocalityDragEnd}
                  style={{
                    ...s.productRow,
                    opacity: draggingLocalityId === l.id ? 0.35 : 1,
                    background: dragOverLocalityId === l.id ? '#eef4ff' : undefined,
                    borderLeft: dragOverLocalityId === l.id ? '3px solid #2D6BE4' : '3px solid transparent',
                    transition: 'background 0.12s, border-left 0.12s',
                    cursor: draggingLocalityId === l.id ? 'grabbing' : 'grab',
                  }}
                >
                  <div style={s.productName}>{l.name}</div>
                  <div style={{display:'flex', alignItems:'center', gap:4}}>
                    <button style={s.iconBtn} onClick={() => toggleLocality(l.id, l.active)}>{l.active ? <EyeOpen /> : <EyeOff />}</button>
                    <TrashBtn onClick={() => deleteLocality(l.id)} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ══ USUARIOS ══ */}
        {activeTab === 'users' && (
          <div style={s.card}>
            <h2 style={s.sectionTitle}>Usuarios registrados ({users.length})</h2>
            {loadingUsers && <p style={s.emptyMsg}>Cargando...</p>}
            {!loadingUsers && users.length === 0 && <p style={s.emptyMsg}>No hay usuarios registrados.</p>}
            {users.map(u => {
              const status = getStatus(u.id);
              return (
              <div key={u.id} style={s.userRow}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0, minWidth: 60 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: status?.isActive ? '#22c55e' : status ? '#d1d5db' : 'transparent' }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: status?.isActive ? '#15803d' : '#9aa3bc' }}>
                      {status?.isActive ? 'En línea' : status ? 'Inactivo' : '—'}
                    </span>
                  </div>
                  {status && (
                    <>
                      <span style={{ fontSize: 10, color: '#9aa3bc' }}>{status.pageLabel === '🏠' ? '🏠 Landing' : '🛍️ Catálogo'}</span>
                      <span style={{ fontSize: 10, color: '#c4c9d9' }}>
                        {new Date(status.updated_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </>
                  )}
                </div>
                <div style={s.userInfo}>
                  <div style={s.productName}>{u.name || '—'}</div>
                  <div style={s.productMeta}>{u.email}</div>
                </div>
                <div style={{display:'flex', gap:8, alignItems:'center'}}>
                  <select style={{...s.input, width: 180, fontSize: 13, padding: '6px 10px'}} value={u.locality_id || ''} onChange={e => updateUserLocality(u.id, e.target.value)}>
                    {localities.filter(l => l.active).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <div style={{display:'flex', alignItems:'center', gap:6}}>
                    <span style={{fontSize:11, color:'#9aa3bc', fontWeight:600, whiteSpace:'nowrap'}}>Mandar email para confirmación de pedido?</span>
                    <div
                      onClick={() => {
                        const newVal = u.send_confirmation_email === false ? true : false;
                        setUsers(prev => prev.map(x => x.id === u.id ? { ...x, send_confirmation_email: newVal } : x));
                        supabase.rpc('admin_update_user_confirmation', { p_user_id: u.id, p_send_confirmation: newVal }).then(r => console.log('confirmation rpc:', r));
                      }}
                      style={{ width: 36, height: 20, borderRadius: 10, background: u.send_confirmation_email === false ? '#dde1ef' : '#1B2F5E', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
                    >
                      <div style={{ position: 'absolute', top: 2, left: u.send_confirmation_email === false ? 2 : 18, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                    </div>
                  </div>
                  <div style={{display:'flex', gap:4, flexWrap:'wrap'}}>
                    <button
                      onClick={() => updateUserSeller(u.id, null)}
                      style={{border:'1.5px solid #dde1ef', borderRadius:6, padding:'4px 10px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Barlow, sans-serif', background: !u.seller_id ? '#1B2F5E' : 'white', color: !u.seller_id ? 'white' : '#9aa3bc'}}
                    >
                      Sin vendedor
                    </button>
                    {sellers.filter(sel => sel.active).map(sel => (
                      <button
                        key={sel.id}
                        onClick={() => updateUserSeller(u.id, sel.id)}
                        style={{border:'1.5px solid #dde1ef', borderRadius:6, padding:'4px 10px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Barlow, sans-serif', background: u.seller_id === sel.id ? '#1B2F5E' : 'white', color: u.seller_id === sel.id ? 'white' : '#5a6380'}}
                      >
                        {sel.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );})}
          </div>
        )}

        {/* ══ VENDEDORES ══ */}
        {activeTab === 'sellers' && (
          <>
            <div style={s.card}>
              <h2 style={s.sectionTitle}>Nuevo vendedor</h2>
              <div style={{display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end'}}>
                <div style={{...s.formGroup, flex:'1 1 160px', marginBottom:0}}>
                  <label style={s.label}>Nombre *</label>
                  <input style={s.input} value={newSeller.name} onChange={e => setNewSeller(v => ({...v, name: e.target.value}))} placeholder="Nombre completo" />
                </div>
                <div style={{...s.formGroup, flex:'1 1 160px', marginBottom:0}}>
                  <label style={s.label}>Teléfono INKORA</label>
                  <input style={s.input} value={newSeller.phone} onChange={e => setNewSeller(v => ({...v, phone: e.target.value}))} placeholder="+54 9 ..." />
                </div>
                <button style={{...s.btnPrimary, opacity: newSeller.name.trim() && !savingSeller ? 1 : 0.5, whiteSpace:'nowrap'}} disabled={!newSeller.name.trim() || savingSeller} onClick={addSeller}>
                  {savingSeller ? 'Guardando...' : '+ Agregar'}
                </button>
              </div>
            </div>
            <div style={s.card}>
              <h2 style={s.sectionTitle}>Vendedores ({sellers.length})</h2>
              {sellers.length === 0 && <p style={s.emptyMsg}>No hay vendedores todavía.</p>}
              {sellers.length > 0 && (
                <div style={{overflowX:'auto'}}>
                  <table style={s.tbl}>
                    <thead>
                      <tr>
                        <th style={s.th}>Nombre</th>
                        <th style={s.th}>Teléfono INKORA</th>
                        <th style={s.th}>Visible</th>
                        <th style={{...s.th, width:32}}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sellers.map(sel => (
                        <tr key={sel.id} style={{opacity: sel.active ? 1 : 0.5}}>
                          <td style={s.td}>
                            <input
                              style={s.tblInput}
                              defaultValue={sel.name}
                              onBlur={e => updateSellerField(sel.id, 'name', e.target.value)}
                            />
                          </td>
                          <td style={s.td}>
                            <input
                              style={{...s.tblInput, maxWidth:180}}
                              defaultValue={sel.phone || ''}
                              placeholder="Teléfono"
                              onBlur={e => updateSellerField(sel.id, 'phone', e.target.value)}
                            />
                          </td>
                          <td style={{...s.td, textAlign:'center'}}>
                            <button style={s.iconBtn} onClick={() => toggleSeller(sel.id, sel.active)}>
                              {sel.active ? <EyeOpen /> : <EyeOff />}
                            </button>
                          </td>
                          <td style={{...s.td, textAlign:'center'}}>
                            <TrashBtn onClick={() => deleteSeller(sel.id)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══ ADMINS ══ */}
        {activeTab === 'admins' && (
          <>
            <div style={s.card}>
              <h2 style={s.sectionTitle}>Agregar administrador</h2>
              <div style={{display:'flex', gap:10, alignItems:'flex-end'}}>
                <div style={{...s.formGroup, flex:1, marginBottom:0}}>
                  <label style={s.label}>Email</label>
                  <input style={s.input} type="email" value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addAdmin(); }} placeholder="usuario@email.com" />
                </div>
                <button style={{...s.btnPrimary, opacity: newAdminEmail.trim() && !addingAdmin ? 1 : 0.5, whiteSpace:'nowrap'}} disabled={!newAdminEmail.trim() || addingAdmin} onClick={addAdmin}>
                  {addingAdmin ? 'Guardando...' : '+ Agregar'}
                </button>
              </div>
            </div>
            <div style={s.card}>
              <h2 style={s.sectionTitle}>Administradores ({admins.length})</h2>
              {admins.length === 0 && <p style={s.emptyMsg}>No hay administradores.</p>}
              {admins.map(a => (
                <div key={a.email} style={s.productRow}>
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    <span style={s.productName}>{a.email}</span>
                    {a.email === currentUser && <span style={{background:'#e8eef9', color:'#2D6BE4', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700}}>vos</span>}
                  </div>
                  <TrashBtn onClick={() => setDeleteConfirmEmail(a.email)} />
                </div>
              ))}
            </div>
          </>
        )}

      {/* ══ CONFIGURACIÓN ══ */}
        {activeTab === 'config' && (
          <>
            <div style={s.card}>
              <h2 style={s.sectionTitle}>Inicio de sesión</h2>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0'}}>
                <div>
                  <div style={{fontSize:13, fontWeight:600, color:'#2d3352'}}>Método de login</div>
                  <div style={{fontSize:11, color:'#9aa3bc', marginTop:1}}>Cómo ingresan los usuarios al catálogo</div>
                </div>
                <div style={{display:'flex', gap:6}}>
                  <button
                    onClick={() => saveSetting('login_method', 'modal')}
                    style={{padding:'6px 14px', borderRadius:8, border:'1.5px solid #dde1ef', fontSize:12, fontWeight:600, cursor:'pointer', background: settings.login_method !== 'google' ? '#1B2F5E' : 'white', color: settings.login_method !== 'google' ? 'white' : '#5a6380'}}
                  >
                    📋 Modal completo
                  </button>
                  <button
                    onClick={() => saveSetting('login_method', 'google')}
                    style={{display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:8, border:'1.5px solid #dde1ef', fontSize:12, fontWeight:600, cursor:'pointer', background: settings.login_method === 'google' ? '#1B2F5E' : 'white', color: settings.login_method === 'google' ? 'white' : '#5a6380'}}
                  >
                    <GoogleIcon /> Solo Google
                  </button>
                </div>
              </div>
            </div>

            <div style={s.card}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <div style={{fontSize:13, fontWeight:700, color:'#1B2F5E'}}>Pre-seleccionar cuenta Google</div>
                  <div style={{fontSize:11, color:'#9aa3bc', marginTop:1}}>Recuerda el último email usado y lo sugiere automáticamente</div>
                </div>
                <div onClick={() => saveSetting('google_login_hint', settings['google_login_hint'] === 'true' ? 'false' : 'true')}
                  style={{ width: 36, height: 20, borderRadius: 10, background: settings['google_login_hint'] === 'true' ? '#1B2F5E' : '#dde1ef', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 2, left: settings['google_login_hint'] === 'true' ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </div>
              </div>
            </div>

            <div style={s.card}>
              <h2 style={s.sectionTitle}>Orden de pestañas</h2>
              <p style={{fontSize:12, color:'#9aa3bc', marginBottom:12}}>Arrastrá para reordenar las pestañas del panel.</p>
              <div style={{display:'flex', flexDirection:'column', gap:6}}>
                {(() => {
                  const ALL_TABS = { products:'Productos', designs:'Diseños', orders:'Pedidos', localities:'Escalas de precios', users:'Usuarios', sellers:'Vendedores', admins:'Admins', config:'Configuración', heatmap:'Actividad', stats:'Estadísticas', production:'Producción' };
                  return tabOrder.map((id, idx) => (
                    <div
                      key={id}
                      draggable
                      onDragStart={e => { e.stopPropagation(); setDraggingConfigTab(id); }}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (draggingConfigTab && draggingConfigTab !== id) { setTabOrder(prev => { const next = [...prev]; const from = next.indexOf(draggingConfigTab); const to = next.indexOf(id); next.splice(from, 1); next.splice(to, 0, draggingConfigTab); return next; }); }}}
                      onDragEnd={() => { setDraggingConfigTab(null); localStorage.setItem('admin_tab_order', JSON.stringify(tabOrder)); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', borderRadius: 8,
                        border: '1.5px solid #dde1ef',
                        background: draggingConfigTab === id ? '#eef4ff' : 'white',
                        cursor: draggingConfigTab ? 'grabbing' : 'grab',
                        opacity: draggingConfigTab === id ? 0.4 : 1,
                        transition: 'background 0.12s, opacity 0.12s',
                        userSelect: 'none',
                      }}
                    >
                      <span style={{color:'#b0b8d0', fontSize:16, lineHeight:1}}>⠿</span>
                      <span style={{fontSize:13, fontWeight:600, color:'#2d3352'}}>{ALL_TABS[id]}</span>
                      <span style={{marginLeft:'auto', fontSize:11, color:'#b0b8d0'}}>#{idx + 1}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>

            <div style={s.card}>
              <h2 style={s.sectionTitle}>Dashboard <span style={{fontSize:11, color:'#9aa3bc', fontWeight:400}}>inkora.com.ar/dashboard</span></h2>
              <div style={{display:'flex', flexDirection:'column', gap:0}}>
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0'}}>
                  <div>
                    <div style={{fontSize:13, fontWeight:600, color:'#2d3352'}}>Estado de pedidos</div>
                    <div style={{fontSize:11, color:'#9aa3bc', marginTop:1}}>Muestra la columna Estado en el historial de pedidos del usuario</div>
                  </div>
                  <div onClick={() => saveSetting('show_order_status', settings['show_order_status'] === 'false' ? 'true' : 'false')} style={{ width: 36, height: 20, borderRadius: 10, background: settings['show_order_status'] !== 'false' ? '#1B2F5E' : '#dde1ef', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 2, left: settings['show_order_status'] !== 'false' ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                </div>
                
              </div>
            </div>

            {[
              { page: 'landing', label: 'Landing', subtitle: 'inkora.com.ar' },
              { page: 'catalogo', label: 'Catálogo', subtitle: 'inkora.com.ar/catalogo' },
            ].map(({ page, label, subtitle }) => (
              <div key={page} style={s.card}>
                <h2 style={s.sectionTitle}>{label} <span style={{fontSize:11, color:'#9aa3bc', fontWeight:400}}>{subtitle}</span></h2>
                <div style={{display:'flex', flexDirection:'column', gap:0}}>
                  {[
                    { key: `${page}_mode`, label: 'Tema', desc: 'Modo oscuro o claro', type: 'theme', disabled: page === 'catalogo' },
                    { key: `${page}_show_theme`, label: 'Botón tema', desc: 'Switch oscuro/claro visible para usuarios' },
                    { key: `${page}_show_cart`, label: 'Botón carrito', desc: 'Ícono de carrito en el header', disabled: page === 'catalogo' },
                    { key: `${page}_show_account`, label: 'Botón cuenta', desc: 'Botón de login/perfil en el header' },
                    { key: `${page}_show_whatsapp`, label: 'Botón WhatsApp', desc: 'FAB de WhatsApp flotante' },
                    { key: `${page}_show_history`, label: 'Botón historial', desc: 'Ícono de historial de pedidos en el header' },
                    
                    { key: `${page}_tab_text`, label: 'Texto pestaña', desc: 'Texto animado en la pestaña del navegador', type: 'text' },
                    { key: `${page}_tab_interval`, label: 'Velocidad parpadeo (ms)', desc: 'Intervalo en milisegundos (ej: 1000 = 1 seg)', type: 'number' },
                    { key: `${page}_tab_on_away`, label: 'Animar al salir', desc: 'Anima cuando el usuario cambia a otra pestaña' },
{ key: `${page}_tab_on_active`, label: 'Animar al estar', desc: 'Anima mientras el usuario está viendo la página' },
                  ].map(({ key, label: rowLabel, desc, type, disabled }, i, arr) => (
                    <div key={key} style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom: i < arr.length - 1 ? '1px solid #eef0f6' : 'none', opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? 'none' : 'auto'}}>
                      <div>
                        <div style={{fontSize:13, fontWeight:600, color:'#2d3352'}}>{rowLabel}</div>
                        <div style={{fontSize:11, color:'#9aa3bc', marginTop:1}}>{desc}{disabled ? ' — próximamente' : ''}</div>
                      </div>
                      {type === 'text' ? (
                        <input
                          style={{border:'1.5px solid #dde1ef', borderRadius:7, padding:'5px 10px', fontSize:12, fontFamily:'Barlow, sans-serif', color:'#2d3352', width:180}}
                          value={settings[key] ?? ''}
                          onChange={e => setSettings(prev => ({...prev, [key]: e.target.value}))}
                          onBlur={e => saveSetting(key, e.target.value)}
                        />
                      ) : type === 'number' ? (
                        <input
                          type="number"
                          style={{border:'1.5px solid #dde1ef', borderRadius:7, padding:'5px 10px', fontSize:12, fontFamily:'Barlow, sans-serif', color:'#2d3352', width:90}}
                          value={settings[key] ?? ''}
                          onChange={e => setSettings(prev => ({...prev, [key]: e.target.value}))}
                          onBlur={e => saveSetting(key, e.target.value)}
                        />
                      ) : type === 'theme' ? (
                        <div style={{display:'flex', gap:6}}>
                          <button onClick={() => saveSetting(key, 'light')} style={{padding:'5px 12px', borderRadius:7, border:'1.5px solid #dde1ef', fontSize:12, fontWeight:600, cursor:'pointer', background: settings[key] === 'light' ? '#1B2F5E' : 'white', color: settings[key] === 'light' ? 'white' : '#5a6380'}}>☀️ Claro</button>
                          <button onClick={() => saveSetting(key, 'dark')} style={{padding:'5px 12px', borderRadius:7, border:'1.5px solid #dde1ef', fontSize:12, fontWeight:600, cursor:'pointer', background: settings[key] !== 'light' ? '#1B2F5E' : 'white', color: settings[key] !== 'light' ? 'white' : '#5a6380'}}>🌙 Oscuro</button>
                        </div>
                      ) : (
                        <div
                          onClick={() => saveSetting(key, settings[key] === 'false' ? 'true' : 'false')}
                          style={{ width: 36, height: 20, borderRadius: 10, background: settings[key] !== 'false' ? '#1B2F5E' : '#dde1ef', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
                        >
                          <div style={{ position: 'absolute', top: 2, left: settings[key] !== 'false' ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

      </div>

      <footer style={s.footer}>INKORA® Admin</footer>

      {/* MODAL DETALLE PEDIDO */}
      {orderDetail && (
        <div style={{position:'fixed', inset:0, background:'rgba(17,32,64,0.55)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20}} onClick={() => setOrderDetail(null)}>
          <div style={{background:'white', borderRadius:16, border:'1.5px solid #dde1ef', boxShadow:'0 8px 40px rgba(27,47,94,0.18)', padding:'28px 28px 24px', width:'100%', maxWidth:520, maxHeight:'80vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:14}} onClick={e => e.stopPropagation()}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div style={{fontSize:16, fontWeight:700, color:'#1B2F5E'}}>Pedido {orderDetail.order_code}</div>
              <button style={{background:'none', border:'none', fontSize:18, color:'#9aa3bc', cursor:'pointer', lineHeight:1}} onClick={() => setOrderDetail(null)}>✕</button>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 16px', fontSize:13}}>
              <div><span style={{color:'#9aa3bc', fontSize:11, fontWeight:600, textTransform:'uppercase'}}>Cliente</span><div style={{fontWeight:600, color:'#2d3352'}}>{orderDetail.customer_name || '—'}</div></div>
              <div><span style={{color:'#9aa3bc', fontSize:11, fontWeight:600, textTransform:'uppercase'}}>Teléfono</span><div style={{fontWeight:600, color:'#2d3352'}}>{orderDetail.customer_phone || '—'}</div></div>
              <div><span style={{color:'#9aa3bc', fontSize:11, fontWeight:600, textTransform:'uppercase'}}>Email</span><div style={{fontWeight:600, color:'#2d3352'}}>{orderDetail.customer_email || '—'}</div></div>
              <div><span style={{color:'#9aa3bc', fontSize:11, fontWeight:600, textTransform:'uppercase'}}>Fecha</span><div style={{fontWeight:600, color:'#2d3352'}}>{orderDetail.created_at ? new Date(orderDetail.created_at).toLocaleString('es-AR') : '—'}</div></div>
              {orderDetail.notes && <div style={{gridColumn:'1/-1'}}><span style={{color:'#9aa3bc', fontSize:11, fontWeight:600, textTransform:'uppercase'}}>Notas</span><div style={{fontWeight:500, color:'#5a6380'}}>{orderDetail.notes}</div></div>}
            </div>
            <div>
              <div style={{fontSize:12, fontWeight:700, color:'#5a6380', textTransform:'uppercase', letterSpacing:0.5, marginBottom:8}}>Items</div>
              <table style={{width:'100%', borderCollapse:'collapse'}}>
                <thead>
                  <tr>
                    <th style={{...s.th, padding:'4px 8px'}}>Diseño</th>
                    <th style={{...s.th, padding:'4px 8px', textAlign:'right'}}>Cant.</th>
                    <th style={{...s.th, padding:'4px 8px', textAlign:'right'}}>P/u</th>
                    <th style={{...s.th, padding:'4px 8px', textAlign:'right'}}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(orderDetail.items) ? orderDetail.items : []).map((item, i) => (
                    <tr key={i}>
                      <td style={{...s.td, padding:'5px 8px', fontSize:13}}>{item.name}</td>
                      <td style={{...s.td, padding:'5px 8px', fontSize:13, textAlign:'right'}}>{item.qty}</td>
                      <td style={{...s.td, padding:'5px 8px', fontSize:13, textAlign:'right'}}>{item.pricePerUnit ? `$${Number(item.pricePerUnit).toLocaleString('es-AR')}` : '—'}</td>
                      <td style={{...s.td, padding:'5px 8px', fontSize:13, fontWeight:600, textAlign:'right'}}>{item.pricePerUnit ? `$${(item.qty * item.pricePerUnit).toLocaleString('es-AR')}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{display:'flex', justifyContent:'flex-end', alignItems:'center', gap:16, borderTop:'1.5px solid #eef0f6', paddingTop:12}}>
              <span style={{fontSize:13, color:'#5a6380'}}>Total</span>
              <span style={{fontSize:18, fontWeight:800, color:'#1B2F5E'}}>{orderDetail.total ? `$${Number(orderDetail.total).toLocaleString('es-AR')}` : '—'}</span>
            </div>
          </div>
        </div>
      )}

      {/* ══ HEATMAP ══ */}
        {activeTab === 'heatmap' && (
          <HeatmapTab supabase={supabase} products={products} />
        )}

      {/* ══ ESTADÍSTICAS ══ */}
        {activeTab === 'stats' && (
          <StatsTab supabase={supabase} sellers={sellers} />
        )}

      {/* ══ PRODUCCIÓN ══ */}
        {activeTab === 'production' && (
          <ProductionTab
            supabase={supabase}
            sellers={sellers}
            products={products}
            orders={orders}
          />
        )}

      {/* MODAL CONFIRMAR */}
      {confirmModal.open && (
        <div style={{position:'fixed', inset:0, background:'rgba(17,32,64,0.55)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20}}>
          <div style={{background:'white', borderRadius:16, border:'1.5px solid #dde1ef', boxShadow:'0 8px 40px rgba(27,47,94,0.18)', padding:'28px 28px 24px', width:'100%', maxWidth:380, display:'flex', flexDirection:'column', gap:16}}>
            <div style={{fontSize:16, fontWeight:700, color:'#1B2F5E'}}>¿Confirmar eliminación?</div>
            <div style={{fontSize:13, color:'#5a6380', lineHeight:1.5}}>{confirmModal.message}</div>
            <div style={{display:'flex', gap:10, justifyContent:'flex-end', marginTop:4}}>
              <button style={{background:'white', border:'1.5px solid #dde1ef', color:'#5a6380', borderRadius:10, padding:'8px 20px', fontSize:13, fontWeight:600, cursor:'pointer'}} onClick={closeConfirm}>Cancelar</button>
              {confirmModal.requireHold ? (
                <HoldButton onConfirm={() => { confirmModal.onConfirm(); closeConfirm(); }} />
              ) : (
                <button style={{background:'linear-gradient(135deg, #e53e3e, #c53030)', color:'white', border:'none', borderRadius:10, padding:'8px 20px', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(229,62,62,0.4)'}} onClick={() => { confirmModal.onConfirm(); closeConfirm(); }}>Eliminar</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL ELIMINAR ADMIN */}
      {deleteConfirmEmail && (
        <div style={{position:'fixed', inset:0, background:'rgba(17,32,64,0.55)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20}}>
          <div style={{background:'white', borderRadius:16, border:'1.5px solid #dde1ef', boxShadow:'0 8px 40px rgba(27,47,94,0.18)', padding:'28px 28px 24px', width:'100%', maxWidth:380, display:'flex', flexDirection:'column', gap:16}}>
            <div style={{fontSize:16, fontWeight:700, color:'#1B2F5E'}}>¿Eliminar administrador?</div>
            <div style={{fontSize:13, color:'#5a6380', lineHeight:1.5}}><strong>{deleteConfirmEmail}</strong> ya no podrá ingresar al panel.</div>
            <div style={{display:'flex', gap:10, justifyContent:'flex-end', marginTop:4}}>
              <button style={{background:'white', border:'1.5px solid #dde1ef', color:'#5a6380', borderRadius:10, padding:'8px 20px', fontSize:13, fontWeight:600, cursor:'pointer'}} onClick={() => setDeleteConfirmEmail(null)}>Cancelar</button>
              <button style={{background:'linear-gradient(135deg, #e53e3e, #c53030)', color:'white', border:'none', borderRadius:10, padding:'8px 20px', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(229,62,62,0.4)'}} onClick={() => deleteAdmin(deleteConfirmEmail)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatsTab({ supabase, sellers }) {
  const [orders, setOrders] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [sellerFilter, setSellerFilter] = React.useState('all');
  const [datePreset, setDatePreset] = React.useState('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');

  React.useEffect(() => {
    supabase.from('orders').select('*').order('created_at', { ascending: true })
      .then(({ data }) => { setOrders(data || []); setLoading(false); });
  }, [supabase]);

  function getDateRange() {
    const now = new Date();
    if (datePreset === '7d') { const d = new Date(); d.setDate(d.getDate() - 7); return [d, now]; }
    if (datePreset === '30d') { const d = new Date(); d.setDate(d.getDate() - 30); return [d, now]; }
    if (datePreset === '90d') { const d = new Date(); d.setDate(d.getDate() - 90); return [d, now]; }
    if (datePreset === 'year') { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return [d, now]; }
    if (datePreset === 'custom' && dateFrom) {
      return [new Date(dateFrom), dateTo ? new Date(dateTo + 'T23:59:59') : now];
    }
    return [null, null];
  }

  const [from, to] = getDateRange();

  const filtered = orders.filter(o => {
    if (sellerFilter !== 'all' && (o.seller_id || null) !== (sellerFilter === 'none' ? null : sellerFilter)) return false;
    if (from && new Date(o.created_at) < from) return false;
    if (to && new Date(o.created_at) > to) return false;
    return true;
  });

  const totalOrders = filtered.length;
  const totalRevenue = filtered.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const allItems = filtered.flatMap(o => Array.isArray(o.items) ? o.items : []);
  const totalUnits = allItems.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const avgUnitsPerOrder = totalOrders > 0 ? totalUnits / totalOrders : 0;

  const byStatus = { pending: 0, confirmed: 0, in_production: 0, ready: 0, cancelled: 0 };
  filtered.forEach(o => { if (byStatus[o.status] !== undefined) byStatus[o.status]++; });
  const STATUS_LABELS = { pending: 'Pendiente', confirmed: 'Confirmado', in_production: 'En producción', ready: 'Listo', cancelled: 'Cancelado' };
  const STATUS_COLORS = { pending: '#f59e0b', confirmed: '#3b82f6', in_production: '#8b5cf6', ready: '#22c55e', cancelled: '#ef4444' };

  const designMap = {};
  allItems.forEach(i => {
    if (!i.name) return;
    if (!designMap[i.name]) designMap[i.name] = { name: i.name, qty: 0, revenue: 0 };
    designMap[i.name].qty += Number(i.qty) || 0;
    designMap[i.name].revenue += (Number(i.qty) || 0) * (Number(i.pricePerUnit) || 0);
  });
  const topDesigns = Object.values(designMap).sort((a, b) => b.qty - a.qty).slice(0, 10);

  const productMap = {};
  allItems.forEach(i => {
    const name = i.productName || 'Sin producto';
    if (!productMap[name]) productMap[name] = { name, qty: 0 };
    productMap[name].qty += Number(i.qty) || 0;
  });
  const topProducts = Object.values(productMap).sort((a, b) => b.qty - a.qty);

  const dayMap = {};
  filtered.forEach(o => {
    const day = new Date(o.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    if (!dayMap[day]) dayMap[day] = { day, orders: 0, revenue: 0 };
    dayMap[day].orders++;
    dayMap[day].revenue += Number(o.total) || 0;
  });
  const dayData = Object.values(dayMap).slice(-30);
  const maxOrders = Math.max(...dayData.map(d => d.orders), 1);

  const uniqueEmails = new Set(filtered.map(o => o.customer_email).filter(Boolean));
  const recurringEmails = [...uniqueEmails].filter(e => filtered.filter(o => o.customer_email === e).length > 1);

  const card = { background: 'white', borderRadius: 10, padding: 20, border: '1.5px solid #dde1ef' };
  const metricCard = { ...card, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140, flex: '1 1 140px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...card, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Vendedor</div>
          <select value={sellerFilter} onChange={e => setSellerFilter(e.target.value)}
            style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '6px 10px', fontSize: 13, fontFamily: 'Barlow, sans-serif', color: '#2d3352' }}>
            <option value="all">Todos</option>
            <option value="none">Sin vendedor</option>
            {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Período</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['all','Todo'], ['7d','7 días'], ['30d','30 días'], ['90d','90 días'], ['year','1 año'], ['custom','Personalizado']].map(([val, label]) => (
              <button key={val} onClick={() => setDatePreset(val)}
                style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: datePreset === val ? '#1B2F5E' : 'white', color: datePreset === val ? 'white' : '#5a6380' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {datePreset === 'custom' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Desde</div>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '6px 10px', fontSize: 13, fontFamily: 'Barlow, sans-serif' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Hasta</div>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '6px 10px', fontSize: 13, fontFamily: 'Barlow, sans-serif' }} />
            </div>
          </div>
        )}
      </div>

      {loading ? <div style={{ color: '#9aa3bc', fontSize: 14 }}>Cargando...</div> : <>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Pedidos', value: totalOrders },
          { label: 'Facturación total', value: '$' + totalRevenue.toLocaleString('es-AR') },
          { label: 'Ticket promedio', value: '$' + Math.round(avgTicket).toLocaleString('es-AR') },
          { label: 'Unidades totales', value: totalUnits.toLocaleString('es-AR') },
          { label: 'Prom. unidades/pedido', value: avgUnitsPerOrder.toFixed(1) },
          { label: 'Clientes únicos', value: uniqueEmails.size },
          { label: 'Clientes recurrentes', value: recurringEmails.length },
        ].map(({ label, value }) => (
          <div key={label} style={metricCard}>
            <div style={{ fontSize: 11, color: '#9aa3bc', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#1B2F5E' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1B2F5E', marginBottom: 14 }}>Pedidos por estado</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {Object.entries(byStatus).map(([status, count]) => (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f7f8fc', borderRadius: 8, padding: '8px 14px', border: '1.5px solid #eef0f6' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[status] }} />
              <span style={{ fontSize: 12, color: '#5a6380', fontWeight: 600 }}>{STATUS_LABELS[status]}</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#1B2F5E' }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {dayData.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1B2F5E', marginBottom: 14 }}>Pedidos por día</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, overflowX: 'auto' }}>
            {dayData.map(d => (
              <div key={d.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 32 }}>
                <div style={{ fontSize: 9, color: '#9aa3bc', fontWeight: 600 }}>{d.orders}</div>
                <div style={{ width: 24, background: '#2D6BE4', borderRadius: '3px 3px 0 0', height: Math.max(4, (d.orders / maxOrders) * 90) }} />
                <div style={{ fontSize: 9, color: '#c4c9d9', whiteSpace: 'nowrap' }}>{d.day}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ ...card, flex: '1 1 300px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1B2F5E', marginBottom: 14 }}>Top 10 diseños más pedidos</div>
          {topDesigns.length === 0 ? <div style={{ color: '#9aa3bc', fontSize: 13 }}>Sin datos</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topDesigns.map((d, i) => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#c4c9d9', minWidth: 18, textAlign: 'right' }}>#{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#2d3352', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                    <div style={{ height: 4, background: '#f0f2f8', borderRadius: 2, marginTop: 3 }}>
                      <div style={{ height: 4, background: '#2D6BE4', borderRadius: 2, width: `${(d.qty / topDesigns[0].qty) * 100}%` }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1B2F5E', minWidth: 30, textAlign: 'right' }}>{d.qty}u</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ ...card, flex: '1 1 220px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1B2F5E', marginBottom: 14 }}>Productos</div>
          {topProducts.length === 0 ? <div style={{ color: '#9aa3bc', fontSize: 13 }}>Sin datos</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topProducts.map((p, i) => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#c4c9d9', minWidth: 18, textAlign: 'right' }}>#{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#2d3352' }}>{p.name}</div>
                    <div style={{ height: 4, background: '#f0f2f8', borderRadius: 2, marginTop: 3 }}>
                      <div style={{ height: 4, background: '#8b5cf6', borderRadius: 2, width: `${(p.qty / topProducts[0].qty) * 100}%` }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1B2F5E', minWidth: 30, textAlign: 'right' }}>{p.qty}u</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      </>}
    </div>
  );
}

function usePresence(supabase) {
  const [presence, setPresence] = React.useState([]);
  const [tick, setTick] = React.useState(0);
  const ACTIVE_THRESHOLD = 4000;

  React.useEffect(() => {
    supabase.from('user_presence').select('*').order('updated_at', { ascending: false })
      .then(({ data }) => setPresence((data || []).map(u => ({ ...u, _lastSeen: Date.now() }))));

    const ch = supabase.channel('shared-presence-watch-' + Math.random())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setPresence(prev => prev.filter(u => u.user_id !== payload.old.user_id));
        } else {
          const newEntry = { ...payload.new, _lastSeen: Date.now() };
          setPresence(prev => {
            const exists = prev.find(u => u.user_id === newEntry.user_id);
            if (exists) return prev.map(u => u.user_id === newEntry.user_id ? newEntry : u);
            return [newEntry, ...prev];
          });
        }
      })
      .subscribe();

    const ticker = setInterval(() => setTick(t => t + 1), 500);
    return () => { ch.unsubscribe(); clearInterval(ticker); };
  }, [supabase]);

  const getStatus = (userId) => {
    const u = presence.find(p => p.user_id === userId);
    if (!u) return null;
    const isActive = u._lastSeen && (Date.now() - u._lastSeen < ACTIVE_THRESHOLD);
    const pageLabel = u.page === 'landing' ? '🏠' : '🛍️';
    return { isActive, pageLabel, updated_at: u.updated_at };
  };

  return { presence, getStatus, ACTIVE_THRESHOLD, tick };
}

const ACTIVITY_EVENT_CONFIG = {
  page_view: { icon: '🏠', label: 'Vista de página', color: '#6b7280' },
  product_view: { icon: '📦', label: 'Vio producto', color: '#2D6BE4' },
  design_view: { icon: '👁️', label: 'Vio diseño', color: '#2D6BE4' },
  design_search: { icon: '🔍', label: 'Búsqueda', color: '#7c3aed' },
  cart_add: { icon: '🛒', label: 'Agregó al carrito', color: '#15803d' },
  cart_remove: { icon: '🗑️', label: 'Quitó del carrito', color: '#dc2626' },
  cart_view: { icon: '👜', label: 'Abrió carrito', color: '#6b7280' },
  cart_qty_change: { icon: '➕', label: 'Cambió cantidad', color: '#d97706' },
  checkout_start: { icon: '📋', label: 'Inició checkout', color: '#d97706' },
  checkout_abandon: { icon: '❌', label: 'Abandonó checkout', color: '#dc2626' },
  order_confirm: { icon: '✅', label: 'Confirmó pedido', color: '#15803d' },
  model_view: { icon: '🔷', label: 'Abrió visor 3D', color: '#0891b2' },
  auth_login: { icon: '🔑', label: 'Login', color: '#7c3aed' },
  auth_register: { icon: '🆕', label: 'Registro', color: '#7c3aed' },
  auth_logout: { icon: '🚪', label: 'Logout', color: '#6b7280' },
  whatsapp_click: { icon: '💬', label: 'WhatsApp', color: '#25D366' },
  session_start: { icon: '🟢', label: 'Nueva sesión', color: '#15803d' },
  click_global: { icon: '🖱️', label: 'Click', color: '#9aa3bc' },
};

function ActivityHistory({ supabase }) {
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [identityFilter, setIdentityFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [visibleSessions, setVisibleSessions] = React.useState(50);
  const [expanded, setExpanded] = React.useState(new Set());

  const loadActivity = React.useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('user_activity_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);
    setEvents(data || []);
    setLoading(false);
  }, [supabase]);

  React.useEffect(() => { loadActivity(); }, [loadActivity]);

  const eventTypes = React.useMemo(() => [...new Set(events.map(e => e.event_type).filter(Boolean))].sort(), [events]);

  const filteredEvents = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter(e => {
      if (identityFilter === 'known' && e.is_anonymous) return false;
      if (identityFilter === 'anonymous' && !e.is_anonymous) return false;
      if (typeFilter !== 'all' && e.event_type !== typeFilter) return false;
      if (dateFrom && new Date(e.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(e.created_at) > new Date(dateTo + 'T23:59:59')) return false;
      if (q) {
        const haystack = `${e.user_email || ''} ${e.user_name || ''} ${e.session_id || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [events, identityFilter, search, typeFilter, dateFrom, dateTo]);

  const sessions = React.useMemo(() => {
    const map = {};
    filteredEvents.forEach(event => {
      const key = event.session_id;
      if (!key) return;
      if (!map[key]) {
        map[key] = {
          session_id: key,
          user_id: event.user_id,
          user_email: event.user_email,
          user_name: event.user_name,
          is_anonymous: event.is_anonymous,
          events: [],
          first_seen: event.created_at,
          last_seen: event.created_at,
        };
      }
      map[key].events.push(event);
      if (new Date(event.created_at) < new Date(map[key].first_seen)) map[key].first_seen = event.created_at;
      if (new Date(event.created_at) > new Date(map[key].last_seen)) map[key].last_seen = event.created_at;
      if (!map[key].user_email && event.user_email) map[key].user_email = event.user_email;
      if (!map[key].user_name && event.user_name) map[key].user_name = event.user_name;
      map[key].is_anonymous = map[key].is_anonymous && event.is_anonymous;
    });
    return Object.values(map)
      .map(s => ({ ...s, events: s.events.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)) }))
      .sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));
  }, [filteredEvents]);

  const metrics = React.useMemo(() => {
    const starts = filteredEvents.filter(e => e.event_type === 'checkout_start').length;
    const abandons = filteredEvents.filter(e => e.event_type === 'checkout_abandon').length;
    const top = (type, key) => {
      const counts = {};
      filteredEvents.filter(e => e.event_type === type).forEach(e => {
        const value = e.metadata?.[key];
        if (value) counts[value] = (counts[value] || 0) + 1;
      });
      return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    };
    return {
      total: filteredEvents.length,
      sessions: sessions.length,
      abandonRate: `${Math.round((abandons / Math.max(starts, 1)) * 100)}%`,
      topProduct: top('product_view', 'product_name'),
      topCartDesign: top('cart_add', 'design_name'),
      stored: events.length,
    };
  }, [events.length, filteredEvents, sessions.length]);

  function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    return days > 0 ? `hace ${days}d` : hrs > 0 ? `hace ${hrs}h` : mins > 0 ? `hace ${mins}min` : 'hace un momento';
  }

  function describeEvent(event) {
    const m = event.metadata || {};
    if (event.event_type === 'cart_add') return `${m.design_name || 'Diseño'} x${m.qty || 1}${m.price ? ` - $${Number(m.price).toLocaleString('es-AR')}` : ''}`;
    if (event.event_type === 'cart_qty_change') return `delta: ${m.delta > 0 ? '+' : ''}${m.delta || 0} -> ${m.new_qty ?? '—'} total`;
    if (event.event_type === 'design_search') return `query: "${m.query || ''}" - ${m.results_count ?? 0} resultados`;
    if (event.event_type === 'click_global') return `«${m.element_text || 'sin texto'}» - ${m.element_tag || 'elemento'}`;
    if (event.event_type === 'checkout_abandon') return `${m.time_spent_seconds || 0} segundos en el formulario`;
    if (event.event_type === 'order_confirm') return `${m.order_code || 'Pedido'} - ${m.items_count || 0} items${m.total ? ` - $${Number(m.total).toLocaleString('es-AR')}` : ''}`;
    return m.design_name || m.product_name || m.page_title || m.method || m.page || '';
  }

  function toggleSession(id) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const shownSessions = sessions.slice(0, visibleSessions);

  return (
    <div style={{ background: 'white', borderRadius: 10, padding: 24, border: '1.5px solid #dde1ef' }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1B2F5E', marginBottom: 16 }}>Historial de actividad</h2>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        {[['all', 'Todos'], ['known', 'Solo logueados'], ['anonymous', 'Solo anónimos']].map(([id, label]) => (
          <button key={id} onClick={() => setIdentityFilter(id)} style={{ border: '1.5px solid #dde1ef', borderRadius: 7, padding: '6px 12px', background: identityFilter === id ? '#1B2F5E' : 'white', color: identityFilter === id ? 'white' : '#5a6380', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar email, nombre o sesión..." style={{ border: '1.5px solid #dde1ef', borderRadius: 7, padding: '6px 10px', fontSize: 12, minWidth: 220 }} />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ border: '1.5px solid #dde1ef', borderRadius: 7, padding: '6px 10px', fontSize: 12 }}>
          <option value="all">Todos los eventos</option>
          {eventTypes.map(t => <option key={t} value={t}>{ACTIVITY_EVENT_CONFIG[t]?.label || t}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ border: '1.5px solid #dde1ef', borderRadius: 7, padding: '6px 10px', fontSize: 12 }} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ border: '1.5px solid #dde1ef', borderRadius: 7, padding: '6px 10px', fontSize: 12 }} />
        <button onClick={loadActivity} style={{ border: '1.5px solid #dde1ef', borderRadius: 7, padding: '6px 12px', background: 'white', color: '#5a6380', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>↻ Actualizar</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 10, marginBottom: 18 }}>
        {[
          ['Eventos', metrics.total],
          ['Sesiones', metrics.sessions],
          ['Abandono checkout', metrics.abandonRate],
          ['Producto top', metrics.topProduct],
          ['Diseño carrito top', metrics.topCartDesign],
          ['Eventos cargados', metrics.stored],
        ].map(([label, value]) => (
          <div key={label} style={{ background: '#f7f8fc', border: '1px solid #eef0f6', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 10, color: '#9aa3bc', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            <div style={{ fontSize: 17, color: '#1B2F5E', fontWeight: 800, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#9aa3bc', fontSize: 14 }}>Cargando actividad...</div>
      ) : shownSessions.length === 0 ? (
        <div style={{ color: '#9aa3bc', fontSize: 13 }}>No hay eventos para los filtros actuales.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shownSessions.map(session => {
            const isOpen = expanded.has(session.session_id);
            const hasOrder = session.events.some(e => e.event_type === 'order_confirm');
            const hasAbandon = session.events.some(e => e.event_type === 'checkout_abandon');
            const title = session.is_anonymous ? `Anónimo · ${session.session_id.slice(0, 8)}` : `${session.user_name || 'Usuario'}${session.user_email ? ` · ${session.user_email}` : ''}`;
            return (
              <div key={session.session_id} style={{ border: '1px solid #eef0f6', borderRadius: 9, overflow: 'hidden' }}>
                <button onClick={() => toggleSession(session.session_id)} style={{ width: '100%', border: 'none', background: '#f7f8fc', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ color: '#1B2F5E', fontWeight: 800 }}>{isOpen ? '▼' : '▶'}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: '#2d3352', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                  {hasOrder && <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 800 }}>Pedido</span>}
                  {hasAbandon && <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 800 }}>Abandonó</span>}
                  <span style={{ color: '#9aa3bc', fontSize: 12 }}>{timeAgo(session.last_seen)} · {session.events.length} eventos</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '10px 14px 12px 28px', position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 16, top: 12, bottom: 12, width: 2, background: '#dbe7ff' }} />
                    {session.events.map(event => {
                      const cfg = ACTIVITY_EVENT_CONFIG[event.event_type] || { icon: '•', label: event.event_type, color: '#9aa3bc' };
                      return (
                        <div key={event.id} style={{ display: 'grid', gridTemplateColumns: '24px 150px 1fr 72px', gap: 8, alignItems: 'center', padding: '5px 0', fontSize: 12 }}>
                          <span style={{ position: 'relative', zIndex: 1, color: cfg.color }}>{cfg.icon}</span>
                          <span style={{ color: cfg.color, fontWeight: 800 }}>{cfg.label}</span>
                          <span style={{ color: '#5a6380', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{describeEvent(event)}</span>
                          <span style={{ color: '#9aa3bc', textAlign: 'right' }}>{new Date(event.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {visibleSessions < sessions.length && (
            <button onClick={() => setVisibleSessions(v => v + 50)} style={{ alignSelf: 'center', marginTop: 8, border: '1.5px solid #dde1ef', borderRadius: 8, padding: '8px 18px', background: 'white', color: '#2D6BE4', fontWeight: 800, cursor: 'pointer' }}>Cargar más</button>
          )}
        </div>
      )}
    </div>
  );
}

function HeatmapTab({ supabase, products }) {
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filterProduct, setFilterProduct] = React.useState('all');
  const [confirmReset, setConfirmReset] = React.useState(false);
  const { presence, ACTIVE_THRESHOLD, tick } = usePresence(supabase);

  React.useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: clickData } = await supabase.from('click_events').select('*').order('timestamp', { ascending: false }).limit(5000);
      setEvents(clickData || []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const productOptions = [{ id: 'all', name: 'Todos los productos' }, ...products];
  const filteredCount = filterProduct === 'all' ? events.length : events.filter(e => e.producto_activo === filterProduct).length;

  function openHeatmap() {
    const base = window.location.origin;
    if (filterProduct === 'all') {
      window.open(`${base}/catalogo?heatmap=1`, '_blank');
    } else {
      const p = products.find(pr => pr.id === filterProduct);
      if (!p) return;
      const slug = p.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      window.open(`${base}/catalogo?producto=${slug}&heatmap=1`, '_blank');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'white', borderRadius: 10, padding: 24, border: '1.5px solid #dde1ef' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1B2F5E', marginBottom: 16 }}>Mapa de calor — Catálogo</h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          <select
            value={filterProduct}
            onChange={e => setFilterProduct(e.target.value)}
            style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '7px 12px', fontSize: 13, fontFamily: 'Barlow, sans-serif', color: '#2d3352', cursor: 'pointer' }}
          >
            {productOptions.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={async () => {
              setLoading(true);
              const { data } = await supabase.from('click_events').select('*').order('timestamp', { ascending: false }).limit(5000);
              setEvents(data || []);
              setLoading(false);
            }}
            style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '7px 12px', fontSize: 12, background: 'white', cursor: 'pointer', color: '#5a6380' }}
          >
            ↻ Actualizar
          </button>
        </div>

        {loading ? (
          <div style={{ color: '#9aa3bc', fontSize: 14 }}>Cargando eventos...</div>
        ) : (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
            <div style={{ background: '#f0f4ff', borderRadius: 10, padding: '16px 24px', minWidth: 140 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#1B2F5E' }}>{filteredCount}</div>
              <div style={{ fontSize: 12, color: '#9aa3bc', marginTop: 2 }}>clicks registrados</div>
            </div>
            <div style={{ background: '#f0f4ff', borderRadius: 10, padding: '16px 24px', minWidth: 140 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#1B2F5E' }}>{new Set(events.map(e => e.producto_activo)).size}</div>
              <div style={{ fontSize: 12, color: '#9aa3bc', marginTop: 2 }}>productos con clicks</div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={openHeatmap}
            disabled={loading || events.length === 0}
            style={{ background: '#1B2F5E', color: 'white', border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: loading || events.length === 0 ? 'not-allowed' : 'pointer', opacity: loading || events.length === 0 ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            🔥 Ver mapa de calor en el catálogo
          </button>
          <button
            onClick={() => setConfirmReset(true)}
            disabled={loading || events.length === 0}
            style={{ background: 'white', color: '#dc2626', border: '1.5px solid #fecaca', borderRadius: 10, padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: loading || events.length === 0 ? 'not-allowed' : 'pointer', opacity: loading || events.length === 0 ? 0.5 : 1 }}
          >
            🗑️ Resetear clicks
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#9aa3bc', marginTop: 10 }}>
          Abre el catálogo en una nueva pestaña con el mapa de calor superpuesto. Podés scrollear e interactuar normalmente.
        </p>
      </div>

      {/* Lista de usuarios activos/inactivos */}
      <div style={{ background: 'white', borderRadius: 10, padding: 24, border: '1.5px solid #dde1ef' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1B2F5E', marginBottom: 16 }}>Usuarios en el catálogo</h2>
        {loading ? (
          <div style={{ color: '#9aa3bc', fontSize: 14 }}>Cargando...</div>
        ) : presence.length === 0 ? (
          <div style={{ color: '#9aa3bc', fontSize: 13 }}>No hay actividad registrada.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(() => {
              const now = Date.now();
              const active = presence.filter(u => now - new Date(u.updated_at).getTime() < ACTIVE_THRESHOLD);
              const inactive = presence.filter(u => now - new Date(u.updated_at).getTime() >= ACTIVE_THRESHOLD);

              const pageLabel = (page) => page === 'landing' ? '🏠 Landing' : '🛍️ Catálogo';
              const pageOrder = (page) => page === 'landing' ? 0 : 1;

              const sortedActive = [...active].sort((a, b) => pageOrder(a.page) - pageOrder(b.page));
              const sortedInactive = [...inactive].sort((a, b) => pageOrder(a.page) - pageOrder(b.page));

              const timeAgo = (updated_at) => {
                const diff = Date.now() - new Date(updated_at).getTime();
                const mins = Math.floor(diff / 60000);
                const hrs = Math.floor(mins / 60);
                const days = Math.floor(hrs / 24);
                return days > 0 ? `hace ${days}d` : hrs > 0 ? `hace ${hrs}h` : mins > 0 ? `hace ${mins}min` : 'hace un momento';
              };

              const fecha = (updated_at) => new Date(updated_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

              return (
                <>
                  {sortedActive.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>🟢 Activos ahora ({sortedActive.length})</div>
                      {sortedActive.map(u => (
                        <div key={u.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#2d3352' }}>{u.name || '—'}</div>
                            <div style={{ fontSize: 11, color: '#9aa3bc' }}>{u.email}</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                            <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>En línea</div>
                            <div style={{ fontSize: 10, color: '#9aa3bc', background: '#e8eef9', borderRadius: 4, padding: '1px 6px' }}>{pageLabel(u.page)}</div>
                            <div style={{ fontSize: 10, color: '#c4c9d9' }}>{fecha(u.updated_at)}</div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {sortedInactive.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 1, marginTop: sortedActive.length > 0 ? 12 : 0, marginBottom: 4 }}>⚫ Inactivos ({sortedInactive.length})</div>
                      {sortedInactive.map(u => (
                        <div key={u.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: '#f7f8fc', border: '1px solid #eef0f6' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#d1d5db', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#2d3352' }}>{u.name || '—'}</div>
                            <div style={{ fontSize: 11, color: '#9aa3bc' }}>{u.email}</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                            <div style={{ fontSize: 11, color: '#9aa3bc', fontWeight: 600 }}>{timeAgo(u.updated_at)}</div>
                            <div style={{ fontSize: 10, color: '#9aa3bc', background: '#f0f2f8', borderRadius: 4, padding: '1px 6px' }}>{pageLabel(u.page)}</div>
                            <div style={{ fontSize: 10, color: '#c4c9d9' }}>{fecha(u.updated_at)}</div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      <ActivityHistory supabase={supabase} />

      {confirmReset && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,32,64,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, border: '1.5px solid #dde1ef', boxShadow: '0 8px 40px rgba(27,47,94,0.18)', padding: '28px 28px 24px', width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1B2F5E' }}>¿Resetear todos los clicks?</div>
            <div style={{ fontSize: 13, color: '#5a6380', lineHeight: 1.5 }}>Esta acción va a eliminar <strong>todos los {events.length} clicks registrados</strong> permanentemente. No se puede deshacer.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button style={{ background: 'white', border: '1.5px solid #dde1ef', color: '#5a6380', borderRadius: 10, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }} onClick={() => setConfirmReset(false)}>Cancelar</button>
              <button
                style={{ background: 'linear-gradient(135deg, #e53e3e, #c53030)', color: 'white', border: 'none', borderRadius: 10, padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(229,62,62,0.4)' }}
                onClick={async () => {
                  setLoading(true);
                  await supabase.from('click_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                  setEvents([]);
                  setConfirmReset(false);
                  setLoading(false);
                }}
              >
                Sí, eliminar todo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
  

const styles = {
  loginWrap: { minHeight: '100vh', background: '#f7f8fc', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  loginBox: { background: 'white', borderRadius: 16, padding: 40, width: 360, boxShadow: '0 4px 24px rgba(27,47,94,0.12)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  loginTitle: { fontSize: 20, fontWeight: 700, color: '#1B2F5E', marginBottom: 8 },
  btnGoogle: { display: 'flex', alignItems: 'center', gap: 10, background: 'white', color: '#2d3352', border: '1.5px solid #dde1ef', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  wrap: { minHeight: '100vh', background: '#f7f8fc', fontFamily: "'Barlow', sans-serif" },
  header: { background: '#1B2F5E', padding: '0 20px', height: 46, display: 'flex', alignItems: 'center', gap: 12 },
  headerTitle: { color: 'rgba(255,255,255,0.6)', fontSize: 12, letterSpacing: 2, flex: 1 },
  btnLogout: { background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  tabBar: { background: 'white', borderBottom: '1.5px solid #dde1ef' },
  tabBarInner: { width: '90%', maxWidth: '100%', margin: '0 auto', padding: '0 16px', display: 'flex', gap: 0 },
  tab: { background: 'none', border: 'none', padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#9aa3bc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 },
  tabActive: { color: '#1B2F5E', boxShadow: 'inset 0 -3px 0 #1B2F5E' },
  orphanBadge: { background: '#fee2e2', color: '#dc2626', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 },
  content: { width: '90%', maxWidth: '100%', margin: '16px auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 14 },
  card: { background: 'white', borderRadius: 10, padding: 16, border: '1.5px solid #dde1ef' },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: '#1B2F5E', marginBottom: 12 },
  emptyMsg: { color: '#9aa3bc', fontSize: 12 },
  formGroup: { marginBottom: 10 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  input: { width: '100%', border: '1.5px solid #dde1ef', borderRadius: 6, padding: '5px 9px', fontFamily: 'Barlow, sans-serif', fontSize: 13, color: '#2d3352', boxSizing: 'border-box' },
  errorMsg: { fontSize: 11, color: '#dc2626', marginTop: 3 },
  productRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #eef0f6' },
  productName: { fontSize: 13, fontWeight: 700, color: '#2d3352', marginBottom: 2 },
  productMeta: { fontSize: 11, color: '#9aa3bc' },
  fileList: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 },
  fileRow: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 10px', background: '#f7f8fc', borderRadius: 8, border: '1.5px solid #dde1ef' },
  fileThumb: { width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid #dde1ef', flexShrink: 0 },
  fileFields: { flex: 1, minWidth: 0 },
  removePendingBtn: { background: 'none', border: 'none', color: '#9aa3bc', fontSize: 15, cursor: 'pointer', padding: '0 4px', flexShrink: 0, lineHeight: 1, marginTop: 8 },
  btnPrimary: { background: '#1B2F5E', color: 'white', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  btnWarning: { background: '#fff8e1', color: '#7a5800', border: '1.5px solid #f6c200', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  editBtn: { background: '#e8eef9', color: '#2D6BE4', border: 'none', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 3, display: 'flex', alignItems: 'center', borderRadius: 5 },
  designRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #eef0f6' },
  designInfo: { display: 'flex', alignItems: 'center', gap: 10 },
  designThumb: { width: 36, height: 36, objectFit: 'cover', borderRadius: 6, border: '1px solid #dde1ef' },
  designName: { fontSize: 13, fontWeight: 600, color: '#2d3352' },
  designCat: { fontSize: 11, color: '#9aa3bc', marginTop: 1 },
  productTag: { background: '#e8eef9', color: '#2D6BE4', borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 600, marginRight: 3 },
  orphanTag: { background: '#fee2e2', color: '#dc2626', borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 600, marginRight: 3 },
  tbl: { width: '100%', borderCollapse: 'collapse', minWidth: 820 },
  th: { fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, padding: '6px 6px', borderBottom: '2px solid #dde1ef', textAlign: 'left', whiteSpace: 'normal', minWidth: 60 },
  td: { padding: '4px 5px', borderBottom: '1px solid #f0f2f8', verticalAlign: 'middle' },
  tblInput: { width: '100%', border: '1.5px solid #dde1ef', borderRadius: 5, padding: '4px 6px', fontSize: 12, color: '#2d3352', fontFamily: 'Barlow, sans-serif', boxSizing: 'border-box' },
  footer: { textAlign: 'center', padding: '10px', fontSize: 10, color: 'rgba(0,0,0,0.15)', letterSpacing: 1 },
  userBadge: { background: '#e8eef9', color: '#2D6BE4', borderRadius: 10, padding: '1px 6px', fontSize: 11, fontWeight: 700 },
  userRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #eef0f6', gap: 10 },
  userInfo: { flex: 1, minWidth: 0 },
  formRow2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 0 },
};
