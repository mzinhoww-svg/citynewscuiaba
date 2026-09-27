import React from 'react';
import { Icon } from '../icons/Icon.jsx';
export function IconButton({ icon, variant = 'outline', size = 48, badge = false, label, onClick, style, iconColor }) {
  const v = {
    outline: { background: 'var(--cn-branco)', border: '1px solid var(--border-subtle)', color: 'var(--text-strong)' },
    filled: { background: 'var(--surface-card)', border: '1px solid transparent', color: 'var(--text-strong)' },
    inverse: { background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.2)', color: 'var(--text-inverse)' },
    ghost: { background: 'transparent', border: '1px solid transparent', color: 'var(--text-strong)' },
  }[variant];
  return (
    <button aria-label={label || icon} onClick={onClick}
      style={{ position: 'relative', width: size, height: size, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flexShrink: 0, boxSizing: 'border-box', ...v, ...style }}>
      <Icon name={icon} size={Math.round(size / 2)} color={iconColor} />
      {badge && <span style={{ position: 'absolute', top: size * 0.27, right: size * 0.29, width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 0 2px var(--cn-branco)' }} />}
    </button>
  );
}
