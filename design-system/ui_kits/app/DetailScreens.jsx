// Article reader (+ display sheet) and Profile/Settings (+ logout dialog).
function ArticleScreen({ story, onBack }) {
  const { IconButton, MetaRow, CategoryTag, Photo, ArticleActionBar, BottomSheet, Button, Slider, SegmentedToggle, Icon } = CN;
  const [sheet, setSheet] = React.useState(false);
  const [size, setSize] = React.useState(50);
  const [liked, setLiked] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [prog, setProg] = React.useState(0);
  const fs = 15 + Math.round(size / 100 * 6);
  const onScroll = (e) => { const el = e.currentTarget; setProg(el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)); };
  return <Phone>
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 24px 0' }}>
      <IconButton icon="arrow-left" label="Voltar" onClick={onBack} />
      <IconButton icon="type" label="Exibição" onClick={() => setSheet(true)} />
    </div>
    <Scroll style={{ padding: '20px 24px 24px' }}>
      <div onScroll={onScroll}></div>
      <CategoryTag>{story.cat || 'Cidade'}</CategoryTag>
      <h1 style={{ margin: '10px 0 12px', font: 'var(--type-headline-xl)', color: 'var(--text-strong)', textWrap: 'pretty' }}>{story.title}</h1>
      <MetaRow author="Por Ana Lima" trending="Mais lida" time={story.time || '12 min'} />
      <Photo label="Foto da reportagem" ratio="16/10" style={{ margin: '20px 0 8px' }} />
      <p style={{ margin: '0 0 20px', font: 'var(--type-meta)', color: 'var(--text-meta)' }}>Legenda da foto · Crédito: CityNews</p>
      <p style={{ margin: '0 0 16px', font: '700 ' + fs + 'px/1.6 var(--font-serif)', color: 'var(--text-strong)' }}>A mudança começa na segunda-feira (5) e vale para os dois sentidos da avenida, segundo a Secretaria de Mobilidade.</p>
      <p style={{ margin: '0 0 16px', font: '400 ' + fs + 'px/1.65 var(--font-serif)', color: 'var(--text-body)' }}>O desvio deve durar 90 dias. Motoristas que seguem para o Centro Político Administrativo devem usar a Av. Historiador Rubens de Mendonça como alternativa nos horários de pico.</p>
      <p style={{ margin: 0, font: '400 ' + fs + 'px/1.65 var(--font-serif)', color: 'var(--text-body)' }}>A prefeitura informou que agentes de trânsito vão orientar os condutores nos primeiros dias. Linhas de ônibus que passam pelo trecho terão pontos provisórios.</p>
    </Scroll>
    <ArticleActionBar likes={liked ? '2,5 mil' : '2,4 mil'} comments={23} liked={liked} saved={saved} progress={0.35} onLike={() => setLiked(!liked)} onSave={() => setSaved(!saved)} style={{ paddingBottom: 18 }} />
    {sheet && <BottomSheet title="Exibição" onClose={() => setSheet(false)} footer={<Button fullWidth onClick={() => setSheet(false)}>Aplicar</Button>}>
      <div style={{ font: '400 14px var(--font-sans)', color: 'var(--text-meta)', marginBottom: 14 }}>Tema de leitura</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}><b style={{ font: '600 16px var(--font-sans)' }}>Modo claro</b><SegmentedToggle options={[{ value: 'l', label: 'Claro', icon: 'sun' }, { value: 'd', label: 'Escuro', icon: 'moon' }]} /></div>
      <div style={{ font: '400 14px var(--font-sans)', color: 'var(--text-meta)', marginBottom: 14 }}>Tamanho da fonte</div>
      <Slider steps={7} value={size} onChange={setSize} startAdornment={<span style={{ font: '500 16px var(--font-sans)' }}>A</span>} endAdornment={<span style={{ font: '500 28px var(--font-sans)' }}>A</span>} />
      <div style={{ font: '400 14px var(--font-sans)', color: 'var(--text-meta)', margin: '28px 0 14px' }}>Brilho</div>
      <Slider defaultValue={72} startAdornment={<Icon name="sun" size={20} />} endAdornment={<Icon name="sun" size={26} />} />
    </BottomSheet>}
  </Phone>;
}
function ProfileScreen({ tab, setTab, onLogout }) {
  const { NavHeader, ListRow, Toggle, Dialog, Button, TabBar, StatCard } = CN;
  const [dlg, setDlg] = React.useState(false);
  const H = ({ children }) => <h2 style={{ margin: '24px 0 12px', font: 'var(--type-section)', fontSize: 18, color: 'var(--text-strong)' }}>{children}</h2>;
  return <Phone>
    <NavHeader title="Configurações" variant="plain" divider onBack={() => setTab('home')} style={{ paddingTop: 12 }} />
    <Scroll style={{ padding: '0 24px 24px' }}>
      <H>Sua leitura</H>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><StatCard icon="book-open" label="Lidas" value="114" delta="+8" /><StatCard icon="bookmark" label="Salvas" value="23" /></div>
      <H>Geral</H>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ListRow icon="user" label="Minha conta" onClick={() => {}} />
        <ListRow icon="bell" label="Notificações" bordered trailing={<Toggle defaultChecked label="Notificações" />} />
        <ListRow icon="map-pin" label="Minha cidade" value="Cuiabá" onClick={() => {}} />
        <ListRow icon="globe" label="Idioma" value="Português" onClick={() => {}} />
      </div>
      <H>Preferências</H>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ListRow icon="shield" label="Política de privacidade" onClick={() => {}} />
        <ListRow icon="circle-help" label="Ajuda e suporte" onClick={() => {}} />
        <ListRow icon="log-out" label="Sair" danger trailing={null} onClick={() => setDlg(true)} />
      </div>
    </Scroll>
    <TabBar items={tabs} value={tab} onChange={setTab} style={{ paddingBottom: 18, height: 82 }} />
    {dlg && <Dialog title="Tem certeza de que deseja sair?" onClose={() => setDlg(false)} actions={<><Button size="md" style={{ minWidth: 180 }} onClick={() => setDlg(false)}>Cancelar</Button><Button variant="danger" onClick={onLogout}>Sair</Button></>} />}
  </Phone>;
}
Object.assign(window, { ArticleScreen, ProfileScreen });
