import { NextResponse } from 'next/server';

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function POST(request) {
  try {
    const { orderCode, form, cartItems, total, notes } = await request.json();
    const fecha = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

    const itemsHtml = cartItems
      .map(i => `<tr><td style="padding:4px 8px">${i.name}</td><td style="padding:4px 8px">×${i.qty}</td><td style="padding:4px 8px">${i.pricePerUnit ? `$${(i.qty * i.pricePerUnit).toLocaleString()}` : '—'}</td></tr>`)
      .join('');

    const html = `
      <h2 style="color:#1B2F5E">Nuevo pedido INKORA</h2>
      <p><strong>Código:</strong> ${orderCode}</p>
      <p><strong>Cliente:</strong> ${form.name}</p>
      <p><strong>Teléfono:</strong> ${form.phone}</p>
      <p><strong>Email:</strong> ${form.email}</p>
      ${notes ? `<p><strong>Notas:</strong> ${notes}</p>` : ''}
      <table border="1" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:16px">
        <thead><tr style="background:#1B2F5E;color:white"><th style="padding:6px 12px">Diseño</th><th style="padding:6px 12px">Cant.</th><th style="padding:6px 12px">Precio</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot><tr><td colspan="2" style="padding:6px 12px;font-weight:bold">Total</td><td style="padding:6px 12px;font-weight:bold">$${total.toLocaleString()}</td></tr></tfoot>
      </table>
    `;

    // CSV — una fila por item
    const csvHeaders = ['Código', 'Nombre cliente', 'Email', 'Teléfono', 'Diseño', 'Cantidad', 'Precio unitario', 'Subtotal', 'Total', 'Notas', 'Fecha'];
    const csvRows = cartItems.map((item, idx) => [
      orderCode,
      form.name,
      form.email,
      form.phone,
      item.name,
      item.qty,
      item.pricePerUnit ?? '',
      item.pricePerUnit ? item.qty * item.pricePerUnit : '',
      idx === 0 ? total : '',   // total solo en la primera fila
      idx === 0 ? (notes || '') : '',
      idx === 0 ? fecha : '',
    ].map(escapeCSV).join(','));

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\r\n');
    const csvBase64 = Buffer.from('\uFEFF' + csvContent, 'utf-8').toString('base64');

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
        html,
        attachments: [
          {
            filename: `pedido-${orderCode}.csv`,
            content: csvBase64,
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
