import React from 'react';
export function BarChart({ values, labels = [], height = 100, highlight, style }) {
  const max = Math.max(...values, 1);
  return (
    <div style={style}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height }}>
        {values.map((v, i) => <div key={i} style={{ flex: 1, height: Math.max(2, v / max * height), borderRadius: '4px 4px 0 0', background: i === highlight ? 'var(--accent)' : v ? 'linear-gradient(180deg, var(--cn-cerrado), var(--cn-cerrado-soft))' : 'transparent' }} />)}
      </div>
      {labels.length > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, font: '600 12px/1 var(--font-sans)', color: 'var(--text-placeholder)' }}>{labels.map((l, i) => <span key={i}>{l}</span>)}</div>}
    </div>
  );
}
