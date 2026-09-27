import React from 'react';
import { IconButton } from '../actions/IconButton.jsx';
export function Dialog({ open = true, title, children, actions, onClose, inline = false }) {
  if (!open) return null;
  const box = (
    <div role="dialog" style={{ position: 'relative', width: '100%', maxWidth: 312, background: 'var(--cn-branco)', borderRadius: 'var(--r-xl)', padding: '48px 24px 24px', boxSizing: 'border-box', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
      {onClose && <IconButton icon="x" variant="ghost" size={40} label="Fechar" onClick={onClose} style={{ position: 'absolute', top: 10, right: 10 }} />}
      {title && <h3 style={{ margin: 0, font: '600 18px/1.35 var(--font-sans)', color: 'var(--text-strong)', textWrap: 'balance' }}>{title}</h3>}
      {children && <div style={{ marginTop: 10, font: 'var(--type-body)', color: 'var(--text-meta)' }}>{children}</div>}
      {actions && <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>{actions}</div>}
    </div>
  );
  if (inline) return box;
  return <div onClick={(e) => e.target === e.currentTarget && onClose && onClose()} style={{ position: 'absolute', inset: 0, background: 'var(--surface-overlay)', backdropFilter: 'blur(var(--blur-overlay))', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, zIndex: 50 }}>{box}</div>;
}
