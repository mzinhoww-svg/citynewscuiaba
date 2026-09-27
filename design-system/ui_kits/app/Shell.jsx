// Shared data + phone shell for the CityNews app UI kit.
const CN = window.CityNewsDesignSystem_4f3e0e;
const appData = {
  cats: ['Tudo', 'Cidade', 'Política', 'Esporte', 'Cultura', 'Economia', 'Agro'],
  featured: [
    { id: 'f1', cat: 'Cidade', time: '5 h', comments: 50, title: 'Prefeitura anuncia novo corredor de ônibus na Av. Fernando Corrêa' },
    { id: 'f2', cat: 'Política', time: '2 h', comments: 31, title: 'Câmara aprova revisão do plano diretor de Cuiabá' },
    { id: 'f3', cat: 'Esporte', time: '1 h', comments: 12, title: 'Arena Pantanal recebe clássico no domingo' },
  ],
  explore: [
    { id: 'n1', title: 'Obras na Av. do CPA mudam o trânsito a partir de segunda-feira', author: 'Ana Lima', comments: 28, time: '12 min' },
    { id: 'n2', title: 'Calor de 41 °C: Defesa Civil emite alerta para a Baixada Cuiabana', author: 'Rafael Souza', comments: 14, time: '40 min' },
    { id: 'n3', title: 'Festival de Inverno de Chapada divulga programação completa', author: 'Júlia Campos', comments: 9, time: '2 h' },
    { id: 'n4', title: 'Feira do Porto ganha novo horário aos sábados', author: 'Ana Lima', comments: 6, time: '3 h' },
  ],
  topics: [
    { label: 'Mobilidade', icon: 'map-pin', on: true }, { label: 'Política', icon: 'newspaper', on: true }, { label: 'Economia', icon: 'trending-up', on: false },
    { label: 'Cultura', icon: 'play', on: false }, { label: 'Clima', icon: 'sun', on: false }, { label: 'Esporte', icon: 'users', on: false },
  ],
  columnists: ['Ana Lima', 'Rafael Souza', 'Júlia Campos', 'Marcos Arruda', 'Guia CityNews'],
};
const tabs = [
  { id: 'home', label: 'Início', icon: 'house' },
  { id: 'search', label: 'Buscar', icon: 'search' },
  { id: 'saved', label: 'Salvos', icon: 'bookmark', fillActive: true },
  { id: 'profile', label: 'Perfil', icon: 'user' },
];
function StatusBar({ inverse }) {
  return <div style={{ height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px 0 32px', font: '600 15px/1 var(--font-sans)', color: inverse ? '#fff' : 'var(--cn-tinta)' }}>
    <span>9:41</span><span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ width: 17, height: 10, borderRadius: 2, background: 'currentColor', opacity: .9 }}></span><span style={{ width: 24, height: 11, borderRadius: 3, border: '1.5px solid currentColor', boxSizing: 'border-box', padding: 1 }}><span style={{ display: 'block', height: '100%', width: '80%', background: 'currentColor', borderRadius: 1 }}></span></span></span>
  </div>;
}
function Phone({ children, inverse, bg = '#fff' }) {
  return <div style={{ width: 375, height: 812, borderRadius: 44, overflow: 'hidden', background: bg, position: 'relative', display: 'flex', flexDirection: 'column', boxShadow: '0 0 0 10px #0F1B2D, 0 30px 60px rgba(15,27,45,.25)' }}>
    <StatusBar inverse={inverse} />
    {children}
    <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', width: 134, height: 5, borderRadius: 3, background: inverse ? '#fff' : 'var(--cn-tinta)', zIndex: 60 }}></div>
  </div>;
}
function Scroll({ children, style }) {
  return <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', ...style }}>{children}</div>;
}
Object.assign(window, { CN, appData, tabs, Phone, Scroll, StatusBar });
