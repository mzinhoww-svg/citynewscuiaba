# Notas de integração do brand kit

- Origem: projeto Claude Design "CityNews Design System" (27/09/2026).
- `tokens/*.css` e `styles.css` são o **original do kit** e ficam como referência. Em produção vale `src/styles/tokens.css`, que mantém os nomes do kit e aplica os refinamentos R1 a R14 de `DESIGN.md` §2 (Névoa no lugar de Papel na UI, placeholder e bordas com contraste, foco sólido, tipografia maior, cores de IA, atenção e urgente, modo escuro, z-index).
- `components/*` são protótipos JSX com estilo inline. P0 Task 9b porta todos para TSX com tokens e as correções R4 a R10. Os `.prompt.md` viram documentação JSDoc.
- `ui_kits/app` e `ui_kits/web` são a referência de composição de telas. Abra `index.html` no navegador para ver.
- Não foram trazidas as capturas do template de terceiros (Nachricht) nem as imagens de galeria do kit: são licenciadas e não podem ir para produção. Continuam disponíveis no canvas do projeto.
- `reference/CityNews Cuiaba - Identidade de marca.pdf` é o documento de identidade que originou o kit.
- `_adherence.oxlintrc.json` foi convertido em regras do ESLint (sem hex e px crus, só as duas famílias de fonte, import pelo índice).
