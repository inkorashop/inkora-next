// Alerta por email a inkora ante errores graves (402 de Supabase, fallos de
// envio de emails de pedidos, etc). No depende de Supabase para funcionar:
// llama a Resend directamente, para poder avisar incluso si Supabase esta caido.

const lastSentAt = new Map();
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutos por tipo de error, para no saturar

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function notifyOpsError({ source, message, details }) {
  const key = String(source || 'unknown');
  const now = Date.now();
  const last = lastSentAt.get(key) || 0;
  if (now - last < COOLDOWN_MS) {
    return { ok: false, skipped: true, reason: 'throttled' };
  }
  lastSentAt.set(key, now);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'INKORA <onboarding@resend.dev>',
        to: [process.env.EMAIL],
        subject: `Alerta tecnica INKORA: ${key}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2d3352">
            <div style="background:#c53030;padding:20px 24px;border-radius:8px 8px 0 0">
              <h2 style="color:white;margin:0;font-size:18px">Alerta tecnica</h2>
            </div>
            <div style="background:#f8faff;padding:20px 24px;border:1px solid #dde1ef;border-top:none">
              <p style="margin:0 0 6px"><strong>Origen:</strong> ${escapeHtml(key)}</p>
              <p style="margin:0 0 6px"><strong>Mensaje:</strong> ${escapeHtml(message || 'Sin detalle')}</p>
              ${details ? `<p style="margin:0 0 6px;white-space:pre-wrap"><strong>Detalles:</strong> ${escapeHtml(details)}</p>` : ''}
              <p style="margin:12px 0 0;color:#5a6380;font-size:12px">${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</p>
            </div>
          </div>
        `,
      }),
    });
    return { ok: res.ok };
  } catch (err) {
    return { ok: false, error: err?.message || 'send_failed' };
  }
}
