export const EMPTY_VISIBILITY_RULES = {
  hiddenProducts: [],
  hiddenVariants: [],
  hiddenCategories: {},
  hiddenDesigns: [],
};

export const ANONYMOUS_VISIBILITY_KEY = 'visibility_rules_anonymous';

export function userVisibilityKey(userId) {
  return userId ? `visibility_rules_user_${userId}` : ANONYMOUS_VISIBILITY_KEY;
}

export function parseVisibilityRules(value) {
  if (!value) return { ...EMPTY_VISIBILITY_RULES };
  try {
    const raw = typeof value === 'string' ? JSON.parse(value) : value;
    return normalizeVisibilityRules(raw);
  } catch {
    return { ...EMPTY_VISIBILITY_RULES };
  }
}

export function normalizeVisibilityRules(raw = {}) {
  const hiddenCategories = {};
  Object.entries(raw.hiddenCategories || {}).forEach(([productId, categories]) => {
    if (Array.isArray(categories)) {
      hiddenCategories[productId] = [...new Set(categories.filter(Boolean))];
    }
  });

  return {
    hiddenProducts: uniqueStrings(raw.hiddenProducts),
    hiddenVariants: uniqueStrings(raw.hiddenVariants),
    hiddenCategories,
    hiddenDesigns: uniqueStrings(raw.hiddenDesigns),
  };
}

export function serializeVisibilityRules(rules) {
  return JSON.stringify(normalizeVisibilityRules(rules));
}

export function visibilityCounts(rules) {
  const normalized = normalizeVisibilityRules(rules);
  return {
    products: normalized.hiddenProducts.length,
    variants: normalized.hiddenVariants.length,
    categories: Object.values(normalized.hiddenCategories).reduce((sum, list) => sum + list.length, 0),
    designs: normalized.hiddenDesigns.length,
  };
}

export function isRootProduct(product, products) {
  return !product?.parent_product_id || !products.some(p => p.id === product.parent_product_id);
}

export function getRootProductId(product) {
  return product?.parent_product_id || product?.id;
}

export function isProductHidden(product, products, rules) {
  if (!product) return false;
  const normalized = normalizeVisibilityRules(rules);
  const rootId = getRootProductId(product);
  if (normalized.hiddenProducts.includes(rootId)) return true;
  if (!isRootProduct(product, products) && normalized.hiddenVariants.includes(product.id)) return true;
  return false;
}

export function isCategoryHidden(productId, category, rules) {
  if (!productId || !category || category === 'Todos') return false;
  const normalized = normalizeVisibilityRules(rules);
  return (normalized.hiddenCategories[productId] || []).includes(category);
}

export function isDesignHidden(design, rules) {
  if (!design) return false;
  const normalized = normalizeVisibilityRules(rules);
  return normalized.hiddenDesigns.includes(design.id);
}

export function filterProductsForVisibility(products, rules) {
  return (products || []).filter(product => !isProductHidden(product, products || [], rules));
}

export function filterCategoriesForVisibility(product, categories, rules) {
  return (categories || []).filter(category => !isCategoryHidden(product?.id, category, rules));
}

export function filterDesignsForVisibility(designs, rules) {
  return (designs || []).filter(design => !isDesignHidden(design, rules));
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean).map(String))];
}
