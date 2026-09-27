Confirmation modal (logout, delete). Parent must be position:relative.
```jsx
<Dialog title="Tem certeza de que deseja sair?" onClose={close}
  actions={<><Button size="md" style={{minWidth:180}} onClick={close}>Cancelar</Button><Button variant="danger" onClick={logout}>Sair</Button></>} />
```
