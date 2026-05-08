'use client';
import React, { useState, useEffect, useRef } from 'react';

const VARIABLES = [
  { v: '{{orderCode}}', desc: 'Código del pedido' },
  { v: '{{customerName}}', desc: 'Nombre del cliente' },
  { v: '{{customerEmail}}', desc: 'Email del cliente' },
  { v: '{{customerPhone}}', desc: 'Teléfono del cliente' },
  { v: '{{sellerName}}', desc: 'Nombre del vendedor' },
  { v: '{{notes}}', desc: 'Notas del pedido' },
  { v: '{{fecha}}', desc: 'Fecha y hora' },
  { v: '{{itemsTable}}', desc: 'Tabla de productos (HTML)' },
  { v: '{{totalSection}}', desc: 'Sección de total (HTML)' },
];

const DEFAULT_ADMIN_HTML = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2d3352">
  <div style="background:#1B2F5E;padding:20px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:white;margin:0;font-size:18px">Nuevo pedido INKORA</h2>
  </div>
  <div style="background:#f8faff;padding:20px 24px;border:1px solid #dde1ef;border-top:none">
    <p style="margin:0 0 6px"><strong>Código:</strong> {{orderCode}}</p>
    <p style="margin:0 0 6px"><strong>Cliente:</strong> {{customerName}}</p>
    <p style="margin:0 0 6px"><strong>Teléfono:</strong> {{customerPhone}}</p>
    <p style="margin:0 0 6px"><strong>Email:</strong> {{customerEmail}}</p>
    <p style="margin:0 0 6px"><strong>Vendedor:</strong> {{sellerName}}</p>
    <p style="margin:0 0 6px"><strong>Notas:</strong> {{notes}}</p>
    <p style="margin:6px 0 0;font-size:12px;color:#9aa3bc"><strong>Fecha:</strong> {{fecha}}</p>
  </div>
  {{itemsTable}}
  {{totalSection}}
</div>`;

const DEFAULT_CLIENT_HTML = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2d3352">
  <div style="background:#1B2F5E;padding:20px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:white;margin:0;font-size:18px">¡Recibimos tu pedido!</h2>
  </div>
  <div style="background:#f8faff;padding:20px 24px;border:1px solid #dde1ef;border-top:none">
    <p style="margin:0 0 6px">Hola <strong>{{customerName}}</strong>, tu pedido fue registrado correctamente.</p>
    <p style="margin:0 0 6px"><strong>Código de pedido:</strong> {{orderCode}}</p>
    <p style="margin:0 0 6px"><strong>Notas:</strong> {{notes}}</p>
  </div>
  {{itemsTable}}
  {{totalSection}}
  <p style="margin-top:16px;color:#5a6380;font-size:13px;text-align:center">Nos pondremos en contacto a la brevedad para confirmar tu pedido.</p>
</div>`;

const TEMPLATES = [
  {
    key: 'email_template_admin',
    subjectKey: 'email_subject_admin',
    label: 'Notificación al admin',
    desc: 'Se manda internamente cuando entra un pedido nuevo.',
    defaultHtml: DEFAULT_ADMIN_HTML,
    defaultSubject: 'Nuevo pedido {{orderCode}} — {{customerName}}',
  },
  {
    key: 'email_template_client',
    subjectKey: 'email_subject_client',
    label: 'Confirmación al cliente',
    desc: 'Se manda al cliente cuando confirma su pedido.',
    defaultHtml: DEFAULT_CLIENT_HTML,
    defaultSubject: 'Tu pedido {{orderCode}} — INKORA',
  },
];

function buildPreviewHtml(html) {
  const sampleTable = `<table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #dde1ef;border-radius:8px;overflow:hidden;margin-top:16px"><thead><tr style="background:#1B2F5E;color:white;font-size:13px"><th style="padding:7px 10px;text-align:left">Producto</th><th style="padding:7px 10px;text-align:left">Diseño</th><th style="padding:7px 10px;text-align:center">Planchas</th></tr></thead><tbody><tr style="font-size:13px"><td style="padding:5px 10px;border-bottom:1px solid #eef0f6">Llavero</td><td style="padding:5px 10px;border-bottom:1px solid #eef0f6">Diseño A</td><td style="padding:5px 10px;border-bottom:1px solid #eef0f6;text-align:center">10</td></tr></tbody><tfoot><tr style="background:#f8faff"><td colspan="2" style="padding:7px 10px;font-weight:700;font-size:12px;border-top:2px solid #1B2F5E">Llavero</td><td style="padding:7px 10px;font-weight:700;font-size:12px;border-top:2px solid #1B2F5E;text-align:center">10</td></tr></tfoot></table>`;
  const sampleTotal = `<div style="padding:12px 16px;background:#e8f0fe;border:1px solid #dde1ef;border-top:none;border-radius:0 0 8px 8px;text-align:right;font-weight:700;font-size:15px;color:#1B2F5E">Total: $15.000</div>`;
  return html
    .replace(/{{orderCode}}/g, 'INK-2025-001')
    .replace(/{{customerName}}/g, 'Juan Pérez')
    .replace(/{{customerEmail}}/g, 'juan@email.com')
    .replace(/{{customerPhone}}/g, '3765 123456')
    .replace(/{{sellerName}}/g, 'Vendedor Ejemplo')
    .replace(/{{notes}}/g, 'Entrega urgente')
    .replace(/{{fecha}}/g, '07/05/2025 14:30')
    .replace(/{{itemsTable}}/g, sampleTable)
    .replace(/{{totalSection}}/g, sampleTotal);
}

export default function EmailsTab({ supabase }) {
  const [activeKey, setActiveKey] = useState(TEMPLATES[0].key);
  const [values, setValues] = useState({});
  const [dirty, setDirty] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const iframeRef = useRef(null);

  const tpl = TEMPLATES.find(t => t.key === activeKey);

  useEffect(() => {
    async function load() {
      const keys = TEMPLATES.flatMap(t => [t.key, t.subjectKey]);
      const { data } = await supabase.from('settings').select('*').in('key', keys);
      if (data) {
        const map = {};
        for (const row of data) map[row.key] = row.value;
        setValues(map);
      }
    }
    load();
  }, [supabase]);

  function getHtml() { return values[tpl.key] ?? tpl.defaultHtml; }
  function getSubject() { return values[tpl.subjectKey] ?? tpl.defaultSubject; }

  function setHtml(v) { setValues(p => ({ ...p, [tpl.key]: v })); setDirty(p => ({ ...p, [activeKey]: true })); }
  function setSubject(v) { setValues(p => ({ ...p, [tpl.subjectKey]: v })); setDirty(p => ({ ...p, [activeKey]: true })); }

  async function save() {
    setSaving(true);
    await supabase.from('settings').upsert({ key: tpl.key, value: getHtml() });
    await supabase.from('settings').upsert({ key: tpl.subjectKey, value: getSubject() });
    setDirty(p => ({ ...p, [activeKey]: false }));
    setSavedNotice(activeKey);
    setTimeout(() => setSavedNotice(null), 2500);
    setSaving(false);
  }

  function resetToDefault() {
    setValues(p => ({ ...p, [tpl.key]: tpl.defaultHtml, [tpl.subjectKey]: tpl.defaultSubject }));
    setDirty(p => ({ ...p, [activeKey]: true }));
  }

  function insertVariable(v) {
    const ta = document.getElementById('email-html-editor');
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const current = getHtml();
    const next = current.slice(0, start) + v + current.slice(end);
    setHtml(next);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + v.length, start + v.length); }, 0);
  }

  const previewHtml = buildPreviewHtml(getHtml());

  const inp = { border: '1.5px solid #dde1ef', borderRadius: 6, padding: '6px 10px', fontSize: 13, fontFamily: 'Barlow, sans-serif', color: '#2d3352', boxSizing: 'border-box', width: '100%' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Tab selector */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1.5px solid #dde1ef', background: 'white', padding: '0 16px' }}>
        {TEMPLATES.map(t => (
          <button
            key={t.key}
            onClick={() => { setActiveKey(t.key); setShowPreview(false); }}
            style={{ background: 'none', border: 'none', borderBottom: activeKey === t.key ? '3px solid #1B2F5E' : '3px solid transparent', padding: '10px 14px', fontSize: 13, fontWeight: activeKey === t.key ? 700 : 500, color: activeKey === t.key ? '#1B2F5E' : '#9aa3bc', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', marginBottom: -1.5 }}
          >
            {t.label}
            {dirty[t.key] && <span style={{ marginLeft: 6, width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', verticalAlign: 'middle' }} />}
          </button>
        ))}
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 12, color: '#5a6380' }}>{tpl.desc}</p>

        {/* Subject */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.4 }}>Asunto del email</label>
          <input style={inp} value={getSubject()} onChange={e => setSubject(e.target.value)} />
        </div>

        {/* Variables hint */}
        <div style={{ background: '#f8faff', border: '1.5px solid #dde1ef', borderRadius: 8, padding: '10px 14px' }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.4 }}>Variables disponibles</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {VARIABLES.map(({ v, desc }) => (
              <button
                key={v}
                title={desc}
                onClick={() => insertVariable(v)}
                style={{ background: '#e8eef9', border: '1px solid #c5d3f0', borderRadius: 5, padding: '3px 8px', fontSize: 11, fontWeight: 600, color: '#2D6BE4', cursor: 'pointer', fontFamily: 'monospace' }}
              >
                {v}
              </button>
            ))}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9aa3bc' }}>Hacé click en una variable para insertarla en el cursor del editor. Las que no aplican al template quedan en blanco.</p>
        </div>

        {/* Toggle editor/preview */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setShowPreview(false)}
            style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: !showPreview ? '#1B2F5E' : 'white', color: !showPreview ? 'white' : '#5a6380', fontFamily: 'Barlow, sans-serif' }}
          >
            Editar HTML
          </button>
          <button
            onClick={() => setShowPreview(true)}
            style={{ border: '1.5px solid #dde1ef', borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: showPreview ? '#1B2F5E' : 'white', color: showPreview ? 'white' : '#5a6380', fontFamily: 'Barlow, sans-serif' }}
          >
            Vista previa
          </button>
        </div>

        {!showPreview ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#5a6380', textTransform: 'uppercase', letterSpacing: 0.4 }}>HTML del email</label>
            <textarea
              id="email-html-editor"
              value={getHtml()}
              onChange={e => setHtml(e.target.value)}
              spellCheck={false}
              style={{ ...inp, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6, minHeight: 420, resize: 'vertical', whiteSpace: 'pre', overflowX: 'auto', tabSize: 2 }}
            />
          </div>
        ) : (
          <div style={{ border: '1.5px solid #dde1ef', borderRadius: 8, overflow: 'hidden', background: '#f7f8fc', padding: 16 }}>
            <p style={{ fontSize: 11, color: '#9aa3bc', margin: '0 0 10px' }}>Vista previa con datos de ejemplo</p>
            <iframe
              ref={iframeRef}
              title="email-preview"
              srcDoc={`<!DOCTYPE html><html><body style="margin:0;padding:16px;background:#f7f8fc">${previewHtml}</body></html>`}
              style={{ width: '100%', minHeight: 480, border: 'none', borderRadius: 6, background: 'white' }}
            />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', borderTop: '1.5px solid #f0f2f8', paddingTop: 14 }}>
          <button
            onClick={save}
            disabled={saving || !dirty[activeKey]}
            style={{ background: dirty[activeKey] ? '#1B2F5E' : '#9aa3bc', color: 'white', border: 'none', borderRadius: 8, padding: '8px 22px', fontSize: 13, fontWeight: 700, cursor: dirty[activeKey] ? 'pointer' : 'default', fontFamily: 'Barlow, sans-serif', transition: 'background 0.2s' }}
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          <button
            onClick={resetToDefault}
            style={{ background: 'white', border: '1.5px solid #dde1ef', color: '#5a6380', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
          >
            Restaurar default
          </button>
          {savedNotice === activeKey && (
            <span style={{ fontSize: 12, color: '#18a36a', fontWeight: 700 }}>✓ Guardado. Los próximos emails usarán esta plantilla.</span>
          )}
        </div>
      </div>
    </div>
  );
}
