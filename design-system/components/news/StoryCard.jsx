import React from 'react';
import { Photo } from './Photo.jsx';
import { CategoryTag } from './CategoryTag.jsx';
import { MetaRow } from './MetaRow.jsx';
import { Icon } from '../icons/Icon.jsx';
export function StoryCard({ title, image, category, author, avatar, time, comments, saved, onToggleSave, onClick, width = 278, style }) {
  return (
    <article onClick={onClick} style={{ width, padding: 14, borderRadius: 'var(--r-xl)', background: 'var(--surface-card)', display: 'flex', flexDirection: 'column', gap: 14, boxSizing: 'border-box', cursor: onClick ? 'pointer' : 'default', flexShrink: 0, ...style }}>
      <Photo src={image} radius="var(--r-lg)" style={{ height: 150 }}>
        {category && <span style={{ position: 'absolute', top: 12, left: 12 }}><CategoryTag variant="pill">{category}</CategoryTag></span>}
        {saved !== undefined && <span role="button" onClick={(e) => { e.stopPropagation(); onToggleSave && onToggleSave(); }} style={{ position: 'absolute', top: 12, right: 12, cursor: 'pointer', color: 'var(--text-inverse)' }}>
          <Icon name="bookmark" size={24} fill={saved ? 'currentColor' : 'none'} /></span>}
      </Photo>
      <h3 style={{ margin: 0, font: 'var(--type-headline)', fontSize: 18, color: 'var(--text-strong)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{title}</h3>
      <MetaRow author={author} avatar={avatar} time={time} comments={comments} />
    </article>
  );
}
