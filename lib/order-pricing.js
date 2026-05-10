function toMoneyNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeQty(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function formatOrderMoney(value) {
  const number = toMoneyNumber(value);
  if (number === null) return '—';
  return `$${Math.round(number).toLocaleString('es-AR')}`;
}

export function getStoredUnitPrice(item) {
  return toMoneyNumber(
    item?.pricePerUnit ??
    item?.unitPrice ??
    item?.price_per_unit ??
    item?.unit_price ??
    item?.price
  );
}

export function getStoredItemSubtotal(item) {
  return toMoneyNumber(
    item?.subtotal ??
    item?.lineTotal ??
    item?.line_total ??
    item?.total
  );
}

export function getStoredItemsTotal(items) {
  if (!Array.isArray(items)) return 0;

  return items.reduce((sum, item) => {
    if (item?.showPrice === false) return sum;

    const qty = normalizeQty(item?.qty);
    const storedSubtotal = getStoredItemSubtotal(item);

    if (storedSubtotal !== null && storedSubtotal > 0) {
      return sum + storedSubtotal;
    }

    const storedUnit = getStoredUnitPrice(item);

    if (storedUnit !== null && storedUnit > 0) {
      return sum + qty * storedUnit;
    }

    return sum;
  }, 0);
}

export function canInferSingleProductUnitPrice(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const visibleItems = items.filter(item => item?.showPrice !== false && normalizeQty(item?.qty) > 0);

  if (visibleItems.length === 0) return false;

  const productKeys = visibleItems.map(item =>
    item?.product_id ||
    item?.productId ||
    item?.productName ||
    item?.product_name ||
    ''
  );

  if (productKeys.some(key => !key)) return false;

  return new Set(productKeys).size === 1;
}

export function getLegacySingleProductUnitPrice(order) {
  if (!canInferSingleProductUnitPrice(order)) return null;

  const total = toMoneyNumber(order?.total);
  if (total === null || total <= 0) return null;

  const items = Array.isArray(order?.items) ? order.items : [];
  const totalQty = items.reduce((sum, item) => {
    if (item?.showPrice === false) return sum;
    return sum + normalizeQty(item?.qty);
  }, 0);

  if (totalQty <= 0) return null;

  return total / totalQty;
}

export function orderHasStoredPriceMismatch(order) {
  const total = toMoneyNumber(order?.total);
  if (total === null || total <= 0) return false;

  const storedItemsTotal = getStoredItemsTotal(order?.items);
  if (!storedItemsTotal || storedItemsTotal <= 0) return false;

  return Math.abs(storedItemsTotal - total) > 1;
}

export function getOrderItemPricing(item, order = null) {
  const qty = normalizeQty(item?.qty);

  if (item?.showPrice === false) {
    return {
      unitPrice: null,
      subtotal: null,
      hasPrice: false,
      source: 'hidden',
    };
  }

  const shouldInferLegacySingleProductPrice =
    order &&
    orderHasStoredPriceMismatch(order) &&
    canInferSingleProductUnitPrice(order);

  if (shouldInferLegacySingleProductPrice) {
    const inferredUnitPrice = getLegacySingleProductUnitPrice(order);

    if (inferredUnitPrice !== null && inferredUnitPrice > 0) {
      return {
        unitPrice: inferredUnitPrice,
        subtotal: qty * inferredUnitPrice,
        hasPrice: true,
        source: 'legacy_single_product_total',
      };
    }
  }

  const storedSubtotal = getStoredItemSubtotal(item);

  if (storedSubtotal !== null && storedSubtotal > 0) {
    return {
      unitPrice: qty > 0 ? storedSubtotal / qty : getStoredUnitPrice(item),
      subtotal: storedSubtotal,
      hasPrice: true,
      source: 'stored_subtotal',
    };
  }

  const storedUnitPrice = getStoredUnitPrice(item);

  if (storedUnitPrice !== null && storedUnitPrice > 0) {
    return {
      unitPrice: storedUnitPrice,
      subtotal: qty * storedUnitPrice,
      hasPrice: true,
      source: 'stored_unit',
    };
  }

  return {
    unitPrice: null,
    subtotal: null,
    hasPrice: false,
    source: 'missing',
  };
}

export function buildOrderItemsSnapshot(cartItems, getUnitPrice) {
  if (!Array.isArray(cartItems)) return [];

  return cartItems.map(item => {
    const qty = normalizeQty(item?.qty);
    const rawUnitPrice = item?.showPrice === false ? null : getUnitPrice(item?.product_id);
    const unitPrice = toMoneyNumber(rawUnitPrice);
    const hasPrice = item?.showPrice !== false && unitPrice !== null && unitPrice > 0;
    const subtotal = hasPrice ? qty * unitPrice : null;

    return {
      ...item,
      qty,
      pricePerUnit: hasPrice ? unitPrice : null,
      unitPrice: hasPrice ? unitPrice : null,
      price_per_unit: hasPrice ? unitPrice : null,
      subtotal,
      lineTotal: subtotal,
      pricing_snapshot_version: 1,
      pricing_snapshot_source: 'checkout',
    };
  });
}

export function getOrderItemsTotal(items) {
  if (!Array.isArray(items)) return 0;

  const total = items.reduce((sum, item) => {
    const pricing = getOrderItemPricing(item);
    return sum + (pricing.hasPrice ? pricing.subtotal : 0);
  }, 0);

  return Math.round(total);
}