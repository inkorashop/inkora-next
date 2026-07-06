'use client';
import React, { useEffect, useState } from 'react';

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < breakpoint : false);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [breakpoint]);

  return isMobile;
}

const sampleTable = `
  <table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #dde1ef;border-radius:8px;overflow:hidden;margin-top:16px">
    <thead>
      <tr style="background:#1B2F5E;color:white;font-size:13px">
        <th style="padding:7px 10px;text-align:left">Producto</th>
        <th style="padding:7px 10px;text-align:left">Diseno</th>
        <th style="padding:7px 10px;text-align:center">Cantidad</th>
        <th style="padding:7px 10px;text-align:right">Precio/u</th>
        <th style="padding:7px 10px;text-align:right">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      <tr style="font-size:13px">
        <td style="padding:5px 10px;border-bottom:1px solid #eef0f6">Calcos Librerias</td>
        <td style="padding:5px 10px;border-bottom:1px solid #eef0f6">My Hero Academy</td>
        <td style="padding:5px 10px;border-bottom:1px solid #eef0f6;text-align:center">37</td>
        <td style="padding:5px 10px;border-bottom:1px solid #eef0f6;text-align:right">$1.600</td>
        <td style="padding:5px 10px;border-bottom:1px solid #eef0f6;text-align:right">$59.200</td>
      </tr>
      <tr style="font-size:13px">
        <td style="padding:5px 10px;border-bottom:1px solid #eef0f6">Pines</td>
        <td style="padding:5px 10px;border-bottom:1px solid #eef0f6">Para mochila</td>
        <td style="padding:5px 10px;border-bottom:1px solid #eef0f6;text-align:center">10</td>
        <td style="padding:5px 10px;border-bottom:1px solid #eef0f6;text-align:right">$600</td>
        <td style="padding:5px 10px;border-bottom:1px solid #eef0f6;text-align:right">$6.000</td>
      </tr>
    </tbody>
    <tfoot>
      <tr style="background:#f8faff">
        <td colspan="2" style="padding:6px 10px;font-weight:700;font-size:12px;border-top:2px solid #1B2F5E">Calcos Librerias</td>
        <td style="padding:6px 10px;font-weight:700;font-size:12px;border-top:2px solid #1B2F5E;text-align:center">37</td>
        <td style="padding:6px 10px;font-weight:700;font-size:12px;border-top:2px solid #1B2F5E"></td>
        <td style="padding:6px 10px;font-weight:700;font-size:12px;border-top:2px solid #1B2F5E"></td>
      </tr>
      <tr style="background:#f8faff">
        <td colspan="2" style="padding:6px 10px;font-weight:700;font-size:12px;border-top:1px solid #dde1ef">Pines</td>
        <td style="padding:6px 10px;font-weight:700;font-size:12px;border-top:1px solid #dde1ef;text-align:center">10</td>
        <td style="padding:6px 10px;font-weight:700;font-size:12px;border-top:1px solid #dde1ef"></td>
        <td style="padding:6px 10px;font-weight:700;font-size:12px;border-top:1px solid #dde1ef"></td>
      </tr>
      <tr style="background:#eef4ff">
        <td colspan="2" style="padding:6px 10px;font-weight:700;font-size:12px;border-top:1px solid #dde1ef;color:#1B2F5E">Total</td>
        <td style="padding:6px 10px;font-weight:700;font-size:12px;border-top:1px solid #dde1ef;text-align:center;color:#1B2F5E"></td>
        <td style="padding:6px 10px;font-weight:700;font-size:12px;border-top:1px solid #dde1ef"></td>
        <td style="padding:6px 10px;font-weight:700;font-size:12px;border-top:1px solid #dde1ef;text-align:right;color:#1B2F5E">$65.200</td>
      </tr>
    </tfoot>
  </table>
`;

const totalSection = `
  <div style="padding:12px 16px;background:#e8f0fe;border:1px solid #dde1ef;border-top:none;border-radius:0 0 8px 8px;text-align:right;font-weight:700;font-size:15px;color:#1B2F5E">
    Total: $65.200
  </div>
`;

const adminOrderActions = `
  <div style="text-align:center;padding:16px 24px;background:#f8faff;border:1px solid #dde1ef;border-top:none">
    <a href="#" style="display:inline-block;background:#2D6BE4;color:white;text-decoration:none;font-weight:bold;font-size:14px;padding:11px 20px;border-radius:8px;margin:4px;vertical-align:middle">
      <span style="display:inline-block;width:20px;height:20px;border-radius:999px;background:white;vertical-align:middle;margin-right:7px;text-align:center;line-height:20px">
        <img src="https://ylawwaoznxzxwetlkjel.supabase.co/storage/v1/object/public/assets/Logo%20nuevo.png" alt="" width="14" height="14" style="display:inline-block;vertical-align:middle;border:0;max-width:14px;max-height:14px" />
      </span>
      <span style="vertical-align:middle">Ir al pedido</span>
    </a>
    <a href="#" style="display:inline-block;background:white;color:#1B2F5E;text-decoration:none;font-weight:bold;font-size:14px;padding:11px 20px;border-radius:8px;border:1.5px solid #2D6BE4;margin:4px;vertical-align:middle">
      <span style="display:inline-block;position:relative;width:16px;height:16px;vertical-align:middle;margin-right:7px">
        <span style="display:block;position:absolute;left:5px;top:2px;width:9px;height:10px;border:1.7px solid #1B2F5E;border-radius:2px"></span>
        <span style="display:block;position:absolute;left:1px;top:5px;width:9px;height:10px;border:1.7px solid #1B2F5E;border-radius:2px;background:white"></span>
      </span>
      <span style="vertical-align:middle">Copiar pedido</span>
    </a>
  </div>
`;

function emailShell(content) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:22px;background:#eef2f8;font-family:Arial,sans-serif">${content}</body></html>`;
}

const previews = [
  {
    id: 'order-admin',
    label: 'Pedido nuevo - INKORA',
    flow: 'Catalogo > confirmar pedido',
    sentBy: 'Resend',
    recipient: 'Email interno configurado en servidor',
    subject: 'Nuevo pedido INK-J92BQCBU - Inkora',
    note: 'Incluye CSV adjunto con los items del pedido.',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2d3352">
        <div style="background:#1B2F5E;padding:20px 24px;border-radius:8px 8px 0 0">
          <h2 style="color:white;margin:0;font-size:18px">Nuevo pedido INKORA</h2>
        </div>
        <div style="background:#f8faff;padding:20px 24px;border:1px solid #dde1ef;border-top:none">
          <p style="margin:0 0 6px"><strong>Codigo:</strong> INK-J92BQCBU</p>
          <p style="margin:0 0 6px"><strong>Cliente:</strong> Inkora</p>
          <p style="margin:0 0 6px"><strong>Telefono:</strong> 3765211015</p>
          <p style="margin:0 0 6px"><strong>Email:</strong> inkorashop@gmail.com</p>
          <p style="margin:0 0 6px"><strong>Vendedor:</strong> Francisco</p>
          <p style="margin:0 0 6px"><strong>Notas:</strong> Entrega por la tarde</p>
          <p style="margin:6px 0 0;font-size:12px;color:#9aa3bc"><strong>Fecha:</strong> 05/07/2026, 16:30:00</p>
        </div>
        ${adminOrderActions}
        ${sampleTable}
        ${totalSection}
      </div>
    `,
  },
  {
    id: 'order-client',
    label: 'Confirmacion de pedido - cliente',
    flow: 'Catalogo > confirmar pedido',
    sentBy: 'Resend',
    recipient: 'Email ingresado por el cliente',
    subject: 'Tu pedido INK-J92BQCBU - INKORA',
    note: 'Se manda solo si el cliente tiene activa la confirmacion de pedido.',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2d3352">
        <div style="background:#1B2F5E;padding:20px 24px;border-radius:8px 8px 0 0">
          <h2 style="color:white;margin:0;font-size:18px">Recibimos tu pedido</h2>
        </div>
        <div style="background:#f8faff;padding:20px 24px;border:1px solid #dde1ef;border-top:none">
          <p style="margin:0 0 6px">Hola <strong>Inkora</strong>, tu pedido fue registrado correctamente.</p>
          <p style="margin:0 0 6px"><strong>Codigo de pedido:</strong> INK-J92BQCBU</p>
          <p style="margin:0 0 6px"><strong>Notas:</strong> Entrega por la tarde</p>
        </div>
        ${sampleTable}
        ${totalSection}
        <p style="margin-top:16px;color:#5a6380;font-size:13px;text-align:center">Nos pondremos en contacto a la brevedad para confirmar tu pedido.</p>
      </div>
    `,
  },
  {
    id: 'auth-confirm',
    label: 'Confirmacion de cuenta',
    flow: 'Registro con email y contrasena',
    sentBy: 'Supabase Auth',
    recipient: 'Email registrado por el usuario',
    subject: 'Confirma tu email',
    note: 'Solo se usa si en Configuracion esta activa la confirmacion de email al registrarse. La plantilla real se administra en Supabase.',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#2d3352;background:white;border:1px solid #dde1ef;border-radius:12px;overflow:hidden">
        <div style="background:#1B2F5E;padding:22px 24px">
          <h2 style="color:white;margin:0;font-size:19px">Confirma tu email</h2>
        </div>
        <div style="padding:24px">
          <p style="margin:0 0 12px;font-size:14px;line-height:1.5">Para terminar de crear tu cuenta en INKORA, confirma este email.</p>
          <a href="#" style="display:inline-block;background:#1B2F5E;color:white;text-decoration:none;border-radius:8px;padding:11px 22px;font-weight:700;font-size:14px">Confirmar cuenta</a>
          <p style="margin:18px 0 0;color:#9aa3bc;font-size:12px;line-height:1.5">Si no pediste crear una cuenta, podes ignorar este mensaje.</p>
        </div>
      </div>
    `,
  },
  {
    id: 'password-reset',
    label: 'Cambio de contrasena',
    flow: 'Login > olvide mi contrasena',
    sentBy: 'Supabase Auth',
    recipient: 'Email ingresado por el usuario',
    subject: 'Restablece tu contrasena',
    note: 'El link lleva a /auth/reset-password. La plantilla real se administra en Supabase.',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#2d3352;background:white;border:1px solid #dde1ef;border-radius:12px;overflow:hidden">
        <div style="background:#1B2F5E;padding:22px 24px">
          <h2 style="color:white;margin:0;font-size:19px">Nueva contrasena</h2>
        </div>
        <div style="padding:24px">
          <p style="margin:0 0 12px;font-size:14px;line-height:1.5">Recibimos una solicitud para cambiar la contrasena de tu cuenta INKORA.</p>
          <a href="#" style="display:inline-block;background:#1B2F5E;color:white;text-decoration:none;border-radius:8px;padding:11px 22px;font-weight:700;font-size:14px">Cambiar contrasena</a>
          <p style="margin:18px 0 0;color:#9aa3bc;font-size:12px;line-height:1.5">Si no fuiste vos, podes ignorar este mensaje.</p>
        </div>
      </div>
    `,
  },
];

export default function EmailsTab() {
  const isMobile = useIsMobile();
  const [activeId, setActiveId] = useState(previews[0].id);
  const active = previews.find(preview => preview.id === activeId) || previews[0];

  return (
    <div style={{ minHeight: 'calc(100vh - 120px)', background: '#f5f7fc', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'white', borderBottom: '1.5px solid #dde1ef', padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, color: '#1B2F5E', fontSize: 18, fontWeight: 800 }}>Vista previa de emails</h2>
            <p style={{ margin: '5px 0 0', color: '#5a6380', fontSize: 13, lineHeight: 1.45 }}>
              Solo visualizacion. Las plantillas no se editan desde Admin.
            </p>
          </div>
          <span style={{ background: '#e8f7ef', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 999, padding: '5px 10px', fontSize: 11, fontWeight: 800 }}>
            Modo lectura
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', flex: 1, minHeight: 0 }}>
        <aside style={{ width: isMobile ? '100%' : 330, background: 'white', borderRight: isMobile ? 'none' : '1.5px solid #dde1ef', borderBottom: isMobile ? '1.5px solid #dde1ef' : 'none', padding: 14, boxSizing: 'border-box', overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {previews.map(preview => {
              const selected = preview.id === active.id;
              return (
                <button
                  key={preview.id}
                  onClick={() => setActiveId(preview.id)}
                  style={{
                    textAlign: 'left',
                    border: `1.5px solid ${selected ? '#2D6BE4' : '#dde1ef'}`,
                    background: selected ? '#eef4ff' : '#ffffff',
                    borderRadius: 8,
                    padding: 12,
                    cursor: 'pointer',
                    fontFamily: 'Barlow, sans-serif',
                    boxShadow: selected ? '0 2px 10px rgba(45,107,228,0.12)' : 'none',
                  }}
                >
                  <div style={{ color: '#1B2F5E', fontSize: 13, fontWeight: 800 }}>{preview.label}</div>
                  <div style={{ color: '#9aa3bc', fontSize: 11, fontWeight: 700, marginTop: 3 }}>{preview.sentBy}</div>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 14, background: '#f8faff', border: '1px solid #dde1ef', borderRadius: 8, padding: 12 }}>
            <div style={metaLabel}>Flujo</div>
            <div style={metaValue}>{active.flow}</div>
            <div style={{ ...metaLabel, marginTop: 10 }}>Destinatario</div>
            <div style={metaValue}>{active.recipient}</div>
            <div style={{ ...metaLabel, marginTop: 10 }}>Asunto</div>
            <div style={metaValue}>{active.subject}</div>
            <div style={{ ...metaLabel, marginTop: 10 }}>Nota</div>
            <div style={{ color: '#5a6380', fontSize: 12, lineHeight: 1.45 }}>{active.note}</div>
          </div>
        </aside>

        <section style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 14px', borderBottom: '1.5px solid #dde1ef', background: '#fafbff', color: '#9aa3bc', fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            Preview con datos de ejemplo
          </div>
          <iframe
            title={`email-preview-${active.id}`}
            srcDoc={emailShell(active.html)}
            style={{ flex: 1, border: 'none', width: '100%', background: '#eef2f8' }}
          />
        </section>
      </div>
    </div>
  );
}

const metaLabel = {
  color: '#9aa3bc',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  marginBottom: 3,
};

const metaValue = {
  color: '#1B2F5E',
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.35,
};
