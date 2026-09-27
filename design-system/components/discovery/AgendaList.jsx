import React from 'react';
export function AgendaList({ items, variant = 'time', title, surface = 'papel', style }) {
  return (
    <div style={{ background: surface === 'papel' ? 'var(--bg-section)' : 'transparent', padding: surface === 'papel' ? 20 : 0, ...style }}>
      {title && <div style={{ font: 'var(--type-eyebrow)', letterSpacing: 'var(--ls-eyebrow)', textTransform: 'uppercase', color: 'var(--text-strong)', paddingBottom: 12, borderBottom: '1px solid var(--cn-linha)' }}>{title}</div>}
      {items.map((it, i) => variant === 'time' ? (
        <div key={i} style={{ padding: '12px 0', borderBottom: i < items.length - 1 ? '1px solid var(--cn-linha)' : 0 }}>
          <div style={{ font: '700 13px/1.2 var(--font-sans)', color: 'var(--text-service)' }}>{it.when}</div>
          <div style={{ font: '600 15px/1.3 var(--font-sans)', color: 'var(--text-strong)', marginTop: 2 }}>{it.title}</div>
          {it.place && <div style={{ font: 'var(--type-meta)', color: 'var(--text-meta)', marginTop: 2 }}>{it.place}</div>}
        </div>) : (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '64px 1fr', alignItems: 'baseline', padding: '14px 0', borderTop: '1px solid var(--cn-linha)' }}>
          <span style={{ font: '700 13px/1 var(--font-sans)', textTransform: 'uppercase', color: 'var(--text-strong)' }}>{it.when}</span>
          <span style={{ font: '400 15px/1.3 var(--font-sans)', color: 'var(--text-strong)' }}>{it.title}{it.place ? ' · ' + it.place : ''}</span>
        </div>))}
    </div>
  );
}
