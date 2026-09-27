import React from 'react';
import { LiveIndicator } from '../news/LiveIndicator.jsx';
export function VideoLowerThird({ kicker = 'Agora · CityNews Cuiabá', headline, style }) {
  return (
    <div style={{ background: 'var(--cn-tinta)', borderRadius: 'var(--r-xs)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10, ...style }}>
      <LiveIndicator label={kicker} inverse pulse={false} />
      <div style={{ font: '700 20px/1.2 var(--font-sans)', color: 'var(--text-inverse)', letterSpacing: '-0.01em' }}>{headline}</div>
    </div>
  );
}
