# CityNews Cuiabá — Design System

**CityNews Cuiabá** is a local news brand for Cuiabá and Várzea Grande (Mato Grosso, Brazil): *"O ponto da cidade. Notícia, agenda e serviço no mesmo lugar."* It publishes across a **mobile app**, a **website**, social posts, and short video. The brand idea is "O Ponto": an open letter **C** (the city, open to its people) plus an **Urucum-orange dot** that marks *now*. The master brand stays fixed; the geographic line underneath changes (Cuiabá, Várzea Grande, Campo Grande, Goiânia, Guia Cuiabá).

## Sources
- **Brand identity PDF** — `uploads/CityNews Cuiabá - Identidade de marca.pdf` (5 pages: 01 Assinatura principal, 02 Construção, 03 Sistema de cor e tipografia, 04 Assinaturas/versões, 05 Aplicações site/app/redes/vídeo). Colors, fonts, logo, and site/app/social layouts come from here.
- **App mockups** — `uploads/sc - 05…40.png`, `Frame 1–4.png`, gallery images `00-capa.jpg`, `0x-galeria-0x.avif`. These are a licensed third-party template ("Nachricht – News Portal Mobile Apps UI Kit", Outfit font, green accent). **We used its component inventory, layout, and measurements (375pt frame, 24px gutters, 52px inputs, 56px pill buttons, r16/r20 cards), and re-skinned it fully with the CityNews brand.** The Nachricht name, font, green, and emoji are not part of CityNews.
- **GitHub** — https://github.com/mzinhoww-svg/citynewscuiaba. The repository was **empty** when this system was built (the API returned "409 empty repository"), so no code was imported. Once code lands there, explore it and sync — it should become the source of truth for component behavior.

## Index
- `styles.css` — the only file consumers link (imports `tokens/*`).
- `tokens/` — `fonts.css` (@font-face), `colors.css`, `typography.css`, `spacing.css` (spacing, radii, shadows, motion), `base.css`.
- `fonts/` — Schibsted Grotesk (variable 400–900), Source Serif 4 (variable, roman + italic). Latin subset.
- `assets/logo/` — PNG signatures extracted from the brand PDF: `citynews-horizontal`, `-horizontal-negative`, `-horizontal-mono`, `-vertical-negative`, `-symbol`.
- `components/` — React primitives (see list below), each with `.jsx`, `.d.ts`, `.prompt.md`, plus one card per folder.
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Brand).
- `ui_kits/app/` — interactive mobile app (Abertura, Login, Início, Buscar, Salvos, Matéria + Exibição sheet, Configurações + logout dialog).
- `ui_kits/web/` — website home (lead + Agenda de hoje + Mais notícias + O que fazer em Cuiabá) and article page.
- `SKILL.md` — Agent Skill entry point. `github.md` — source repo association.

## Components
- **icons/** — `Icon` (Lucide paths, 1.5 stroke)
- **actions/** — `Button`, `IconButton`
- **forms/** — `TextField`, `SearchBar`, `Toggle`, `Slider`, `SegmentedToggle`
- **navigation/** — `Chip` / `ChipGroup`, `Tabs`, `TabBar`, `NavHeader`, `SectionHeader`
- **news/** — `NewsCard`, `FeatureCard`, `StoryCard`, `Photo`, `CategoryTag`, `MetaRow`, `LiveIndicator`
- **discovery/** — `TopicCard`, `SourceAvatar`, `AgendaList`, `StatCard`, `BarChart`
- **lists/** — `ListRow`, `ArticleActionBar`
- **overlays/** — `Dialog`, `BottomSheet`
- **brand/** — `Logo`, `SiteHeader`, `VideoLowerThird`

**Where they come from:** the mockup template defines the app families (buttons, inputs, search, chips, tabs, bottom nav, headers, feature/list/story cards, topic tiles, source avatars, stats + chart, list rows, toggles, sliders, dialog, bottom sheet, article action bar). The brand PDF defines `SiteHeader`, `AgendaList`, `LiveIndicator` ("Agora"), `VideoLowerThird` (tarja), `CategoryTag` label plate, and the logo versions.

**Intentional additions:** `Icon` (wraps the icon set so components share one glyph source); `Photo` (the brand PDF uses a warm-grey "Foto" box for images — this makes that placeholder a reusable slot); `Logo` (serves the extracted signature files).

---

## CONTENT FUNDAMENTALS
- **Language:** Brazilian Portuguese. Local and specific: street names, bairros, temperatures, times ("Av. do CPA", "32° em Cuiabá", "19h", "sáb, 20h").
- **Voice:** a well-informed neighbor. Direct and useful, not sensational. "Notícia, agenda e serviço" — every piece should help the reader *do* something (go, avoid, decide).
- **Headlines:** sentence case, no final period, verb-led, ≤ 2 lines ("Título da reportagem principal da edição em até duas linhas"). No clickbait, no ALL CAPS headlines.
- **Lede:** the first sentence of a story/post is **bold** and carries the essentials; 2–3 lines of context follow "for people who only read the post".
- **Eyebrows / editorias:** one or two words, UPPERCASE with wide tracking: CIDADE, MOBILIDADE, ENTRETENIMENTO, AGENDA · FIM DE SEMANA.
- **Address:** second person, informal-neutral ("você"): "Entre com a conta que você já cadastrou", "Temas que você segue". Brand speaks as "CityNews", never "we the team".
- **UI labels:** short verbs — Entrar, Seguir/Seguindo, Ver tudo, Aplicar, Salvar, Sair. Time as relative ("há 12 min", "5 h") in feeds, absolute ("29/09/2026, 9h12") in articles. Time format: "19h", "20h30".
- **Bylines:** "Por [Autor] · atualizado há 12 min". Separator is the middle dot `·`; vertical bar `|` only in footer nav strings.
- **Emoji:** never. The source template's topic emoji were replaced by outline icons. The 🔥 "trending" becomes a `flame` icon.

## VISUAL FOUNDATIONS
- **Palette:** Tinta `#0F1B2D` leads (text, dark grounds, primary buttons, active chips). Urucum `#E8491D` is the dot — live indicators, active markers, progress, slider fills; used in *small quantities*. Urucum Texto `#B33A12` is the accessible version for small text/links/eyebrows. Cerrado `#1E6B52` marks Guia/serviços/utilidade (agenda times, toggles ON, positive deltas). Papel `#F5F2EC` is the warm section/card/input fill. Grafite `#4A4F57` for metadata. Proportion bar in the PDF: Tinta ≫ Papel/white > Cerrado > Urucum.
- **Type:** Schibsted Grotesk for the brand, UI, section titles, and big display ("O que fazer em Cuiabá", 800, tight −0.02 to −0.03em). Source Serif 4 for news headlines and reading body — this is what makes it feel like journalism. Eyebrows: Grotesk 700, 12px, +0.08em, uppercase.
- **Backgrounds:** flat white or Papel. Dark Tinta blocks for splash, footer, video plates, app icon. No gradients except the **protection gradient** (transparent → Tinta 88%) on photos behind white text. No textures or patterns.
- **Imagery:** real reportage photography of the city; the splash uses black-and-white. Until real photos are supplied, use the `Photo` placeholder (`--cn-foto` #E6E1D8, "Foto" label) exactly as the PDF does.
- **Corner radii:** app surfaces are soft — inputs/photos r16, list cards/modals r20, sheet r28, thumbnails r12, buttons/chips pills. Web and print are square (photos r0 on the site, r4 plates) — editorial and sober.
- **Cards:** flat — Papel fill with no border and no shadow (NewsCard, StoryCard, TopicCard); or white with a 1px `#ECEAE6` hairline (StatCard, ListRow). Never left-border accent cards.
- **Shadows:** almost none. `--shadow-lg` only for floating dialogs/sheets; `--shadow-sm` on toggle knobs and the active segment.
- **Borders/lines:** 1px hairlines; a 1px Tinta rule separates big web sections (from the PDF layout).
- **Transparency & blur:** only for overlays — scrim `rgba(15,27,45,.48)` + 8px backdrop blur behind dialogs/sheets; white 14% glass for icon buttons over photos.
- **Motion:** quiet. 120–320ms, `cubic-bezier(.2,0,0,1)`; fades and slides for sheets; the live dot has a soft pulse. No bounces.
- **Hover/press:** links go Urucum Texto → Tinta + underline; buttons scale to .98 on press and primary darkens to `--cn-tinta-80`; chips/tabs switch fill (Papel ↔ Tinta).
- **Layout:** mobile 375pt, 24px gutters, 16px vertical rhythm between cards, 20–24px between sections; bottom tab bar fixed (64 + safe area). Web: 1200 max, 40px gutters, lead story + 300px agenda sidebar, sticky masthead with "● AGORA".
- **Logo rules:** min 96px wide digital / 25mm print; symbol alone ≥16px; clear space = 2× dot diameter; negative version on Tinta/photo.

## ICONOGRAPHY
- The mockups use a thin **outline** icon set (~1.5px stroke, rounded caps, 24px grid) — nav (home, book, bookmark, user), meta (clock, comment), inputs (mail, lock, eye), settings (globe, shield, help, logout).
- No icon files were supplied, so we use **Lucide** (closest match in weight and style). Paths are copied verbatim into `components/icons/Icon.jsx` (ISC license) — no CDN needed. ⚠️ *Substitution — swap in the official set if one exists.*
- Sizes: 24 nav/inputs, 20 buttons/list rows, 14–16 meta rows. Active states fill the glyph (bookmark, heart).
- **No emoji, no unicode pictograms.** The only "icon" that is brand is **O Ponto** — the Urucum dot, reused as live indicator, notification badge, and active marker.
- Social sign-in buttons show text only; add official Google/Apple marks when available.

## Caveats
- Logos are **raster PNGs cropped from the PDF** (≈900px wide). Replace with vector SVG masters when available.
- Fonts are the Google Fonts versions named in the brand PDF (Schibsted Grotesk, Source Serif 4) — no substitution needed.
