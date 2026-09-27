import React from 'react';
import { Icon } from '../icons/Icon.jsx';
export function ListRow({ icon, leading, label, value, trailing = 'chevron', selected = false, danger = false, bordered = true, onClick, style }) {
  const color = danger ? 'var(--text-danger)' : 'var(--text-strong)';
  return (
    <div role={onClick ? 'button' : undefined} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 52, padding: '0 16px', boxSizing: 'border-box', cursor: onClick ? 'pointer' : 'default',
      background: bordered ? 'var(--cn-branco)' : 'transparent', borderRadius: bordered ? 'var(--r-md)' : 0, border: bordered ? '1px solid ' + (selected ? 'var(--cn-urucum)' : 'var(--border-subtle)') : 0, ...style }}>
      {leading}
      {icon && <Icon name={icon} color={color} />}
      <span style={{ flex: 1, font: '500 15px/1.2 var(--font-sans)', color }}>{label}</span>
      {value && <span style={{ font: '400 14px/1 var(--font-sans)', color: 'var(--text-meta)' }}>{value}</span>}
      {trailing === 'chevron' && <Icon name="chevron-right" size={20} color="var(--text-placeholder)" />}
      {trailing === 'check' && selected && <Icon name="check" size={20} color="var(--text-link)" />}
      {trailing && typeof trailing === 'object' && trailing}
    </div>
  );
}
