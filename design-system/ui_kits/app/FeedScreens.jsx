// Main tab screens: Home, Search, Saved.
function HomeScreen({ onOpen, tab, setTab }) {
  const { IconButton, SearchBar, ChipGroup, FeatureCard, SectionHeader, NewsCard, TabBar, Logo } = CN;
  const [cat, setCat] = React.useState('Tudo');
  return <Phone>
    <Scroll>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px 0' }}>
        <Logo base="../../assets/logo/" height={34} />
        <IconButton icon="bell" badge label="Notificações" />
      </div>
      <p style={{ margin: '6px 24px 0', font: 'var(--type-meta)', color: 'var(--text-meta)' }}>Atualizado há 2 minutos · 32° em Cuiabá</p>
      <div style={{ padding: '20px 24px 16px' }}><SearchBar /></div>
      <ChipGroup items={appData.cats} value={cat} onChange={setCat} style={{ padding: '0 24px' }} />
      <div style={{ display: 'flex', gap: 16, overflowX: 'auto', scrollbarWidth: 'none', padding: '20px 24px 8px' }}>
        {appData.featured.map((f) => <FeatureCard key={f.id} category={f.cat} time={f.time} comments={f.comments} title={f.title} onClick={() => onOpen(f)} style={{ flexShrink: 0 }} />)}
      </div>
      <SectionHeader title="Explorar" style={{ padding: '20px 24px 16px' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 24px 24px' }}>
        {appData.explore.map((n) => <NewsCard key={n.id} {...n} onClick={() => onOpen(n)} onMore={() => {}} />)}
      </div>
    </Scroll>
    <TabBar items={tabs} value={tab} onChange={setTab} style={{ paddingBottom: 18, height: 82 }} />
  </Phone>;
}
function SearchScreen({ tab, setTab, onOpen }) {
  const { NavHeader, SearchBar, Tabs, SectionHeader, TopicCard, SourceAvatar, NewsCard, TabBar } = CN;
  const [t, setT] = React.useState('Temas');
  return <Phone>
    <NavHeader title="Buscar" onBack={() => setTab('home')} style={{ padding: '12px 24px 0' }} />
    <Scroll>
      <div style={{ padding: '20px 24px 16px' }}><SearchBar /></div>
      <Tabs items={['Matérias', 'Temas', 'Autores']} value={t} onChange={setT} style={{ padding: '0 24px' }} />
      {t === 'Temas' && <>
        <SectionHeader title="Temas que você segue" style={{ padding: '24px 24px 16px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, padding: '0 24px' }}>{appData.topics.slice(0, 3).map((x) => <TopicCard key={x.label} label={x.label} icon={x.icon} defaultFollowing={x.on} />)}</div>
        <SectionHeader title="Outros temas" action={null} style={{ padding: '24px 24px 16px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, padding: '0 24px 24px' }}>{appData.topics.slice(3).map((x) => <TopicCard key={x.label} label={x.label} icon={x.icon} />)}</div>
      </>}
      {t === 'Autores' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, padding: 24 }}>{appData.columnists.map((c) => <SourceAvatar key={c} name={c} />)}</div>}
      {t === 'Matérias' && <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>{appData.explore.map((n) => <NewsCard key={n.id} {...n} onClick={() => onOpen(n)} />)}</div>}
    </Scroll>
    <TabBar items={tabs} value={tab} onChange={setTab} style={{ paddingBottom: 18, height: 82 }} />
  </Phone>;
}
function SavedScreen({ tab, setTab, onOpen }) {
  const { SearchBar, ChipGroup, StoryCard, TabBar, IconButton, Icon } = CN;
  const [saved, setSaved] = React.useState({ f1: true, f2: true, f3: true });
  const [cat, setCat] = React.useState('Tudo');
  const groups = [['Ter, 29 de setembro', appData.featured.slice(0, 2)], ['Sáb, 26 de setembro', appData.featured.slice(2)]];
  return <Phone>
    <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 48px', alignItems: 'center', padding: '12px 24px 0' }}><span></span><span style={{ textAlign: 'center', font: 'var(--type-nav-title)' }}>Salvos</span><IconButton icon="bell" badge /></div>
    <Scroll>
      <div style={{ padding: '20px 24px 16px' }}><SearchBar placeholder="Buscar nos salvos" /></div>
      <ChipGroup items={appData.cats} value={cat} onChange={setCat} style={{ padding: '0 24px' }} />
      {groups.map(([d, list]) => <div key={d}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 24px 14px', font: '600 15px/1 var(--font-sans)', color: 'var(--text-strong)' }}><Icon name="calendar" size={20} color="var(--text-meta)" />{d}</div>
        <div style={{ display: 'flex', gap: 16, overflowX: 'auto', scrollbarWidth: 'none', padding: '0 24px' }}>
          {list.map((f) => <StoryCard key={f.id} category={f.cat} title={f.title} author="Ana Lima" avatar={null} time={f.time} comments={f.comments} saved={saved[f.id]} onToggleSave={() => setSaved({ ...saved, [f.id]: !saved[f.id] })} onClick={() => onOpen(f)} />)}
        </div>
      </div>)}
      <div style={{ height: 24 }}></div>
    </Scroll>
    <TabBar items={tabs} value={tab} onChange={setTab} style={{ paddingBottom: 18, height: 82 }} />
  </Phone>;
}
Object.assign(window, { HomeScreen, SearchScreen, SavedScreen });
