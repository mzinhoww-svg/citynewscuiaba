import React from 'react';
import { Photo } from './Photo.jsx';
import { MetaRow } from './MetaRow.jsx';
import { CategoryTag } from './CategoryTag.jsx';
export function NewsCard({ title, image, category, author, comments, time, onClick, onMore, surface = 'papel', style }) {
  return (
    <article onClick={onClick} style={{ display: 'flex', gap: 14, padding: 12, borderRadius: 'var(--r-xl)', cursor: onClick ? 'pointer' : 'default',
      background: surface === 'papel' ? 'var(--surface-card)' : 'var(--cn-branco)', border: surface === 'papel' ? 0 : '1px solid var(--border-subtle)', ...style }}>
      <Photo src={image} radius="var(--r-md)" style={{ width: 96, height: 96 }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'space-between', paddingTop: 2 }}>
        {category && <CategoryTag>{category}</CategoryTag>}
        <h3 style={{ margin: 0, font: 'var(--type-headline-sm)', color: 'var(--text-strong)', display: '-webkit-box', WebkitLineClamp: category ? 2 : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', textWrap: 'pretty' }}>{title}</h3>
        <MetaRow author={author} comments={comments} time={time} onMore={onMore} />
      </div>
    </article>
  );
}
