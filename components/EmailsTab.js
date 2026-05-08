'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── Variables disponibles ─────────────────────────────────────────────────
const VARIABLES = [
  { v: '{{orderCode}}', desc: 'Código del pedido' },
  { v: '{{customerName}}', desc: 'Nombre del cliente' },
  { v: '{{customerEmail}}', desc: 'Email del cliente' },
  { v: '{{customerPhone}}', desc: 'Teléfono' },
  { v: '{{sellerName}}', desc: 'Vendedor' },
  { v: '{{notes}}', desc: 'Notas' },
  { v: '{{fecha}}', desc: 'Fecha y hora' },
  { v: '{{itemsTable}}', desc: 'Tabla de productos' },
  { v: '{{totalSection}}', desc: 'Sección de total' },
];

// ─── Bloques por defecto ───────────────────────────────────────────────────
let _uid = 1;
function uid() { return String(_uid++); }

const DEFAULT_ADMIN_BLOCKS = () => [
  { id: uid(), type: 'header', props: { text: 'Nuevo pedido INKORA', bgColor: '#1B2F5E', textColor: '#ffffff', fontSize: 18 } },
  { id: uid(), type: 'info_box', props: { bgColor: '#f8faff', rows: [
    { label: 'Código', value: '{{orderCode}}' },
    { label: 'Cliente', value: '{{customerName}}' },
    { label: 'Teléfono', value: '{{customerPhone}}' },
    { label: 'Email', value: '{{customerEmail}}' },
    { label: 'Vendedor', value: '{{sellerName}}' },
    { label: 'Notas', value: '{{notes}}' },
    { label: 'Fecha', value: '{{fecha}}' },
  ]}},
  { id: uid(), type: 'items_table', props: {} },
  { id: uid(), type: 'total_section', props: {} },
];

const DEFAULT_CLIENT_BLOCKS = () => [
  { id: uid(), type: 'header', props: { text: '¡Recibimos tu pedido!', bgColor: '#1B2F5E', textColor: '#ffffff', fontSize: 18 } },
  { id: uid(), type: 'info_box', props: { bgColor: '#f8faff', rows: [
    { label: 'Hola', value: '{{customerName}}, tu pedido fue registrado correctamente.' },
    { label: 'Código', value: '{{orderCode}}' },
    { label: 'Notas', value: '{{notes}}' },
  ]}},
  { id: uid(), type: 'items_table', props: {} },
  { id: uid(), type: 'total_section', props: {} },
  { id: uid(), type: 'text', props: { text: 'Nos pondremos en contacto a la brevedad para confirmar tu pedido.', color: '#5a6380', fontSize: 13, align: 'center' } },
];

// ─── HTML generators ───────────────────────────────────────────────────────
function blockToHtml(block) {
  const p = block.props;
  switch (block.type) {
    case 'header':
      return `<div style="background:${p.bgColor};padding:20px 24px;border-radius:8px 8px 0 0"><h2 style="color:${p.textColor};margin:0;font-size:${p.fontSize}px">${p.text}</h2></div>`;
    case 'info_box': {
      const rows = (p.rows || []).map(r =>
        `<p style="margin:0 0 6px"><strong>${r.label}:</strong> ${r.value}</p>`).join('');
      return `<div style="background:${p.bgColor || '#f8faff'};padding:20px 24px;border:1px solid #dde1ef;border-top:none">${rows}</div>`;
    }
    case 'text':
      return `<p style="margin:12px 0;color:${p.color};font-size:${p.fontSize}px;text-align:${p.align}">${p.text}</p>`;
    case 'divider':
      return `<div style="border-top:1px solid ${p.color || '#dde1ef'};margin:${p.margin || 12}px 0"></div>`;
    case 'spacer':
      return `<div style="height:${p.height || 16}px"></div>`;
    case 'button':
      return `<div style="text-align:${p.align || 'center'};margin:16px 0"><a href="#" style="display:inline-block;background:${p.bgColor};color:${p.textColor};text-decoration:none;border-radius:8px;padding:10px 24px;font-weight:700;font-size:14px">${p.text}</a></div>`;
    case 'items_table':
      return '{{itemsTable}}';
    case 'total_section':
      return '{{totalSection}}';
    default: return '';
  }
}

function blocksToHtml(blocks) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2d3352">\n${blocks.map(blockToHtml).join('\n')}\n</div>`;
}

// ─── Preview con datos de ejemplo ──────────────────────────────────────────
const SAMPLE_TABLE = `<table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #dde1ef;border-radius:8px;overflow:hidden;margin-top:16px"><thead><tr style="background:#1B2F5E;color:white;font-size:13px"><th style="padding:7px 10px;text-align:left">Producto</th><th style="padding:7px 10px;text-align:left">Diseño</th><th style="padding:7px 10px;text-align:center">Cantidad</th></tr></thead><tbody><tr><td style="padding:5px 10px;border-bottom:1px solid #eef0f6">Llavero</td><td style="padding:5px 10px;border-bottom:1px solid #eef0f6">Diseño A</td><td style="padding:5px 10px;border-bottom:1px solid #eef0f6;text-align:center">10</td></tr></tbody><tfoot><tr style="background:#f8faff"><td colspan="2" style="padding:6px 10px;font-weight:700;font-size:12px;border-top:2px solid #1B2F5E">Llavero</td><td style="padding:6px 10px;font-weight:700;font-size:12px;border-top:2px solid #1B2F5E;text-align:center">10</td></tr></tfoot></table>`;
const SAMPLE_TOTAL = `<div style="padding:12px 16px;background:#e8f0fe;border:1px solid #dde1ef;border-top:none;border-radius:0 0 8px 8px;text-align:right;font-weight:700;font-size:15px;color:#1B2F5E">Total: $15.000</div>`;

function buildPreviewHtml(html) {
  return html
    .replace(/\{\{orderCode\}\}/g, 'INK-2025-001')
    .replace(/\{\{customerName\}\}/g, 'Juan Pérez')
    .replace(/\{\{customerEmail\}\}/g, 'juan@email.com')
    .replace(/\{\{customerPhone\}\}/g, '3765 123456')
    .replace(/\{\{sellerName\}\}/g, 'Vendedor Ejemplo')
    .replace(/\{\{notes\}\}/g, 'Entrega urgente')
    .replace(/\{\{fecha\}\}/g, '07/05/2025 14:30')
    .replace(/\{\{itemsTable\}\}/g, SAMPLE_TABLE)
    .replace(/\{\{totalSection\}\}/g, SAMPLE_TOTAL);
}

// ─── Templates config ──────────────────────────────────────────────────────
const TEMPLATES = [
  { key: 'email_template_admin', blocksKey: 'email_blocks_admin', subjectKey: 'email_subject_admin', label: 'Notificación al admin', desc: 'Se manda internamente cuando entra un pedido nuevo.', defaultBlocks: DEFAULT_ADMIN_BLOCKS, defaultSubject: 'Nuevo pedido {{orderCode}} — {{customerName}}' },
  { key: 'email_template_client', blocksKey: 'email_blocks_client', subjectKey: 'email_subject_client', label: 'Confirmación al cliente', desc: 'Se manda al cliente cuando confirma su pedido.', defaultBlocks: DEFAULT_CLIENT_BLOCKS, defaultSubject: 'Tu pedido {{orderCode}} — INKORA' },
];

const BLOCK_PALETTE = [
  { type: 'header', label: 'Encabezado', icon: '■' },
  { type: 'info_box', label: 'Caja info', icon: '☰' },
  { type: 'text', label: 'Texto', icon: 'T' },
  { type: 'button', label: 'Botón', icon: '◉' },
  { type: 'divider', label: 'Separador', icon: '—' },
  { type: 'spacer', label: 'Espacio', icon: '↕' },
  { type: 'items_table', label: 'Tabla items', icon: '⊞' },
  { type: 'total_section', label: 'Total', icon: '$' },
];

const BLOCK_DEFAULT_PROPS = {
  header: { text: 'Encabezado', bgColor: '#1B2F5E', textColor: '#ffffff', fontSize: 18 },
  info_box: { bgColor: '#f8faff', rows: [{ label: 'Campo', value: '{{orderCode}}' }] },
  text: { text: 'Escribe tu texto aquí...', color: '#2d3352', fontSize: 13, align: 'left' },
  button: { text: 'Botón', bgColor: '#1B2F5E', textColor: '#ffffff', align: 'center' },
  divider: { color: '#dde1ef', margin: 12 },
  spacer: { height: 16 },
  items_table: {},
  total_section: {},
};

// ─── Props editors ─────────────────────────────────────────────────────────
function PropHeader({ block, onChange }) {
  const p = block.props;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row label="Texto"><input style={iStyle} value={p.text} onChange={e => onChange({ text: e.target.value })} /></Row>
      <Row label="Fondo"><input type="color" value={p.bgColor} onChange={e => onChange({ bgColor: e.target.value })} style={{ width: 40, height: 28, border: 'none', cursor: 'pointer', padding: 0 }} /></Row>
      <Row label="Color texto"><input type="color" value={p.textColor} onChange={e => onChange({ textColor: e.target.value })} style={{ width: 40, height: 28, border: 'none', cursor: 'pointer', padding: 0 }} /></Row>
      <Row label="Tamaño"><input type="number" style={{ ...iStyle, width: 60 }} value={p.fontSize} min={10} max={32} onChange={e => onChange({ fontSize: Number(e.target.value) })} /></Row>
    </div>
  );
}

function PropInfoBox({ block, onChange }) {
  const p = block.props;
  const rows = p.rows || [];
  function setRow(idx, field, val) {
    const next = rows.map((r, i) => i === idx ? { ...r, [field]: val } : r);
    onChange({ rows: next });
  }
  function addRow() { onChange({ rows: [...rows, { label: 'Campo', value: '' }] }); }
  function removeRow(idx) { onChange({ rows: rows.filter((_, i) => i !== idx) }); }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Row label="Fondo"><input type="color" value={p.bgColor || '#f8faff'} onChange={e => onChange({ bgColor: e.target.value })} style={{ width: 40, height: 28, border: 'none', cursor: 'pointer', padding: 0 }} /></Row>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 }}>Filas</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input style={{ ...iStyle, width: 80, flexShrink: 0 }} value={r.label} placeholder="Label" onChange={e => setRow(i, 'label', e.target.value)} />
          <input style={{ ...iStyle, flex: 1, minWidth: 0 }} value={r.value} placeholder="Valor / variable" onChange={e => setRow(i, 'value', e.target.value)} />
          <button onClick={() => removeRow(i)} style={iconBtnStyle} title="Eliminar fila">✕</button>
        </div>
      ))}
      <button onClick={addRow} style={{ background: '#e8eef9', border: '1px solid #c5d3f0', borderRadius: 5, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: '#2D6BE4', cursor: 'pointer', marginTop: 4, alignSelf: 'flex-start' }}>+ Agregar fila</button>
    </div>
  );
}

function PropText({ block, onChange }) {
  const p = block.props;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row label="Texto"><textarea style={{ ...iStyle, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} value={p.text} onChange={e => onChange({ text: e.target.value })} /></Row>
      <Row label="Color"><input type="color" value={p.color} onChange={e => onChange({ color: e.target.value })} style={{ width: 40, height: 28, border: 'none', cursor: 'pointer', padding: 0 }} /></Row>
      <Row label="Tamaño"><input type="number" style={{ ...iStyle, width: 60 }} value={p.fontSize} min={10} max={24} onChange={e => onChange({ fontSize: Number(e.target.value) })} /></Row>
      <Row label="Alineación">
        <select style={iStyle} value={p.align} onChange={e => onChange({ align: e.target.value })}>
          <option value="left">Izquierda</option>
          <option value="center">Centro</option>
          <option value="right">Derecha</option>
        </select>
      </Row>
    </div>
  );
}

function PropButton({ block, onChange }) {
  const p = block.props;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row label="Texto"><input style={iStyle} value={p.text} onChange={e => onChange({ text: e.target.value })} /></Row>
      <Row label="Fondo"><input type="color" value={p.bgColor} onChange={e => onChange({ bgColor: e.target.value })} style={{ width: 40, height: 28, border: 'none', cursor: 'pointer', padding: 0 }} /></Row>
      <Row label="Color texto"><input type="color" value={p.textColor} onChange={e => onChange({ textColor: e.target.value })} style={{ width: 40, height: 28, border: 'none', cursor: 'pointer', padding: 0 }} /></Row>
      <Row label="Alineación">
        <select style={iStyle} value={p.align} onChange={e => onChange({ align: e.target.value })}>
          <option value="left">Izquierda</option>
          <option value="center">Centro</option>
          <option value="right">Derecha</option>
        </select>
      </Row>
    </div>
  );
}

function PropDivider({ block, onChange }) {
  const p = block.props;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row label="Color"><input type="color" value={p.color || '#dde1ef'} onChange={e => onChange({ color: e.target.value })} style={{ width: 40, height: 28, border: 'none', cursor: 'pointer', padding: 0 }} /></Row>
      <Row label="Margen (px)"><input type="number" style={{ ...iStyle, width: 60 }} value={p.margin || 12} min={0} max={48} onChange={e => onChange({ margin: Number(e.target.value) })} /></Row>
    </div>
  );
}

function PropSpacer({ block, onChange }) {
  const p = block.props;
  return (
    <Row label="Alto (px)"><input type="number" style={{ ...iStyle, width: 60 }} value={p.height || 16} min={4} max={80} onChange={e => onChange({ height: Number(e.target.value) })} /></Row>
  );
}

const PROP_EDITORS = { header: PropHeader, info_box: PropInfoBox, text: PropText, button: PropButton, divider: PropDivider, spacer: PropSpacer };

// ─── Shared mini-components ─────────────────────────────────────────────────
function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span style={{ fontSize: 11, color: '#5a6380', fontWeight: 600, minWidth: 72, paddingTop: 6 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

const iStyle = { border: '1.5px solid #dde1ef', borderRadius: 5, padding: '4px 8px', fontSize: 12, fontFamily: 'Barlow, sans-serif', color: '#2d3352', boxSizing: 'border-box', width: '100%' };
const iconBtnStyle = { background: 'none', border: 'none', color: '#9aa3bc', cursor: 'pointer', fontSize: 12, padding: '2px 5px', flexShrink: 0 };

const BLOCK_LABELS = { header: 'Encabezado', info_box: 'Caja info', text: 'Texto', button: 'Botón', divider: 'Separador', spacer: 'Espacio', items_table: 'Tabla de items', total_section: 'Sección total' };

// ─── Main component ────────────────────────────────────────────────────────
export default function EmailsTab({ supabase }) {
  const [activeKey, setActiveKey] = useState(TEMPLATES[0].key);
  const [editorMode, setEditorMode] = useState('blocks'); // 'blocks' | 'html'
  const [allBlocks, setAllBlocks] = useState({});     // key -> block[]
  const [allHtml, setAllHtml] = useState({});         // key -> string
  const [allSubjects, setAllSubjects] = useState({}); // key -> string
  const [selectedId, setSelectedId] = useState(null);
  const [dirty, setDirty] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedKey, setSavedKey] = useState(null);
  const dragRef = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  const tpl = TEMPLATES.find(t => t.key === activeKey);

  // Load from Supabase
  useEffect(() => {
    async function load() {
      const keys = TEMPLATES.flatMap(t => [t.key, t.blocksKey, t.subjectKey]);
      const { data } = await supabase.from('settings').select('key,value').in('key', keys);
      if (!data) return;
      const map = Object.fromEntries(data.map(r => [r.key, r.value]));
      const initBlocks = {};
      const initHtml = {};
      const initSubjects = {};
      for (const t of TEMPLATES) {
        try { initBlocks[t.key] = map[t.blocksKey] ? JSON.parse(map[t.blocksKey]) : t.defaultBlocks(); } catch { initBlocks[t.key] = t.defaultBlocks(); }
        initHtml[t.key] = map[t.key] || '';
        initSubjects[t.key] = map[t.subjectKey] || t.defaultSubject;
      }
      setAllBlocks(initBlocks);
      setAllHtml(initHtml);
      setAllSubjects(initSubjects);
    }
    load();
  }, [supabase]);

  const blocks = allBlocks[activeKey] || tpl.defaultBlocks();
  const htmlVal = allHtml[activeKey] || blocksToHtml(blocks);
  const subject = allSubjects[activeKey] || tpl.defaultSubject;

  // What HTML to preview: blocks mode → generate from blocks; html mode → use raw textarea
  const previewSource = editorMode === 'blocks' ? blocksToHtml(blocks) : htmlVal;
  const previewHtml = buildPreviewHtml(previewSource);

  function setBlocks(v) { setAllBlocks(p => ({ ...p, [activeKey]: v })); setDirty(p => ({ ...p, [activeKey]: true })); }
  function setHtml(v) { setAllHtml(p => ({ ...p, [activeKey]: v })); setDirty(p => ({ ...p, [activeKey]: true })); }
  function setSubject(v) { setAllSubjects(p => ({ ...p, [activeKey]: v })); setDirty(p => ({ ...p, [activeKey]: true })); }

  function updateBlock(id, newProps) {
    setBlocks(blocks.map(b => b.id === id ? { ...b, props: { ...b.props, ...newProps } } : b));
  }

  function addBlock(type) {
    const nb = { id: uid(), type, props: { ...BLOCK_DEFAULT_PROPS[type] } };
    if (type === 'info_box') nb.props = { ...nb.props, rows: [...nb.props.rows] };
    setBlocks([...blocks, nb]);
    setSelectedId(nb.id);
  }

  function removeBlock(id) { setBlocks(blocks.filter(b => b.id !== id)); if (selectedId === id) setSelectedId(null); }
  function duplicateBlock(id) {
    const idx = blocks.findIndex(b => b.id === id);
    if (idx === -1) return;
    const orig = blocks[idx];
    const copy = { id: uid(), type: orig.type, props: JSON.parse(JSON.stringify(orig.props)) };
    const next = [...blocks];
    next.splice(idx + 1, 0, copy);
    setBlocks(next);
    setSelectedId(copy.id);
  }
  function moveBlock(id, dir) {
    const idx = blocks.findIndex(b => b.id === id);
    if ((dir === -1 && idx === 0) || (dir === 1 && idx === blocks.length - 1)) return;
    const next = [...blocks];
    [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
    setBlocks(next);
  }

  // Drag-and-drop handlers
  function onDragStart(e, id) { dragRef.current = id; e.dataTransfer.effectAllowed = 'move'; }
  function onDragOver(e, id) { e.preventDefault(); setDragOver(id); }
  function onDrop(e, targetId) {
    e.preventDefault();
    const srcId = dragRef.current;
    if (!srcId || srcId === targetId) { setDragOver(null); return; }
    const next = [...blocks];
    const from = next.findIndex(b => b.id === srcId);
    const to = next.findIndex(b => b.id === targetId);
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setBlocks(next);
    setDragOver(null);
    dragRef.current = null;
  }
  function onDragEnd() { setDragOver(null); dragRef.current = null; }

  async function save() {
    setSaving(true);
    const finalHtml = editorMode === 'blocks' ? blocksToHtml(blocks) : htmlVal;
    await supabase.from('settings').upsert({ key: tpl.key, value: finalHtml });
    await supabase.from('settings').upsert({ key: tpl.subjectKey, value: subject });
    if (editorMode === 'blocks') {
      await supabase.from('settings').upsert({ key: tpl.blocksKey, value: JSON.stringify(blocks) });
    }
    setDirty(p => ({ ...p, [activeKey]: false }));
    setSavedKey(activeKey);
    setTimeout(() => setSavedKey(null), 2500);
    setSaving(false);
  }

  function resetToDefault() {
    setBlocks(tpl.defaultBlocks());
    setHtml('');
    setSubject(tpl.defaultSubject);
    setSelectedId(null);
    setEditorMode('blocks');
  }

  function switchToHtml() {
    setAllHtml(p => ({ ...p, [activeKey]: blocksToHtml(blocks) }));
    setEditorMode('html');
    setSelectedId(null);
  }

  const selectedBlock = blocks.find(b => b.id === selectedId);
  const PropEditor = selectedBlock ? PROP_EDITORS[selectedBlock.type] : null;

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 120px)' }}>

      {/* Template tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1.5px solid #dde1ef', background: 'white', padding: '0 16px' }}>
        {TEMPLATES.map(t => (
          <button key={t.key} onClick={() => { setActiveKey(t.key); setSelectedId(null); }}
            style={{ background: 'none', border: 'none', borderBottom: activeKey === t.key ? '3px solid #1B2F5E' : '3px solid transparent', padding: '10px 14px', fontSize: 13, fontWeight: activeKey === t.key ? 700 : 500, color: activeKey === t.key ? '#1B2F5E' : '#9aa3bc', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', marginBottom: -1.5 }}>
            {t.label}
            {dirty[t.key] && <span style={{ marginLeft: 5, width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', verticalAlign: 'middle' }} />}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 16px', borderBottom: '1.5px solid #f0f2f8', background: '#fafbff', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 12, color: '#5a6380', flex: 1 }}>{tpl.desc}</p>
        <div style={{ display: 'flex', gap: 4 }}>
          {['blocks', 'html'].map(m => (
            <button key={m} onClick={m === 'html' ? switchToHtml : () => setEditorMode('blocks')}
              style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: editorMode === m ? '#1B2F5E' : 'white', color: editorMode === m ? 'white' : '#5a6380', fontFamily: 'Barlow, sans-serif' }}>
              {m === 'blocks' ? 'Bloques' : 'HTML'}
            </button>
          ))}
        </div>
      </div>

      {/* Subject */}
      <div style={{ padding: '10px 16px', borderBottom: '1.5px solid #f0f2f8', display: 'flex', gap: 10, alignItems: 'center', background: 'white' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }}>Asunto</span>
        <input style={{ ...iStyle, flex: 1 }} value={subject} onChange={e => setSubject(e.target.value)} />
      </div>

      {/* Main split area */}
      <div style={{ display: 'flex', flex: 1, gap: 0, minHeight: 0 }}>

        {/* LEFT: editor */}
        <div style={{ width: '45%', minWidth: 280, display: 'flex', flexDirection: 'column', borderRight: '1.5px solid #dde1ef', background: 'white' }}>

          {editorMode === 'blocks' ? (
            <>
              {/* Palette */}
              <div style={{ padding: '8px 12px', borderBottom: '1.5px solid #f0f2f8', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {BLOCK_PALETTE.map(({ type, label, icon }) => (
                  <button key={type} onClick={() => addBlock(type)} title={label}
                    style={{ background: '#f0f4ff', border: '1.5px solid #c5d3f0', borderRadius: 6, padding: '4px 9px', fontSize: 11, fontWeight: 600, color: '#2D6BE4', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Barlow, sans-serif' }}>
                    <span style={{ fontSize: 13 }}>{icon}</span>{label}
                  </button>
                ))}
              </div>

              {/* Block list */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {blocks.length === 0 && <p style={{ fontSize: 12, color: '#9aa3bc', textAlign: 'center', marginTop: 24 }}>Agregá bloques desde la paleta de arriba</p>}
                {blocks.map((block) => {
                  const isSelected = selectedId === block.id;
                  const isDragTarget = dragOver === block.id;
                  return (
                    <div key={block.id}>
                      {/* Block row */}
                      <div
                        draggable
                        onDragStart={e => onDragStart(e, block.id)}
                        onDragOver={e => onDragOver(e, block.id)}
                        onDrop={e => onDrop(e, block.id)}
                        onDragEnd={onDragEnd}
                        onClick={() => setSelectedId(isSelected ? null : block.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 7, cursor: 'grab',
                          background: isSelected ? '#eef4ff' : isDragTarget ? '#f0f4ff' : '#f8faff',
                          border: `1.5px solid ${isSelected ? '#2D6BE4' : isDragTarget ? '#a5c0f5' : '#dde1ef'}`,
                          transition: 'all 0.1s',
                        }}>
                        <span style={{ color: '#9aa3bc', fontSize: 14, cursor: 'grab', flexShrink: 0 }}>⠿</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#2d3352', flex: 1 }}>{BLOCK_LABELS[block.type] || block.type}</span>
                        {block.type === 'header' && <span style={{ fontSize: 11, color: '#9aa3bc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{block.props.text}</span>}
                        <button onClick={e => { e.stopPropagation(); moveBlock(block.id, -1); }} style={iconBtnStyle} title="Subir">↑</button>
                        <button onClick={e => { e.stopPropagation(); moveBlock(block.id, 1); }} style={iconBtnStyle} title="Bajar">↓</button>
                        <button onClick={e => { e.stopPropagation(); duplicateBlock(block.id); }} style={iconBtnStyle} title="Duplicar">⧉</button>
                        <button onClick={e => { e.stopPropagation(); removeBlock(block.id); }} style={{ ...iconBtnStyle, color: '#e53e3e' }} title="Eliminar">✕</button>
                      </div>

                      {/* Props panel inline below selected block */}
                      {isSelected && PropEditor && (
                        <div style={{ margin: '2px 0 4px 16px', background: '#fafbff', border: '1.5px solid #dde1ef', borderRadius: 7, padding: '10px 12px' }}>
                          <PropEditor block={block} onChange={props => updateBlock(block.id, props)} />
                        </div>
                      )}
                      {isSelected && !PropEditor && (
                        <div style={{ margin: '2px 0 4px 16px', padding: '8px 12px', fontSize: 12, color: '#9aa3bc', fontStyle: 'italic' }}>
                          Este bloque es un placeholder — no tiene propiedades editables.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Variables reference */}
              <div style={{ borderTop: '1.5px solid #f0f2f8', padding: '8px 12px', background: '#fafbff' }}>
                <p style={{ margin: '0 0 5px', fontSize: 10, fontWeight: 700, color: '#9aa3bc', textTransform: 'uppercase', letterSpacing: 0.4 }}>Variables</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {VARIABLES.map(({ v, desc }) => (
                    <span key={v} title={desc} style={{ background: '#e8eef9', border: '1px solid #c5d3f0', borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 600, color: '#2D6BE4', cursor: 'default', fontFamily: 'monospace' }}>{v}</span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* HTML editor */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 12, gap: 8 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {VARIABLES.map(({ v, desc }) => (
                  <button key={v} title={desc} onClick={() => {
                    const ta = document.getElementById('email-html-editor');
                    if (!ta) return;
                    const s = ta.selectionStart, e = ta.selectionEnd;
                    const next = htmlVal.slice(0, s) + v + htmlVal.slice(e);
                    setHtml(next);
                    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + v.length, s + v.length); }, 0);
                  }}
                    style={{ background: '#e8eef9', border: '1px solid #c5d3f0', borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 600, color: '#2D6BE4', cursor: 'pointer', fontFamily: 'monospace' }}>
                    {v}
                  </button>
                ))}
              </div>
              <textarea
                id="email-html-editor"
                value={htmlVal}
                onChange={e => setHtml(e.target.value)}
                spellCheck={false}
                style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6, border: '1.5px solid #dde1ef', borderRadius: 6, padding: 10, resize: 'none', color: '#2d3352', boxSizing: 'border-box', whiteSpace: 'pre', overflowX: 'auto', tabSize: 2 }}
              />
            </div>
          )}
        </div>

        {/* RIGHT: live preview */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f0f2f8' }}>
          <div style={{ padding: '6px 12px', borderBottom: '1.5px solid #dde1ef', background: '#fafbff', fontSize: 11, color: '#9aa3bc', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Vista previa (datos de ejemplo)
          </div>
          <iframe
            title="email-preview"
            srcDoc={`<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#f0f2f8;font-family:Arial,sans-serif">${previewHtml}</body></html>`}
            style={{ flex: 1, border: 'none', width: '100%' }}
          />
        </div>
      </div>

      {/* Footer actions */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 16px', borderTop: '1.5px solid #f0f2f8', background: 'white' }}>
        <button onClick={save} disabled={saving || !dirty[activeKey]}
          style={{ background: dirty[activeKey] ? '#1B2F5E' : '#c5cce0', color: 'white', border: 'none', borderRadius: 8, padding: '8px 22px', fontSize: 13, fontWeight: 700, cursor: dirty[activeKey] ? 'pointer' : 'default', fontFamily: 'Barlow, sans-serif' }}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <button onClick={resetToDefault}
          style={{ background: 'white', border: '1.5px solid #dde1ef', color: '#5a6380', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>
          Restaurar default
        </button>
        {savedKey === activeKey && <span style={{ fontSize: 12, color: '#18a36a', fontWeight: 700 }}>✓ Guardado. Los próximos emails usarán esta plantilla.</span>}
      </div>
    </div>
  );
}
