import React from 'react';
export function SourceAvatar({ name, image, initials, size = 56, onClick }) {
  const ini = initials || name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  return (
    <button onClick={onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, border: 0, background: 'transparent', padding: 0, cursor: 'pointer', width: size + 16 }}>
      <span style={{ width: size, height: size, borderRadius: '50%', background: image ? 'center/cover url(' + image + ')' : 'var(--cn-papel)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 16px/1 var(--font-sans)', color: 'var(--text-strong)' }}>{!image && ini}</span>
      <span style={{ font: '400 12px/1.2 var(--font-sans)', color: 'var(--text-strong)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{name}</span>
    </button>
  );
}
