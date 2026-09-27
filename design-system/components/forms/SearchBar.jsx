import React from 'react';
import { Icon } from '../icons/Icon.jsx';
export function SearchBar({ placeholder = 'Buscar notícias ou autores', value, onChange, onFilter, showFilter = true, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 'var(--h-input)', padding: '0 16px', borderRadius: 'var(--r-lg)', background: 'var(--surface-input)', boxSizing: 'border-box', ...style }}>
      <Icon name="search" color="var(--text-placeholder)" />
      <input value={value} onChange={onChange} placeholder={placeholder} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', font: '400 15px/1.2 var(--font-sans)', color: 'var(--text-strong)' }} />
      {showFilter && <span role="button" aria-label="Filtros" onClick={onFilter} style={{ cursor: 'pointer', display: 'flex' }}><Icon name="sliders-horizontal" color="var(--text-meta)" /></span>}
    </div>
  );
}
