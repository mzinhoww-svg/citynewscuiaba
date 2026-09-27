import React from 'react';
export function BottomSheet({ open = true, title, children, footer, onClose, inline = false }) {
  if (!open) return null;
  const sheet = (
    <div style={{ position: inline ? 'relative' : 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--cn-branco)', borderRadius: 'var(--r-2xl) var(--r-2xl) 0 0', padding: '12px var(--gutter-mobile) 32px', boxShadow: 'var(--shadow-lg)' }}>
      <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--cn-papel-2)', margin: '0 auto 18px' }} />
      {title && <h3 style={{ margin: '0 0 24px', textAlign: 'center', font: 'var(--type-nav-title)', color: 'var(--text-strong)' }}>{title}</h3>}
      {children}
      {footer && <div style={{ marginTop: 32 }}>{footer}</div>}
    </div>
  );
  if (inline) return sheet;
  return <div onClick={(e) => e.target === e.currentTarget && onClose && onClose()} style={{ position: 'absolute', inset: 0, background: 'var(--surface-overlay)', backdropFilter: 'blur(var(--blur-overlay))', zIndex: 50 }}>{sheet}</div>;
}
