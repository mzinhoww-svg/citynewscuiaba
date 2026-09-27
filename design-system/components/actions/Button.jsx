import React from 'react';
import { Icon } from '../icons/Icon.jsx';
const SIZES = { lg: { h: 56, px: 24, fs: 16, icon: 20 }, md: { h: 44, px: 20, fs: 14, icon: 18 }, sm: { h: 30, px: 16, fs: 12, icon: 14 } };
export function Button({ variant = 'primary', size = 'lg', icon, iconRight, leading, fullWidth = false, disabled = false, onClick, children, style, type = 'button' }) {
  const s = SIZES[size] || SIZES.lg;
  const [press, setPress] = React.useState(false);
  const v = {
    primary: { background: 'var(--action-primary)', color: 'var(--text-inverse)', border: '1px solid transparent' },
    secondary: { background: 'var(--action-secondary)', color: 'var(--text-strong)', border: '1px solid transparent' },
    outline: { background: 'var(--cn-branco)', color: 'var(--text-strong)', border: '1px solid var(--border-subtle)' },
    'outline-strong': { background: 'transparent', color: 'var(--text-strong)', border: '1px solid var(--border-strong)' },
    accent: { background: 'var(--accent)', color: 'var(--text-inverse)', border: '1px solid transparent' },
    text: { background: 'transparent', color: 'var(--text-link)', border: '1px solid transparent' },
    danger: { background: 'transparent', color: 'var(--text-danger)', border: '1px solid transparent' },
  }[variant];
  const dis = disabled ? { background: variant === 'text' || variant === 'danger' ? 'transparent' : 'var(--cn-papel-2)', color: 'var(--text-placeholder)', border: '1px solid transparent', cursor: 'not-allowed' } : {};
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      onPointerDown={() => setPress(true)} onPointerUp={() => setPress(false)} onPointerLeave={() => setPress(false)}
      style={{ display: fullWidth ? 'flex' : 'inline-flex', width: fullWidth ? '100%' : undefined, alignItems: 'center', justifyContent: 'center', gap: 10,
        height: variant === 'text' || variant === 'danger' ? 'auto' : s.h, padding: variant === 'text' || variant === 'danger' ? 0 : '0 ' + s.px + 'px',
        borderRadius: 'var(--r-pill)', font: '600 ' + s.fs + 'px/1 var(--font-sans)', cursor: 'pointer', boxSizing: 'border-box', whiteSpace: 'nowrap',
        transition: 'transform var(--dur-fast) var(--ease-standard), background var(--dur-base) var(--ease-standard)',
        transform: press && !disabled ? 'scale(.98)' : 'none', ...v, ...(press && variant === 'primary' ? { background: 'var(--action-primary-pressed)' } : {}), ...dis, ...style }}>
      {leading}
      {icon && <Icon name={icon} size={s.icon} />}
      {children}
      {iconRight && <Icon name={iconRight} size={s.icon} />}
    </button>
  );
}
