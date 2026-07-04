export function isModelUrl(url) {
  if (!url) return false;
  return /\.(3mf|glb|gltf|obj|usdz)$/i.test(String(url).split('?')[0]);
}

export function getDesignOriginalImageUrl(design) {
  if (!design) return null;
  return design.image_url || (!isModelUrl(design.model_url) ? design.model_url : null) || null;
}

export function getDesignDisplayImageUrl(design) {
  if (!design) return null;
  return design.optimized_image_url || getDesignOriginalImageUrl(design);
}
