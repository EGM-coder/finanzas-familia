/* ============================================================
   EGMFin — Web screens (light + dark via .dark class)
   6 vistas: Landing · Inicio dashboard · Maristas · Horizonte · Línea de vida · Asesor IA
   ============================================================ */

const fmtW = window.EGM.fmt;
const DW = window.EGM;
const { useState: uSW } = React;

// ── Landing
function WebLanding({ dark }) {
  return (
    <div className={`egm ${dark?'dark':''}`} style={{
      width:'100%', height:'100%', background:'var(--bg)', overflow:'auto',
      padding:'40px 60px 50px',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div className="display-it" style={{ fontSize: 22 }}>EGM<span style={{ color:'var(--ink-3)' }}>·</span>Fin</div>
        <div style={{ display:'flex', gap: 22 }}>
          {['Sistema','Doctrina','Horizonte','Acceso'].map(t => <span key={t} className="label">{t}</span>)}
        </div>
      </div>
      <div className="rule-strong" style={{ marginTop: 22, marginBottom: 50 }} />

      <div style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr', gap: 70 }}>
        <div>
          <div className="label fade fade-1" style={{ marginBottom: 20 }}>Dossier estratégico · 2026—2036</div>
          <div className="display fade fade-2" style={{ fontSize: 96, lineHeight: 0.96 }}>
            Una<br/>forma más<br/><span className="display-it">lúcida</span><br/>de ver.
          </div>
          <div className="rule-strong fade fade-3" style={{ marginTop: 28, width: 90, marginBottom: 22 }} />
          <div className="body fade fade-3" style={{ fontSize: 16.5, lineHeight: 1.5, maxWidth: 480, color:'var(--ink-2)' }}>
            Patrimonio, flujos, protección y control cotidiano de la familia <span className="display-it">Gahimbare Ibáñez</span> — reunidos en un sistema propio, con la disciplina de un despacho de banca privada.
          </div>
          <div className="fade fade-4" style={{ marginTop: 32, display:'flex', gap: 10 }}>
            <button className="btn btn-fill">Acceso · Eric →</button>
            <button className="btn">Acceso · Ana</button>
          </div>
        </div>

        <div className="card fade fade-3" style={{ padding: 22 }}>
          <div className="label" style={{ marginBottom: 14 }}>Estado del sistema · 24·iv·26</div>
          {[
            { l:'Patrimonio neto',    v:'203.417', s:'€' },
            { l:'Maristas pagado',    v:'143.370', s:'€ · 28%' },
            { l:'Hipoteca pendiente', v:'416.640', s:'€ · firma may·26' },
            { l:'Remanente mensual',  v:'3.843',   s:'€/mes' },
            { l:'Cuentas modeladas',  v:'18',      s:'5 clases' },
            { l:'Coste sistema',      v:'<15',     s:'€/mes' },
          ].map((r,i) => (
            <div key={i} style={{ display:'flex', alignItems:'baseline', padding:'13px 0', borderBottom:'1px solid var(--rule-2)' }}>
              <div style={{ flex:1 }}>
                <div className="label" style={{ fontSize: 9, marginBottom: 2 }}>{r.l}</div>
                <div className="roman" style={{ fontSize: 11 }}>{r.s}</div>
              </div>
              <div className="display num" style={{ fontSize: 24 }}>{r.v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="fade fade-5" style={{ marginTop: 60, paddingTop: 28, borderTop:'1px solid var(--rule)', display:'flex', justifyContent:'space-between', gap: 40 }}>
        {DW.doctrine.pillars.map((p,i) => (
          <div key={i} style={{ flex:1 }}>
            <span className="roman" style={{ fontSize: 14 }}>{['I','II','III'][i]}</span>
            <div className="display-it" style={{ fontSize: 28, marginTop: 6 }}>{p}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Web · Inicio dashboard
function WebHome({ dark }) {
  const nw = DW.netWorth;
  return (
    <WebFrame dark={dark} section="home">
      <div style={{ padding:'34px 50px 50px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
          <div>
            <div className="label">I · Inicio</div>
            <div className="display" style={{ fontSize: 38, marginTop: 4 }}>Hoy, 24·iv·26</div>
          </div>
          <div className="roman" style={{ fontSize: 14 }}>Logroño · semana XVII</div>
        </div>
        <div className="rule-strong" style={{ margin:'20px 0 32px' }} />

        <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap: 40 }}>
          <div className="fade fade-1">
            <div className="label" style={{ marginBottom: 8 }}>Patrimonio neto</div>
            <div className="display num breathe" style={{ fontSize: 96, letterSpacing:'-0.025em', lineHeight: 1 }}>
              {fmtW.int(nw.today)}<span style={{ fontSize: 36, color:'var(--ink-3)' }}> €</span>
            </div>
            <div className="body" style={{ fontStyle:'italic', color:'var(--ink-3)', marginTop: 8, fontSize: 14 }}>
              Líquido + base · sin Maristas finalizado · trayectoria base 2036 → 710k €
            </div>

            <div className="rule" style={{ margin:'28px 0 14px' }} />
            <div className="label" style={{ marginBottom: 12 }}>Composición · cinco clases</div>
            {nw.breakdown.map((r,i) => {
              const pct = (r.v / nw.today * 100).toFixed(0);
              return (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'24px 1fr 100px 50px', gap: 14, padding:'13px 0', borderBottom:'1px solid var(--rule-2)', alignItems:'baseline' }}>
                  <span className="roman" style={{ fontSize: 12 }}>{['I','II','III','IV','V'][i]}</span>
                  <div>
                    <div style={{ fontSize: 14.5, fontWeight: 500 }}>{r.k}</div>
                    <div className="roman" style={{ fontSize: 12 }}>{r.n}</div>
                  </div>
                  <div className="num" style={{ fontSize: 17, textAlign:'right' }}>{fmtW.int(r.v)} €</div>
                  <div className="num" style={{ fontSize: 12, textAlign:'right', color:'var(--ink-3)' }}>{pct}%</div>
                </div>
              );
            })}
          </div>

          <div className="fade fade-2">
            <div className="card" style={{ padding: 22 }}>
              <div className="label" style={{ marginBottom: 12 }}>Flujo · abril 2026</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 16, marginBottom: 14 }}>
                <div>
                  <div className="label" style={{ fontSize: 9, marginBottom: 4 }}>Ingresos</div>
                  <div className="num pos" style={{ fontSize: 22 }}>+{fmtW.int(DW.flow.income)}</div>
                </div>
                <div>
                  <div className="label" style={{ fontSize: 9, marginBottom: 4 }}>Fijos</div>
                  <div className="num neg" style={{ fontSize: 22 }}>{fmtW.int(DW.flow.fixed)}</div>
                </div>
              </div>
              <div className="rule" style={{ marginBottom: 12 }} />
              <div className="label" style={{ fontSize: 9, marginBottom: 4 }}>Margen</div>
              <div className="display num" style={{ fontSize: 38 }}>{fmtW.int(DW.flow.remaining)}<span style={{ fontSize: 14, color:'var(--ink-3)' }}> €/mes</span></div>
            </div>

            <div style={{ marginTop: 18 }}>
              <div className="label" style={{ marginBottom: 10 }}>Detalle · líneas</div>
              {DW.flow.rows.map((r,i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr auto', padding:'8px 0', borderBottom:'1px solid var(--rule-2)', alignItems:'baseline' }}>
                  <div>
                    <div style={{ fontSize: 13 }}>{r.k}</div>
                    {r.note && <div className="roman" style={{ fontSize: 10.5 }}>{r.note}</div>}
                  </div>
                  <div className={`num ${r.v>0?'pos':''}`} style={{ fontSize: 13 }}>{r.v>0?'+':''}{fmtW.int(r.v)} €</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </WebFrame>
  );
}

// ── Web · Maristas
function WebMaristas({ dark }) {
  const m = DW.maristas;
  const pct = (m.paid / m.base * 100).toFixed(0);
  return (
    <WebFrame dark={dark} section="mar">
      <div style={{ padding:'34px 50px 50px' }}>
        <div className="label">III · Maristas</div>
        <div className="display" style={{ fontSize: 42, marginTop: 4 }}>El piso, paso a paso.</div>
        <div className="body" style={{ fontStyle:'italic', color:'var(--ink-3)', marginTop: 6, fontSize: 14 }}>
          Entrega prevista mayo 2026 · COBLANSA · interior MAIO
        </div>
        <div className="rule-strong" style={{ margin:'20px 0 30px' }} />

        <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1fr', gap: 40 }}>
          <div className="fade fade-1">
            <div className="label" style={{ marginBottom: 8 }}>Pagado de la base</div>
            <div className="display num" style={{ fontSize: 64, lineHeight: 1 }}>
              {fmtW.int(m.paid)}<span style={{ fontSize: 22, color:'var(--ink-3)' }}> / {fmtW.int(m.base)} €</span>
            </div>
            <div style={{ marginTop: 16, height: 8, background:'var(--rule-2)', position:'relative' }}>
              <div style={{ position:'absolute', left:0, top:0, height:'100%', width: `${pct}%`, background:'var(--ink)' }} />
            </div>
            <div className="label" style={{ marginTop: 6 }}>{pct}% · firma hipoteca pendiente</div>

            <div style={{ marginTop: 30 }}>
              <div className="label" style={{ marginBottom: 12 }}>Cronograma de pagos</div>
              {m.milestones.map((ms,i) => (
                <div key={i} style={{
                  display:'grid', gridTemplateColumns:'24px 100px 1fr auto auto', gap: 16,
                  padding:'14px 0', borderBottom:'1px solid var(--rule-2)', alignItems:'baseline',
                  background: ms.hero ? 'var(--bg-soft)' : 'transparent',
                  margin: ms.hero ? '6px -16px' : 0,
                  paddingLeft: ms.hero ? 16 : 0, paddingRight: ms.hero ? 16 : 0,
                  borderLeft: ms.hero ? '2px solid var(--ink)' : 'none',
                }}>
                  <div style={{ width: 10, height: 10, borderRadius:'50%', background: ms.paid?'var(--ink)':'transparent', border:'1.5px solid var(--ink)', marginTop: 6 }} />
                  <div className="roman" style={{ fontSize: 12 }}>{ms.date}</div>
                  <div>
                    <div style={{ fontSize: 14.5, fontWeight: ms.hero?600:500 }}>{ms.label}</div>
                    {ms.hero && <div className="body" style={{ fontSize: 12, fontStyle:'italic', marginTop: 3 }}>Acción crítica · vida 850k antes de firma</div>}
                  </div>
                  <div className="num" style={{ fontSize: 16 }}>{fmtW.int(ms.amount)} €</div>
                  <div className="label" style={{ fontSize: 9, color: ms.paid?'var(--signal-pos)':'var(--ink-4)', minWidth: 70, textAlign:'right' }}>{ms.paid?'Pagado':'Pendiente'}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="fade fade-2">
            <div className="card" style={{ padding: 22 }}>
              <div className="label" style={{ marginBottom: 8 }}>Cuota mensual estimada</div>
              <div className="display num" style={{ fontSize: 44 }}>
                {fmtW.int(m.monthly.rate)}<span style={{ fontSize: 16, color:'var(--ink-3)' }}> – {fmtW.int(m.monthly.rateHigh)} €/mes</span>
              </div>
              <div className="rule" style={{ margin:'16px 0' }} />
              {[['Hipoteca', `${fmtW.int(m.monthly.rate)} €`],['Comunidad', `${fmtW.int(m.monthly.comm)} €`],['IBI prorrateado', `${fmtW.int(m.monthly.ibi)} €`]].map(([l,v],i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', fontSize: 13 }}>
                  <span style={{ color:'var(--ink-3)' }}>{l}</span>
                  <span className="num">{v}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 18, padding: '14px 16px', borderLeft:'2px solid var(--signal-warn)', background:'var(--bg-soft)' }}>
              <div className="label warn" style={{ marginBottom: 4 }}>Acción crítica</div>
              <div className="body" style={{ fontSize: 13.5, fontStyle:'italic' }}>
                Pareja de hecho + vida 850k <strong>antes</strong> de firma. Sin esto, la hipoteca expone a Ana al 100% del riesgo.
              </div>
            </div>
          </div>
        </div>
      </div>
    </WebFrame>
  );
}

// ── Web · Horizonte (simulator) — escala dashboard
function WebSimulator({ dark }) {
  const p = DW.projection;
  const [year, setY] = uSW(2031);
  const idx = p.years.indexOf(year);
  const W = 700, H = 280, padT = 16, padB = 26, padR = 50;
  const xAt = i => (i / (p.years.length-1)) * (W - padR);
  const yAt = v => padT + (1 - v/900) * (H - padT - padB);
  const path = arr => arr.map((v,i)=>`${i===0?'M':'L'}${xAt(i)},${yAt(v)}`).join(' ');

  return (
    <WebFrame dark={dark} section="sim">
      <div style={{ padding:'34px 50px 50px' }}>
        <div className="label">IV · Horizonte</div>
        <div className="display" style={{ fontSize: 42, marginTop: 4 }}>2026 — 2036.</div>
        <div className="body" style={{ fontStyle:'italic', color:'var(--ink-3)', marginTop: 6, fontSize: 14 }}>
          Lo que los números dicen que vendrá · tres escenarios · k €
        </div>
        <div className="rule-strong" style={{ margin:'20px 0 30px' }} />

        <div className="card fade fade-1" style={{ padding: 24, position:'relative' }}>
          <svg width={W} height={H} style={{ display:'block' }}>
            {[0,225,450,675,900].map((g,i) => (
              <g key={i}>
                <line x1={0} x2={W-padR} y1={yAt(g)} y2={yAt(g)} stroke="var(--rule-2)" />
                <text x={W-padR+8} y={yAt(g)+4} fontSize="10" fill="var(--ink-3)" fontFamily="var(--mono)">{g===0?'0':g+'k'}</text>
              </g>
            ))}
            <path d={path(p.optimist)} fill="none" stroke="var(--ink)" strokeWidth="1.2" strokeDasharray="4,3" opacity=".55" />
            <path d={path(p.pessimist)} fill="none" stroke="var(--ink)" strokeWidth="1" strokeDasharray="1,3" opacity=".4" />
            <path d={path(p.base)} fill="none" stroke="var(--ink)" strokeWidth="1.8" />

            {p.years.map((y,i) => p.notes[y] ? (
              <g key={y}>
                <line x1={xAt(i)} x2={xAt(i)} y1={padT} y2={H-padB} stroke="var(--rule)" strokeDasharray="2,2" />
                <text x={xAt(i)+5} y={padT+10} fontSize="9" fill="var(--ink-3)" fontFamily="var(--sans)" letterSpacing="1">{p.notes[y].toUpperCase()}</text>
              </g>
            ) : null)}

            <line x1={xAt(idx)} x2={xAt(idx)} y1={padT-8} y2={H-padB} stroke="var(--ink)" strokeWidth="1" />
            <circle cx={xAt(idx)} cy={yAt(p.base[idx])} r="5" fill="var(--bg)" stroke="var(--ink)" strokeWidth="2" />

            {p.years.map((y,i) => (
              <text key={y} x={xAt(i)} y={H-8} fontSize="10" textAnchor="middle"
                fill={year===y?'var(--ink)':'var(--ink-4)'} fontFamily="var(--mono)"
                fontWeight={year===y?600:400}>{y}</text>
            ))}
          </svg>
          <input type="range" min={2026} max={2036} value={year}
            onChange={e=>setY(+e.target.value)}
            style={{ position:'absolute', left: 24, right: 74, top: 40, height: H-50, opacity: 0, cursor:'ew-resize', width: W-padR }} />
          <input type="range" min={2026} max={2036} value={year}
            onChange={e=>setY(+e.target.value)}
            style={{ width: W-padR, marginTop: 4, accentColor:'var(--ink)' }} />
        </div>

        <div style={{ marginTop: 28, display:'grid', gridTemplateColumns:'140px 1fr 1fr 1fr', gap: 22, alignItems:'baseline' }}>
          <div>
            <div className="label">Año</div>
            <div className="display-it num" style={{ fontSize: 60 }}>{year}</div>
            {p.notes[year] && <div className="display-it" style={{ fontSize: 14, color:'var(--ink-3)' }}>{p.notes[year]}</div>}
          </div>
          {[['Optimista', p.optimist[idx], 'RV 6,5%'],['Base', p.base[idx], 'RV 5,5%'],['Pesimista', p.pessimist[idx], 'RV 3,5%']].map(([l,v,r],i) => (
            <div key={i} style={{ borderTop:'1px solid var(--ink)', paddingTop: 12 }}>
              <div className="label" style={{ fontSize: 9 }}>{l}</div>
              <div className="display num" style={{ fontSize: 38, fontWeight: i===1?600:400 }}>{v}<span style={{ fontSize: 14, color:'var(--ink-3)' }}>k €</span></div>
              <div className="roman" style={{ fontSize: 11 }}>{r}</div>
            </div>
          ))}
        </div>
      </div>
    </WebFrame>
  );
}

// ── Web · Línea de vida
function WebTimeline({ dark }) {
  return (
    <WebFrame dark={dark} section="tl">
      <div style={{ padding:'34px 50px 50px' }}>
        <div className="label">V · Línea de vida</div>
        <div className="display" style={{ fontSize: 42, marginTop: 4 }}>Diez años por delante.</div>
        <div className="body" style={{ fontStyle:'italic', color:'var(--ink-3)', marginTop: 6, fontSize: 14 }}>
          No todos están bajo nuestro control, pero sí mapeados.
        </div>
        <div className="rule-strong" style={{ margin:'20px 0 30px' }} />

        {DW.timeline.map((h,i) => {
          const isNow = h.kind==='now';
          const isAction = h.kind==='action';
          const isVest = h.kind==='vest';
          return (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'90px 24px 1fr 130px', gap: 18, padding:'16px 0', borderBottom:'1px solid var(--rule-2)', alignItems:'baseline' }}>
              <div className="display-it num" style={{ fontSize: 22, color: isNow?'var(--ink)':'var(--ink-3)' }}>{h.year}</div>
              <div style={{ display:'flex', justifyContent:'center', position:'relative' }}>
                <div style={{
                  width: isNow?12:7, height: isNow?12:7, borderRadius:'50%',
                  background: isNow?'var(--ink)':isAction?'var(--signal-neg)':isVest?'var(--signal-pos)':'transparent',
                  border: `1.5px solid ${isAction?'var(--signal-neg)':isVest?'var(--signal-pos)':'var(--ink)'}`,
                  marginTop: 6,
                }} />
                {i < DW.timeline.length-1 && <div style={{ position:'absolute', top: 22, bottom: -32, left:'50%', width: 1, background:'var(--rule)' }} />}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 500 }}>{h.label}</div>
                {h.note && <div className="roman" style={{ fontSize: 12.5, marginTop: 3 }}>{h.note}</div>}
              </div>
              <div style={{ textAlign:'right' }}>
                {isNow && <span className="label" style={{ background:'var(--ink)', color:'var(--bg)', padding:'4px 9px', fontSize: 9 }}>HOY</span>}
                {isAction && <span className="label neg" style={{ border:'1px solid var(--signal-neg)', padding:'4px 9px', fontSize: 9 }}>CRÍTICO</span>}
                {isVest && <span className="label pos" style={{ border:'1px solid var(--signal-pos)', padding:'4px 9px', fontSize: 9 }}>VESTING</span>}
              </div>
            </div>
          );
        })}
      </div>
    </WebFrame>
  );
}

// ── Web · Asesor IA
function WebAdvisor({ dark }) {
  const conv = DW.advisor.sample;
  return (
    <WebFrame dark={dark} section="ai">
      <div style={{ padding:'34px 50px 50px' }}>
        <div className="label">VI · Asesor</div>
        <div className="display" style={{ fontSize: 42, marginTop: 4 }}>Pregúntale al sistema.</div>
        <div className="body" style={{ fontStyle:'italic', color:'var(--ink-3)', marginTop: 6, fontSize: 14 }}>
          Razona con tus datos. Cita la doctrina. Nunca improvisa.
        </div>
        <div className="rule-strong" style={{ margin:'20px 0 30px' }} />

        <div style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr', gap: 40 }}>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>Pregunta · Eric · 14:22</div>
            <div className="body" style={{ fontSize: 18, lineHeight: 1.4, fontStyle:'italic', color:'var(--ink-2)', maxWidth: 540 }}>
              «{conv[0].text}»
            </div>

            <div className="rule-dot" style={{ margin:'24px 0' }} />

            <div className="label" style={{ marginBottom: 12 }}>Asesor · razona</div>
            {conv[1].blocks.map((b,i) => {
              if (b.type==='p') return <div key={i} className="body" style={{ fontSize: 15, lineHeight: 1.55, color:'var(--ink-2)', marginBottom: 16, maxWidth: 580 }}>{b.text}</div>;
              return (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr auto', borderTop:'1px solid var(--rule-2)', padding:'14px 0', alignItems:'baseline', gap: 14, maxWidth: 580 }}>
                  <div>
                    <div className="label" style={{ fontSize: 9, marginBottom: 4 }}>{b.label}</div>
                    {b.note && <div className="roman" style={{ fontSize: 12 }}>{b.note}</div>}
                  </div>
                  <div className="display num" style={{ fontSize: 28 }}>{b.value}</div>
                </div>
              );
            })}
          </div>

          <div>
            <div className="label" style={{ marginBottom: 12 }}>Sugeridas</div>
            <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
              {DW.advisor.suggestions.map((s,i) => (
                <div key={i} className="card-soft" style={{ padding: '12px 14px', fontSize: 13.5, fontStyle:'italic', color:'var(--ink-2)', fontFamily:'var(--serif)' }}>«{s}»</div>
              ))}
            </div>

            <div className="rule" style={{ margin:'24px 0 14px' }} />
            <div className="label" style={{ marginBottom: 8 }}>Doctrina activa</div>
            <div className="display-it" style={{ fontSize: 22, lineHeight: 1.2 }}>«{DW.doctrine.edge}»</div>
          </div>
        </div>
      </div>
    </WebFrame>
  );
}

Object.assign(window, { WebLanding, WebHome, WebMaristas, WebSimulator, WebTimeline, WebAdvisor });
