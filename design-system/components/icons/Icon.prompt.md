Outline icon used everywhere in CityNews UI (nav, meta rows, inputs); Lucide geometry at 1.5 stroke.
```jsx
<Icon name="search" size={24} color="var(--text-placeholder)" />
<Icon name="heart" fill="var(--cn-erro)" color="var(--cn-erro)" />
```
- `size` 16 in meta rows, 20 in buttons, 24 in nav/inputs.
- Active/filled state: pass `fill` (bookmark, heart). Never use emoji as icons.
