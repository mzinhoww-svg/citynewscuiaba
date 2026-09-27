# Geração dos SVGs do logotipo

Os SVGs de `design-system/assets/logo/svg/` foram gerados a partir de três fontes:

- **Símbolo:** geometria medida no PNG do brand kit. Arco com raio de linha média 32 e traço 15, abertura de ±40°, ponto Urucum de raio 9 a uma distância de 1,0 raio externo do centro.
- **Wordmark "CityNews":** contornos da Schibsted Grotesk em peso 800, com tracking de −0,065em, ajustado à largura do PNG.
- **Linha geográfica:** Schibsted Grotesk em peso 500, com altura de maiúscula a 36% da altura de maiúscula do wordmark.

Para regerar, instancie as fontes variáveis com fontTools (`instancer`, pesos 800 e 500 em `/tmp/sg800.ttf` e `/tmp/sg500.ttf`) e rode `python3 scripts/brand/buildlogos.py`.

Quando o SVG mestre oficial existir, ele substitui estes arquivos.
