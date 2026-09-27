import React from 'react';
export function Slider({ value, defaultValue = 50, min = 0, max = 100, steps, onChange, startAdornment, endAdornment }) {
  const [inner, setInner] = React.useState(defaultValue);
  const v = value !== undefined ? value : inner;
  const ref = React.useRef(null);
  const pct = (v - min) / (max - min) * 100;
  const setFrom = (x) => { const r = ref.current.getBoundingClientRect(); let p = Math.min(1, Math.max(0, (x - r.left) / r.width)); let nv = min + p * (max - min); if (steps) { const st = (max - min) / (steps - 1); nv = min + Math.round((nv - min) / st) * st; } if (value === undefined) setInner(nv); onChange && onChange(nv); };
  const down = (e) => { setFrom(e.clientX); const mv = (ev) => setFrom(ev.clientX); const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {startAdornment}
      <div ref={ref} onPointerDown={down} style={{ position: 'relative', flex: 1, height: 24, cursor: 'pointer', touchAction: 'none' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 9, height: 6, borderRadius: 3, background: 'var(--cn-papel)' }} />
        <div style={{ position: 'absolute', left: 0, width: pct + '%', top: 9, height: 6, borderRadius: 3, background: 'var(--accent)' }} />
        {steps && Array.from({ length: steps }).map((_, i) => <span key={i} style={{ position: 'absolute', left: 'calc(' + (i / (steps - 1) * 100) + '% - 2px)', top: 10, width: 4, height: 4, borderRadius: 2, background: i / (steps - 1) * 100 <= pct ? 'var(--cn-branco)' : 'var(--text-placeholder)' }} />)}
        <div style={{ position: 'absolute', left: 'calc(' + pct + '% - 10px)', top: 2, width: 20, height: 20, borderRadius: '50%', background: 'var(--cn-branco)', border: '3px solid var(--accent)', boxSizing: 'border-box', boxShadow: 'var(--shadow-sm)' }} />
      </div>
      {endAdornment}
    </div>
  );
}
