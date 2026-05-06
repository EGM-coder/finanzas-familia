/* ============================================================
   EGMFin · Módulo VII — Control · microgasto
   App + Web, claro y oscuro
   ============================================================ */

const Dc = window.EGM;
const fmtC = window.EGM.fmt;
const { useState: uSC } = React;

// ── Helper: semáforo color
const semColor = (s) => s==='verde' ? 'var(--signal-pos)' : s==='ambar' ? 'var(--signal-warn)' : 'var(--signal-neg)';
const semLabel = (s) => s==='verde' ? 'En curso' : s==='ambar' ? 'Atención' : 'Excedido';

// ════════════════════════════════════════════
//   APP · Control
// ════════════════════════════════════════════
function AppControl({ dark }) {
  const c = Dc.control;
  const pct = Math.min(100, (c.weekSpend / c.weekBudget * 100));
  return (
    <Screen tab="flow" dark={dark}>
      <ScreenHead chapter="VII · Control" title="Microgasto" subtitle={`Semana ${c.week.num} · ${c.week.from} — ${c.week.to}`} />

      <div style={{ padding:'4px 22px 24px' }}>
        {/* Semáforo + cifra de la semana */}
        <div className="card fade fade-1" style={{ padding: 18, position:'relative' }}>
          <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between' }}>
            <div className="label">Gastado · semana</div>
            <div style={{ display:'flex', gap: 4, alignItems:'center' }}>
              <span style={{ width: 8, height: 8, borderRadius:'50%', background: semColor(c.semaforo) }} />
              <span className="label" style={{ color: semColor(c.semaforo), fontSize: 9 }}>{semLabel(c.semaforo)}</span>
            </div>
          </div>
          <div className="display num" style={{ fontSize: 44, marginTop: 6 }}>
            {fmtC.eurD(c.weekSpend)}<span style={{ fontSize: 14, color:'var(--ink-3)' }}> / {fmtC.int(c.weekBudget)} €</span>
          </div>
          <div style={{ marginTop: 12, height: 4, background:'var(--rule-2)', position:'relative' }}>
            <div style={{ position:'absolute', left:0, top:0, height:'100%', width: `${pct}%`, background: semColor(c.semaforo) }} />
          </div>
          <div className="roman" style={{ fontSize: 11, marginTop: 8 }}>
            Hoy {fmtC.eurD(c.todaySpend)} · margen restante mes {fmtC.int(c.week.remaining)} €
          </div>
        </div>

        {/* CTA captura */}
        <div className="fade fade-2" style={{ marginTop: 14, display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8 }}>
          <button className="btn btn-fill" style={{ padding:'14px 12px' }}>
            <span style={{ fontSize: 14, marginRight: 6 }}>◉</span>Foto del ticket
          </button>
          <button className="btn" style={{ padding:'14px 12px' }}>+ Manual</button>
        </div>

        <div className="rule" style={{ margin:'22px 0 12px' }} />

        {/* Categorías de la semana */}
        <div className="label fade fade-3" style={{ marginBottom: 10 }}>Por categoría</div>
        {c.categories.map((cat,i) => {
          const p = (cat.v / cat.b) * 100;
          const over = p > 100;
          return (
            <div key={i} className="fade fade-3" style={{ padding:'9px 0', borderBottom:'1px solid var(--rule-2)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 4 }}>
                <span style={{ fontSize: 13 }}>{cat.k}</span>
                <span className="num" style={{ fontSize: 13, color: over?'var(--signal-neg)':'var(--ink)' }}>
                  {fmtC.eurD(cat.v)}<span style={{ color:'var(--ink-3)', fontSize: 11 }}> / {cat.b} €</span>
                </span>
              </div>
              <div style={{ height: 2, background:'var(--rule-2)', position:'relative' }}>
                <div style={{ position:'absolute', left: 0, top: 0, height:'100%', width: `${Math.min(100,p)}%`, background: over?'var(--signal-neg)':'var(--ink)' }} />
              </div>
            </div>
          );
        })}

        <div className="rule" style={{ margin:'22px 0 12px' }} />

        {/* Tickets recientes */}
        <div className="label fade fade-4" style={{ marginBottom: 10 }}>Tickets recientes</div>
        {c.recentTickets.slice(0, 5).map((t,i) => (
          <div key={i} className="fade fade-4" style={{ display:'grid', gridTemplateColumns:'auto 1fr auto', gap: 10, padding:'10px 0', borderBottom:'1px solid var(--rule-2)', alignItems:'baseline' }}>
            <div style={{
              width: 28, height: 28, border:'1px solid var(--rule)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily:'var(--mono)', fontSize: 9, color:'var(--ink-3)',
              background: t.photo?'var(--bg-soft)':'transparent', alignSelf:'center',
            }}>{t.photo?'IMG':'·'}</div>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{t.place}</div>
              <div className="roman" style={{ fontSize: 11 }}>{t.who} · {t.cat} · {t.date}</div>
            </div>
            <div className="num" style={{ fontSize: 14 }}>{fmtC.eurD(t.amount)}</div>
          </div>
        ))}
      </div>
    </Screen>
  );
}

// ════════════════════════════════════════════
//   WEB · Control · dashboard
// ════════════════════════════════════════════
function WebControl({ dark }) {
  const c = Dc.control;
  const pct = Math.min(100, (c.weekSpend / c.weekBudget * 100));
  return (
    <WebFrame dark={dark} section="flow">
      <div style={{ padding:'34px 50px 50px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
          <div>
            <div className="label">VII · Control</div>
            <div className="display" style={{ fontSize: 42, marginTop: 4 }}>Microgasto.</div>
          </div>
          <div className="roman" style={{ fontSize: 14 }}>Semana {c.week.num} · {c.week.from} — {c.week.to}</div>
        </div>
        <div className="body" style={{ fontStyle:'italic', color:'var(--ink-3)', marginTop: 6, fontSize: 14 }}>
          Tickets fotografiados, leídos, catalogados. El semáforo del domingo decide la semana.
        </div>
        <div className="rule-strong" style={{ margin:'20px 0 30px' }} />

        <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1fr', gap: 40 }}>
          {/* Izquierda: cifra y categorías */}
          <div className="fade fade-1">
            <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between' }}>
              <div className="label">Gastado · semana</div>
              <div style={{ display:'flex', gap: 6, alignItems:'center' }}>
                <span style={{ width: 10, height: 10, borderRadius:'50%', background: semColor(c.semaforo) }} />
                <span className="label" style={{ color: semColor(c.semaforo) }}>{semLabel(c.semaforo)}</span>
              </div>
            </div>
            <div className="display num" style={{ fontSize: 84, lineHeight: 1 }}>
              {fmtC.eurD(c.weekSpend)}<span style={{ fontSize: 22, color:'var(--ink-3)' }}> / {fmtC.int(c.weekBudget)} €</span>
            </div>
            <div style={{ marginTop: 16, height: 6, background:'var(--rule-2)', position:'relative' }}>
              <div style={{ position:'absolute', left:0, top:0, height:'100%', width: `${pct}%`, background: semColor(c.semaforo) }} />
            </div>
            <div className="roman" style={{ fontSize: 12.5, marginTop: 8 }}>
              {pct.toFixed(0)}% del presupuesto · hoy {fmtC.eurD(c.todaySpend)} · margen mensual restante {fmtC.int(c.week.remaining)} €
            </div>

            <div className="rule" style={{ margin:'30px 0 16px' }} />
            <div className="label" style={{ marginBottom: 12 }}>Por categoría · semana</div>
            {c.categories.map((cat,i) => {
              const p = (cat.v / cat.b) * 100;
              const over = p > 100;
              return (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'140px 1fr 110px', gap: 16, padding:'11px 0', borderBottom:'1px solid var(--rule-2)', alignItems:'baseline' }}>
                  <span style={{ fontSize: 14 }}>{cat.k}</span>
                  <div style={{ height: 3, background:'var(--rule-2)', position:'relative' }}>
                    <div style={{ position:'absolute', left:0, top:0, height:'100%', width: `${Math.min(100,p)}%`, background: over?'var(--signal-neg)':'var(--ink)' }} />
                  </div>
                  <span className="num" style={{ fontSize: 14, textAlign:'right', color: over?'var(--signal-neg)':'var(--ink)' }}>
                    {fmtC.eurD(cat.v)}<span style={{ color:'var(--ink-3)', fontSize: 11 }}> / {cat.b}</span>
                  </span>
                </div>
              );
            })}
          </div>

          {/* Derecha: tickets recientes con thumbnail */}
          <div className="fade fade-2">
            <div className="card" style={{ padding: 18 }}>
              <div className="label" style={{ marginBottom: 10 }}>Captura</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8 }}>
                <button className="btn btn-fill" style={{ padding: 14 }}>◉ Foto del ticket</button>
                <button className="btn" style={{ padding: 14 }}>+ Manual</button>
              </div>
              <div className="roman" style={{ fontSize: 11.5, marginTop: 10 }}>
                OCR + categorización automática · revisable antes de guardar
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <div className="label" style={{ marginBottom: 10 }}>Tickets recientes</div>
              {c.recentTickets.map((t,i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'34px 1fr auto', gap: 12, padding:'11px 0', borderBottom:'1px solid var(--rule-2)', alignItems:'baseline' }}>
                  <div style={{
                    width: 34, height: 34, border:'1px solid var(--rule)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontFamily:'var(--mono)', fontSize: 9, color:'var(--ink-3)',
                    background: t.photo?'var(--bg-soft)':'transparent', alignSelf:'center',
                  }}>{t.photo?'IMG':'·'}</div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{t.place}</div>
                    <div className="roman" style={{ fontSize: 11.5 }}>{t.who} · {t.cat} · {t.date} {t.time}</div>
                  </div>
                  <div className="num" style={{ fontSize: 14 }}>{fmtC.eurD(t.amount)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </WebFrame>
  );
}

Object.assign(window, { AppControl, WebControl });
