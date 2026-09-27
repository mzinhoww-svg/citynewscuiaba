import React from 'react';
import { Logo } from './Logo.jsx';
import { LiveIndicator } from '../news/LiveIndicator.jsx';
export function SiteHeader({ items = ['Notícias', 'Agenda', 'Guia', 'Serviços', 'Cultura'], active, onNavigate, logoBase = 'assets/logo/', live = true, style }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 40, height: 76, padding: '0 var(--gutter-desktop)', background: 'var(--cn-branco)', borderBottom: '1px solid var(--border-subtle)', ...style }}>
      <Logo base={logoBase} height={40} />
      <nav style={{ display: 'flex', gap: 28, flex: 1, justifyContent: 'center' }}>
        {items.map((it) => <a key={it} href="#" onClick={(e) => { e.preventDefault(); onNavigate && onNavigate(it); }}
          style={{ font: '500 16px/1 var(--font-sans)', color: 'var(--text-strong)', textDecoration: 'none', paddingBottom: 4, borderBottom: '2px solid ' + (it === active ? 'var(--accent)' : 'transparent') }}>{it}</a>)}
      </nav>
      {live && <LiveIndicator />}
    </header>
  );
}
