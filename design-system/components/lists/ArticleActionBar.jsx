import React from 'react';
import { Icon } from '../icons/Icon.jsx';
export function ArticleActionBar({ likes, comments, liked = false, saved = false, progress = 0, onLike, onComment, onShare, onSave, style }) {
  const btn = { display: 'inline-flex', alignItems: 'center', gap: 8, border: 0, background: 'transparent', cursor: 'pointer', padding: 0, font: '500 15px/1 var(--font-sans)', color: 'var(--text-meta)' };
  return (
    <div style={{ position: 'relative', background: 'var(--cn-branco)', borderTop: '1px solid var(--border-subtle)', ...style }}>
      <div style={{ position: 'absolute', top: -1, left: 0, height: 3, width: progress * 100 + '%', background: 'var(--accent)', transition: 'width var(--dur-base) linear' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, padding: '0 var(--gutter-mobile)' }}>
        <button style={{ ...btn, color: liked ? 'var(--cn-erro)' : btn.color }} onClick={onLike}><Icon name="heart" fill={liked ? 'currentColor' : 'none'} />{likes}</button>
        <button style={btn} onClick={onComment}><Icon name="message-circle" />{comments}</button>
        <button style={btn} onClick={onShare} aria-label="Compartilhar"><Icon name="share-2" /></button>
        <button style={{ ...btn, color: saved ? 'var(--text-link)' : btn.color }} onClick={onSave} aria-label="Salvar"><Icon name="bookmark" fill={saved ? 'currentColor' : 'none'} /></button>
      </div>
    </div>
  );
}
