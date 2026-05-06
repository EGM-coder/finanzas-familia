// EGMFin — datos extraídos del Dossier V3.0
// Single source of truth para los tres mocks.

window.EGM = {
  family: { eric: 'Eric', ana: 'Ana', leo: 'Leo', biel: 'Biel', city: 'Logroño · La Rioja', surname: 'Gahimbare Ibáñez' },

  // Patrimonio neto a 24 abril 2026 (líquido + base)
  netWorth: {
    today: 203_417,
    breakdown: [
      { k: 'Liquidez',       v:  41_280, n: '5 cuentas'   },
      { k: 'Indexados',      v:  78_540, n: 'MyInvestor'  },
      { k: 'Trade Republic', v:  18_220, n: 'ETF + acc.'  },
      { k: 'Maristas pagado',v:  43_370, n: 'COBLANSA'    },
      { k: 'Stock options',  v:  22_007, n: 'NDX1 in-the-money' },
    ],
  },

  // Cashflow mensual actual
  flow: {
    income:  6_000,
    fixed:  -2_157,   // alquiler + préstamos + suministros + niños
    remaining: 3_843,
    rows: [
      { k: 'Nómina Eric',          v: +3_500, t: 'income' },
      { k: 'Nómina Ana',           v: +2_500, t: 'income' },
      { k: 'Alquiler',             v:   -800, t: 'fixed', note: 'desaparece may·26' },
      { k: 'Préstamo coche',       v:   -389, t: 'fixed', note: 'Kutxabank' },
      { k: 'Préstamo máster',      v:   -238, t: 'fixed', note: 'vence may·27' },
      { k: 'Comedor + Kids&Us',    v:   -180, t: 'fixed', note: 'Leo' },
      { k: 'Suministros + seguros',v:   -550, t: 'fixed', note: '' },
    ],
  },

  // Maristas — el proyecto vertebrador
  maristas: {
    base:      509_100,
    paid:      143_370,
    pending:   416_640,   // hipoteca por firmar
    delivery:  'mayo 2026',
    promotor:  'COBLANSA',
    interior:  'MAIO',
    milestones: [
      { date: 'Ene 2024',  label: 'Reserva 5%',          amount:  25_050, paid: true },
      { date: '2024–2026', label: 'Cuotas 20% + IVA',    amount: 110_220, paid: true },
      { date: '2025–2026', label: 'Mejoras de obra',     amount:   8_100, paid: true },
      { date: 'May 2026',  label: 'Hipoteca 75% + IVA',  amount: 416_640, paid: false, hero: true },
    ],
    monthly: { rate: 1330, rateHigh: 1480, comm: 80, ibi: 50 },
  },

  // Línea de vida — hitos 2026 → 2036
  timeline: [
    { year: 2026, m:  4, label: 'Hoy',                                   note: 'Fundación del sistema',                  kind: 'now'    },
    { year: 2026, m:  4, label: 'Pareja de hecho · vida 850k',           note: 'Acción crítica antes de hipoteca',       kind: 'action' },
    { year: 2026, m:  5, label: 'Entrega Maristas · firma hipoteca',     note: 'Escritura COBLANSA · 416,6k',            kind: 'event'  },
    { year: 2026, m:  6, label: 'Bonus 2025',                            note: 'Liquidez post-Maristas',                 kind: 'event'  },
    { year: 2027, m:  5, label: 'Máster saldado',                        note: 'Liberación 237,72 €/mes',                kind: 'event'  },
    { year: 2028, m:  6, label: 'Vesting I · strike 11,60 €',            note: 'Paquete I Nordex',                       kind: 'vest'   },
    { year: 2029, m:  6, label: 'Vesting II · strike 26,31 €',           note: 'Paquete II — condicional',               kind: 'vest'   },
    { year: 2032, m:  9, label: 'Leo entra en primaria',                 note: 'Consolidación gasto escolar',            kind: 'event'  },
    { year: 2034, m:  9, label: 'Biel entra en primaria',                note: '',                                       kind: 'event'  },
    { year: 2036, m:  4, label: 'Revisión decenal',                      note: '10 años de datos · re-evaluación',       kind: 'horizon'},
  ],

  // Proyección 2026 → 2036 (miles €) — base, optimista, pesimista
  projection: {
    years: [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036],
    base:      [203, 245, 298, 358, 410, 462, 518, 576, 632, 670, 710],
    optimist:  [203, 252, 318, 402, 475, 545, 615, 690, 760, 815, 870],
    pessimist: [203, 235, 270, 295, 320, 348, 380, 410, 438, 465, 490],
    notes: {
      2028: 'Vesting I',
      2029: 'Vesting II',
      2027: 'Máster saldado',
      2026: 'Firma hipoteca',
    },
  },

  // Doctrina — frases del dossier
  doctrine: {
    main:    'Una forma más lúcida de ver.',
    sub:     'Patrimonio, flujos, protección y control cotidiano de la familia Gahimbare Ibáñez — reunidos en un sistema propio, vivo, y con horizonte.',
    pillars: [
      'Primero vemos.',
      'Luego anticipamos.',
      'Después decidimos.',
    ],
    edge:    'No suma libros — cataloga.',
  },

  // Asesor IA — conversación de muestra
  advisor: {
    sample: [
      { role: 'user', text: '¿Cuánto puedo amortizar de la hipoteca con el bonus de junio sin tocar el colchón?' },
      { role: 'ai', blocks: [
        { type: 'p', text: 'Asumiendo bonus neto de 8.400 € (15% sobre 56k brutos) y manteniendo el colchón de 6 meses (≈ 21.000 € en cuenta común):' },
        { type: 'metric', label: 'Margen disponible',  value: '8.400 €' },
        { type: 'metric', label: 'Recomendación',       value: '5.000 €',  note: 'amortización a capital · ahorra ~7.200 € en intereses a 30 años' },
        { type: 'metric', label: 'Reserva sugerida',    value: '3.400 €',  note: 'aporte indexado MyInvestor común — diversifica' },
        { type: 'p', text: 'Importante: amortización antes del 31 dic 2026 entra en deducción IRPF si la hipoteca es vivienda habitual y aplicas el régimen anterior. Eric, ya no aplica — pero conviene confirmar con tu gestor.' },
      ]},
    ],
    suggestions: [
      '¿Ejecuto el vesting I si NDX1 está a 18 €?',
      'Optimiza Art. 7p para 2026',
      'Compara MAPFRE vs Zurich para vida 850k',
    ],
  },

  // Control · microgasto — el quinto pilar
  // Captura de tickets · semáforo semanal · categorías
  control: {
    week: { num: 17, from: '20 abr', to: '26 abr', remaining: 3843 },
    semaforo: 'verde', // verde · ámbar · rojo
    weekSpend: 287.40,
    weekBudget: 350,
    todaySpend: 42.80,
    recentTickets: [
      { date: '26·iv', time: '13:42', who: 'Ana',  place: 'Mercadona',     cat: 'Alimentación', amount: 67.30, items: 14, photo: true  },
      { date: '26·iv', time: '11:08', who: 'Eric', place: 'Café Moderno',  cat: 'Cafés',        amount:  4.20, items:  2, photo: true  },
      { date: '25·iv', time: '20:15', who: 'Ana',  place: 'Farmacia',      cat: 'Salud',        amount: 18.40, items:  3, photo: true  },
      { date: '25·iv', time: '18:30', who: 'Eric', place: 'Repsol',        cat: 'Coche',        amount: 62.00, items:  1, photo: true  },
      { date: '24·iv', time: '17:50', who: 'Ana',  place: 'Kids&Us',       cat: 'Niños',        amount: 95.00, items:  1, photo: false },
      { date: '24·iv', time: '14:00', who: 'Eric', place: 'Casa Toni',     cat: 'Comer fuera',  amount: 38.50, items:  3, photo: true  },
    ],
    categories: [
      { k: 'Alimentación',   v: 134.20, b: 160 },
      { k: 'Coche',          v:  62.00, b:  80 },
      { k: 'Niños',          v:  53.00, b:  60 },
      { k: 'Comer fuera',    v:  38.50, b:  40 },
      { k: 'Salud',          v:  18.40, b:  30 },
      { k: 'Cafés',          v:  11.30, b:  15 },
    ],
  },

  fmt: {
    eur:  (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n),
    eurD: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n),
    int:  (n) => new Intl.NumberFormat('es-ES').format(n),
  },
};
