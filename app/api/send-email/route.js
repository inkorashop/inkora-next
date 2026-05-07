import { NextResponse } from 'next/server';

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildTable(cartItems, hasPrice) {
  const tdStyle = 'padding:5px 10px;border-bottom:1px solid #eef0f6;';
  const thStyle = 'padding:7px 10px;text-align:left;';

  const headers = hasPrice
    ? `<tr style="background:#1B2F5E;color:white;font-size:13px">
        <th style="${thStyle}">Producto</th>
        <th style="${thStyle}">Diseño</th>
        <th style="${thStyle}text-align:center">Planchas</th>
        <th style="${thStyle}text-align:right">Precio/u</th>
        <th style="${thStyle}text-align:right">Subtotal</th>
      </tr>`
    : `<tr style="background:#1B2F5E;color:white;font-size:13px">
        <th style="${thStyle}">Producto</th>
        <th style="${thStyle}">Diseño</th>
        <th style="${thStyle}text-align:center">Planchas</th>
      </tr>`;

  const rows = cartItems.map(i => {
    const rowStyle = 'font-size:13px;';
    if (hasPrice) {
      return `<tr style="${rowStyle}">
        <td style="${tdStyle}">${i.productName || '—'}</td>
        <td style="${tdStyle}">${i.name || '—'}</td>
        <td style="${tdStyle}text-align:center">${i.qty}</td>
        <td style="${tdStyle}text-align:right">${i.pricePerUnit ? `$${Number(i.pricePerUnit).toLocaleString('es-AR')}` : '—'}</td>
        <td style="${tdStyle}text-align:right">${i.pricePerUnit ? `$${(i.qty * i.pricePerUnit).toLocaleString('es-AR')}` : '—'}</td>
      </tr>`;
    }
    return `<tr style="${rowStyle}">
      <td style="${tdStyle}">${i.productName || '—'}</td>
      <td style="${tdStyle}">${i.name || '—'}</td>
      <td style="${tdStyle}text-align:center">${i.qty}</td>
    </tr>`;
  }).join('');

  const totalPlanchas = cartItems.reduce((s, i) => s + (i.qty || 0), 0);
  const totalAmount = cartItems.reduce((s, i) => s + (i.pricePerUnit ? i.qty * i.pricePerUnit : 0), 0);

  const footerTd = 'padding:7px 10px;font-weight:700;font-size:13px;border-top:2px solid #1B2F5E;';
  const footer = hasPrice
    ? `<tr style="background:#f8faff">
        <td colspan="2" style="${footerTd}">Total</td>
        <td style="${footerTd}text-align:center">${totalPlanchas} pl.</td>
        <td style="${footerTd}"></td>
        <td style="${footerTd}text-align:right;color:#1B2F5E">$${totalAmount.toLocaleString('es-AR')}</td>
      </tr>`
    : `<tr style="background:#f8faff">
        <td colspan="2" style="${footerTd}">Total</td>
        <td style="${footerTd}text-align:center">${totalPlanchas} pl.</td>
      </tr>`;

  return `<table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #dde1ef;border-radius:8px;overflow:hidden;margin-top:16px">
    <thead>${headers}</thead>
    <tbody>${rows}</tbody>
    <tfoot>${footer}</tfoot>
  </table>`;
}

export async function POST(request) {
  try {
    const { orderCode, form, cartItems, total, showPrice, notes, sellerName, sendConfirmation } = await request.json();
    const fecha = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

    const hasPrice = showPrice === true && cartItems.some(i => i.pricePerUnit !== null && i.pricePerUnit !== undefined && i.pricePerUnit > 0);

    const table = buildTable(cartItems, hasPrice);

    const adminHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2d3352">
        <div style="background:#1B2F5E;padding:20px 24px;border-radius:8px 8px 0 0">
          <h2 style="color:white;margin:0;font-size:18px">Nuevo pedido INKORA</h2>
        </div>
        <div style="background:#f8faff;padding:20px 24px;border:1px solid #dde1ef;border-top:none">
          <p style="margin:0 0 6px"><strong>Código:</strong> ${orderCode}</p>
          <p style="margin:0 0 6px"><strong>Cliente:</strong> ${form.name}</p>
          <p style="margin:0 0 6px"><strong>Teléfono:</strong> ${form.phone || '—'}</p>
          <p style="margin:0 0 6px"><strong>Email:</strong> ${form.email}</p>
          ${sellerName ? `<p style="margin:0 0 6px"><strong>Vendedor:</strong> ${sellerName}</p>` : ''}
          ${notes ? `<p style="margin:0 0 6px"><strong>Notas:</strong> ${notes}</p>` : ''}
          <p style="margin:6px 0 0;font-size:12px;color:#9aa3bc"><strong>Fecha:</strong> ${fecha}</p>
        </div>
        ${table}
        ${hasPrice ? `<div style="padding:12px 16px;background:#e8f0fe;border:1px solid #dde1ef;border-top:none;border-radius:0 0 8px 8px;text-align:right;font-weight:700;font-size:15px;color:#1B2F5E">Total: $${total.toLocaleString('es-AR')}</div>` : ''}
      </div>
    `;

    // CSV
    const csvHeaders = ['Código', 'Cliente', 'Email', 'Teléfono', 'Producto', 'Diseño', 'Planchas', 'Precio unitario', 'Subtotal', 'Total', 'Notas', 'Vendedor', 'Fecha'];
    const csvRows = cartItems.map((item, idx) => [
      orderCode,
      form.name,
      form.email,
      form.phone || '',
      item.productName || '',
      item.name,
      item.qty,
      hasPrice && item.pricePerUnit ? item.pricePerUnit : '',
      hasPrice && item.pricePerUnit ? item.qty * item.pricePerUnit : '',
      idx === 0 && hasPrice ? total : '',
      idx === 0 ? (notes || '') : '',
      idx === 0 ? (sellerName || '') : '',
      idx === 0 ? fecha : '',
    ].map(escapeCSV).join(','));

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
        subject: `Nuevo pedido ${orderCode} — ${form.name}`,
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
      const clientHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2d3352">
          <div style="background:#1B2F5E;padding:20px 24px;border-radius:8px 8px 0 0">
            <h2 style="color:white;margin:0;font-size:18px">¡Recibimos tu pedido!</h2>
          </div>
          <div style="background:#f8faff;padding:20px 24px;border:1px solid #dde1ef;border-top:none">
            <p style="margin:0 0 6px">Hola <strong>${form.name}</strong>, tu pedido fue registrado correctamente.</p>
            <p style="margin:0 0 6px"><strong>Código de pedido:</strong> ${orderCode}</p>
            ${notes ? `<p style="margin:0 0 6px"><strong>Notas:</strong> ${notes}</p>` : ''}
          </div>
          ${table}
          ${hasPrice ? `<div style="padding:12px 16px;background:#e8f0fe;border:1px solid #dde1ef;border-top:none;border-radius:0 0 8px 8px;text-align:right;font-weight:700;font-size:15px;color:#1B2F5E">Total: $${total.toLocaleString('es-AR')}</div>` : ''}
          <p style="margin-top:16px;color:#5a6380;font-size:13px;text-align:center">Nos pondremos en contacto a la brevedad para confirmar tu pedido.</p>
        </div>
      `;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'INKORA <onboarding@resend.dev>',
          to: [form.email],
          subject: `Tu pedido ${orderCode} — INKORA`,
          html: clientHtml,
        }),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
