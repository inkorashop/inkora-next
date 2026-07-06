import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';
import { adminAuthStatus, requireAdmin } from '@/lib/admin-api-auth';
import { notifyOpsError } from '@/lib/error-alert';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function unitPriceOf(item) {
  return Number(item?.pricePerUnit ?? item?.price_per_unit ?? item?.price ?? 0);
}

function buildCartTable(items) {
  const anyPriced = items.some(item => item?.showPrice !== false && unitPriceOf(item) > 0);

  const rows = items.map(item => {
    const unit = unitPriceOf(item);
    const showPrice = item?.showPrice !== false && unit > 0;
    const subtotal = unit * (Number(item.qty) || 0);
    return `<tr style="font-size:13px">
      <td style="padding:6px 10px;border-bottom:1px solid #eef0f6">${escapeHtml(item.productName || item.product_name || '—')}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eef0f6">${escapeHtml(item.name || item.designName || '—')}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eef0f6;text-align:center">${escapeHtml(item.qty)}</td>
      ${anyPriced ? `<td style="padding:6px 10px;border-bottom:1px solid #eef0f6;text-align:right">${showPrice ? `$${subtotal.toLocaleString('es-AR')}` : '—'}</td>` : ''}
    </tr>`;
  }).join('');

  return `<table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #dde1ef;border-radius:8px;overflow:hidden;margin-top:12px">
    <thead>
      <tr style="background:#1B2F5E;color:white;font-size:13px">
        <th style="padding:7px 10px;text-align:left">Producto</th>
        <th style="padding:7px 10px;text-align:left">Diseño</th>
        <th style="padding:7px 10px;text-align:center">Cantidad</th>
        ${anyPriced ? '<th style="padding:7px 10px;text-align:right">Subtotal</th>' : ''}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export async function POST(request) {
  try {
    const supabaseAdmin = getAdminClient();
    await requireAdmin(supabaseAdmin);

    const { userId } = await request.json().catch(() => ({}));
    if (!userId) {
      return NextResponse.json({ error: 'Falta userId' }, { status: 400 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, name, cart_reminder_email_enabled, deleted_at')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.email) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }
    if (profile.deleted_at) {
      return NextResponse.json({ error: 'Este cliente fue eliminado' }, { status: 409 });
    }
    // Recheck del lado del servidor: si el cliente desactivo la preferencia
    // justo antes de que el admin confirmara el envio, no se manda igual.
    if (profile.cart_reminder_email_enabled === false) {
      return NextResponse.json({ error: 'El cliente desactivo los recordatorios de carrito' }, { status: 409 });
    }

    const { data: cart, error: cartError } = await supabaseAdmin
      .from('carts')
      .select('items, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (cartError) throw cartError;

    const items = Array.isArray(cart?.items) ? cart.items.filter(item => Number(item?.qty) > 0) : [];
    if (items.length === 0) {
      return NextResponse.json({ error: 'El cliente no tiene items en el carrito' }, { status: 404 });
    }

    const safeName = escapeHtml(profile.name || '');
    const catalogUrl = 'https://www.inkora.com.ar/catalogo';
    const disableUrl = 'https://www.inkora.com.ar/dashboard?tab=miperfil&cart_reminder_off=1';

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2d3352">
        <div style="background:#1B2F5E;padding:20px 24px;border-radius:8px 8px 0 0">
          <h2 style="color:white;margin:0;font-size:18px">¡Todavía tenés cosas en tu carrito!</h2>
        </div>
        <div style="background:#f8faff;padding:20px 24px;border:1px solid #dde1ef;border-top:none">
          <p style="margin:0">Hola${safeName ? ' ' + safeName : ''}! Dejaste este pedido a medio armar. Tu carrito sigue guardado tal cual lo dejaste, podés retomarlo cuando quieras.</p>
        </div>
        ${buildCartTable(items)}
        <div style="text-align:center;padding:20px 24px;background:#f8faff;border:1px solid #dde1ef;border-top:none;border-radius:0 0 8px 8px">
          <a href="${catalogUrl}" style="display:inline-block;background:#2D6BE4;color:white;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:8px">Retomar pedido</a>
        </div>
        <div style="text-align:center;padding:14px 24px 0">
          <a href="${disableUrl}" style="display:inline-block;background:white;color:#9aa3bc;text-decoration:none;font-weight:600;font-size:11px;padding:8px 16px;border-radius:8px;border:1px solid #dde1ef">No volver a recibir estos avisos</a>
        </div>
      </div>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'INKORA <onboarding@resend.dev>',
        to: [profile.email],
        subject: 'Todavia tenes un pedido sin terminar - INKORA',
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      notifyOpsError({
        source: 'cart_reminder_email_failed',
        message: `No se pudo enviar el recordatorio de carrito a ${profile.email}`,
        details: err,
      }).catch(() => {});
      return NextResponse.json({ error: err }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: adminAuthStatus(error) });
  }
}
