export const DESIGN_LIMITS_SETTING_KEY = 'design_limit_rules';

export const DEFAULT_CALCO_DESIGN_LIMIT_TIERS = [
  { min_quantity: 50, max_designs: 30 },
  { min_quantity: 100, max_designs: 50 },
  { min_quantity: 150, max_designs: 70 },
  { min_quantity: 200, max_designs: 85 },
  { min_quantity: 300, max_designs: 105 },
  { min_quantity: 400, max_designs: 120 },
];

export function parseDesignLimitRules(value) {
  if (!value) return {};
  try {
    const raw = typeof value === 'string' ? JSON.parse(value) : value;
    if (!raw || typeof raw !== 'object') return {};
    return Object.fromEntries(
      Object.entries(raw).map(([productId, config]) => [productId, normalizeDesignLimitConfig(config)])
    );
  } catch {
    return {};
  }
}

export function serializeDesignLimitRules(rules) {
  const normalized = {};
  Object.entries(rules || {}).forEach(([productId, config]) => {
    normalized[productId] = normalizeDesignLimitConfig(config);
  });
  return JSON.stringify(normalized);
}

export function normalizeDesignLimitConfig(config = {}) {
  return {
    inheritParent: config.inheritParent === true,
    tiers: normalizeDesignLimitTiers(config.tiers),
  };
}

export function normalizeDesignLimitTiers(tiers = []) {
  return (Array.isArray(tiers) ? tiers : [])
    .map(tier => ({
      min_quantity: Math.max(1, Number(tier.min_quantity) || 0),
      max_designs: Math.max(1, Number(tier.max_designs) || 0),
    }))
    .filter(tier => tier.min_quantity > 0 && tier.max_designs > 0)
    .sort((a, b) => a.min_quantity - b.min_quantity);
}

export function getDesignLimitConfig(product, products, rules) {
  if (!product) return { productId: null, inherited: false, tiers: [] };
  const hasOwnConfig = Object.prototype.hasOwnProperty.call(rules || {}, product.id);
  const own = normalizeDesignLimitConfig(rules?.[product.id]);
  if (own.inheritParent && product.parent_product_id) {
    const parent = products.find(p => p.id === product.parent_product_id);
    const parentConfig = getDesignLimitConfig(parent, products, rules);
    return { ...parentConfig, inherited: true, inheritedFromId: parent?.id || null };
  }
  const fallbackTiers = !hasOwnConfig && shouldUseDefaultCalcoTiers(product) ? DEFAULT_CALCO_DESIGN_LIMIT_TIERS : [];
  return {
    productId: product.id,
    inherited: false,
    inheritedFromId: null,
    tiers: own.tiers.length > 0 ? own.tiers : fallbackTiers,
  };
}

export function getDesignLimitState({ productId, products, rules, cartItems, nextCartItems }) {
  const product = products.find(p => p.id === productId);
  const config = getDesignLimitConfig(product, products, rules);
  if (!config.tiers.length) return null;

  const items = nextCartItems || cartItems || [];
  const productItems = items.filter(item => item.product_id === productId && Number(item.qty) > 0);
  const totalQty = productItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const distinctDesigns = productItems.length;
  const currentTier = getApplicableDesignLimitTier(config.tiers, totalQty);
  if (!currentTier) return null;

  const nextTier = config.tiers.find(tier => Number(tier.max_designs) > Number(currentTier.max_designs)) || null;
  return {
    product,
    totalQty,
    distinctDesigns,
    maxDesigns: Number(currentTier.max_designs),
    currentTier,
    nextTier,
    tiers: config.tiers,
    inherited: config.inherited,
    inheritedFromId: config.inheritedFromId,
  };
}

export function getApplicableDesignLimitTier(tiers, totalQty) {
  const normalized = normalizeDesignLimitTiers(tiers);
  if (!normalized.length) return null;
  const applicable = normalized
    .filter(tier => Number(tier.min_quantity) <= totalQty)
    .sort((a, b) => Number(b.min_quantity) - Number(a.min_quantity))[0];
  return applicable || normalized[0];
}

function shouldUseDefaultCalcoTiers(product) {
  const name = `${product?.name || ''} ${product?.variant_name || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return name.includes('calcos librerias') || (name.includes('plancha') && name.includes('calco'));
}
