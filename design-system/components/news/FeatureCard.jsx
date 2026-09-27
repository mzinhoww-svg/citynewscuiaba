import React from 'react';
import { Photo } from './Photo.jsx';
import { CategoryTag } from './CategoryTag.jsx';
import { Icon } from '../icons/Icon.jsx';
export function FeatureCard({ title, image, category, time, comments, width = 310, height = 176, onClick, style }) {
  const meta = { display: 'inline-flex', alignItems: 'center', gap: 5, font: '500 12px/1 var(--font-sans)', color: 'var(--text-inverse)' };
  return (
    <Photo src={image} label="" radius="var(--r-lg)" style={{ width, height, cursor: onClick ? 'pointer' : 'default', ...style }}>
      <div onClick={onClick} style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,27,45,.15) 0%, rgba(15,27,45,0) 35%, rgba(15,27,45,.88) 100%)' }} />
      <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
        {category && <CategoryTag variant="pill">{category}</CategoryTag>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          {time && <span style={meta}><Icon name="clock" size={14} />{time}</span>}
          {comments !== undefined && <span style={meta}><Icon name="message-circle" size={14} />{comments}</span>}
        </span>
      </div>
      <h3 style={{ position: 'absolute', left: 14, right: 14, bottom: 14, margin: 0, font: '600 18px/1.25 var(--font-serif)', color: 'var(--text-inverse)', textWrap: 'pretty', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{title}</h3>
    </Photo>
  );
}
