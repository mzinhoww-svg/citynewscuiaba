import React from 'react';
export function Photo({ src, alt = '', label = 'Foto', ratio, height, radius = 'var(--r-lg)', style, children }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: radius, background: 'var(--surface-photo)', aspectRatio: ratio, height, flexShrink: 0, ...style }}>
      {src ? <img src={src} alt={alt} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', font: '400 13px/1.3 var(--font-sans)', color: 'var(--text-meta)', textAlign: 'center', padding: 8 }}>{label}</span>}
      {children}
    </div>
  );
}
