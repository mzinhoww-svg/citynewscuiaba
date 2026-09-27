import React from 'react';
import { Icon } from '../icons/Icon.jsx';
export function StatCard({ icon, label, value, delta, trend = 'up', style }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border-subtle)', background: 'var(--cn-branco)', ...style }}>
      <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--cn-papel)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-strong)', flexShrink: 0 }}><Icon name={icon} size={20} /></span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <span style={{ font: '400 13px/1 var(--font-sans)', color: 'var(--text-meta)' }}>{label}</span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><b style={{ font: '700 17px/1 var(--font-sans)', color: 'var(--text-strong)' }}>{value}</b>
          {delta && <span style={{ font: '600 11px/1 var(--font-sans)', color: trend === 'up' ? 'var(--text-service)' : 'var(--text-danger)' }}>{delta}</span>}</span>
      </div>
    </div>
  );
}
