// CityNews website: home + article.
const CNW = window.CityNewsDesignSystem_4f3e0e;
const webStories = [
  { id: 'w1', cat: 'Mobilidade', title: 'VLT: governo apresenta novo cronograma para o BRT', author: 'Rafael Souza', time: 'há 1 h' },
  { id: 'w2', cat: 'Clima', title: 'Calor de 41 °C: Defesa Civil emite alerta para a Baixada Cuiabana', author: 'Júlia Campos', time: 'há 2 h' },
  { id: 'w3', cat: 'Cultura', title: 'Festival de Inverno de Chapada divulga programação completa', author: 'Ana Lima', time: 'há 3 h' },
];
function TopStrip() {
  return <div style={{ background: 'var(--cn-papel)', padding: '8px var(--gutter-desktop)', display: 'flex', justifyContent: 'space-between', font: '400 13px/1 var(--font-sans)', color: 'var(--text-meta)' }}>
    <span>Cuiabá e Várzea Grande · terça, 29 de setembro</span><span>32° · Tempo aberto</span>
  </div>;
}
function WebHome({ onOpen }) {
  const { Photo, CategoryTag, AgendaList, SectionHeader } = CNW;
  return <main style={{ maxWidth: 'var(--container-max)', margin: '0 auto', padding: '32px var(--gutter-desktop) 56px' }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 32 }}>
      <article onClick={() => onOpen({ cat: 'Cidade', title: 'Obras na Av. do CPA mudam o trânsito a partir de segunda-feira' })} style={{ cursor: 'pointer' }}>
        <Photo label="Foto da reportagem principal" ratio="16/9" radius="0" />
        <div style={{ marginTop: 20 }}><CategoryTag>Cidade</CategoryTag></div>
        <h1 style={{ margin: '12px 0 12px', font: '600 40px/1.15 var(--font-serif)', color: 'var(--text-strong)', textWrap: 'balance' }}>Obras na Av. do CPA mudam o trânsito a partir de segunda-feira</h1>
        <p style={{ margin: 0, font: 'var(--type-meta)', fontSize: 14, color: 'var(--text-meta)' }}>Por Ana Lima · atualizado há 12 min</p>
      </article>
      <AgendaList title="Agenda de hoje" items={[{ when: '19h', title: 'Show no Sesc Arsenal', place: 'Centro' }, { when: '20h30', title: 'Mostra de cinema regional', place: 'Cine Teatro Cuiabá' }, { when: '22h', title: 'Rasqueado na Orla', place: 'Porto' }]} />
    </div>
    <div style={{ height: 1, background: 'var(--cn-tinta)', margin: '48px 0 24px' }}></div>
    <SectionHeader title="Mais notícias" style={{ marginBottom: 20 }} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 32 }}>
      {webStories.map((s) => <article key={s.id} onClick={() => onOpen(s)} style={{ cursor: 'pointer' }}>
        <Photo ratio="3/2" radius="0" />
        <div style={{ marginTop: 14 }}><CategoryTag>{s.cat}</CategoryTag></div>
        <h3 style={{ margin: '8px 0', font: '600 21px/1.25 var(--font-serif)', color: 'var(--text-strong)', textWrap: 'pretty' }}>{s.title}</h3>
        <p style={{ margin: 0, font: 'var(--type-meta)', color: 'var(--text-meta)' }}>Por {s.author} · {s.time}</p>
      </article>)}
    </div>
    <section style={{ marginTop: 56, background: 'var(--cn-papel)', padding: 40, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)', gap: 40 }}>
      <div>
        <CategoryTag tone="service">Agenda · fim de semana</CategoryTag>
        <h2 style={{ margin: '12px 0 0', font: '800 44px/1.02 var(--font-sans)', letterSpacing: '-0.03em', color: 'var(--text-strong)' }}>O que fazer em Cuiabá</h2>
      </div>
      <AgendaList variant="day" surface="none" items={[{ when: 'Sex', title: 'Feira da Praça 8 de Abril', place: 'Goiabeiras' }, { when: 'Sáb', title: 'Festa de São Benedito', place: 'Centro Histórico' }, { when: 'Dom', title: 'Passeio ciclístico', place: 'Parque Mãe Bonifácia' }]} />
    </section>
  </main>;
}
function WebArticle({ story, onBack }) {
  const { Photo, CategoryTag, Button, LiveIndicator } = CNW;
  return <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px var(--gutter-desktop) 64px' }}>
    <Button variant="text" icon="arrow-left" onClick={onBack}>Voltar para a capa</Button>
    <div style={{ marginTop: 28, display: 'flex', gap: 20, alignItems: 'center' }}><CategoryTag>{story.cat}</CategoryTag><LiveIndicator label="Atualizado há 12 min" /></div>
    <h1 style={{ margin: '14px 0 16px', font: '600 44px/1.12 var(--font-serif)', color: 'var(--text-strong)', textWrap: 'balance' }}>{story.title}</h1>
    <p style={{ margin: '0 0 28px', font: '400 20px/1.5 var(--font-serif)', color: 'var(--text-meta)' }}>Desvio vale para os dois sentidos e deve durar 90 dias; veja rotas alternativas.</p>
    <p style={{ margin: '0 0 24px', font: 'var(--type-meta)', fontSize: 14, color: 'var(--text-meta)' }}>Por Ana Lima · 29/09/2026, 9h12</p>
    <Photo label="Foto da reportagem" ratio="16/9" radius="0" />
    <p style={{ margin: '8px 0 32px', font: 'var(--type-meta)', color: 'var(--text-meta)' }}>Legenda da foto · Crédito: CityNews</p>
    <div style={{ font: 'var(--type-body-read)', fontSize: 19, color: 'var(--text-body)' }}>
      <p style={{ margin: '0 0 20px', fontWeight: 700 }}>A mudança começa na segunda-feira (5) e vale para os dois sentidos da avenida, segundo a Secretaria de Mobilidade.</p>
      <p style={{ margin: '0 0 20px' }}>Motoristas que seguem para o Centro Político Administrativo devem usar a Av. Historiador Rubens de Mendonça como alternativa nos horários de pico. <a href="#">Veja o mapa dos desvios</a>.</p>
      <p style={{ margin: 0 }}>A prefeitura informou que agentes de trânsito vão orientar os condutores nos primeiros dias. Linhas de ônibus que passam pelo trecho terão pontos provisórios.</p>
    </div>
  </main>;
}
function WebFooter() {
  const { Logo } = CNW;
  return <footer style={{ background: 'var(--cn-tinta)', color: '#fff', padding: '40px var(--gutter-desktop)' }}>
    <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <Logo base="../../assets/logo/" variant="horizontal-negative" height={40} />
      <span style={{ font: '700 12px/1 var(--font-sans)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>CityNews Cuiabá · Notícias | Agenda | Guia | Serviços</span>
    </div>
  </footer>;
}
Object.assign(window, { CNW, TopStrip, WebHome, WebArticle, WebFooter });
