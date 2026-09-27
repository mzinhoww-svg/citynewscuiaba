Pill-shaped action button — use `primary` (Tinta) for the one main CTA per screen, `outline` for social sign-in and secondary actions, `text` for inline links like "Ver tudo".
```jsx
<Button fullWidth>Entrar</Button>
<Button variant="outline" fullWidth leading={<img src="google.svg" width="20"/>}>Entrar com Google</Button>
<Button size="sm">Seguir</Button> <Button size="sm" variant="outline-strong">Seguindo</Button>
<Button variant="danger">Sair</Button>
```
- Sizes: lg 56 (forms, sheets), md 44, sm 30 (follow chips in topic cards).
- `accent` (Urucum fill) only for live/"Agora" moments — never as the default CTA.
- Disabled = papel-2 fill + placeholder text. Press = scale .98.
