'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';

const supabase = createBrowserSupabaseClient();

const CATEGORIES = ['deportes', 'animales', 'vehiculos', 'otros'];
const EMPTY_PRODUCT = { name: '', slug: '', columns_desktop: 5, columns_mobile: 2, aspect_ratio: '2/3', max_file_size_kb: 250, price_per_unit: 0, show_price: true };

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
  const [auth, setAuth] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const authRef = useRef(false);

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

  function askConfirm(message, onConfirm) {
    setConfirmModal({ open: true, message, onConfirm });
  }
  function closeConfirm() {
    setConfirmModal({ open: false, message: '', onConfirm: null });
  }

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

  // Price tiers
  const [priceTiers, setPriceTiers] = useState([]);
  const [newTiers, setNewTiers] = useState({});
  const [editingTiers, setEditingTiers] = useState({});
  const [savedTierId, setSavedTierId] = useState(null);
  const [addingTier, setAddingTier] = useState(null);

  // ── AUTH ──
  useEffect(() => {
    // Verificar sesión existente
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await verifyAdmin(session.user.email);
      }
    });

    // Capturar SIGNED_IN después del redirect de Google
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user && !authRef.current) {
        await verifyAdmin(session.user.email);
      }
      // Ignorar SIGNED_OUT para no cerrar sesión al cambiar de pestaña
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verifyAdmin(email) {
    setCheckingAuth(true);
    const { data } = await supabase.from('admins').select('email').eq('email', email).single();
    if (data) {
      setAuth(true);
      authRef.current = true;
      setCurrentUserEmail(email);
      setAccessDenied(false);
    } else {
      setAccessDenied(true);
      setAuth(false);
      authRef.current = false;
    }
    setCheckingAuth(false);
  }

  async function loginWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://inkora-next.vercel.app/admin' }
    });
  }

  async function logout() {
    await supabase.auth.signOut();
    setAuth(false);
    authRef.current = false;
    setAccessDenied(false);
    setCurrentUserEmail('');
  }

  useEffect(() => {
    if (auth) { loadProducts(); loadDesigns(); loadLocalities(); loadUsers(); loadPriceTiers(); loadAdmins(); }
  }, [auth]);

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

  useEffect(() => { return () => pendingFiles.forEach(f => URL.revokeObjectURL(f.preview)); }, [pendingFiles]);

  async function loadProducts() {
    const { data } = await supabase.from('products').select('*').order('created_at');
    if (data) setProducts(data);
  }

  async function loadDesigns() {
    const { data } = await supabase.from('designs').select('*, products(name)').order('created_at');
    if (data) {
      setDesigns(data);
      setOrphanCount(data.filter(d => !d.product_id && d.active).length);
    }
  }

  async function loadAdmins() {
    const { data } = await supabase.from('admins').select('email').order('email');
    if (data) setAdmins(data);
  }

  async function addAdmin() {
    if (!newAdminEmail.trim()) return;
    setAddingAdmin(true);
    await supabase.from('admins').insert({ email: newAdminEmail.trim().toLowerCase() });
    setNewAdminEmail('');
    setAddingAdmin(false);
    loadAdmins();
  }

  function deleteAdmin(email) {
    if (email === currentUserEmail) {
      alert('No podés eliminarte a vos mismo.');
      return;
    }
    askConfirm(`¿Eliminar acceso de admin para ${email}?`, async () => {
      await supabase.from('admins').delete().eq('email', email);
      loadAdmins();
    });
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
    const NROWS = cellRefs.current.length;
    if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'ArrowRight') {
      if (colIdx + 1 < NCOLS) { e.preventDefault(); cellRefs.current[rowIdx]?.[colIdx + 1]?.focus(); }
    } else if ((e.key === 'Tab' && e.shiftKey) || e.key === 'ArrowLeft') {
      if (colIdx - 1 >= 0) { e.preventDefault(); cellRefs.current[rowIdx]?.[colIdx - 1]?.focus(); }
    } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
      if (rowIdx + 1 < NROWS) { e.preventDefault(); cellRefs.current[rowIdx + 1]?.[colIdx]?.focus(); }
    } else if (e.key === 'ArrowUp') {
      if (rowIdx - 1 >= 0) { e.preventDefault(); cellRefs.current[rowIdx - 1]?.[colIdx]?.focus(); }
    }
  }

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
    await supabase.from('price_tiers').update({
      min_quantity: Number(ef.min_quantity),
      price_per_unit: Number(ef.price_per_unit),
    }).eq('id', id);
    setSavedTierId(id);
    setTimeout(() => setSavedTierId(prev => prev === id ? null : prev), 1200);
  }

  async function addTierMatrix(productId, localityId, key) {
    const t = newTiers[key] || { min_quantity: '', price_per_unit: '' };
    if (!t.min_quantity || !t.price_per_unit) return;
    await supabase.from('price_tiers').insert({
      product_id: productId, locality_id: localityId,
      min_quantity: Number(t.min_quantity), price_per_unit: Number(t.price_per_unit),
    });
    setNewTiers(prev => ({ ...prev, [key]: { min_quantity: '', price_per_unit: '' } }));
    setAddingTier(null);
    loadPriceTiers();
  }

  function deleteProduct(id) {
    askConfirm('¿Seguro que querés eliminar este producto? Esta acción no se puede deshacer.', async () => {
      await supabase.from('products').delete().eq('id', id);
      loadProducts();
    });
  }

  function deleteScale(id) {
    askConfirm('¿Eliminar esta escala de precio?', async () => {
      await supabase.from('price_tiers').delete().eq('id', id);
      loadPriceTiers();
    });
  }

  async function toggleProduct(id, active) {
    await supabase.from('products').update({ active: !active }).eq('id', id);
    setSavedProductId(id);
    setTimeout(() => setSavedProductId(prev => prev === id ? null : prev), 1200);
    loadProducts();
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
      ...entry,
      nameExists: entry.name.length > 2 && existing.has(entry.name.toLowerCase()),
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

  async function loadLocalities() {
    const { data } = await supabase.from('localities').select('*').order('created_at');
    if (data) setLocalities(data);
  }

  async function loadUsers() {
    setLoadingUsers(true);
    const { data } = await supabase.rpc('admin_get_profiles');
    if (data) setUsers(data);
    setLoadingUsers(false);
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
      loadLocalities();
      loadPriceTiers();
    });
  }

  async function updateUserLocality(userId, localityId) {
    await supabase.rpc('admin_update_user_locality', { p_user_id: userId, p_locality_id: localityId || null });
    loadUsers();
  }

  const hasDupInBatch = (index, name) =>
    name.length > 0 && pendingFiles.some((f, i) => i !== index && f.name.toLowerCase() === name.toLowerCase());

  const canSubmit = selectedProductId && pendingFiles.length > 0 &&
    pendingFiles.every(f => f.name.trim().length > 0 && !f.nameExists && !f.sizeError) &&
    !pendingFiles.some((f, i) => hasDupInBatch(i, f.name));

  const s = styles;

  // ── PANTALLA LOGIN ──
  if (checkingAuth) return (
    <div style={s.loginWrap}>
      <div style={s.loginBox}>
        <img src="https://ylawwaoznxzxwetlkjel.supabase.co/storage/v1/object/public/assets/Logo%20nuevo.png" alt="INKORA" style={{height:50, marginBottom:16}} />
        <div style={{color:'#9aa3bc', fontSize:13}}>Verificando...</div>
      </div>
    </div>
  );

  if (accessDenied) return (
    <div style={s.loginWrap}>
      <div style={s.loginBox}>
        <img src="https://ylawwaoznxzxwetlkjel.supabase.co/storage/v1/object/public/assets/Logo%20nuevo.png" alt="INKORA" style={{height:50, marginBottom:16}} />
        <div style={{color:'#e53e3e', fontWeight:700, fontSize:15, marginBottom:8}}>Acceso denegado</div>
        <div style={{color:'#9aa3bc', fontSize:13, marginBottom:16, textAlign:'center'}}>Tu cuenta no tiene permisos para acceder al panel de administración.</div>
        <button style={s.btnPrimary} onClick={logout}>Cerrar sesión</button>
      </div>
    </div>
  );

  if (!auth) return (
    <div style={s.loginWrap}>
      <div style={s.loginBox}>
        <img src="https://ylawwaoznxzxwetlkjel.supabase.co/storage/v1/object/public/assets/Logo%20nuevo.png" alt="INKORA" style={{height:50, marginBottom:16}} />
        <h2 style={s.loginTitle}>Panel de Administración</h2>
        <button style={{...s.btnPrimary, display:'flex', alignItems:'center', gap:10, padding:'10px 20px', fontSize:14}} onClick={loginWithGoogle}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="white" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="white" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="white" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="white" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Ingresar con Google
        </button>
      </div>
    </div>
  );

  return (
    <div style={s.wrap}>
      <header style={s.header}>
        <img src="https://ylawwaoznxzxwetlkjel.supabase.co/storage/v1/object/public/assets/Logo%20nuevo.png" alt="INKORA" style={{height:36, filter:'brightness(0) invert(1)'}} />
        <span style={s.headerTitle}>Panel de Administración</span>
        <span style={{color:'rgba(255,255,255,0.5)', fontSize:11, marginRight:8}}>{currentUserEmail}</span>
        <button style={s.btnLogout} onClick={logout}>Cerrar sesión</button>
      </header>

      <div style={s.tabBar}>
        <div style={s.tabBarInner}>
          {['products','designs','localities','users','admins'].map(tab => (
            <button key={tab} style={{...s.tab, ...(activeTab === tab ? s.tabActive : {})}} onClick={() => setActiveTab(tab)}>
              {tab === 'products' && 'Productos'}
              {tab === 'designs' && <>Diseños {orphanCount > 0 && <span style={s.orphanBadge}>{orphanCount}</span>}</>}
              {tab === 'localities' && 'Localidades'}
              {tab === 'users' && <>Usuarios {users.length > 0 && <span style={s.userBadge}>{users.length}</span>}</>}
              {tab === 'admins' && 'Admins'}
            </button>
          ))}
        </div>
      </div>

      <div style={s.content}>

        {/* ══ TAB: PRODUCTOS ══ */}
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
                            <button style={s.iconBtn} onClick={() => toggleProduct(p.id, p.active)}>
                              {p.active ? <EyeOpen /> : <EyeOff />}
                            </button>
                          </td>
                          <td style={s.td}>
                            <input ref={setRef(0)} style={s.tblInput} value={form.name || ''}
                              onChange={e => updateProductForm(p.id, 'name', e.target.value)}
                              onBlur={() => saveProduct(p.id)}
                              onKeyDown={e => handleProductKeyDown(e, rowIdx, 0)} />
                          </td>
                          <td style={s.td}>
                            <input ref={setRef(1)} style={{...s.tblInput, width: 58}} type="number" min="1" max="10"
                              value={form.columns_desktop ?? 1}
                              onChange={e => updateProductForm(p.id, 'columns_desktop', parseInt(e.target.value)||1)}
                              onBlur={() => saveProduct(p.id)}
                              onKeyDown={e => handleProductKeyDown(e, rowIdx, 1)} />
                          </td>
                          <td style={s.td}>
                            <input ref={setRef(2)} style={{...s.tblInput, width: 58}} type="number" min="1" max="4"
                              value={form.columns_mobile ?? 1}
                              onChange={e => updateProductForm(p.id, 'columns_mobile', parseInt(e.target.value)||1)}
                              onBlur={() => saveProduct(p.id)}
                              onKeyDown={e => handleProductKeyDown(e, rowIdx, 2)} />
                          </td>
                          <td style={s.td}>
                            <input ref={setRef(3)} style={{...s.tblInput, width: 80}} type="number" min="50"
                              value={form.max_file_size_kb ?? 250}
                              onChange={e => updateProductForm(p.id, 'max_file_size_kb', parseInt(e.target.value)||250)}
                              onBlur={() => saveProduct(p.id)}
                              onKeyDown={e => handleProductKeyDown(e, rowIdx, 3)} />
                          </td>
                          <td style={{...s.td, textAlign:'center'}}>
                            <button style={s.iconBtn} onClick={() => {
                              const newVal = !form.show_price;
                              updateProductForm(p.id, 'show_price', newVal);
                              saveProduct(p.id, { show_price: newVal });
                            }}>
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
                        <td style={s.td}>
                          <input style={s.tblInput} value={newProduct.name} placeholder="Nombre"
                            onChange={e => { const name = e.target.value; setNewProduct(p => ({...p, name, slug: slugify(name)})); }} />
                        </td>
                        <td style={s.td}><input style={{...s.tblInput, width: 58}} type="number" min="1" max="10" value={newProduct.columns_desktop} onChange={e => setNewProduct(p => ({...p, columns_desktop: parseInt(e.target.value)||1}))} /></td>
                        <td style={s.td}><input style={{...s.tblInput, width: 58}} type="number" min="1" max="4" value={newProduct.columns_mobile} onChange={e => setNewProduct(p => ({...p, columns_mobile: parseInt(e.target.value)||1}))} /></td>
                        <td style={s.td}><input style={{...s.tblInput, width: 80}} type="number" min="50" value={newProduct.max_file_size_kb} onChange={e => setNewProduct(p => ({...p, max_file_size_kb: parseInt(e.target.value)||250}))} /></td>
                        <td style={{...s.td, textAlign:'center'}}>
                          <button style={s.iconBtn} onClick={() => setNewProduct(p => ({...p, show_price: !p.show_price}))}>
                            {newProduct.show_price ? <EyeOpen /> : <EyeOff />}
                          </button>
                        </td>
                        <td style={s.td}>
                          <button style={{...s.btnPrimary, padding:'6px 14px', fontSize:13, opacity: newProduct.name && !savingProduct ? 1 : 0.5}}
                            disabled={!newProduct.name || savingProduct} onClick={addProduct}>
                            {savingProduct ? '...' : 'Crear'}
                          </button>
                        </td>
                        <td style={s.td}></td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={8} style={{padding:'10px 6px'}}>
                        <button style={{...s.editBtn, width:'100%', textAlign:'center', padding:'8px'}}
                          onClick={() => { setShowAddForm(v => !v); setNewProduct(EMPTY_PRODUCT); }}>
                          {showAddForm ? '✕ Cancelar' : '+ Agregar producto'}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── PRECIOS ESCALONADOS ── */}
            <div style={s.card}>
              <h2 style={s.sectionTitle}>Escalas de precio por localidad</h2>
              {localities.filter(l => l.active).length === 0 ? (
                <p style={s.emptyMsg}>No hay localidades activas.</p>
              ) : products.filter(p => p.active).length === 0 ? (
                <p style={s.emptyMsg}>No hay productos activos.</p>
              ) : (
                <div style={{display:'flex', flexWrap:'wrap', gap:14, alignItems:'flex-start'}}>
                  {products.filter(p => p.active).map(product => {
                    const productTiers = priceTiers.filter(t => t.product_id === product.id);
                    const activeLocalities = localities.filter(l => l.active);
                    return (
                      <div key={product.id} style={{border:'1.5px solid #dde1ef', borderRadius:8, overflow:'hidden', flex:'1 1 220px', minWidth:200}}>
                        <div style={{background:'#1B2F5E', color:'white', padding:'5px 10px', fontSize:12, fontWeight:700, letterSpacing:0.5}}>
                          {product.name}
                        </div>
                        {activeLocalities.map((locality, li) => {
                          const key = `${product.id}_${locality.id}`;
                          const tiers = productTiers.filter(t => t.locality_id === locality.id).sort((a,b) => Number(a.min_quantity) - Number(b.min_quantity));
                          const nt = newTiers[key] || { min_quantity: '', price_per_unit: '' };
                          const isAdding = addingTier === key;
                          return (
                            <div key={locality.id} style={{borderTop: li > 0 ? '1.5px solid #eef0f6' : 'none'}}>
                              <div style={{padding:'4px 8px', background:'#f7f8fc', fontSize:11, fontWeight:700, color:'#5a6380', letterSpacing:0.3, textTransform:'uppercase'}}>
                                {locality.name}
                              </div>
                              <table style={{width:'100%', borderCollapse:'collapse'}}>
                                <thead>
                                  <tr>
                                    <th style={{...s.th, padding:'3px 8px', fontSize:10}}>Cant. mín.</th>
                                    <th style={{...s.th, padding:'3px 8px', fontSize:10}}>Precio/u</th>
                                    <th style={{...s.th, padding:'3px 4px', width:24}}></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {tiers.length === 0 && !isAdding && (
                                    <tr><td colSpan={3} style={{...s.td, color:'#9aa3bc', fontSize:11, fontStyle:'italic', textAlign:'center', padding:'4px 8px'}}>Sin escalas</td></tr>
                                  )}
                                  {tiers.map(t => {
                                    const ef = editingTiers[t.id] || { min_quantity: t.min_quantity, price_per_unit: t.price_per_unit };
                                    return (
                                      <tr key={t.id} style={{borderTop:'1px solid #f0f2f8'}}>
                                        <td style={{...s.td, padding:'3px 8px'}}>
                                          <input style={{...s.tblInput, width:68, padding:'2px 5px', fontSize:12}} type="number" min="1"
                                            value={ef.min_quantity}
                                            onChange={e => updateTierForm(t.id, 'min_quantity', e.target.value)}
                                            onBlur={() => saveTierAuto(t.id)} />
                                        </td>
                                        <td style={{...s.td, padding:'3px 8px'}}>
                                          <div style={{display:'flex', alignItems:'center', gap:2}}>
                                            <span style={{fontSize:11, color:'#9aa3bc'}}>$</span>
                                            <input style={{...s.tblInput, width:68, padding:'2px 5px', fontSize:12}} type="number" min="0"
                                              value={ef.price_per_unit}
                                              onChange={e => updateTierForm(t.id, 'price_per_unit', e.target.value)}
                                              onBlur={() => saveTierAuto(t.id)} />
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
                                      <td style={{...s.td, padding:'3px 8px'}}>
                                        <input style={{...s.tblInput, width:68, padding:'2px 5px', fontSize:12}} type="number" min="1" placeholder="≥qty"
                                          value={nt.min_quantity}
                                          onChange={e => setNewTiers(prev => ({...prev, [key]: {...nt, min_quantity: e.target.value}}))} />
                                      </td>
                                      <td style={{...s.td, padding:'3px 8px'}}>
                                        <div style={{display:'flex', alignItems:'center', gap:2}}>
                                          <span style={{fontSize:11, color:'#9aa3bc'}}>$</span>
                                          <input style={{...s.tblInput, width:68, padding:'2px 5px', fontSize:12}} type="number" min="0" placeholder="$/u"
                                            value={nt.price_per_unit}
                                            onChange={e => setNewTiers(prev => ({...prev, [key]: {...nt, price_per_unit: e.target.value}}))} />
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
                                {isAdding ? (
                                  <button style={{background:'none', border:'none', cursor:'pointer', color:'#9aa3bc', fontSize:11, padding:0}} onClick={() => setAddingTier(null)}>✕ Cancelar</button>
                                ) : (
                                  <button style={{...s.editBtn, padding:'2px 8px', fontSize:11, width:'100%', textAlign:'center'}} onClick={() => setAddingTier(key)}>+ Agregar escala</button>
                                )}
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

        {/* ══ TAB: DISEÑOS ══ */}
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
                            <input style={{...s.input, borderColor: hasError ? '#dc2626' : '#dde1ef'}}
                              value={entry.name} onChange={e => updateEntry(i, 'name', e.target.value)} placeholder="Nombre del diseño" />
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
                  <button style={{...s.btnPrimary, marginTop: 16, opacity: canSubmit && !uploading ? 1 : 0.5}}
                    disabled={!canSubmit || uploading} onClick={addDesigns}>
                    {uploading ? 'Subiendo...' : `Agregar ${pendingFiles.length} diseño${pendingFiles.length !== 1 ? 's' : ''}`}
                  </button>
                </>
              )}
            </div>
            <div style={s.card}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 20}}>
                <h2 style={{...s.sectionTitle, marginBottom: 0}}>Diseños actuales ({designs.length})</h2>
                {orphanCount > 0 && (
                  <button style={{...s.btnWarning, opacity: migrating ? 0.5 : 1}} disabled={migrating} onClick={migrateOrphans}>
                    {migrating ? 'Migrando...' : `Migrar ${orphanCount} sin producto →`}
                  </button>
                )}
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
                    <button style={s.iconBtn} onClick={() => toggleDesign(d.id, d.active)}>
                      {d.active ? <EyeOpen /> : <EyeOff />}
                    </button>
                    <TrashBtn onClick={() => deleteDesign(d.id)} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ══ TAB: LOCALIDADES ══ */}
        {activeTab === 'localities' && (
          <>
            <div style={s.card}>
              <h2 style={s.sectionTitle}>Nueva localidad</h2>
              <div style={s.formGroup}>
                <label style={s.label}>Nombre *</label>
                <input style={s.input} value={newLocality.name} onChange={e => setNewLocality(l => ({...l, name: e.target.value}))} placeholder="ej: Posadas" />
              </div>
              <button style={{...s.btnPrimary, opacity: newLocality.name && !savingLocality ? 1 : 0.5}}
                disabled={!newLocality.name || savingLocality} onClick={addLocality}>
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
                    <button style={s.iconBtn} onClick={() => toggleLocality(l.id, l.active)}>
                      {l.active ? <EyeOpen /> : <EyeOff />}
                    </button>
                    <TrashBtn onClick={() => deleteLocality(l.id)} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ══ TAB: USUARIOS ══ */}
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
                <div style={s.userLocality}>
                  <select style={{...s.input, width: 180, fontSize: 13, padding: '6px 10px'}}
                    value={u.locality_id || ''} onChange={e => updateUserLocality(u.id, e.target.value)}>
                    <option value="">Sin localidad</option>
                    {localities.filter(l => l.active).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══ TAB: ADMINS ══ */}
        {activeTab === 'admins' && (
          <div style={s.card}>
            <h2 style={s.sectionTitle}>Administradores</h2>
            <div style={{display:'flex', gap:8, marginBottom:16}}>
              <input style={{...s.input, flex:1}} value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)}
                placeholder="Email del nuevo admin" onKeyDown={e => e.key === 'Enter' && addAdmin()} />
              <button style={{...s.btnPrimary, opacity: newAdminEmail && !addingAdmin ? 1 : 0.5}}
                disabled={!newAdminEmail || addingAdmin} onClick={addAdmin}>
                {addingAdmin ? '...' : 'Agregar'}
              </button>
            </div>
            {admins.length === 0 && <p style={s.emptyMsg}>No hay admins configurados.</p>}
            {admins.map(a => (
              <div key={a.email} style={s.productRow}>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <div style={s.productName}>{a.email}</div>
                  {a.email === currentUserEmail && <span style={{background:'#e8eef9', color:'#2D6BE4', borderRadius:4, padding:'1px 6px', fontSize:10, fontWeight:700}}>vos</span>}
                </div>
                <TrashBtn onClick={() => deleteAdmin(a.email)} />
              </div>
            ))}
          </div>
        )}

      </div>

      <footer style={s.footer}>INKORA® Admin</footer>

      {/* ── MODAL CONFIRMACIÓN ── */}
      {confirmModal.open && (
        <div style={{position:'fixed', inset:0, background:'rgba(17,32,64,0.55)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20}}>
          <div style={{background:'white', borderRadius:16, border:'1.5px solid #dde1ef', boxShadow:'0 8px 40px rgba(27,47,94,0.18)', padding:'28px 28px 24px', width:'100%', maxWidth:380, display:'flex', flexDirection:'column', gap:16}}>
            <div style={{fontSize:16, fontWeight:700, color:'#1B2F5E'}}>¿Confirmar eliminación?</div>
            <div style={{fontSize:13, color:'#5a6380', lineHeight:1.5}}>{confirmModal.message}</div>
            <div style={{display:'flex', gap:10, justifyContent:'flex-end', marginTop:4}}>
              <button style={{background:'white', border:'1.5px solid #dde1ef', color:'#5a6380', borderRadius:10, padding:'8px 20px', fontSize:13, fontWeight:600, cursor:'pointer'}} onClick={closeConfirm}>Cancelar</button>
              <button style={{background:'linear-gradient(135deg, #e53e3e, #c53030)', color:'white', border:'none', borderRadius:10, padding:'8px 20px', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(229,62,62,0.4)'}}
                onClick={() => { confirmModal.onConfirm(); closeConfirm(); }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  loginWrap: { minHeight: '100vh', background: '#f7f8fc', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  loginBox: { background: 'white', borderRadius: 12, padding: 28, width: 340, boxShadow: '0 4px 24px rgba(27,47,94,0.12)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  loginTitle: { fontSize: 17, fontWeight: 700, color: '#1B2F5E', marginBottom: 6 },
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
  userLocality: { flexShrink: 0 },
  formRow2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 0 },
};
