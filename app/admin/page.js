'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const CATEGORIES = ['deportes', 'animales', 'vehiculos', 'otros'];
const EMPTY_PRODUCT = { name: '', slug: '', columns_desktop: 5, columns_mobile: 2, aspect_ratio: '2/3', max_file_size_kb: 250 };

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

export default function Admin() {
  const [auth, setAuth] = useState(false);
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState('products');

  // Products
  const [products, setProducts] = useState([]);
  const [newProduct, setNewProduct] = useState(EMPTY_PRODUCT);
  const [savingProduct, setSavingProduct] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [editForm, setEditForm] = useState({});

  // Designs
  const [designs, setDesigns] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [orphanCount, setOrphanCount] = useState(0);
  const [migrating, setMigrating] = useState(false);

  // Localities
  const [localities, setLocalities] = useState([]);
  const [newLocality, setNewLocality] = useState({ name: '', price_per_unit: 500 });
  const [savingLocality, setSavingLocality] = useState(false);

  // Users
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => { if (auth) { loadProducts(); loadDesigns(); loadLocalities(); loadUsers(); } }, [auth]);
  useEffect(() => { return () => pendingFiles.forEach(f => URL.revokeObjectURL(f.preview)); }, [pendingFiles]);

  async function loadProducts() {
    const { data } = await supabase.from('products').select('*').eq('active', true).order('created_at');
    if (data) setProducts(data);
  }

  async function loadDesigns() {
    const { data } = await supabase
      .from('designs').select('*, products(name)').eq('active', true).order('created_at');
    if (data) {
      setDesigns(data);
      setOrphanCount(data.filter(d => !d.product_id).length);
    }
  }

  async function addProduct() {
    if (!newProduct.name.trim() || !newProduct.slug.trim()) return;
    setSavingProduct(true);
    await supabase.from('products').insert({ ...newProduct, active: true });
    setNewProduct(EMPTY_PRODUCT);
    setSavingProduct(false);
    loadProducts();
  }

  function startEdit(product) {
    setEditingProductId(product.id);
    setEditForm({
      name: product.name,
      columns_desktop: product.columns_desktop,
      columns_mobile: product.columns_mobile,
      aspect_ratio: product.aspect_ratio,
      max_file_size_kb: product.max_file_size_kb,
    });
  }

  async function saveEdit(id) {
    await supabase.from('products').update(editForm).eq('id', id);
    setEditingProductId(null);
    loadProducts();
  }

  async function deleteProduct(id) {
    if (!window.confirm('¿Eliminar este producto? Los diseños asociados quedarán sin producto asignado.')) return;
    await supabase.from('products').update({ active: false }).eq('id', id);
    loadProducts();
  }

  async function deleteDesign(id) {
    await supabase.from('designs').update({ active: false }).eq('id', id);
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
      file,
      preview: URL.createObjectURL(file),
      name: file.name.replace(/\.[^.]+$/, ''),
      category: 'deportes',
      nameExists: false,
      sizeError: file.size > maxSizeKb * 1024,
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
    setNewLocality({ name: '', price_per_unit: 500 });
    setSavingLocality(false);
    loadLocalities();
  }

  async function toggleLocality(id, active) {
    await supabase.from('localities').update({ active: !active }).eq('id', id);
    loadLocalities();
  }

  async function updateUserLocality(userId, localityId) {
    await supabase.rpc('admin_update_user_locality', {
      p_user_id: userId,
      p_locality_id: localityId || null,
    });
    loadUsers();
  }

  const hasDupInBatch = (index, name) =>
    name.length > 0 && pendingFiles.some((f, i) => i !== index && f.name.toLowerCase() === name.toLowerCase());

  const canSubmit = selectedProductId && pendingFiles.length > 0 &&
    pendingFiles.every(f => f.name.trim().length > 0 && !f.nameExists && !f.sizeError) &&
    !pendingFiles.some((f, i) => hasDupInBatch(i, f.name));

  const s = styles;

  if (!auth) return (
    <div style={s.loginWrap}>
      <div style={s.loginBox}>
        <img src="https://ylawwaoznxzxwetlkjel.supabase.co/storage/v1/object/public/assets/Logo%20nuevo.png" alt="INKORA" style={{height:50, marginBottom:24}} />
        <h2 style={s.loginTitle}>Panel de Administración</h2>
        <input style={s.input} type="password" placeholder="Contraseña" value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if(e.key === 'Enter' && password === 'inkora2026') setAuth(true); }} />
        <button style={s.btnPrimary} onClick={() => { if (password === 'inkora2026') setAuth(true); else alert('Contraseña incorrecta'); }}>Ingresar</button>
      </div>
    </div>
  );

  return (
    <div style={s.wrap}>
      <header style={s.header}>
        <img src="https://ylawwaoznxzxwetlkjel.supabase.co/storage/v1/object/public/assets/Logo%20nuevo.png" alt="INKORA" style={{height:36, filter:'brightness(0) invert(1)'}} />
        <span style={s.headerTitle}>Panel de Administración</span>
        <button style={s.btnLogout} onClick={() => { setAuth(false); setPassword(''); }}>Cerrar sesión</button>
      </header>

      {/* ── TABS ── */}
      <div style={s.tabBar}>
        <div style={s.tabBarInner}>
          <button style={{...s.tab, ...(activeTab === 'products' ? s.tabActive : {})}} onClick={() => setActiveTab('products')}>
            Productos
          </button>
          <button style={{...s.tab, ...(activeTab === 'designs' ? s.tabActive : {})}} onClick={() => setActiveTab('designs')}>
            Diseños {orphanCount > 0 && <span style={s.orphanBadge}>{orphanCount}</span>}
          </button>
          <button style={{...s.tab, ...(activeTab === 'localities' ? s.tabActive : {})}} onClick={() => setActiveTab('localities')}>
            Localidades
          </button>
          <button style={{...s.tab, ...(activeTab === 'users' ? s.tabActive : {})}} onClick={() => setActiveTab('users')}>
            Usuarios {users.length > 0 && <span style={s.userBadge}>{users.length}</span>}
          </button>
        </div>
      </div>

      <div style={s.content}>

        {/* ══ TAB: PRODUCTOS ══ */}
        {activeTab === 'products' && (
          <>
            <div style={s.card}>
              <h2 style={s.sectionTitle}>Productos actuales</h2>

              {products.length === 0 && (
                <p style={s.emptyMsg}>No hay productos todavía.</p>
              )}

              {products.map(p => (
                <div key={p.id}>
                  {editingProductId === p.id ? (
                    /* ── EDIT FORM ── */
                    <div style={s.editRow}>
                      <div style={s.formRow2}>
                        <div style={s.formGroup}>
                          <label style={s.label}>Nombre</label>
                          <input style={s.input} value={editForm.name}
                            onChange={e => setEditForm(f => ({...f, name: e.target.value}))} />
                        </div>
                        <div style={s.formGroup}>
                          <label style={s.label}>Proporción</label>
                          <input style={s.input} value={editForm.aspect_ratio}
                            onChange={e => setEditForm(f => ({...f, aspect_ratio: e.target.value}))} placeholder="2/3" />
                        </div>
                      </div>
                      <div style={s.formRow3}>
                        <div style={s.formGroup}>
                          <label style={s.label}>Columnas PC</label>
                          <input style={s.input} type="number" min="1" max="10" value={editForm.columns_desktop}
                            onChange={e => setEditForm(f => ({...f, columns_desktop: parseInt(e.target.value) || 1}))} />
                        </div>
                        <div style={s.formGroup}>
                          <label style={s.label}>Columnas celular</label>
                          <input style={s.input} type="number" min="1" max="4" value={editForm.columns_mobile}
                            onChange={e => setEditForm(f => ({...f, columns_mobile: parseInt(e.target.value) || 1}))} />
                        </div>
                        <div style={s.formGroup}>
                          <label style={s.label}>Tamaño máx (KB)</label>
                          <input style={s.input} type="number" min="50" value={editForm.max_file_size_kb}
                            onChange={e => setEditForm(f => ({...f, max_file_size_kb: parseInt(e.target.value) || 250}))} />
                        </div>
                      </div>
                      <div style={{display:'flex', gap:8}}>
                        <button style={s.btnPrimary} onClick={() => saveEdit(p.id)}>Guardar</button>
                        <button style={s.btnSecondarySmall} onClick={() => setEditingProductId(null)}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    /* ── PRODUCT ROW ── */
                    <div style={s.productRow}>
                      <div>
                        <div style={s.productName}>{p.name} <span style={s.productSlug}>/{p.slug}</span></div>
                        <div style={s.productMeta}>
                          {p.columns_desktop} cols desktop · {p.columns_mobile} cols móvil · {p.aspect_ratio} · máx {p.max_file_size_kb}kb
                        </div>
                      </div>
                      <div style={{display:'flex', gap:8}}>
                        <button style={s.editBtn} onClick={() => startEdit(p)}>Editar</button>
                        <button style={s.deleteBtn} onClick={() => deleteProduct(p.id)}>Eliminar</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={s.card}>
              <h2 style={s.sectionTitle}>Nuevo producto</h2>
              <div style={s.formRow2}>
                <div style={s.formGroup}>
                  <label style={s.label}>Nombre *</label>
                  <input style={s.input} value={newProduct.name}
                    onChange={e => { const name = e.target.value; setNewProduct(p => ({...p, name, slug: slugify(name)})); }}
                    placeholder="ej: Calcos" />
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>Slug *</label>
                  <input style={s.input} value={newProduct.slug}
                    onChange={e => setNewProduct(p => ({...p, slug: e.target.value}))} placeholder="ej: calcos" />
                </div>
              </div>
              <div style={s.formRow4}>
                <div style={s.formGroup}>
                  <label style={s.label}>Columnas PC</label>
                  <input style={s.input} type="number" min="1" max="10" value={newProduct.columns_desktop}
                    onChange={e => setNewProduct(p => ({...p, columns_desktop: parseInt(e.target.value) || 1}))} />
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>Columnas celular</label>
                  <input style={s.input} type="number" min="1" max="4" value={newProduct.columns_mobile}
                    onChange={e => setNewProduct(p => ({...p, columns_mobile: parseInt(e.target.value) || 1}))} />
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>Proporción</label>
                  <input style={s.input} value={newProduct.aspect_ratio}
                    onChange={e => setNewProduct(p => ({...p, aspect_ratio: e.target.value}))} placeholder="2/3" />
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>Tamaño máx (KB)</label>
                  <input style={s.input} type="number" min="50" value={newProduct.max_file_size_kb}
                    onChange={e => setNewProduct(p => ({...p, max_file_size_kb: parseInt(e.target.value) || 250}))} />
                </div>
              </div>
              <button style={{...s.btnPrimary, opacity: newProduct.name && newProduct.slug && !savingProduct ? 1 : 0.5}}
                disabled={!newProduct.name || !newProduct.slug || savingProduct} onClick={addProduct}>
                {savingProduct ? 'Guardando...' : 'Crear producto'}
              </button>
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
                <select style={s.input} value={selectedProductId}
                  onChange={e => { setSelectedProductId(e.target.value); setPendingFiles([]); }}>
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
                          <select style={{...s.input, width: 140, flexShrink: 0}} value={entry.category}
                            onChange={e => updateEntry(i, 'category', e.target.value)}>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                          </select>
                          <button style={s.removePendingBtn} onClick={() => removePending(i)}>✕</button>
                        </div>
                      );
                    })}
                  </div>
                  <button style={{...s.btnPrimary, marginTop: 16, opacity: canSubmit && !uploading ? 1 : 0.5, cursor: canSubmit && !uploading ? 'pointer' : 'not-allowed'}}
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
                <div key={d.id} style={s.designRow}>
                  <div style={s.designInfo}>
                    {d.image_url && <img src={d.image_url} alt={d.name} style={s.designThumb} />}
                    <div>
                      <div style={s.designName}>{d.name}</div>
                      <div style={s.designCat}>
                        {d.products?.name
                          ? <span style={s.productTag}>{d.products.name}</span>
                          : <span style={s.orphanTag}>Sin producto</span>}
                        {' '}{d.category}
                      </div>
                    </div>
                  </div>
                  <button style={s.deleteBtn} onClick={() => deleteDesign(d.id)}>Eliminar</button>
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
              <div style={s.formRow2}>
                <div style={s.formGroup}>
                  <label style={s.label}>Nombre *</label>
                  <input style={s.input} value={newLocality.name}
                    onChange={e => setNewLocality(l => ({...l, name: e.target.value}))}
                    placeholder="ej: Posadas" />
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>Precio por unidad ($)</label>
                  <input style={s.input} type="number" min="0" value={newLocality.price_per_unit}
                    onChange={e => setNewLocality(l => ({...l, price_per_unit: parseInt(e.target.value) || 0}))} />
                </div>
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
                  <div>
                    <div style={s.productName}>{l.name}</div>
                    <div style={s.productMeta}>${l.price_per_unit.toLocaleString()} por unidad</div>
                  </div>
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    <span style={{...s.localityStatus, background: l.active ? '#dcfce7' : '#fee2e2', color: l.active ? '#16a34a' : '#dc2626'}}>
                      {l.active ? 'Activa' : 'Inactiva'}
                    </span>
                    <button style={s.editBtn} onClick={() => toggleLocality(l.id, l.active)}>
                      {l.active ? 'Desactivar' : 'Activar'}
                    </button>
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
                  <select
                    style={{...s.input, width: 180, fontSize: 13, padding: '6px 10px'}}
                    value={u.locality_id || ''}
                    onChange={e => updateUserLocality(u.id, e.target.value)}
                  >
                    <option value="">Sin localidad</option>
                    {localities.filter(l => l.active).map(l => (
                      <option key={l.id} value={l.id}>{l.name} (${l.price_per_unit})</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
      <footer style={s.footer}>INKORA® Admin</footer>
    </div>
  );
}

const styles = {
  loginWrap: { minHeight: '100vh', background: '#f7f8fc', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  loginBox: { background: 'white', borderRadius: 16, padding: 40, width: 360, boxShadow: '0 4px 24px rgba(27,47,94,0.12)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  loginTitle: { fontSize: 20, fontWeight: 700, color: '#1B2F5E', marginBottom: 8 },
  wrap: { minHeight: '100vh', background: '#f7f8fc', fontFamily: "'Barlow', sans-serif" },
  header: { background: '#1B2F5E', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', gap: 16 },
  headerTitle: { color: 'rgba(255,255,255,0.6)', fontSize: 13, letterSpacing: 2, flex: 1 },
  btnLogout: { background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' },
  tabBar: { background: 'white', borderBottom: '1.5px solid #dde1ef' },
  tabBarInner: { maxWidth: 800, margin: '0 auto', padding: '0 24px', display: 'flex', gap: 0 },
  tab: { background: 'none', border: 'none', padding: '16px 24px', fontSize: 14, fontWeight: 600, color: '#9aa3bc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 },
  tabActive: { color: '#1B2F5E', boxShadow: 'inset 0 -3px 0 #1B2F5E' },
  orphanBadge: { background: '#fee2e2', color: '#dc2626', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 },
  content: { maxWidth: 800, margin: '32px auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 24 },
  card: { background: 'white', borderRadius: 14, padding: 28, border: '1.5px solid #dde1ef' },
  sectionTitle: { fontSize: 18, fontWeight: 700, color: '#1B2F5E', marginBottom: 20 },
  emptyMsg: { color: '#9aa3bc', fontSize: 14, marginBottom: 0 },
  formRow2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 0 },
  formRow3: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 0 },
  formRow4: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 0 },
  formGroup: { marginBottom: 16 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: { width: '100%', border: '1.5px solid #dde1ef', borderRadius: 8, padding: '10px 12px', fontFamily: 'Barlow, sans-serif', fontSize: 14, color: '#2d3352', boxSizing: 'border-box' },
  errorMsg: { fontSize: 11, color: '#dc2626', marginTop: 4 },
  editRow: { background: '#f7f8fc', borderRadius: 10, padding: 16, marginBottom: 8, border: '1.5px solid #dde1ef' },
  productRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #eef0f6' },
  productName: { fontSize: 15, fontWeight: 700, color: '#2d3352', marginBottom: 3 },
  productSlug: { fontSize: 12, fontWeight: 400, color: '#9aa3bc' },
  productMeta: { fontSize: 12, color: '#9aa3bc' },
  fileList: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 4 },
  fileRow: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px', background: '#f7f8fc', borderRadius: 10, border: '1.5px solid #dde1ef' },
  fileThumb: { width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid #dde1ef', flexShrink: 0 },
  fileFields: { flex: 1, minWidth: 0 },
  removePendingBtn: { background: 'none', border: 'none', color: '#9aa3bc', fontSize: 16, cursor: 'pointer', padding: '0 4px', flexShrink: 0, lineHeight: 1, marginTop: 10 },
  btnPrimary: { background: '#1B2F5E', color: 'white', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  btnSecondarySmall: { background: 'white', color: '#5a6380', border: '1.5px solid #dde1ef', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  btnWarning: { background: '#fff8e1', color: '#7a5800', border: '1.5px solid #f6c200', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  editBtn: { background: '#e8eef9', color: '#2D6BE4', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  designRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #eef0f6' },
  designInfo: { display: 'flex', alignItems: 'center', gap: 12 },
  designThumb: { width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '1px solid #dde1ef' },
  designName: { fontSize: 14, fontWeight: 600, color: '#2d3352' },
  designCat: { fontSize: 12, color: '#9aa3bc', textTransform: 'uppercase', marginTop: 2 },
  productTag: { background: '#e8eef9', color: '#2D6BE4', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600, marginRight: 4 },
  orphanTag: { background: '#fee2e2', color: '#dc2626', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600, marginRight: 4 },
  deleteBtn: { background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 },
  footer: { textAlign: 'center', padding: '16px', fontSize: 10, color: 'rgba(0,0,0,0.15)', letterSpacing: 1 },
  userBadge: { background: '#e8eef9', color: '#2D6BE4', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 },
  localityStatus: { borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600 },
  userRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #eef0f6', gap: 12 },
  userInfo: { flex: 1, minWidth: 0 },
  userLocality: { flexShrink: 0 },
};
