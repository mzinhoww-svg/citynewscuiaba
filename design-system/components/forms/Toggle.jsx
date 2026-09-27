import React from 'react';
export function Toggle({ checked, defaultChecked = false, onChange, disabled = false, label }) {
  const [inner, setInner] = React.useState(defaultChecked);
  const on = checked !== undefined ? checked : inner;
  const flip = () => { if (disabled) return; if (checked === undefined) setInner(!on); onChange && onChange(!on); };
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={flip} disabled={disabled}
      style={{ width: 40, height: 24, borderRadius: 999, border: 0, padding: 2, cursor: disabled ? 'not-allowed' : 'pointer', background: on ? 'var(--accent-service)' : 'var(--cn-papel-2)', opacity: disabled ? .5 : 1, display: 'flex', transition: 'background var(--dur-base) var(--ease-standard)', flexShrink: 0 }}>
      <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--cn-branco)', boxShadow: 'var(--shadow-sm)', transform: on ? 'translateX(16px)' : 'none', transition: 'transform var(--dur-base) var(--ease-standard)' }} />
    </button>
  );
}
