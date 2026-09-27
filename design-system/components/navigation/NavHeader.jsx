import React from 'react';
import { IconButton } from '../actions/IconButton.jsx';
import { Icon } from '../icons/Icon.jsx';
export function NavHeader({ title, onBack, right, variant = 'circle', divider = false, style }) {
  const back = onBack && (variant === 'circle'
    ? <IconButton icon="arrow-left" label="Voltar" onClick={onBack} />
    : <button aria-label="Voltar" onClick={onBack} style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer', color: 'var(--text-strong)', display: 'flex' }}><Icon name="arrow-left" /></button>);
  return (
    <header style={{ display: 'grid', gridTemplateColumns: '48px 1fr 48px', alignItems: 'center', minHeight: 48, padding: '0 var(--gutter-mobile)', paddingBottom: divider ? 16 : 0, borderBottom: divider ? '1px solid var(--border-subtle)' : 0, ...style }}>
      <div style={{ display: 'flex' }}>{back}</div>
      <div style={{ textAlign: 'center', font: 'var(--type-nav-title)', color: 'var(--text-strong)' }}>{title}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{right}</div>
    </header>
  );
}
