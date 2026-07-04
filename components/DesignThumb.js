'use client';

import { useDesigns } from '@/contexts/DesignsContext';
import { getDesignDisplayImageUrl } from '@/lib/design-image-url';

export default function DesignThumb({ designId, imageUrl: imageUrlProp, name: nameProp, size = 32, style }) {
  const { designById, designByName, openLightbox } = useDesigns();

  let design = null;
  if (designId) {
    design = designById.get(String(designId)) ?? null;
    if (!design && nameProp) design = designByName.get(nameProp.toLowerCase()) ?? null;
  } else if (nameProp) {
    design = designByName.get(nameProp.toLowerCase()) ?? null;
  }

  const imageUrl = imageUrlProp || getDesignDisplayImageUrl(design);
  const name = nameProp || design?.name || '';

  if (!imageUrl) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 5, flexShrink: 0,
        background: '#e8eaf4', border: '1px solid #dde1ef',
        display: 'inline-block',
        ...style,
      }} />
    );
  }

  return (
    <img
      src={imageUrl}
      alt={name}
      title={name}
      onClick={() => openLightbox(imageUrl, name)}
      style={{
        width: size, height: size, borderRadius: 5, flexShrink: 0,
        objectFit: 'cover', border: '1px solid #dde1ef',
        cursor: 'pointer', display: 'inline-block',
        verticalAlign: 'middle',
        ...style,
      }}
    />
  );
}
