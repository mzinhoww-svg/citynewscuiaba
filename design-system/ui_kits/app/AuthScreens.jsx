// Onboarding + auth screens.
function SplashScreen({ onNext }) {
  const { Logo, Button } = CN;
  return <Phone inverse bg="var(--cn-tinta)">
    <div onClick={onNext} style={{ flex: 1, position: 'relative', cursor: 'pointer', margin: '-44px 0 0' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--cn-foto)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '400 13px var(--font-sans)', color: 'var(--text-meta)' }}>Foto de reportagem (P&B)</div>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,27,45,0) 30%, rgba(15,27,45,.92) 68%, #0F1B2D 100%)' }}></div>
      <div style={{ position: 'absolute', left: 24, right: 24, bottom: 110, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center' }}>
        <Logo base="../../assets/logo/" variant="vertical-negative" height={120} />
        <p style={{ margin: 0, font: '400 17px/1.5 var(--font-serif)', color: '#fff', textWrap: 'balance' }}>O ponto da cidade. Notícia, agenda e serviço no mesmo lugar.</p>
      </div>
      <div style={{ position: 'absolute', left: 24, right: 24, bottom: 40 }}><Button fullWidth variant="secondary" onClick={onNext}>Começar</Button></div>
    </div>
  </Phone>;
}
function LoginScreen({ onLogin }) {
  const { TextField, Button } = CN;
  const [email, setEmail] = React.useState('');
  const [pwd, setPwd] = React.useState('');
  const ok = email && pwd;
  return <Phone>
    <Scroll style={{ padding: '32px 24px 40px' }}>
      <h1 style={{ margin: 0, font: 'var(--type-screen-title)', color: 'var(--text-strong)' }}>Entrar na conta</h1>
      <p style={{ margin: '8px 0 32px', font: 'var(--type-body)', color: 'var(--text-meta)' }}>Entre com a conta que você já cadastrou.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <TextField label="E-mail ou telefone" icon="mail" placeholder="Digite seu e-mail ou telefone" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Senha" icon="lock" type="password" placeholder="Digite sua senha" value={pwd} onChange={(e) => setPwd(e.target.value)} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '16px 0 40px' }}><Button variant="text">Esqueci a senha</Button></div>
      <Button fullWidth disabled={!ok} onClick={onLogin}>Entrar</Button>
      <p style={{ textAlign: 'center', margin: '20px 0', font: 'var(--type-body)', color: 'var(--text-meta)' }}>Ou continue com</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Button fullWidth variant="outline" onClick={onLogin}>Entrar com Google</Button>
        <Button fullWidth variant="outline" onClick={onLogin}>Entrar com Apple</Button>
      </div>
      <p style={{ textAlign: 'center', marginTop: 24, font: 'var(--type-body)', color: 'var(--text-meta)' }}>Ainda não tem conta? <a href="#" onClick={(e) => { e.preventDefault(); onLogin(); }} style={{ fontWeight: 600 }}>Criar conta</a></p>
    </Scroll>
  </Phone>;
}
Object.assign(window, { SplashScreen, LoginScreen });
