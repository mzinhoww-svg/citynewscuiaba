import React from 'react';
import { Icon } from '../icons/Icon.jsx';
export function MetaRow({ author, avatar, time, comments, category, trending, onMore, inverse = false, style }) {
  const c = inverse ? 'rgba(255,255,255,.86)' : 'var(--text-meta)';
  const item = { display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, font: '400 13px/1 var(--font-sans)', color: c, minWidth: 0, ...style }}>
      {category && <span style={item}>{category}</span>}
      {author && <span style={{ ...item, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{avatar !== undefined && <span style={{ width: 20, height: 20, borderRadius: '50%', background: avatar ? 'center/cover url(' + avatar + ')' : 'var(--cn-papel-2)', flexShrink: 0 }} />}{author}</span>}
      {trending && <span style={{ ...item, color: inverse ? c : 'var(--text-link)' }}><Icon name="flame" size={14} />{trending}</span>}
      {comments !== undefined && <span style={item}><Icon name="message-circle" size={15} />{comments}</span>}
      {time && <span style={item}><Icon name="clock" size={15} />{time}</span>}
      {onMore && <span role="button" onClick={onMore} style={{ ...item, marginLeft: 'auto', cursor: 'pointer' }}><Icon name="ellipsis" size={18} /></span>}
    </div>
  );
}
