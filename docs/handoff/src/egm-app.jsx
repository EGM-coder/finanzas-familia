/* ============================================================
   EGMFin — App screens (light + dark via .dark class)
   6 screens: Onboarding · Home · Maristas · Horizonte (sim) · Línea de vida · Asesor IA
   ============================================================ */

const fmt = window.EGM.fmt;
const D = window.EGM;

// ── Reusable: number that breathes
function BigNumber({ value, suffix = '€', label, sub }) {
  return (
    <div>
      {label && <div className="label" style={{ marginBottom: 8 }}>{label}</div>}
      <div className="display num breathe" style={{ fontSize: 64, lineHeight: 1, letterSpacing: '-0.02em' }}>
        {fmt.int(value)}<span style={{ fontSize: 28, color:'var(--ink-3)', marginLeft: 4 }}>{suffix}</span>
      </div>
      {sub && <div className="body" style={{ fontSize: 13, color:'var(--ink-3)', marginTop: 8, fontStyle:'italic' }}>{sub}</div>}
    </div>
  );
}

// ── 1 · Onboarding (ceremonial)
function AppOnboarding({ dark }) {
  return (
    <div className={`egm ${dark?'dark':''}`} style={{
      width:'100%', height:'100%', background:'var(--bg)', position:'relative',
      display:'flex', flexDirection:'column',
    }}>
      <div style={{ flex: 1, padding:'24px 28px 40px', display:'flex', flexDirection:'column' }}>
        <div className="label fade fade-1" style={{ marginBottom: 18 }}>EGM·FIN — Versión III</div>
        <div className="rule fade fade-1" style={{ marginBottom: 36 }} />

        <div className="display fade fade-2" style={{ fontSize: 44, lineHeight: 1.02 }}>
          Una forma<br/>más <span className="display-it">lúcida</span><br/>de ver.
        </div>

        <div className="rule fade fade-3" style={{ width: 60, marginTop: 28, marginBottom: 22, background:'var(--ink)' }} />

        <div className="body fade fade-3" style={{ fontSize: 15, lineHeight: 1.5, color:'var(--ink-2)', maxWidth: 280 }}>
          Patrimonio, flujos, protección y control cotidiano de la familia <span className="display-it">Gahimbare Ibáñez</span> — reunidos en un sistema propio.
        </div>

        <div style={{ flex: 1 }} />

        <div className="fade fade-4" style={{ marginBottom: 28 }}>
          {D.doctrine.pillars.map((p,i) => (
            <div key={i} style={{ display:'flex', alignItems:'baseline', gap: 14, padding:'8px 0' }}>
              <span className="roman" style={{ fontSize: 13, minWidth: 22 }}>{['I','II','III'][i]}</span>
              <span className="display-it" style={{ fontSize: 18 }}>{p}</span>
            </div>
          ))}
        </div>

        <button className="btn btn-fill fade fade-5">Entrar como Eric →</button>
        <button className="btn fade fade-5" style={{ marginTop: 8 }}>Entrar como Ana</button>
      </div>
    </div>
  );
}

// ── 2 · Home (Inicio · vista situacional)
function AppHome({ dark }) {
  const nw = D.netWorth;
  return (
    <Screen tab="home" dark={dark}>
      <ScreenHead chapter="I · Inicio" title="Hoy, 24·iv·26" subtitle="Estado situacional · familia" />

      <div style={{ padding:'4px 22px 20px' }}>
        <div className="fade fade-1">
          <BigNumber value={nw.today} label="Patrimonio neto" sub="Líquido + base · sin Maristas finalizado" />
        </div>

        <div className="rule" style={{ margin:'24px 0 14px' }} />

        <div className="label fade fade-2" style={{ marginBottom: 10 }}>Composición</div>
        {nw.breakdown.map((r,i) => {
          const pct = (r.v / nw.today * 100).toFixed(0);
          return (
            <div key={i} className="fade fade-2" style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'baseline', padding:'10px 0', borderBottom:'1px solid var(--rule-2)', gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{r.k}</div>
                <div className="roman" style={{ fontSize: 11 }}>{r.n}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div className="num" style={{ fontSize: 16 }}>{fmt.int(r.v)} €</div>
                <div className="label" style={{ fontSize: 9 }}>{pct}%</div>
              </div>
            </div>
          );
        })}

        <div className="rule" style={{ margin:'22px 0 12px' }} />
        <div className="label fade fade-3" style={{ marginBottom: 10 }}>Flujo del mes</div>
        <div className="card fade fade-3" style={{ padding: 16, display:'grid', gridTemplateColumns:'1fr 1fr 1fr' }}>
          <div>
            <div className="label" style={{ fontSize: 9, marginBottom: 4 }}>Ingresos</div>
            <div className="num pos" style={{ fontSize: 18 }}>+{fmt.int(D.flow.income)}</div>
          </div>
          <div>
            <div className="label" style={{ fontSize: 9, marginBottom: 4 }}>Fijos</div>
            <div className="num neg" style={{ fontSize: 18 }}>{fmt.int(D.flow.fixed)}</div>
          </div>
          <div>
            <div className="label" style={{ fontSize: 9, marginBottom: 4 }}>Margen</div>
            <div className="num" style={{ fontSize: 18 }}>{fmt.int(D.flow.remaining)}</div>
          </div>
        </div>
      </div>
    </Screen>
  );
}

// ── 3 · Maristas
function AppMaristas({ dark }) {
  const m = D.maristas;
  const pct = (m.paid / m.base * 100).toFixed(0);
  return (
    <Screen tab="mar" dark={dark}>
      <ScreenHead chapter="III · Maristas" title="El piso, paso a paso" subtitle="Entrega · mayo 2026 · COBLANSA" />

      <div style={{ padding:'4px 22px 20px' }}>
        <div className="fade fade-1" style={{ marginBottom: 22 }}>
          <div className="label" style={{ marginBottom: 8 }}>Pagado de la base</div>
          <div style={{ display:'flex', alignItems:'baseline', gap: 8 }}>
            <span className="display num" style={{ fontSize: 40 }}>{fmt.int(m.paid)}</span>
            <span style={{ color:'var(--ink-3)' }}>/ {fmt.int(m.base)} €</span>
          </div>
          <div style={{ marginTop: 12, height: 6, background:'var(--rule-2)', position:'relative' }}>
            <div style={{ position:'absolute', left:0, top:0, height:'100%', width: `${pct}%`, background:'var(--ink)' }} />
          </div>
          <div className="label" style={{ marginTop: 6 }}>{pct}% completado</div>
        </div>

        <div className="rule" style={{ margin:'4px 0 16px' }} />
        <div className="label fade fade-2" style={{ marginBottom: 10 }}>Cronograma</div>

        {m.milestones.map((ms, i) => (
          <div key={i} className="fade fade-2" style={{
            display:'grid', gridTemplateColumns:'24px 1fr auto', gap: 12,
            padding: '12px 0', borderBottom: '1px solid var(--rule-2)',
            alignItems:'baseline',
            background: ms.hero ? 'var(--bg-soft)' : 'transparent',
            margin: ms.hero ? '8px -12px' : 0,
            paddingLeft: ms.hero ? 12 : 0,
            paddingRight: ms.hero ? 12 : 0,
            borderLeft: ms.hero ? '2px solid var(--ink)' : 'none',
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: ms.paid ? 'var(--ink)' : 'transparent',
              border: '1.5px solid var(--ink)',
              marginTop: 5,
            }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: ms.hero ? 600 : 500 }}>{ms.label}</div>
              <div className="roman" style={{ fontSize: 11 }}>{ms.date}</div>
              {ms.hero && <div className="body" style={{ fontSize: 12, marginTop: 4, fontStyle:'italic' }}>Acción crítica · vida 850k antes de firma</div>}
            </div>
            <div style={{ textAlign:'right' }}>
              <div className="num" style={{ fontSize: 14 }}>{fmt.int(ms.amount)} €</div>
              <div className="label" style={{ fontSize: 9, color: ms.paid ? 'var(--signal-pos)' : 'var(--ink-4)' }}>
                {ms.paid ? 'Pagado' : 'Pendiente'}
              </div>
            </div>
          </div>
        ))}

        <div className="rule" style={{ margin:'18px 0 12px' }} />
        <div className="label fade fade-3" style={{ marginBottom: 10 }}>Cuota mensual estimada</div>
        <div className="card-soft fade fade-3" style={{ padding: 14 }}>
          <div className="display num" style={{ fontSize: 30 }}>{fmt.int(m.monthly.rate)}<span style={{ fontSize: 14, color:'var(--ink-3)' }}> – {fmt.int(m.monthly.rateHigh)} €/mes</span></div>
          <div className="roman" style={{ fontSize: 12, marginTop: 4 }}>
            Hipoteca · comunidad {fmt.int(m.monthly.comm)}€ · IBI {fmt.int(m.monthly.ibi)}€
          </div>
        </div>
      </div>
    </Screen>
  );
}

// ── 4 · Horizonte (Simulator) — IN APP, escala compacta
function AppSimulator({ dark }) {
  const p = D.projection;
  const [year, setY] = uS(2031);
  const idx = p.years.indexOf(year);
  const W = 290, H = 180, padT = 10, padB = 22;
  const xAt = i => (i / (p.years.length-1)) * W;
  const max = 900;
  const yAt = v => padT + (1 - v/max) * (H - padT - padB);
  const path = arr => arr.map((v,i)=>`${i===0?'M':'L'}${xAt(i)},${yAt(v)}`).join(' ');

  return (
    <Screen tab="sim" dark={dark}>
      <ScreenHead chapter="IV · Horizonte" title="2026 — 2036" subtitle="Tres escenarios · k €" />

      <div style={{ padding:'4px 22px 20px' }}>
        <div className="card fade fade-1" style={{ padding: '18px 14px 14px', position:'relative' }}>
          <svg width={W} height={H} style={{ display:'block' }}>
            {[0,225,450,675,900].map((g,i) => (
              <line key={i} x1={0} x2={W} y1={yAt(g)} y2={yAt(g)} stroke="var(--rule-2)" />
            ))}
            <path d={path(p.optimist)} fill="none" stroke="var(--ink)" strokeWidth="1" strokeDasharray="3,2" opacity=".5" />
            <path d={path(p.pessimist)} fill="none" stroke="var(--ink)" strokeWidth="1" strokeDasharray="1,3" opacity=".4" />
            <path d={path(p.base)} fill="none" stroke="var(--ink)" strokeWidth="1.8" />
            <line x1={xAt(idx)} x2={xAt(idx)} y1={padT} y2={H-padB} stroke="var(--ink)" strokeWidth=".5" />
            <circle cx={xAt(idx)} cy={yAt(p.base[idx])} r="4" fill="var(--bg)" stroke="var(--ink)" strokeWidth="1.5" />
            {p.years.map((y,i) => (
              <text key={y} x={xAt(i)} y={H-6} fontSize="9" textAnchor="middle"
                fill={year===y?'var(--ink)':'var(--ink-4)'} fontFamily="var(--mono)">{y}</text>
            ))}
          </svg>
          <input type="range" min={2026} max={2036} value={year}
            onChange={e=>setY(+e.target.value)}
            style={{ width:'100%', marginTop: 6, accentColor:'var(--ink)' }} />
        </div>

        <div className="fade fade-2" style={{ marginTop: 18 }}>
          <div className="label" style={{ marginBottom: 6 }}>Año seleccionado</div>
          <div style={{ display:'flex', alignItems:'baseline', gap: 14 }}>
            <div className="display-it num" style={{ fontSize: 44 }}>{year}</div>
            {p.notes[year] && <div className="display-it" style={{ fontSize: 14, color:'var(--ink-3)' }}>{p.notes[year]}</div>}
          </div>
        </div>

        <div className="fade fade-3" style={{ marginTop: 16 }}>
          {[['Optimista', p.optimist[idx]],['Base', p.base[idx]],['Pesimista', p.pessimist[idx]]].map(([l,v],i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr auto', padding:'10px 0', borderBottom:'1px solid var(--rule-2)', alignItems:'baseline' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: i===1?600:400 }}>{l}</div>
                <div className="roman" style={{ fontSize: 11 }}>{i===0?'RV 6,5%':i===1?'RV 5,5%':'RV 3,5%'}</div>
              </div>
              <div className="num" style={{ fontSize: 22, fontWeight: i===1?600:400 }}>{v}<span style={{ fontSize: 12, color:'var(--ink-3)' }}>k €</span></div>
            </div>
          ))}
        </div>
      </div>
    </Screen>
  );
}

// ── 5 · Línea de vida (en app)
function AppTimeline({ dark }) {
  return (
    <Screen tab="sim" dark={dark}>
      <ScreenHead chapter="V · Línea de vida" title="Diez años por delante" subtitle="Hitos · acciones · vesting" />

      <div style={{ padding:'4px 22px 24px' }}>
        {D.timeline.map((h,i) => {
          const isNow = h.kind==='now';
          const isAction = h.kind==='action';
          const isVest = h.kind==='vest';
          return (
            <div key={i} className={`fade fade-${Math.min(5, Math.floor(i/2)+1)}`} style={{
              display:'grid', gridTemplateColumns:'48px 18px 1fr', gap: 10,
              padding:'12px 0', borderBottom:'1px solid var(--rule-2)',
              alignItems:'baseline', position:'relative',
            }}>
              <div className="num" style={{ fontSize: 13, color:'var(--ink-3)' }}>{h.year}</div>
              <div style={{ display:'flex', justifyContent:'center', position:'relative' }}>
                <div style={{
                  width: isNow?10:6, height: isNow?10:6, borderRadius:'50%',
                  background: isNow ? 'var(--ink)' : isAction ? 'var(--signal-neg)' : isVest ? 'var(--signal-pos)' : 'transparent',
                  border: `1.5px solid ${isAction?'var(--signal-neg)':isVest?'var(--signal-pos)':'var(--ink)'}`,
                  marginTop: 5,
                }} />
                {i < D.timeline.length-1 && <div style={{ position:'absolute', top: 18, bottom: -22, left:'50%', width: 1, background:'var(--rule)' }} />}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, display:'flex', alignItems:'baseline', gap: 8 }}>
                  {h.label}
                  {isNow && <span className="label" style={{ fontSize: 8, padding:'2px 5px', border:'1px solid var(--ink)' }}>HOY</span>}
                  {isAction && <span className="label neg" style={{ fontSize: 8, padding:'2px 5px', border:'1px solid var(--signal-neg)' }}>CRÍTICO</span>}
                  {isVest && <span className="label pos" style={{ fontSize: 8, padding:'2px 5px', border:'1px solid var(--signal-pos)' }}>VESTING</span>}
                </div>
                {h.note && <div className="roman" style={{ fontSize: 11.5, marginTop: 3 }}>{h.note}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Screen>
  );
}

// ── 6 · Asesor IA
function AppAdvisor({ dark }) {
  const [q, setQ] = uS('');
  const conv = D.advisor.sample;
  return (
    <Screen tab="ai" dark={dark}>
      <ScreenHead chapter="VI · Asesor" title="Pregúntale al sistema" subtitle="Razona con tus datos · cita la doctrina" />

      <div style={{ padding:'4px 22px 20px' }}>
        {/* User question */}
        <div className="fade fade-1" style={{ marginBottom: 18 }}>
          <div className="label" style={{ marginBottom: 6 }}>Tú</div>
          <div className="body" style={{ fontSize: 15, lineHeight: 1.45, fontStyle:'italic', color:'var(--ink-2)' }}>
            «{conv[0].text}»
          </div>
        </div>

        <div className="rule-dot" style={{ margin:'12px 0' }} />

        {/* AI answer */}
        <div className="fade fade-2">
          <div className="label" style={{ marginBottom: 8 }}>Asesor · razona</div>
          {conv[1].blocks.map((b, i) => {
            if (b.type === 'p') {
              return <div key={i} className="body" style={{ fontSize: 13.5, lineHeight: 1.5, color:'var(--ink-2)', marginBottom: 12 }}>{b.text}</div>;
            }
            return (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr auto', borderTop:'1px solid var(--rule-2)', padding:'10px 0', alignItems:'baseline', gap: 10 }}>
                <div>
                  <div className="label" style={{ fontSize: 9, marginBottom: 3 }}>{b.label}</div>
                  {b.note && <div className="roman" style={{ fontSize: 11 }}>{b.note}</div>}
                </div>
                <div className="num" style={{ fontSize: 18, fontWeight: 500 }}>{b.value}</div>
              </div>
            );
          })}
        </div>

        <div className="rule" style={{ margin:'18px 0 14px' }} />

        <div className="label fade fade-3" style={{ marginBottom: 8 }}>Sugeridas</div>
        <div className="fade fade-3" style={{ display:'flex', flexDirection:'column', gap: 6 }}>
          {D.advisor.suggestions.map((s,i) => (
            <div key={i} className="card-soft" style={{ padding: '10px 12px', fontSize: 12.5, fontStyle:'italic', color:'var(--ink-2)' }}>
              «{s}»
            </div>
          ))}
        </div>

        <div className="fade fade-4" style={{ marginTop: 16, display:'flex', gap: 6, alignItems:'center', borderTop:'1px solid var(--rule)', paddingTop: 12 }}>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Escribe tu pregunta…"
            style={{ flex:1, background:'transparent', border:'none', outline:'none', color:'var(--ink)', fontSize: 13, fontFamily:'var(--serif)', fontStyle:'italic' }} />
          <span className="label" style={{ fontSize: 9 }}>Enviar →</span>
        </div>
      </div>
    </Screen>
  );
}

Object.assign(window, { AppOnboarding, AppHome, AppMaristas, AppSimulator, AppTimeline, AppAdvisor, BigNumber });
