import React from 'react';
export function LiveIndicator({ label = 'Agora', pulse = true, inverse = false }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, font: 'var(--type-eyebrow)', letterSpacing: 'var(--ls-eyebrow)', textTransform: 'uppercase', color: inverse ? 'var(--text-inverse)' : 'var(--text-strong)' }}>
      <span style={{ position: 'relative', width: 8, height: 8 }}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--accent)' }} />
        {pulse && <span style={{ position: 'absolute', inset: -4, borderRadius: '50%', background: 'var(--accent)', opacity: .25, animation: 'cn-pulse 1.8s var(--ease-standard) infinite' }} />}
      </span>
      {label}
      <style>{'@keyframes cn-pulse{0%{transform:scale(.4);opacity:.45}100%{transform:scale(1.4);opacity:0}}'}</style>
    </span>
  );
}
