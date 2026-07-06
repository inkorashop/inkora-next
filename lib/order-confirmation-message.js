// Mensaje compartido entre la confirmacion por WhatsApp del cliente y el
// enlace "Copiar pedido" del email interno.
export function buildWhatsAppConfirmationMessage(orderCode, customerName, items, total) {
  const productOrder = [];
  const groups = new Map();
  (items || []).forEach(item => {
    const product = item.productName || '-';
    if (!groups.has(product)) {
      groups.set(product, []);
      productOrder.push(product);
    }
    groups.get(product).push(item);
  });

  const multipleProducts = productOrder.length > 1;
  const itemsText = productOrder.map(product => {
    const lines = groups.get(product).map(i => `- ${i.name} x ${i.qty}`).join('\n');
    return multipleProducts ? `*${product}*\n${lines}` : lines;
  }).join('\n\n');

  let message = `Hola INKORA! Quiero confirmar mi pedido\nCodigo: ${orderCode}\nNombre: ${customerName}\nItems:\n${itemsText}`;

  if (multipleProducts) {
    const summary = productOrder.map(product => {
      const qty = groups.get(product).reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
      return `- ${product}: ${qty} unidades`;
    }).join('\n');
    message += `\n\nResumen por producto:\n${summary}`;
  }

  if (total > 0) message += `\nTotal: $${Number(total).toLocaleString('es-AR')}`;

  return message;
}
