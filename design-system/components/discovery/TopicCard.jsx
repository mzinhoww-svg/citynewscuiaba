import React from 'react';
import { Icon } from '../icons/Icon.jsx';
import { Button } from '../actions/Button.jsx';
export function TopicCard({ label, icon = 'newspaper', following, defaultFollowing = false, onToggle, style }) {
  const [inner, setInner] = React.useState(defaultFollowing);
  const on = following ?? inner;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '16px 10px', borderRadius: 'var(--r-lg)', background: 'var(--surface-card)', minWidth: 0, ...style }}>
      <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--cn-branco)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-strong)' }}><Icon name={icon} size={22} /></span>
      <span style={{ font: '500 14px/1.2 var(--font-sans)', color: 'var(--text-strong)', textAlign: 'center' }}>{label}</span>
      <Button size="sm" variant={on ? 'outline-strong' : 'primary'} onClick={() => { setInner(!on); onToggle && onToggle(!on); }} style={{ minWidth: 84 }}>{on ? 'Seguindo' : 'Seguir'}</Button>
    </div>
  );
}
