import { NextResponse } from 'next/server';
import { formatOrderMoney, getOrderItemPricing, getOrderItemsTotal } from '@/lib/order-pricing';

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Datos que vienen del formulario del cliente (nombre, notas, etc.) van
// directo a un template de HTML: hay que escaparlos para que no rompan el
// layout del email ni inyecten markup si alguien pone < > & " ' en un campo.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildTable(cartItems, hasPrice) {
  const tdStyle = 'padding:5px 10px;border-bottom:1px solid #eef0f6;';
  const thStyle = 'padding:7px 10px;text-align:left;';

  const headers = hasPrice
    ? `<tr style="background:#1B2F5E;color:white;font-size:13px">
        <th style="${thStyle}">Producto</th>
        <th style="${thStyle}">Diseño</th>
        <th style="${thStyle}text-align:center">Cantidad</th>
        <th style="${thStyle}text-align:right">Precio/u</th>
        <th style="${thStyle}text-align:right">Subtotal</th>
      </tr>`
    : `<tr style="background:#1B2F5E;color:white;font-size:13px">
        <th style="${thStyle}">Producto</th>
        <th style="${thStyle}">Diseño</th>
        <th style="${thStyle}text-align:center">Cantidad</th>
      </tr>`;

  const rows = cartItems.map(i => {
    const rowStyle = 'font-size:13px;';
    const pricing = getOrderItemPricing(i);

    const productName = escapeHtml(i.productName || '—');
    const designName = escapeHtml(i.name || '—');
    // qty deberia ser siempre un numero (ya normalizado en buildOrderItemsSnapshot
    // en el flujo normal de la app), pero esta ruta acepta cualquier payload
    // JSON directo: se escapa igual que el resto por si alguien la llama a mano
    // con un valor no numerico.
    const safeQty = escapeHtml(i.qty);

    if (hasPrice) {
      return `<tr style="${rowStyle}">
        <td style="${tdStyle}">${productName}</td>
        <td style="${tdStyle}">${designName}</td>
        <td style="${tdStyle}text-align:center">${safeQty}</td>
        <td style="${tdStyle}text-align:right">${pricing.hasPrice ? formatOrderMoney(pricing.unitPrice) : '—'}</td>
        <td style="${tdStyle}text-align:right">${pricing.hasPrice ? formatOrderMoney(pricing.subtotal) : '—'}</td>
      </tr>`;
    }

    return `<tr style="${rowStyle}">
      <td style="${tdStyle}">${productName}</td>
      <td style="${tdStyle}">${designName}</td>
      <td style="${tdStyle}text-align:center">${safeQty}</td>
    </tr>`;
  }).join('');

  const totalAmount = getOrderItemsTotal(cartItems);

  const qtyByProduct = {};
  for (const i of cartItems) {
    const p = i.productName || '—';
    qtyByProduct[p] = (qtyByProduct[p] || 0) + (Number(i.qty) || 0);
  }

  const productEntries = Object.entries(qtyByProduct);

  const footerTd = 'padding:6px 10px;font-weight:700;font-size:12px;border-top:1px solid #dde1ef;';
  const footerTdFirst = 'padding:6px 10px;font-weight:700;font-size:12px;border-top:2px solid #1B2F5E;';

  const productRows = productEntries.map(([pName, pQty], idx) => {
    const td = idx === 0 ? footerTdFirst : footerTd;
    const safePName = escapeHtml(pName);

    if (hasPrice) {
      return `<tr style="background:#f8faff">
        <td colspan="2" style="${td}">${safePName}</td>
        <td style="${td}text-align:center">${pQty}</td>
        <td style="${td}"></td>
        <td style="${td}"></td>
      </tr>`;
    }

    return `<tr style="background:#f8faff">
      <td colspan="2" style="${td}">${safePName}</td>
      <td style="${td}text-align:center">${pQty}</td>
    </tr>`;
  }).join('');

  const totalRow = hasPrice
    ? `<tr style="background:#eef4ff">
        <td colspan="2" style="${footerTd}color:#1B2F5E">Total</td>
        <td style="${footerTd}text-align:center;color:#1B2F5E"></td>
        <td style="${footerTd}"></td>
        <td style="${footerTd}text-align:right;color:#1B2F5E">${formatOrderMoney(totalAmount)}</td>
      </tr>`
    : '';

  const footer = productRows + totalRow;

  return `<table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #dde1ef;border-radius:8px;overflow:hidden;margin-top:16px">
    <thead>${headers}</thead>
    <tbody>${rows}</tbody>
    <tfoot>${footer}</tfoot>
  </table>`;
}

export async function POST(request) {
  try {
    const { orderCode, form, cartItems, showPrice, notes, sellerName, sendConfirmation } = await request.json();
    const fecha = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

    const hasPrice = showPrice === true && cartItems.some(i => getOrderItemPricing(i).hasPrice);
    const emailTotal = hasPrice ? getOrderItemsTotal(cartItems) : 0;

    const table = buildTable(cartItems, hasPrice);
    const totalSection = hasPrice ? `<div style="padding:12px 16px;background:#e8f0fe;border:1px solid #dde1ef;border-top:none;border-radius:0 0 8px 8px;text-align:right;font-weight:700;font-size:15px;color:#1B2F5E">Total: ${formatOrderMoney(emailTotal)}</div>` : '';

    // Todo lo que viene del formulario del cliente se escapa una sola vez
    // aca, y esas versiones seguras son las que se usan tanto en el
    // template por defecto como en tplVars (para templates personalizados).
    const safeOrderCode = escapeHtml(orderCode);
    const safeName = escapeHtml(form.name);
    const safeEmail = escapeHtml(form.email);
    const safePhone = escapeHtml(form.phone || '—');
    const safeSellerName = escapeHtml(sellerName || '');
    const safeNotes = escapeHtml(notes || '');

    const tplVars = {
      orderCode: safeOrderCode,
      customerName: safeName,
      customerEmail: safeEmail,
      customerPhone: safePhone,
      sellerName: safeSellerName,
      notes: safeNotes,
      fecha,
      itemsTable: table,
      totalSection,
    };

    const customTemplates = {};

    // Deep link directo al detalle de este pedido en el panel de Admin
    // (mismo esquema de URL que ya usa el propio Admin para linkear pedidos:
    // tab=pedidos + modal=pedido + pedido=<order_code>). Si quien lo abre no
    // tiene sesion de admin, el flujo normal de auth le va a pedir login.
    const orderAdminUrl = `https://www.inkora.com.ar/admin?tab=pedidos&modal=pedido&pedido=${encodeURIComponent(orderCode)}`;
    const viewOrderButton = `
      <div style="text-align:center;padding:16px 24px;background:#f8faff;border:1px solid #dde1ef;border-top:none">
        <a href="${orderAdminUrl}" style="display:inline-block;background:#2D6BE4;color:white;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:8px">Ver pedido</a>
      </div>
    `;

    const defaultAdminHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2d3352">
        <div style="background:#1B2F5E;padding:20px 24px;border-radius:8px 8px 0 0">
          <h2 style="color:white;margin:0;font-size:18px">Nuevo pedido INKORA</h2>
        </div>
        <div style="background:#f8faff;padding:20px 24px;border:1px solid #dde1ef;border-top:none">
          <p style="margin:0 0 6px"><strong>Código:</strong> ${safeOrderCode}</p>
          <p style="margin:0 0 6px"><strong>Cliente:</strong> ${safeName}</p>
          <p style="margin:0 0 6px"><strong>Teléfono:</strong> ${safePhone}</p>
          <p style="margin:0 0 6px"><strong>Email:</strong> ${safeEmail}</p>
          ${safeSellerName ? `<p style="margin:0 0 6px"><strong>Vendedor:</strong> ${safeSellerName}</p>` : ''}
          ${safeNotes ? `<p style="margin:0 0 6px"><strong>Notas:</strong> ${safeNotes}</p>` : ''}
          <p style="margin:6px 0 0;font-size:12px;color:#9aa3bc"><strong>Fecha:</strong> ${fecha}</p>
        </div>
        ${viewOrderButton}
        ${table}
        ${totalSection}
      </div>
    `;

    const adminHtml = customTemplates['email_template_admin']
      ? applyTemplate(customTemplates['email_template_admin'], tplVars)
      : defaultAdminHtml;

    const adminSubject = customTemplates['email_subject_admin']
      ? applyTemplate(customTemplates['email_subject_admin'], tplVars)
      : `Nuevo pedido ${orderCode} — ${form.name}`;

    // CSV
    const csvHeaders = ['Código', 'Cliente', 'Email', 'Teléfono', 'Producto', 'Diseño', 'Cantidad', 'Precio unitario', 'Subtotal', 'Total', 'Notas', 'Vendedor', 'Fecha'];
    const csvRows = cartItems.map((item, idx) => {
      const pricing = getOrderItemPricing(item);

      return [
        orderCode,
        form.name,
        form.email,
        form.phone || '',
        item.productName || '',
        item.name,
        item.qty,
        hasPrice && pricing.hasPrice ? Math.round(pricing.unitPrice) : '',
        hasPrice && pricing.hasPrice ? Math.round(pricing.subtotal) : '',
        idx === 0 && hasPrice ? emailTotal : '',
        idx === 0 ? (notes || '') : '',
        idx === 0 ? (sellerName || '') : '',
        idx === 0 ? fecha : '',
      ].map(escapeCSV).join(',');
    });

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\r\n');
    const csvBase64 = Buffer.from('﻿' + csvContent, 'utf-8').toString('base64');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'INKORA <onboarding@resend.dev>',
        to: [process.env.EMAIL],
        subject: adminSubject,
        html: adminHtml,
        attachments: [{ filename: `pedido-${orderCode}.csv`, content: csvBase64 }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: 500 });
    }

    // Confirmation email to client
    if (form.email && sendConfirmation !== false) {
      const defaultClientHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2d3352">
          <div style="background:#1B2F5E;padding:20px 24px;border-radius:8px 8px 0 0">
            <h2 style="color:white;margin:0;font-size:18px">¡Recibimos tu pedido!</h2>
          </div>
          <div style="background:#f8faff;padding:20px 24px;border:1px solid #dde1ef;border-top:none">
            <p style="margin:0 0 6px">Hola <strong>${safeName}</strong>, tu pedido fue registrado correctamente.</p>
            <p style="margin:0 0 6px"><strong>Código de pedido:</strong> ${safeOrderCode}</p>
            ${safeNotes ? `<p style="margin:0 0 6px"><strong>Notas:</strong> ${safeNotes}</p>` : ''}
          </div>
          ${table}
          ${totalSection}
          <p style="margin-top:16px;color:#5a6380;font-size:13px;text-align:center">Nos pondremos en contacto a la brevedad para confirmar tu pedido.</p>
        </div>
      `;

      const clientHtml = customTemplates['email_template_client']
        ? applyTemplate(customTemplates['email_template_client'], tplVars)
        : defaultClientHtml;

      const clientSubject = customTemplates['email_subject_client']
        ? applyTemplate(customTemplates['email_subject_client'], tplVars)
        : `Tu pedido ${orderCode} — INKORA`;

      // El email al admin (arriba) ya se mando bien en este punto — es el
      // critico para que se enteren del pedido. Si el de confirmacion al
      // cliente falla, no tiene sentido devolver un error 500 (el pedido y
      // el aviso al admin ya estan hechos), pero tampoco hay que fallar en
      // silencio: se informa en la respuesta para poder detectarlo.
      try {
        const clientRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'INKORA <onboarding@resend.dev>',
            to: [form.email],
            subject: clientSubject,
            html: clientHtml,
          }),
        });

        if (!clientRes.ok) {
          const clientErr = await clientRes.text();
          console.error('Error enviando email de confirmacion al cliente:', clientErr);
          return NextResponse.json({ ok: true, clientEmailSent: false, clientEmailError: clientErr });
        }
      } catch (clientEmailErr) {
        console.error('Error de red enviando email de confirmacion al cliente:', clientEmailErr);
        return NextResponse.json({ ok: true, clientEmailSent: false, clientEmailError: clientEmailErr.message });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
