import React from 'react';
export function CategoryTag({ children, variant = 'text', tone = 'news' }) {
  const color = tone === 'service' ? 'var(--text-service)' : 'var(--text-eyebrow)';
  if (variant === 'pill') return <span style={{ display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 12px', borderRadius: 'var(--r-pill)', background: tone === 'service' ? 'var(--cn-cerrado)' : 'var(--cn-urucum)', color: 'var(--text-inverse)', font: '600 12px/1 var(--font-sans)' }}>{children}</span>;
  if (variant === 'label') return <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 10px', background: 'var(--cn-branco)', color: 'var(--text-strong)', font: '700 11px/1 var(--font-sans)', letterSpacing: 'var(--ls-eyebrow)', textTransform: 'uppercase' }}>{children}</span>;
  return <span style={{ font: 'var(--type-eyebrow)', letterSpacing: 'var(--ls-eyebrow)', textTransform: 'uppercase', color }}>{children}</span>;
}
