"use client";

import { useState, type ReactNode } from "react";
import { applyTheme } from "@/lib/theme/apply";
import {
  AgendaList,
  ArticleActionBar,
  BarChart,
  BottomSheet,
  Button,
  CategoryTag,
  Chip,
  ChipGroup,
  Dialog,
  FeatureCard,
  Icon,
  ICON_NAMES,
  IconButton,
  ListRow,
  LiveIndicator,
  Logo,
  MetaRow,
  NavHeader,
  NewsCard,
  Photo,
  SearchBar,
  SectionHeader,
  SegmentedToggle,
  SiteFooter,
  SiteHeader,
  Slider,
  PopularSourcesRail,
  SourceAvatar,
  SourceCard,
  SourceRow,
  type SourceCardData,
  StatCard,
  StoryCard,
  TabBar,
  Tabs,
  TextField,
  Toggle,
  TopicCard,
  VideoLowerThird,
} from "@/components";

const DEMO_SOURCES: SourceCardData[] = [
  {
    slug: "folha-do-cerrado",
    name: "Folha do Cerrado",
    href: "/fontes/folha-do-cerrado",
    category: "Política",
    locality: "Cuiabá",
    reason: "Popular em Cuiabá",
    reach: 18_342,
    trend: "stable",
    itemsToday: 42,
    updatedAt: "2026-09-27T17:48:00Z",
    verified: true,
    preferred: true,
    followed: true,
  },
  {
    slug: "placar-mt",
    name: "Placar MT",
    href: "/fontes/placar-mt",
    category: "Esportes",
    locality: "Mato Grosso",
    reason: "Em alta nesta semana",
    reach: 4_120,
    trend: "up",
    itemsToday: 9,
    updatedAt: null,
  },
];

/** Card, linha e fileira de fontes (P2-T6) com seguir e ocultar em memória. */
function SourcesDemo() {
  const [followed, setFollowed] = useState<Set<string>>(new Set(["folha-do-cerrado"]));
  const [hidden, setHidden] = useState<string[]>([]);
  const onFollow = (slug: string, next: boolean) =>
    setFollowed((prev) => {
      const out = new Set(prev);
      if (next) out.add(slug);
      else out.delete(slug);
      return out;
    });
  const onHide = (slug: string) => setHidden((h) => [...h, slug]);
  const visible = DEMO_SOURCES.filter((s) => !hidden.includes(s.slug)).map((s) => ({
    ...s,
    followed: followed.has(s.slug),
  }));
  return (
    <div className="flex flex-col gap-6">
      <PopularSourcesRail title="Mais acessadas em Cuiabá" sources={DEMO_SOURCES} />
      <div className="grid gap-4 md:grid-cols-2">
        {visible.map((s) => (
          <SourceCard
            key={s.slug}
            source={s}
            onFollow={onFollow}
            onHide={onHide}
            now={new Date("2026-09-27T18:00:00Z")}
          />
        ))}
      </div>
      <ul className="flex max-w-xl flex-col">
        {visible.map((s) => (
          <SourceRow key={s.slug} source={s} onFollow={onFollow} onHide={onHide} />
        ))}
      </ul>
      {hidden.length > 0 && (
        <Button variant="text" onClick={() => setHidden([])}>
          Mostrar fontes ocultadas
        </Button>
      )}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-t border-line-subtle py-8">
      <h2 id={id} className="type-section text-strong">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <div
      className={
        dark
          ? "flex flex-wrap items-center gap-4 rounded-lg bg-tinta p-4"
          : "flex flex-wrap items-center gap-4"
      }
    >
      {children}
    </div>
  );
}

const Label = ({ children }: { children: ReactNode }) => (
  <p className="type-eyebrow text-meta">{children}</p>
);

export function Showcase() {
  const [theme, setTheme] = useState("light");
  const [saved, setSaved] = useState(true);
  const [useful, setUseful] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cat, setCat] = useState("Tudo");

  return (
    <main id="conteudo" className="mx-auto max-w-page px-gutter py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
        <div className="flex flex-col gap-2">
          <p className="type-eyebrow text-eyebrow">Brand kit portado · P0-T9b</p>
          <h1 className="type-display text-strong">Vitrine do design system</h1>
          <p className="max-w-read type-body text-meta">
            Todos os componentes de src/components com seus estados. Rota bloqueada em produção.
          </p>
          {/* `truncate` em <p> (UX-W1-T9): uma linha só, com reticências. */}
          <p data-testid="ds-truncate" className="max-w-xs truncate type-meta text-meta">
            Texto longo em uma linha só, cortado com reticências quando passa da largura disponível.
          </p>
        </div>
        <SegmentedToggle
          label="Tema da vitrine"
          value={theme}
          onChange={(v) => {
            setTheme(v);
            applyTheme(v === "dark" ? "dark" : "light");
          }}
          options={[
            { value: "light", label: "Claro", icon: "sun" },
            { value: "dark", label: "Escuro", icon: "moon" },
          ]}
        />
      </div>

      <Section id="ds-logo" title="Logo">
        <Row>
          <Logo size="md" />
          <Logo variant="symbol" size="md" />
          <Logo city="Várzea Grande" size="sm" />
          <Logo city="Guia Cuiabá" size="sm" />
          <Logo tone="mono" size="sm" />
          <Logo variant="vertical" size="sm" />
        </Row>
        <Row dark>
          <Logo tone="negative" size="md" />
          <Logo variant="symbol" tone="negative" size="md" />
          <Logo variant="vertical" tone="negative" size="sm" />
        </Row>
      </Section>

      <Section id="ds-icones" title="Ícones (Lucide, traço 1,5)">
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-9">
          {ICON_NAMES.map((name) => (
            <li key={name} className="flex flex-col items-center gap-1.5 text-strong">
              <Icon name={name} />
              <span className="type-meta text-meta">{name}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="ds-botoes" title="Botões">
        <Row>
          <Button>Entrar</Button>
          <Button variant="secondary">Secundário</Button>
          <Button variant="outline" icon="mail">
            Entrar com e-mail
          </Button>
          <Button variant="outline-strong">Seguindo</Button>
          <Button variant="accent" icon="play">
            Ao vivo agora
          </Button>
          <Button variant="text" iconRight="chevron-right">
            Ver tudo
          </Button>
          <Button variant="danger">Sair</Button>
        </Row>
        <Row>
          <Button size="md">Médio</Button>
          <Button size="sm">Seguir</Button>
          <Button size="sm" variant="outline-strong">
            Seguindo
          </Button>
          <Button disabled>Desabilitado</Button>
          <Button href="/agenda" variant="outline">
            Link com cara de botão
          </Button>
        </Row>
        <div className="max-w-sm">
          <Button fullWidth>Largura total</Button>
        </div>
        <Row>
          <IconButton icon="arrow-left" label="Voltar" />
          <IconButton icon="bell" label="Notificações, 2 novas" badge />
          <IconButton icon="ellipsis-vertical" label="Mais opções" variant="ghost" />
          <IconButton icon="search" label="Buscar" variant="filled" size={44} />
        </Row>
        <Row dark>
          <IconButton icon="bookmark" label="Salvar" variant="inverse" />
          <IconButton icon="share-2" label="Compartilhar" variant="inverse" size={44} />
        </Row>
      </Section>

      <Section id="ds-formularios" title="Formulários">
        <div className="grid gap-6 md:grid-cols-2">
          <TextField id="ds-email" label="E-mail ou telefone" icon="mail" placeholder="Digite seu e-mail ou telefone" />
          <TextField id="ds-senha" label="Senha" icon="lock" type="password" placeholder="Crie sua senha" hint="Mínimo de 8 caracteres." />
          <TextField
            id="ds-erro"
            label="E-mail"
            icon="mail"
            type="email"
            defaultValue="ana@"
            error="E-mail incompleto. Exemplo: ana@exemplo.com"
          />
          <TextField id="ds-desab" label="Cidade" defaultValue="Cuiabá" disabled />
        </div>
        <SearchBar placeholder="Buscar notícias ou autores" onFilter={() => setSheetOpen(true)} />
        <Row>
          <span className="flex items-center gap-2 type-body text-strong">
            <Toggle label="Notificações (desligado)" /> Desligado
          </span>
          <span className="flex items-center gap-2 type-body text-strong">
            <Toggle label="Notificações (ligado)" defaultChecked /> Ligado
          </span>
          <span className="flex items-center gap-2 type-body text-meta">
            <Toggle label="Notificações (desabilitado)" disabled /> Desabilitado
          </span>
        </Row>
        <div className="max-w-md">
          <Slider
            label="Tamanho do texto"
            steps={7}
            defaultValue={50}
            valueText={(v) => `Tamanho ${Math.round(v / (100 / 6)) + 1} de 7`}
            startAdornment={<span className="text-16 text-strong">A</span>}
            endAdornment={<span className="text-28 text-strong">A</span>}
          />
        </div>
      </Section>

      <Section id="ds-navegacao" title="Navegação">
        <ChipGroup
          label="Editorias"
          items={["Tudo", "Cidade", "Política", "Esporte", "Cultura", "Economia", "Agro"]}
          value={cat}
          onChange={setCat}
        />
        <Row dark>
          <Chip tone="dark" active>
            Tudo
          </Chip>
          <Chip tone="dark">Cidade</Chip>
          <Chip href="/cidade" tone="dark">
            Link
          </Chip>
        </Row>
        <Tabs label="Tipo de resultado" items={["Matérias", "Temas", "Autores"]} defaultValue="Temas" />
        <NavHeader title="Buscar" backHref="/" />
        <NavHeader
          title="Idioma"
          variant="plain"
          divider
          backHref="/perfil"
          right={<IconButton icon="ellipsis-vertical" label="Mais opções do idioma" variant="ghost" />}
        />
        <SectionHeader title="Explorar" actionHref="/explorar" as="h3" />
        <SectionHeader eyebrow="Agenda · fim de semana" title="O que fazer em Cuiabá" action={null} as="h3" />
        <div className="max-w-md overflow-hidden rounded-lg border border-line-subtle">
          <TabBar active="favorites" label="Exemplo de barra inferior" />
        </div>
      </Section>

      <Section id="ds-noticias" title="Notícias">
        <div className="grid gap-4 md:grid-cols-2">
          <NewsCard
            href="/materia/obras-cpa"
            title="Obras na Av. do CPA mudam o trânsito a partir de segunda"
            author="Ana Lima"
            sources={3}
            time="há 12 min"
          />
          <NewsCard
            href="/materia/calor"
            category="Clima"
            title="Calor de 41 °C: Defesa Civil emite alerta para a Baixada Cuiabana"
            author="Rafael Souza"
            readMinutes={4}
            onMore={() => setSheetOpen(true)}
          />
        </div>
        <div className="rounded-lg bg-section p-4">
          <NewsCard
            surface="white"
            href="/materia/feira"
            title="Feira do Porto ganha novo horário aos sábados"
            author="Júlia Campos"
            time="há 3 h"
          />
        </div>
        <div className="flex snap-x gap-4 overflow-x-auto pb-2 scrollbar-none">
          <FeatureCard
            href="/materia/corredor"
            category="Cidade"
            time="5 h"
            title="Prefeitura anuncia novo corredor de ônibus na Av. Fernando Corrêa"
            width={310}
          />
          <StoryCard
            href="/materia/plano-diretor"
            category="Política"
            saved={saved}
            onToggleSave={() => setSaved((s) => !s)}
            title="Câmara aprova novo plano diretor de Cuiabá"
            author="Rafael Souza"
            avatar={null}
            time="5 h"
          />
        </div>
        <Row>
          <Photo label="Foto da reportagem principal" ratio="16/9" radius="0" className="w-72" />
          <Photo label="Foto" ratio={1} radius="md" className="w-24" />
        </Row>
        <Row>
          <CategoryTag>Cidade</CategoryTag>
          <CategoryTag tone="service">Guia</CategoryTag>
          <CategoryTag variant="pill">Política</CategoryTag>
          <CategoryTag variant="pill" tone="service">
            Serviços
          </CategoryTag>
          <LiveIndicator />
          <LiveIndicator label="Atualizado há 12 min" pulse={false} />
        </Row>
        <Row dark>
          <CategoryTag variant="label">Mobilidade</CategoryTag>
          <LiveIndicator label="Agora · CityNews Cuiabá" inverse />
          <MetaRow inverse author="Ana Lima" time="há 12 min" />
        </Row>
        <MetaRow author="Ana Lima" avatar={null} sources={3} readMinutes={4} time="há 12 min" />
        <MetaRow category="Cidade" trending="Mais lida" time="5 h" />
        <VideoLowerThird headline="Chuva forte alaga trecho da Av. Miguel Sutil" className="max-w-xl" />
      </Section>

      <Section id="ds-descoberta" title="Descoberta">
        <div className="grid max-w-xl grid-cols-3 gap-3">
          <TopicCard label="Mobilidade" icon="map-pin" defaultFollowing />
          <TopicCard label="Política" icon="newspaper" />
          <TopicCard label="Clima" icon="sun" />
        </div>
        <Row>
          <SourceAvatar name="Folha do Cerrado" size={40} href="/fontes/folha-do-cerrado" />
          <SourceAvatar name="MT Agora" size={56} href="/fontes/mt-agora" />
          <SourceAvatar name="Ana Lima" size={64} href="/autores/ana-lima" />
          <SourceAvatar name="Guia CityNews" size={72} href="/guia-cuiaba" />
        </Row>
        <div className="grid gap-6 md:grid-cols-2">
          <AgendaList
            title="Agenda de hoje"
            titleAs="h3"
            items={[
              { when: "19h", title: "Show no Sesc Arsenal", place: "Centro" },
              { when: "20h30", title: "Mostra de cinema regional", place: "Cine Teatro Cuiabá" },
              { when: "22h", title: "Rasqueado na Orla", place: "Porto" },
            ]}
          />
          <AgendaList
            variant="day"
            surface="none"
            items={[
              { when: "Sex", title: "Feira da Praça 8 de Abril", place: "Goiabeiras" },
              { when: "Sáb", title: "Festa de São Benedito", place: "Centro Histórico" },
              { when: "Dom", title: "Passeio ciclístico", place: "Parque Mãe Bonifácia" },
            ]}
          />
        </div>
        <div className="grid max-w-xl grid-cols-2 gap-3">
          <StatCard icon="eye" label="Visualizações" value="213 mil" delta="+12%" />
          <StatCard icon="users" label="Seguidores" value="400" delta="-0,2%" trend="down" />
        </div>
        <BarChart
          className="max-w-md"
          label="Leituras por hora hoje"
          values={[8, 5, 0, 9, 6, 0, 0, 3, 0, 5, 0, 7, 9, 0, 4]}
          labels={["0h", "6", "12h", "18", "24h"]}
          highlight={12}
        />
      </Section>

      <Section id="ds-fontes" title="Fontes em destaque">
        <SourcesDemo />
      </Section>

      <Section id="ds-listas" title="Listas e ações">
        <div className="flex max-w-md flex-col gap-3">
          <ListRow icon="globe" label="Idioma" value="Português" href="/perfil/idioma" />
          <ListRow label="Português (Brasil)" trailing="check" selected onClick={() => {}} />
          <ListRow label="Notificações" bordered={false} trailing={<Toggle label="Notificações da lista" defaultChecked />} />
          <ListRow icon="log-out" label="Sair" danger trailing={null} onClick={() => setDialogOpen(true)} />
        </div>
        <div className="max-w-md overflow-hidden rounded-lg border border-line-subtle">
          <ArticleActionBar
            progress={0.35}
            saved={saved}
            useful={useful}
            onSave={() => setSaved((s) => !s)}
            onUseful={() => setUseful((u) => !u)}
            onAdjust={() => setSheetOpen(true)}
          />
        </div>
      </Section>

      <Section id="ds-sobreposicoes" title="Diálogo e folha">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-lg bg-section p-6">
            <Label>Diálogo (inline)</Label>
            <Dialog
              inline
              title="Tem certeza de que deseja sair?"
              onClose={() => {}}
              actions={
                <>
                  <Button size="md">Cancelar</Button>
                  <Button variant="danger">Sair</Button>
                </>
              }
            >
              Seus favoritos continuam salvos neste aparelho.
            </Dialog>
          </div>
          <div className="flex flex-col gap-3 rounded-lg bg-section p-6">
            <Label>Folha inferior (inline)</Label>
            <BottomSheet inline title="Exibição" footer={<Button fullWidth>Aplicar</Button>}>
              <p className="type-body text-meta">Tamanho do texto e tema de leitura.</p>
            </BottomSheet>
          </div>
        </div>
        <Row>
          <Button variant="outline" onClick={() => setDialogOpen(true)}>
            Abrir diálogo
          </Button>
          <Button variant="outline" onClick={() => setSheetOpen(true)}>
            Abrir folha
          </Button>
        </Row>
        <Dialog
          open={dialogOpen}
          title="Tem certeza de que deseja sair?"
          onClose={() => setDialogOpen(false)}
          actions={
            <>
              <Button size="md" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={() => setDialogOpen(false)}>
                Sair
              </Button>
            </>
          }
        />
        <BottomSheet
          open={sheetOpen}
          title="Exibição"
          onClose={() => setSheetOpen(false)}
          footer={
            <Button fullWidth onClick={() => setSheetOpen(false)}>
              Aplicar
            </Button>
          }
        >
          <Slider label="Tamanho do texto na folha" steps={7} defaultValue={50} />
        </BottomSheet>
      </Section>

      <Section id="ds-marca" title="Cabeçalho e rodapé do site">
        <div className="overflow-hidden rounded-lg border border-line-subtle">
          <SiteHeader active="home" />
        </div>
        <div className="overflow-hidden rounded-lg">
          <SiteFooter />
        </div>
        <p className="type-meta text-meta">
          StudioShell aparece em /estudio (exige sessão); BottomNav é a TabBar fixa das telas estreitas.
        </p>
      </Section>
    </main>
  );
}
