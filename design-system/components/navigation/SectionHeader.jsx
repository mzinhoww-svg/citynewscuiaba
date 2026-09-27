import React from 'react';
export function SectionHeader({ title, action = 'Ver tudo', onAction, eyebrow, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, ...style }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {eyebrow && <span style={{ font: 'var(--type-eyebrow)', letterSpacing: 'var(--ls-eyebrow)', textTransform: 'uppercase', color: 'var(--text-eyebrow)' }}>{eyebrow}</span>}
        <h2 style={{ margin: 0, font: 'var(--type-section)', color: 'var(--text-strong)', letterSpacing: '-0.01em' }}>{title}</h2>
      </div>
      {action && <button onClick={onAction} style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer', font: '600 14px/1 var(--font-sans)', color: 'var(--text-link)' }}>{action}</button>}
    </div>
  );
}
