'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const CATEGORIES = ['deportes', 'animales', 'vehiculos', 'otros'];
const EMPTY_PRODUCT = { name: '', slug: '', columns_desktop: 5, columns_mobile: 2, aspect_ratio: '2/3', max_file_size_kb: 250, price_per_unit: 0, show_price: true };
const LOGO = 'https://ylawwaoznxzxwetlkjel.supabase.co/storage/v1/object/public/assets/Logo%20nuevo.png';

function fileToBase64(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(file);
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
  const [screen, setScreen] = useState('login'); // 'login' | 'checking' | 'denied' | 'panel'
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('products');

  // Products
  const [products, setProducts] = useState([]);
  const [newProduct, setNewProduct] = useState(EMPTY_PRODUCT);
  const [savingProduct, setSavingProduct] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [productForms, setProductForms] = useState({});
  const [savedProductId, setSavedProductId] = useState(null);
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

  // Localities
  const [localities, setLocalities] = useState([]);
  const [newLocality, setNewLocality] = useState({ name: '' });
  const [savingLocality, setSavingLocality] = useState(false);

  // Users
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Admins
  const [admins, setAdmins] = useState([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState(null);

  // Orders
  const [orders, setOrders] = useState([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderDetail, setOrderDetail] = useState(null);

  // Price tiers
  const [priceTiers, setPriceTiers] = useState([]);
  const [newTiers, setNewTiers] = useState({});
  const [editingTiers, setEditingTiers] = useState({});
  const [savedTierId, setSavedTierId] = useState(null);
  const [addingTier, setAddingTier] = useState(null);

  // ── Auth listener ──
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') return;
      if (event === 'SIGNED_IN' && session?.user?.email) {
        checkAdmin(session.user.email);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (screen === 'panel') {
      loadProducts(); loadDesigns(); loadLocalities(); loadUsers(); loadPriceTiers(); loadAdmins(); loadOrders();
    }
  }, [screen]);

  useEffect(() => { return () => pendingFiles.forEach(f => URL.revokeObjectURL(f.preview)); }, [pendingFiles]);

  useEffect(() => {
    const forms = {};
    products.forEach(p => {
      if (!productForms[p.id]) {
        forms[p.id] = { name: p.name, columns_desktop: p.columns_desktop, columns_mobile: p.columns_mobile, aspect_ratio: p.aspect_ratio, max_file_size_kb: p.max_file_size_kb, price_per_unit: p.price_per_unit ?? 0, show_price: p.show_price !== false };
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
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://inkora-next.vercel.app/admin' },
    });
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setScreen('login');
    setCurrentUser(null);
  }

  // ── Products ──
  async function loadProducts() {
    const { data } = await supabase.from('products').select('*').order('created_at');
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
  }

  function handleProductKeyDown(e, rowIdx, colIdx) {
    const NCOLS = 4;
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
    askConfirm('¿Seguro que querés eliminar este producto? Esta acción no se puede deshacer.', async () => {
      await supabase.from('products').delete().eq('id', id);
      loadProducts();
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
    const { data } = await supabase.from('designs').select('*, products(name)').order('created_at');
    if (data) { setDesigns(data); setOrphanCount(data.filter(d => !d.product_id && d.active).length); }
  }

  async function toggleDesign(id, active) {
    await supabase.from('designs').update({ active: !active }).eq('id', id);
    loadDesigns();
  }

  async function deleteDesign(id) {
    await supabase.from('designs').delete().eq('id', id);
    loadDesigns();
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
    const entries = files.map(file => ({
      file, preview: URL.createObjectURL(file),
      name: file.name.replace(/\.[^.]+$/, ''), category: 'deportes',
      nameExists: false, sizeError: file.size > maxSizeKb * 1024,
    }));
    setPendingFiles(entries);
    e.target.value = '';
    const { data } = await supabase.from('designs').select('name').eq('active', true);
    const existing = new Set((data || []).map(d => d.name.toLowerCase()));
    setPendingFiles(prev => prev.map(entry => ({
      ...entry, nameExists: entry.name.length > 2 && existing.has(entry.name.toLowerCase()),
    })));
  }

  const updateEntry = useCallback(async (index, field, value) => {
    setPendingFiles(prev => { const next = [...prev]; next[index] = { ...next[index], [field]: value }; return next; });
    if (field === 'name') {
      if (value.length > 2) {
        const { data } = await supabase.from('designs').select('name').eq('active', true);
        const exists = Array.isArray(data) && data.some(d => d.name.toLowerCase() === value.toLowerCase());
        setPendingFiles(prev => { const next = [...prev]; next[index] = { ...next[index], nameExists: exists }; return next; });
      } else {
        setPendingFiles(prev => { const next = [...prev]; next[index] = { ...next[index], nameExists: false }; return next; });
      }
    }
  }, []);

  function removePending(index) {
    setPendingFiles(prev => { URL.revokeObjectURL(prev[index].preview); return prev.filter((_, i) => i !== index); });
  }

  async function addDesigns() {
    setUploading(true);
    let anyError = false;
    for (const entry of pendingFiles) {
      if (entry.file.size > maxSizeKb * 1024) { alert(`"${entry.name}" supera ${maxSizeKb}kb.`); anyError = true; continue; }
      try {
        const base64 = await fileToBase64(entry.file);
        const res = await fetch('/api/upload-image', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64: base64, fileName: entry.file.name, mimeType: entry.file.type }),
        });
        const data = await res.json();
        if (data.url) {
          await supabase.from('designs').insert({ name: entry.name, category: entry.category, image_url: data.url, active: true, product_id: selectedProductId });
        } else { alert(`Error al subir "${entry.name}".`); anyError = true; }
      } catch { alert(`Error al subir "${entry.name}".`); anyError = true; }
    }
    setUploading(false);
    if (!anyError) setPendingFiles([]);
    loadDesigns();
  }

  // ── Localities ──
  async function loadLocalities() {
    const { data } = await supabase.from('localities').select('*').order('created_at');
    if (data) setLocalities(data);
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

  // ── Orders ──
  async function loadOrders() {
    const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (data) setOrders(data);
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
    return items.slice(0, 3).map(i => `${i.name} ×${i.qty}`).join(', ') + (items.length > 3 ? ` +${items.length - 3}` : '');
  }

  const filteredOrders = orders.filter(o => {
    const q = orderSearch.toLowerCase();
    return !q || (o.order_code || '').toLowerCase().includes(q) || (o.customer_name || '').toLowerCase().includes(q) || (o.customer_email || '').toLowerCase().includes(q);
  });

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
    pendingFiles.every(f => f.name.trim().length > 0 && !f.nameExists && !f.sizeError) &&
    !pendingFiles.some((f, i) => hasDupInBatch(i, f.name));

  const s = styles;

  // ── PANTALLAS AUTH ──
  if (screen === 'login') return (
    <div style={s.loginWrap}>
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
    <div style={s.loginWrap}>
      <div style={s.loginBox}>
        <img src={LOGO} alt="INKORA" style={{height: 50, marginBottom: 16}} />
        <p style={{color: '#5a6380', fontSize: 14, margin: 0}}>Verificando acceso...</p>
      </div>
    </div>
  );

  if (screen === 'denied') return (
    <div style={s.loginWrap}>
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
          {[['products','Productos'],['designs','Diseños'],['orders','Pedidos'],['localities','Localidades'],['users','Usuarios'],['admins','Admins']].map(([id, label]) => (
            <button key={id} style={{...s.tab, ...(activeTab === id ? s.tabActive : {})}} onClick={() => setActiveTab(id)}>
              {label}
              {id === 'designs' && orphanCount > 0 && <span style={s.orphanBadge}>{orphanCount}</span>}
              {id === 'orders' && orders.filter(o => o.status === 'pending').length > 0 && <span style={s.orphanBadge}>{orders.filter(o => o.status === 'pending').length}</span>}
              {id === 'users' && users.length > 0 && <span style={s.userBadge}>{users.length}</span>}
              {id === 'admins' && admins.length > 0 && <span style={s.userBadge}>{admins.length}</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={s.content}>

        {/* ══ PRODUCTOS ══ */}
        {activeTab === 'products' && (
          <>
            <div style={s.card}>
              <h2 style={s.sectionTitle}>Productos</h2>
              <div style={{overflowX: 'auto'}}>
                <table style={s.tbl}>
                  <thead>
                    <tr>
                      <th style={s.th}>Mostrar</th>
                      <th style={s.th}>Nombre</th>
                      <th style={s.th}>Cols PC</th>
                      <th style={s.th}>Cols Cel</th>
                      <th style={s.th}>Tamaño Máx (KB)</th>
                      <th style={s.th}>Precios</th>
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
                        <tr key={p.id} style={{opacity: p.active ? 1 : 0.5}}>
                          <td style={{...s.td, textAlign:'center'}}>
                            <button style={s.iconBtn} onClick={() => toggleProduct(p.id, p.active)}>{p.active ? <EyeOpen /> : <EyeOff />}</button>
                          </td>
                          <td style={s.td}>
                            <input ref={setRef(0)} style={s.tblInput} value={form.name || ''} onChange={e => updateProductForm(p.id, 'name', e.target.value)} onBlur={() => saveProduct(p.id)} onKeyDown={e => handleProductKeyDown(e, rowIdx, 0)} />
                          </td>
                          <td style={s.td}>
                            <input ref={setRef(1)} style={{...s.tblInput, width: 58}} type="number" min="1" max="10" value={form.columns_desktop ?? 1} onChange={e => updateProductForm(p.id, 'columns_desktop', parseInt(e.target.value)||1)} onBlur={() => saveProduct(p.id)} onKeyDown={e => handleProductKeyDown(e, rowIdx, 1)} />
                          </td>
                          <td style={s.td}>
                            <input ref={setRef(2)} style={{...s.tblInput, width: 58}} type="number" min="1" max="4" value={form.columns_mobile ?? 1} onChange={e => updateProductForm(p.id, 'columns_mobile', parseInt(e.target.value)||1)} onBlur={() => saveProduct(p.id)} onKeyDown={e => handleProductKeyDown(e, rowIdx, 2)} />
                          </td>
                          <td style={s.td}>
                            <input ref={setRef(3)} style={{...s.tblInput, width: 80}} type="number" min="50" value={form.max_file_size_kb ?? 250} onChange={e => updateProductForm(p.id, 'max_file_size_kb', parseInt(e.target.value)||250)} onBlur={() => saveProduct(p.id)} onKeyDown={e => handleProductKeyDown(e, rowIdx, 3)} />
                          </td>
                          <td style={{...s.td, textAlign:'center'}}>
                            <button style={s.iconBtn} onClick={() => { const newVal = !form.show_price; updateProductForm(p.id, 'show_price', newVal); saveProduct(p.id, { show_price: newVal }); }}>
                              {form.show_price ? <EyeOpen /> : <EyeOff />}
                            </button>
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
                        <td style={s.td}><input style={{...s.tblInput, width: 58}} type="number" min="1" max="10" value={newProduct.columns_desktop} onChange={e => setNewProduct(p => ({...p, columns_desktop: parseInt(e.target.value)||1}))} /></td>
                        <td style={s.td}><input style={{...s.tblInput, width: 58}} type="number" min="1" max="4" value={newProduct.columns_mobile} onChange={e => setNewProduct(p => ({...p, columns_mobile: parseInt(e.target.value)||1}))} /></td>
                        <td style={s.td}><input style={{...s.tblInput, width: 80}} type="number" min="50" value={newProduct.max_file_size_kb} onChange={e => setNewProduct(p => ({...p, max_file_size_kb: parseInt(e.target.value)||250}))} /></td>
                        <td style={{...s.td, textAlign:'center'}}>
                          <button style={s.iconBtn} onClick={() => setNewProduct(p => ({...p, show_price: !p.show_price}))}>
                            {newProduct.show_price ? <EyeOpen /> : <EyeOff />}
                          </button>
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
                      <td colSpan={8} style={{padding:'10px 6px'}}>
                        <button style={{...s.editBtn, width:'100%', textAlign:'center', padding:'8px'}} onClick={() => { setShowAddForm(v => !v); setNewProduct(EMPTY_PRODUCT); }}>
                          {showAddForm ? '✕ Cancelar' : '+ Agregar producto'}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ESCALAS */}
            <div style={s.card}>
              <h2 style={s.sectionTitle}>Escalas de precio por localidad</h2>
              {localities.filter(l => l.active).length === 0 ? <p style={s.emptyMsg}>No hay localidades activas.</p>
              : products.filter(p => p.active).length === 0 ? <p style={s.emptyMsg}>No hay productos activos.</p>
              : (
                <div style={{display:'flex', flexWrap:'wrap', gap:14, alignItems:'flex-start'}}>
                  {products.filter(p => p.active).map(product => {
                    const productTiers = priceTiers.filter(t => t.product_id === product.id);
                    const activeLocalities = localities.filter(l => l.active);
                    return (
                      <div key={product.id} style={{border:'1.5px solid #dde1ef', borderRadius:8, overflow:'hidden', flex:'1 1 220px', minWidth:200}}>
                        <div style={{background:'#1B2F5E', color:'white', padding:'5px 10px', fontSize:12, fontWeight:700, letterSpacing:0.5}}>{product.name}</div>
                        {activeLocalities.map((locality, li) => {
                          const key = `${product.id}_${locality.id}`;
                          const tiers = productTiers.filter(t => t.locality_id === locality.id).sort((a,b) => Number(a.min_quantity) - Number(b.min_quantity));
                          const nt = newTiers[key] || { min_quantity: '', price_per_unit: '' };
                          const isAdding = addingTier === key;
                          return (
                            <div key={locality.id} style={{borderTop: li > 0 ? '1.5px solid #eef0f6' : 'none'}}>
                              <div style={{padding:'4px 8px', background:'#f7f8fc', fontSize:11, fontWeight:700, color:'#5a6380', letterSpacing:0.3, textTransform:'uppercase'}}>{locality.name}</div>
                              <table style={{width:'100%', borderCollapse:'collapse'}}>
                                <thead>
                                  <tr>
                                    <th style={{...s.th, padding:'3px 8px', fontSize:10}}>Cant. mín.</th>
                                    <th style={{...s.th, padding:'3px 8px', fontSize:10}}>Precio/u</th>
                                    <th style={{...s.th, padding:'3px 4px', width:24}}></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {tiers.length === 0 && !isAdding && <tr><td colSpan={3} style={{...s.td, color:'#9aa3bc', fontSize:11, fontStyle:'italic', textAlign:'center', padding:'4px 8px'}}>Sin escalas</td></tr>}
                                  {tiers.map(t => {
                                    const ef = editingTiers[t.id] || { min_quantity: t.min_quantity, price_per_unit: t.price_per_unit };
                                    return (
                                      <tr key={t.id} style={{borderTop:'1px solid #f0f2f8'}}>
                                        <td style={{...s.td, padding:'3px 8px'}}>
                                          <input style={{...s.tblInput, width:68, padding:'2px 5px', fontSize:12}} type="number" min="1" value={ef.min_quantity} onChange={e => updateTierForm(t.id, 'min_quantity', e.target.value)} onBlur={() => saveTierAuto(t.id)} />
                                        </td>
                                        <td style={{...s.td, padding:'3px 8px'}}>
                                          <div style={{display:'flex', alignItems:'center', gap:2}}>
                                            <span style={{fontSize:11, color:'#9aa3bc'}}>$</span>
                                            <input style={{...s.tblInput, width:68, padding:'2px 5px', fontSize:12}} type="number" min="0" value={ef.price_per_unit} onChange={e => updateTierForm(t.id, 'price_per_unit', e.target.value)} onBlur={() => saveTierAuto(t.id)} />
                                            {savedTierId === t.id && <span style={{color:'#18a36a', fontSize:11, fontWeight:700}}>✓</span>}
                                          </div>
                                        </td>
                                        <td style={{...s.td, padding:'3px 4px', textAlign:'center'}}>
                                          <TrashBtn onClick={() => deleteScale(t.id)} />
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  {isAdding && (
                                    <tr style={{borderTop:'1px solid #f0f2f8', background:'#f7f8fc'}}>
                                      <td style={{...s.td, padding:'3px 8px'}}><input style={{...s.tblInput, width:68, padding:'2px 5px', fontSize:12}} type="number" min="1" placeholder="≥qty" value={nt.min_quantity} onChange={e => setNewTiers(prev => ({...prev, [key]: {...nt, min_quantity: e.target.value}}))} /></td>
                                      <td style={{...s.td, padding:'3px 8px'}}>
                                        <div style={{display:'flex', alignItems:'center', gap:2}}>
                                          <span style={{fontSize:11, color:'#9aa3bc'}}>$</span>
                                          <input style={{...s.tblInput, width:68, padding:'2px 5px', fontSize:12}} type="number" min="0" placeholder="$/u" value={nt.price_per_unit} onChange={e => setNewTiers(prev => ({...prev, [key]: {...nt, price_per_unit: e.target.value}}))} />
                                        </div>
                                      </td>
                                      <td style={{...s.td, padding:'3px 4px', textAlign:'center'}}>
                                        <button style={{...s.editBtn, padding:'1px 5px', fontSize:12}} onClick={() => addTierMatrix(product.id, locality.id, key)}>✓</button>
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                              <div style={{padding:'3px 8px', borderTop:'1px solid #f0f2f8'}}>
                                {isAdding
                                  ? <button style={{background:'none', border:'none', cursor:'pointer', color:'#9aa3bc', fontSize:11, padding:0}} onClick={() => setAddingTier(null)}>✕ Cancelar</button>
                                  : <button style={{...s.editBtn, padding:'2px 8px', fontSize:11, width:'100%', textAlign:'center'}} onClick={() => setAddingTier(key)}>+ Agregar escala</button>
                                }
                              </div>
                            </div>
                          );
                        })}
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
                <select style={s.input} value={selectedProductId} onChange={e => { setSelectedProductId(e.target.value); setPendingFiles([]); }}>
                  <option value="">— Seleccioná un producto —</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {selectedProductId && (
                <div style={s.formGroup}>
                  <label style={s.label}>Imágenes (máx. {maxSizeKb}kb c/u)</label>
                  <input type="file" accept="image/*" multiple style={{...s.input, padding: 6}} onChange={handleFileSelect} />
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
                          <img src={entry.preview} alt="" style={s.fileThumb} />
                          <div style={s.fileFields}>
                            <input style={{...s.input, borderColor: hasError ? '#dc2626' : '#dde1ef'}} value={entry.name} onChange={e => updateEntry(i, 'name', e.target.value)} placeholder="Nombre del diseño" />
                            {entry.nameExists && <div style={s.errorMsg}>⚠ Ya existe este diseño</div>}
                            {entry.sizeError && <div style={s.errorMsg}>⚠ La imagen supera {maxSizeKb}kb</div>}
                            {dupInBatch && <div style={s.errorMsg}>⚠ Nombre duplicado en este lote</div>}
                          </div>
                          <select style={{...s.input, width: 140, flexShrink: 0}} value={entry.category} onChange={e => updateEntry(i, 'category', e.target.value)}>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
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
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 20}}>
                <h2 style={{...s.sectionTitle, marginBottom: 0}}>Diseños actuales ({designs.length})</h2>
                {orphanCount > 0 && <button style={{...s.btnWarning, opacity: migrating ? 0.5 : 1}} disabled={migrating} onClick={migrateOrphans}>{migrating ? 'Migrando...' : `Migrar ${orphanCount} sin producto →`}</button>}
              </div>
              {designs.map(d => (
                <div key={d.id} style={{...s.designRow, opacity: d.active ? 1 : 0.45}}>
                  <div style={s.designInfo}>
                    {d.image_url && <img src={d.image_url} alt={d.name} style={s.designThumb} />}
                    <div>
                      <div style={s.designName}>{d.name}</div>
                      <div style={s.designCat}>
                        {d.products?.name ? <span style={s.productTag}>{d.products.name}</span> : <span style={s.orphanTag}>Sin producto</span>}
                        {' '}{d.category}
                      </div>
                    </div>
                  </div>
                  <div style={{display:'flex', alignItems:'center', gap:4}}>
                    <button style={s.iconBtn} onClick={() => toggleDesign(d.id, d.active)}>{d.active ? <EyeOpen /> : <EyeOff />}</button>
                    <TrashBtn onClick={() => deleteDesign(d.id)} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ══ PEDIDOS ══ */}
        {activeTab === 'orders' && (
          <div style={s.card}>
            <h2 style={s.sectionTitle}>Pedidos ({filteredOrders.length})</h2>
            <div style={{marginBottom: 12}}>
              <input
                style={{...s.input, maxWidth: 320}}
                placeholder="Buscar por código, nombre o email..."
                value={orderSearch}
                onChange={e => setOrderSearch(e.target.value)}
              />
            </div>
            {filteredOrders.length === 0 && <p style={s.emptyMsg}>No hay pedidos.</p>}
            {filteredOrders.length > 0 && (
              <div style={{overflowX: 'auto'}}>
                <table style={s.tbl}>
                  <thead>
                    <tr>
                      <th style={s.th}>Código</th>
                      <th style={s.th}>Fecha</th>
                      <th style={s.th}>Cliente</th>
                      <th style={s.th}>Email</th>
                      <th style={s.th}>Items</th>
                      <th style={s.th}>Total</th>
                      <th style={s.th}>Estado</th>
                      <th style={s.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map(o => {
                      const sc = getStatusCfg(o.status);
                      return (
                        <tr key={o.id}>
                          <td style={s.td}><span style={{fontFamily:'monospace', fontSize:12, fontWeight:700, color:'#1B2F5E'}}>{o.order_code}</span></td>
                          <td style={s.td}><span style={{fontSize:12, color:'#5a6380', whiteSpace:'nowrap'}}>{o.created_at ? new Date(o.created_at).toLocaleDateString('es-AR', {day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit'}) : '—'}</span></td>
                          <td style={s.td}><span style={{fontSize:13, fontWeight:600, color:'#2d3352'}}>{o.customer_name || '—'}</span></td>
                          <td style={s.td}><span style={{fontSize:12, color:'#5a6380'}}>{o.customer_email || '—'}</span></td>
                          <td style={s.td}><span style={{fontSize:12, color:'#5a6380', maxWidth:200, display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{summarizeItems(o.items)}</span></td>
                          <td style={s.td}><span style={{fontSize:13, fontWeight:700, color:'#2d3352', whiteSpace:'nowrap'}}>{o.total ? `$${Number(o.total).toLocaleString('es-AR')}` : '—'}</span></td>
                          <td style={s.td}>
                            <select
                              value={o.status || 'pending'}
                              onChange={e => updateOrderStatus(o.id, e.target.value)}
                              style={{border:`1.5px solid ${sc.color}`, background:sc.bg, color:sc.color, borderRadius:6, padding:'3px 7px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Barlow, sans-serif'}}
                            >
                              {ORDER_STATUSES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                            </select>
                          </td>
                          <td style={s.td}>
                            <button style={s.editBtn} onClick={() => setOrderDetail(o)}>Ver</button>
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
              <h2 style={s.sectionTitle}>Nueva localidad</h2>
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
                <div key={l.id} style={s.productRow}>
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
            {users.map(u => (
              <div key={u.id} style={s.userRow}>
                <div style={s.userInfo}>
                  <div style={s.productName}>{u.name || '—'}</div>
                  <div style={s.productMeta}>{u.email}</div>
                </div>
                <select style={{...s.input, width: 180, fontSize: 13, padding: '6px 10px'}} value={u.locality_id || ''} onChange={e => updateUserLocality(u.id, e.target.value)}>
                  <option value="">Sin localidad</option>
                  {localities.filter(l => l.active).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            ))}
          </div>
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

      {/* MODAL CONFIRMAR */}
      {confirmModal.open && (
        <div style={{position:'fixed', inset:0, background:'rgba(17,32,64,0.55)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20}}>
          <div style={{background:'white', borderRadius:16, border:'1.5px solid #dde1ef', boxShadow:'0 8px 40px rgba(27,47,94,0.18)', padding:'28px 28px 24px', width:'100%', maxWidth:380, display:'flex', flexDirection:'column', gap:16}}>
            <div style={{fontSize:16, fontWeight:700, color:'#1B2F5E'}}>¿Confirmar eliminación?</div>
            <div style={{fontSize:13, color:'#5a6380', lineHeight:1.5}}>{confirmModal.message}</div>
            <div style={{display:'flex', gap:10, justifyContent:'flex-end', marginTop:4}}>
              <button style={{background:'white', border:'1.5px solid #dde1ef', color:'#5a6380', borderRadius:10, padding:'8px 20px', fontSize:13, fontWeight:600, cursor:'pointer'}} onClick={closeConfirm}>Cancelar</button>
              <button style={{background:'linear-gradient(135deg, #e53e3e, #c53030)', color:'white', border:'none', borderRadius:10, padding:'8px 20px', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(229,62,62,0.4)'}} onClick={() => { confirmModal.onConfirm(); closeConfirm(); }}>Eliminar</button>
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
  designCat: { fontSize: 11, color: '#9aa3bc', textTransform: 'uppercase', marginTop: 1 },
  productTag: { background: '#e8eef9', color: '#2D6BE4', borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 600, marginRight: 3 },
  orphanTag: { background: '#fee2e2', color: '#dc2626', borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 600, marginRight: 3 },
  tbl: { width: '100%', borderCollapse: 'collapse', minWidth: 820 },
  th: { fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, padding: '6px 6px', borderBottom: '2px solid #dde1ef', textAlign: 'left', whiteSpace: 'nowrap' },
  td: { padding: '4px 5px', borderBottom: '1px solid #f0f2f8', verticalAlign: 'middle' },
  tblInput: { width: '100%', border: '1.5px solid #dde1ef', borderRadius: 5, padding: '4px 6px', fontSize: 12, color: '#2d3352', fontFamily: 'Barlow, sans-serif', boxSizing: 'border-box' },
  footer: { textAlign: 'center', padding: '10px', fontSize: 10, color: 'rgba(0,0,0,0.15)', letterSpacing: 1 },
  userBadge: { background: '#e8eef9', color: '#2D6BE4', borderRadius: 10, padding: '1px 6px', fontSize: 11, fontWeight: 700 },
  userRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #eef0f6', gap: 10 },
  userInfo: { flex: 1, minWidth: 0 },
  formRow2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 0 },
};