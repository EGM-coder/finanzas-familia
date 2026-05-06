/* ============================================================
   App primitives — Status bar, tab bar, screen scaffold
   Single source of truth for all 6 app screens
   ============================================================ */

const { useState: uS, useEffect: uE, useRef: uR } = React;

function StatusBar({ dark }) {
  return (
    <div style={{
      height: 44, padding: '0 22px',
      display:'flex', alignItems:'center', justifyContent:'space-between',
      fontFamily:'var(--sans)', fontSize: 14, fontWeight: 600,
      color: 'var(--ink)',
    }}>
      <span style={{ fontVariantNumeric:'tabular-nums' }}>9:41</span>
      <span style={{ display:'flex', gap: 4, alignItems:'center' }}>
        <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
          <rect x="0" y="3" width="2" height="4" fill="currentColor" rx=".5"/>
          <rect x="4" y="2" width="2" height="6" fill="currentColor" rx=".5"/>
          <rect x="8" y="1" width="2" height="8" fill="currentColor" rx=".5"/>
          <rect x="12" y="0" width="2" height="10" fill="currentColor" rx=".5"/>
        </svg>
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
          <path d="M7 9c-2 0-3.5-1-5-2.5l1-1C4 6.5 5.5 7 7 7s3-.5 4-1.5l1 1C10.5 8 9 9 7 9zM7 5c-3 0-5-1.5-7-3l1-1c1.5 1.3 3.5 2 6 2s4.5-.7 6-2l1 1c-2 1.5-4 3-7 3z" fill="currentColor"/>
        </svg>
        <svg width="24" height="10" viewBox="0 0 24 10" fill="none">
          <rect x="0" y="0" width="20" height="10" rx="2" stroke="currentColor" fill="none"/>
          <rect x="2" y="2" width="14" height="6" rx="1" fill="currentColor"/>
          <rect x="21" y="3" width="2" height="4" rx=".5" fill="currentColor"/>
        </svg>
      </span>
    </div>
  );
}

function TabBar({ active, onChange }) {
  const tabs = [
    { k: 'home',    label: 'Inicio',     icon: 'I' },
    { k: 'flow',    label: 'Flujo',      icon: 'II' },
    { k: 'mar',     label: 'Maristas',   icon: 'III' },
    { k: 'sim',     label: 'Horizonte',  icon: 'IV' },
    { k: 'ai',      label: 'Asesor',     icon: 'V' },
  ];
  return (
    <div style={{
      position:'absolute', bottom: 0, left: 0, right: 0,
      borderTop: '1px solid var(--rule)',
      background: 'var(--bg)',
      paddingBottom: 18, paddingTop: 10,
      display:'flex', justifyContent:'space-around',
    }}>
      {tabs.map(t => (
        <button key={t.k} onClick={()=>onChange?.(t.k)} style={{
          background:'transparent', border:'none', cursor:'pointer',
          display:'flex', flexDirection:'column', alignItems:'center', gap: 3,
          color: active===t.k ? 'var(--ink)' : 'var(--ink-4)',
          padding: '4px 0', minWidth: 50,
        }}>
          <span className="roman" style={{ fontSize: 14, color:'inherit' }}>{t.icon}</span>
          <span className="label" style={{ fontSize: 8.5, color:'inherit', letterSpacing:'0.1em' }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

function ScreenHead({ chapter, title, subtitle }) {
  return (
    <div style={{ padding: '6px 22px 14px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 8 }}>
        <span className="label">{chapter}</span>
        <span className="roman" style={{ fontSize: 11 }}>EGMFin</span>
      </div>
      <div className="rule" style={{ marginBottom: 12 }} />
      <div className="display" style={{ fontSize: 26, lineHeight: 1.05 }}>{title}</div>
      {subtitle && <div className="body" style={{ fontSize: 13, color:'var(--ink-3)', marginTop: 6 }}>{subtitle}</div>}
    </div>
  );
}

// Screen — full app screen with content + tab bar (status bar comes from IOSDevice)
function Screen({ children, tab, onTab, dark }) {
  return (
    <div className={`egm ${dark?'dark':''}`} style={{
      width:'100%', height:'100%', position:'relative',
      background:'var(--bg)', overflow:'hidden',
    }}>
      <div style={{ position:'absolute', top: 0, bottom: 70, left: 0, right: 0, overflow:'auto', paddingTop: 12 }}>
        {children}
      </div>
      <TabBar active={tab} onChange={onTab} />
    </div>
  );
}

// Web frame — desktop dashboard scaffold
function WebFrame({ children, section, dark }) {
  return (
    <div className={`egm ${dark?'dark':''}`} style={{
      width:'100%', height:'100%', background:'var(--bg)',
      display:'grid', gridTemplateColumns:'200px 1fr', overflow:'hidden',
    }}>
      <aside style={{ borderRight:'1px solid var(--rule)', padding:'28px 20px', display:'flex', flexDirection:'column' }}>
        <div className="display-it" style={{ fontSize: 22, marginBottom: 4 }}>EGM<span style={{ color:'var(--ink-3)' }}>·</span>Fin</div>
        <div className="label" style={{ marginBottom: 30 }}>Dossier vivo · v3.0</div>
        <nav style={{ display:'flex', flexDirection:'column', gap: 2 }}>
          {[
            ['I','Inicio','home'],
            ['II','Flujo','flow'],
            ['III','Maristas','mar'],
            ['IV','Horizonte','sim'],
            ['V','Línea de vida','tl'],
            ['VI','Asesor IA','ai'],
            ['VII','Protección','prot'],
          ].map(([n,l,k]) => (
            <div key={k} style={{
              display:'flex', alignItems:'baseline', gap: 10,
              padding: '7px 0',
              color: section===k ? 'var(--ink)' : 'var(--ink-3)',
              borderLeft: section===k ? '2px solid var(--ink)' : '2px solid transparent',
              paddingLeft: 10, marginLeft: -12,
            }}>
              <span className="roman" style={{ fontSize: 11, minWidth: 22, color: section===k ? 'var(--ink)' : 'var(--ink-4)' }}>{n}</span>
              <span style={{ fontSize: 13, fontWeight: section===k ? 500 : 400 }}>{l}</span>
            </div>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <div className="rule" style={{ marginBottom: 14 }} />
        <div className="label" style={{ marginBottom: 4 }}>Sesión</div>
        <div style={{ fontSize: 13 }}>Eric Gahimbare Ibáñez</div>
        <div className="roman" style={{ fontSize: 11 }}>Logroño · 24·iv·26</div>
      </aside>
      <main style={{ overflow:'auto' }}>{children}</main>
    </div>
  );
}

window.StatusBar = StatusBar;
window.TabBar = TabBar;
window.ScreenHead = ScreenHead;
window.Screen = Screen;
window.WebFrame = WebFrame;
