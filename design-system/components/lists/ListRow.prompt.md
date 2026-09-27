Row for Settings, Language and Security screens. Stack with 12px gap (bordered) or inside a grouped card with dividers (`bordered={false}`).
```jsx
<ListRow icon="globe" label="Idioma" value="Português" onClick={go} />
<ListRow label="Português (Brasil)" trailing="check" selected />
<ListRow label="Face ID" bordered={false} trailing={<Toggle defaultChecked />} />
<ListRow icon="log-out" label="Sair" danger trailing={null} />
```
