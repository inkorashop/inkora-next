import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { orderCode, form, cartItems, total, notes } = await request.json();

    const itemsHtml = cartItems
      .map(i => `<tr><td style="padding:4px 8px">${i.name}</td><td style="padding:4px 8px">×${i.qty}</td><td style="padding:4px 8px">$${(i.qty * 500).toLocaleString()}</td></tr>`)
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

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'INKORA <onboarding@resend.dev>',
        to: [process.env.NEXT_PUBLIC_EMAIL],
        subject: `Nuevo pedido ${orderCode} — ${form.name}`,
        html,
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
