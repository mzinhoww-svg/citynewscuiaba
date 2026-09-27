import React from 'react';
import { Icon } from '../icons/Icon.jsx';
export function TextField({ label, icon, type = 'text', placeholder, value, defaultValue, onChange, error, disabled = false, style }) {
  const [show, setShow] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  const isPwd = type === 'password';
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 12, ...style }}>
      {label && <span style={{ font: 'var(--type-label)', fontSize: 16, color: 'var(--text-strong)' }}>{label}</span>}
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, height: 'var(--h-input)', padding: '0 16px', borderRadius: 'var(--r-lg)', background: 'var(--surface-input)', boxSizing: 'border-box',
        border: '1px solid ' + (error ? 'var(--text-danger)' : focus ? 'var(--cn-tinta)' : 'transparent'), opacity: disabled ? .6 : 1, transition: 'border-color var(--dur-base) var(--ease-standard)' }}>
        {icon && <Icon name={icon} color="var(--text-placeholder)" />}
        <input type={isPwd && !show ? 'password' : isPwd ? 'text' : type} placeholder={placeholder} value={value} defaultValue={defaultValue} onChange={onChange} disabled={disabled}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', font: '400 15px/1.2 var(--font-sans)', color: 'var(--text-strong)' }} />
        {isPwd && <span role="button" onClick={(e) => { e.preventDefault(); setShow(!show); }} style={{ cursor: 'pointer', display: 'flex' }}><Icon name={show ? 'eye-off' : 'eye'} color="var(--text-placeholder)" /></span>}
      </span>
      {error && <span style={{ font: 'var(--type-meta)', color: 'var(--text-danger)' }}>{error}</span>}
    </label>
  );
}
