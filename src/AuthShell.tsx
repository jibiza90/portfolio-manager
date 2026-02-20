import React, { useEffect, useMemo, useState } from 'react';
import App from './App';
import { CLIENTS } from './constants/clients';
import { fetchAccessProfile, subscribeClientOverview, syncClientOverviews } from './services/cloudPortfolio';
import { auth } from './services/firebaseApp';
import { initializePortfolioStore, usePortfolioStore } from './store/portfolio';

const ADMIN_EMAILS = new Set(['jibiza90@gmail.com']);

type Role = 'admin' | 'client';

interface SessionState {
  loading: boolean;
  role: Role | null;
  clientId: string | null;
  email: string | null;
  displayName: string | null;
  error: string | null;
}

interface ClientOverview {
  clientId: string;
  clientName: string;
  currentBalance: number;
  cumulativeProfit: number;
  dailyProfit: number;
  dailyProfitPct: number;
  participation: number;
  totalIncrements: number;
  totalDecrements: number;
  ytdReturnPct: number;
  latestProfitMonth?: { month: string; profit: number; retPct: number } | null;
  latestReturnMonth?: { month: string; profit: number; retPct: number } | null;
  monthly?: Array<{ month: string; profit: number; retPct: number }>;
  twrYtd?: number;
  twrMonthly?: Array<{ month: string; twr: number; periods: Array<unknown> }>;
  updatedAt: number;
  rows: Array<{
    iso: string;
    label: string;
    increment: number | null;
    decrement: number | null;
    baseBalance: number | null;
    finalBalance: number | null;
    profit: number | null;
    profitPct: number | null;
    sharePct: number | null;
    cumulativeProfit: number | null;
  }>;
}

const palette = {
  bg: '#f2f0ea',
  text: '#1f1d1b',
  muted: '#5f5a52',
  card: '#ffffff',
  cardAlt: '#f7f4ee',
  border: '#d7d2c8',
  accent: '#0f6d7a',
  accentText: '#ffffff',
  error: '#b42318'
};

const formatEuro = (value: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value);

const formatPct = (value: number) => `${(value * 100).toFixed(2)}%`;
const formatMonthLabel = (monthIso: string) => {
  const [year, month] = monthIso.split('-');
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const idx = Number.parseInt(month, 10);
  if (!Number.isFinite(idx) || idx < 1 || idx > 12) return monthIso;
  return `${monthNames[idx - 1]} ${year}`;
};
const currentMonthIsoMadrid = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    timeZone: 'Europe/Madrid'
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  return `${year}-${month}`;
};

const Sparkline = ({ values, color = '#0f6d7a' }: { values: number[]; color?: string }) => {
  const width = 360;
  const height = 110;
  const pad = 10;
  const safeValues = values.length > 0 ? values : [0];
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const range = Math.max(1, max - min);
  const gradientId = `spark-${color.replace('#', '')}`;
  const points = safeValues.map((value, idx) => {
    const x = pad + (idx / Math.max(1, safeValues.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  });
  const areaPoints = `${pad},${height - pad} ${points.join(' ')} ${width - pad},${height - pad}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 120, display: 'block' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.24} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, idx) => {
        const [x, y] = point.split(',').map(Number);
        return <circle key={idx} cx={x} cy={y} r={2.2} fill={color} />;
      })}
    </svg>
  );
};

const HorizontalBars = ({ data }: { data: Array<{ label: string; value: number }> }) => {
  const maxAbs = Math.max(1, ...data.map((item) => Math.abs(item.value)));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {data.map((item) => {
        const pct = (Math.abs(item.value) / maxAbs) * 100;
        const positive = item.value >= 0;
        return (
          <div key={item.label} style={{ display: 'grid', gridTemplateColumns: '88px 1fr 88px', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: palette.muted }}>{item.label}</span>
            <div style={{ height: 10, background: '#e9e5dc', borderRadius: 999, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: positive ? '#0f8d52' : '#b42318',
                  borderRadius: 999
                }}
              />
            </div>
            <span style={{ fontSize: 12, textAlign: 'right', color: palette.text }}>{formatPct(item.value)}</span>
          </div>
        );
      })}
    </div>
  );
};

const VerticalBars = ({ data, color = '#0f6d7a' }: { data: Array<{ label: string; value: number }>; color?: string }) => {
  const maxAbs = Math.max(1, ...data.map((item) => Math.abs(item.value)));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, data.length)}, minmax(22px, 1fr))`, gap: 8, alignItems: 'end', minHeight: 140 }}>
      {data.map((item) => {
        const heightPct = (Math.abs(item.value) / maxAbs) * 100;
        const positive = item.value >= 0;
        return (
          <div key={item.label} style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
            <div
              title={`${item.label}: ${item.value.toFixed(2)}`}
              style={{
                width: '100%',
                minHeight: 6,
                height: `${Math.max(6, heightPct)}%`,
                background: positive ? color : '#b42318',
                borderRadius: 8
              }}
            />
            <span style={{ fontSize: 10, color: palette.muted }}>{item.label.split(' ')[0]}</span>
          </div>
        );
      })}
    </div>
  );
};

const ChartTypeSelector = ({
  value,
  onChange
}: {
  value: 'line' | 'bars';
  onChange: (value: 'line' | 'bars') => void;
}) => (
  <div
    style={{
      display: 'inline-flex',
      border: `1px solid ${palette.border}`,
      borderRadius: 999,
      background: '#ffffff'
    }}
  >
    <button
      type="button"
      onClick={() => onChange('line')}
      style={{
        border: 0,
        background: value === 'line' ? palette.accent : 'transparent',
        color: value === 'line' ? palette.accentText : palette.text,
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        padding: '6px 12px',
        cursor: 'pointer'
      }}
    >
      Linea
    </button>
    <button
      type="button"
      onClick={() => onChange('bars')}
      style={{
        border: 0,
        background: value === 'bars' ? palette.accent : 'transparent',
        color: value === 'bars' ? palette.accentText : palette.text,
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        padding: '6px 12px',
        cursor: 'pointer'
      }}
    >
      Barras
    </button>
  </div>
);

const ChartLegend = ({
  data,
  valueFormatter
}: {
  data: Array<{ label: string; value: number }>;
  valueFormatter: (value: number) => string;
}) => (
  <div style={{ marginTop: 10, display: 'grid', gap: 6, maxHeight: 152, overflowY: 'auto', paddingRight: 4 }}>
    {data.map((item) => (
      <div
        key={item.label}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 8,
          alignItems: 'center',
          border: `1px solid ${palette.border}`,
          borderRadius: 10,
          padding: '6px 10px',
          background: '#ffffff'
        }}
      >
        <span style={{ fontSize: 12, color: palette.muted }}>{item.label}</span>
        <strong style={{ fontSize: 12, color: palette.text }}>{valueFormatter(item.value)}</strong>
      </div>
    ))}
  </div>
);

const LoginCard = ({ onLogin, busy, error }: { onLogin: (email: string, password: string) => Promise<void>; busy: boolean; error: string | null }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const currentYear = new Date().getFullYear();

  return (
    <main className="pmLoginRoot">
      <style>{`
        .pmLoginRoot{
          min-height:100vh;
          padding:20px;
          color:#1f1d1b;
          background:
            radial-gradient(900px 520px at 12% 12%, rgba(15,109,122,.14), transparent 55%),
            radial-gradient(800px 460px at 88% 14%, rgba(230,183,86,.20), transparent 58%),
            radial-gradient(780px 440px at 35% 88%, rgba(52,151,176,.10), transparent 60%),
            linear-gradient(180deg, #f8fbff 0%, #f3efe7 100%);
        }
        .pmLoginWrap{
          max-width:1240px;
          margin:0 auto;
          display:grid;
          grid-template-columns:1.1fr .9fr;
          gap:26px;
          align-items:stretch;
        }
        .pmBrand,.pmCard{
          border-radius:24px;
          border:1px solid rgba(31,29,27,.14);
          background:linear-gradient(180deg, rgba(255,255,255,.84) 0%, rgba(250,246,238,.82) 100%);
          backdrop-filter: blur(10px);
          box-shadow:0 24px 52px rgba(20,24,31,.12);
        }
        .pmBrand{
          padding:30px;
          position:relative;
          overflow:hidden;
        }
        .pmBrand::before{
          content:"";
          position:absolute;
          inset:-30% -18%;
          pointer-events:none;
          background:
            radial-gradient(540px 240px at 20% 15%, rgba(230,183,86,.24), transparent 65%),
            radial-gradient(460px 240px at 78% 22%, rgba(46,143,169,.16), transparent 64%);
          filter:blur(6px);
        }
        .pmBrand > *{ position:relative; z-index:1; }
        .pmLogo{
          display:flex;
          align-items:center;
          gap:12px;
          margin-bottom:18px;
        }
        .pmMark{
          width:44px;
          height:44px;
          border-radius:14px;
          display:grid;
          place-items:center;
          background:linear-gradient(145deg, rgba(230,183,86,.95), rgba(52,151,176,.70));
          box-shadow:0 14px 26px rgba(52,151,176,.24);
        }
        .pmBrand h1{
          margin:0;
          font-size:36px;
          line-height:1.08;
          letter-spacing:-.02em;
          color:#16222e;
        }
        .pmBrand p{
          margin:12px 0 0;
          color:#4f5a64;
          line-height:1.62;
          max-width:62ch;
        }
        .pmPills{
          margin-top:20px;
          display:grid;
          gap:10px;
          grid-template-columns:repeat(2, minmax(0, 1fr));
        }
        .pmPill{
          border:1px solid rgba(31,29,27,.13);
          border-radius:999px;
          background:rgba(255,255,255,.86);
          padding:10px 12px;
          font-size:13px;
          font-weight:650;
          display:flex;
          align-items:center;
          gap:8px;
          color:#243342;
        }
        .pmPill i{
          width:9px;
          height:9px;
          border-radius:999px;
          background:#0f8d52;
          box-shadow:0 0 0 4px rgba(15,141,82,.14);
          display:inline-block;
        }
        .pmLegal{
          margin-top:20px;
          color:#6c746f;
          font-size:12px;
        }
        .pmCard{
          padding:24px;
          align-self:center;
        }
        .pmCardHead{
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          margin-bottom:16px;
        }
        .pmCardTitle{
          margin:0;
          font-size:12px;
          letter-spacing:.16em;
          text-transform:uppercase;
          color:#68737f;
          font-weight:800;
        }
        .pmStatus{
          border:1px solid rgba(31,29,27,.12);
          border-radius:999px;
          padding:7px 10px;
          font-size:12px;
          color:#4f5a64;
          background:#ffffff;
          display:flex;
          align-items:center;
          gap:7px;
        }
        .pmStatus i{
          width:8px;
          height:8px;
          border-radius:999px;
          background:#0f8d52;
          box-shadow:0 0 0 4px rgba(15,141,82,.14);
          display:inline-block;
        }
        .pmField{
          margin-bottom:12px;
        }
        .pmLabel{
          display:block;
          margin-bottom:6px;
          color:#5d6873;
          font-size:12px;
          font-weight:760;
          letter-spacing:.14em;
          text-transform:uppercase;
        }
        .pmControl{
          position:relative;
        }
        .pmInput{
          width:100%;
          border:1px solid rgba(31,29,27,.16);
          border-radius:14px;
          background:#ffffff;
          color:#1f1d1b;
          padding:13px 42px 13px 12px;
          font-size:14px;
          outline:none;
          transition:border-color .18s ease, box-shadow .18s ease;
        }
        .pmInput:focus{
          border-color:#0f6d7a;
          box-shadow:0 0 0 4px rgba(15,109,122,.14);
        }
        .pmIconBtn{
          position:absolute;
          right:8px;
          top:50%;
          transform:translateY(-50%);
          width:30px;
          height:30px;
          border-radius:10px;
          border:1px solid rgba(31,29,27,.14);
          background:#f9fbfd;
          color:#4f5a64;
          cursor:pointer;
          font-size:12px;
        }
        .pmSubmit{
          margin-top:12px;
          width:100%;
          border:0;
          border-radius:14px;
          padding:13px;
          background:linear-gradient(135deg, #0f6d7a, #52a9c2);
          color:#ffffff;
          font-weight:760;
          letter-spacing:.08em;
          text-transform:uppercase;
          cursor:pointer;
          box-shadow:0 16px 34px rgba(15,109,122,.24);
          transition:transform .14s ease, opacity .14s ease;
        }
        .pmSubmit:disabled{
          cursor:not-allowed;
          opacity:.66;
          transform:none;
        }
        .pmSubmit:not(:disabled):active{
          transform:translateY(1px);
        }
        .pmError{
          margin-top:10px;
          border-radius:12px;
          border:1px solid rgba(180,35,24,.34);
          background:rgba(180,35,24,.09);
          color:#9e2017;
          padding:10px 12px;
          font-size:13px;
          font-weight:650;
        }
        @media (max-width:980px){
          .pmLoginWrap{
            grid-template-columns:1fr;
          }
          .pmBrand h1{
            font-size:30px;
          }
        }
        @media (max-width:560px){
          .pmPills{
            grid-template-columns:1fr;
          }
        }
      `}</style>

      <div className="pmLoginWrap">
        <section className="pmBrand" aria-label="Panel de marca">
          <div className="pmLogo">
            <div className="pmMark" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 2l8.5 5v10L12 22 3.5 17V7L12 2Z" stroke="rgba(255,255,255,.95)" strokeWidth="1.6" />
                <path d="M7.2 14.1 12 16.9l4.8-2.8" stroke="rgba(255,255,255,.92)" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M12 6.5v10.4" stroke="rgba(255,255,255,.86)" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <strong style={{ display: 'block', color: '#1d2938', fontSize: 18 }}>Portfolio Manager</strong>
              <span style={{ fontSize: 12, color: '#62707d', letterSpacing: '.12em', textTransform: 'uppercase' }}>
                Client & Admin Access
              </span>
            </div>
          </div>

          <h1>Acceso seguro para revisar cartera, KPIs y reportes en segundos.</h1>
          <p>
            Entra con tu cuenta para ver tus datos. Los clientes solo pueden leer su informacion.
            El administrador mantiene el control total de la gestion y las publicaciones.
          </p>

          <div className="pmPills" aria-label="Caracteristicas">
            <div className="pmPill"><i /> Lectura segura de datos</div>
            <div className="pmPill"><i /> Perfil cliente de solo lectura</div>
            <div className="pmPill"><i /> Exportacion PDF desde panel</div>
            <div className="pmPill"><i /> Historial con trazabilidad</div>
          </div>

          <div className="pmLegal">© {currentYear} Portfolio Manager</div>
        </section>

        <section className="pmCard" aria-label="Formulario de acceso">
          <div className="pmCardHead">
            <h2 className="pmCardTitle">Client Access</h2>
            <div className="pmStatus"><i /> Secure Session</div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void onLogin(email, password);
            }}
            noValidate
          >
            <div className="pmField">
              <label className="pmLabel" htmlFor="pmEmail">Correo</label>
              <div className="pmControl">
                <input
                  id="pmEmail"
                  className="pmInput"
                  type="email"
                  autoComplete="username"
                  placeholder="nombre@dominio.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </div>

            <div className="pmField">
              <label className="pmLabel" htmlFor="pmPass">Contrasena</label>
              <div className="pmControl">
                <input
                  id="pmPass"
                  className="pmInput"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="pmIconBtn"
                  aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? 'Oc' : 'Ver'}
                </button>
              </div>
            </div>

            <button className="pmSubmit" type="submit" disabled={busy || !email.trim() || !password}>
              {busy ? 'Verificando...' : 'Iniciar sesion'}
            </button>

            {error ? <div className="pmError">{error}</div> : null}
          </form>
        </section>
      </div>
    </main>
  );
};

const ClientPortal = ({
  clientId,
  email,
  displayName,
  onLogout
}: {
  clientId: string;
  email: string | null;
  displayName: string | null;
  onLogout: () => Promise<void>;
}) => {
  const [overview, setOverview] = useState<ClientOverview | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [balanceChartType, setBalanceChartType] = useState<'line' | 'bars'>('line');
  const [returnChartType, setReturnChartType] = useState<'line' | 'bars'>('line');
  const [kpiHint, setKpiHint] = useState<{ text: string; x: number; y: number } | null>(null);
  const [flowPopup, setFlowPopup] = useState<'inc' | 'dec' | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeClientOverview(
      clientId,
      (value) => {
        setOverview(value as ClientOverview | null);
        setLoaded(true);
        setError(null);
      },
      () => {
        setLoaded(true);
        setError('No se pudo cargar tu resumen.');
      }
    );
    return () => unsubscribe();
  }, [clientId]);

  const clientName = useMemo(() => overview?.clientName ?? CLIENTS.find((client) => client.id === clientId)?.name ?? clientId, [clientId, overview]);
  const headerName = useMemo(() => {
    const cleanDisplayName = displayName?.trim();
    if (cleanDisplayName) return cleanDisplayName;
    if (clientName && !clientName.toLowerCase().startsWith('cliente ')) return clientName;
    if (email) return email.split('@')[0];
    return clientName;
  }, [clientName, displayName, email]);
  const monthlyRaw = overview?.monthly ?? [];
  const twrMonthlyRaw = overview?.twrMonthly ?? [];
  const monthly = useMemo(
    () => monthlyRaw.filter((item) => Math.abs(item.profit) > 0.0001 || Math.abs(item.retPct) > 0.0001),
    [monthlyRaw]
  );
  const twrMonthly = useMemo(
    () => twrMonthlyRaw.filter((item) => Math.abs(item.twr) > 0.0001 || monthly.some((month) => month.month === item.month)),
    [monthly, twrMonthlyRaw]
  );
  const latestProfitMonth = useMemo(
    () => [...monthly].reverse().find((item) => item.profit !== 0) ?? monthly[monthly.length - 1] ?? null,
    [monthly]
  );
  const twrYtd = overview?.twrYtd ?? overview?.ytdReturnPct ?? 0;
  const currentMonthIso = currentMonthIsoMadrid();
  const latestMonthIso = monthly.length ? monthly[monthly.length - 1].month : null;
  const activeMonthIso =
    latestMonthIso && latestMonthIso > currentMonthIso ? latestMonthIso : currentMonthIso;
  const monthEndBalance = useMemo(() => {
    const map = new Map<string, number>();
    const orderedRows = [...(overview?.rows ?? [])].sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
    for (const row of orderedRows) {
      const month = row.iso.slice(0, 7);
      if (row.finalBalance !== null) {
        map.set(month, row.finalBalance);
      }
    }
    return map;
  }, [overview?.rows]);
  const balanceSeries = useMemo(
    () =>
      monthly.map((item) => ({
        label: formatMonthLabel(item.month),
        value: monthEndBalance.get(item.month) ?? 0
      })),
    [monthEndBalance, monthly]
  );
  const twrSeries = useMemo(
    () =>
      monthly.map((item) => ({
        label: formatMonthLabel(item.month),
        value: twrMonthly.find((row) => row.month === item.month)?.twr ?? 0
      })),
    [monthly, twrMonthly]
  );
  const twrCumulativeByMonth = useMemo(() => {
    const map = new Map<string, number>();
    let factor = 1;
    for (const item of monthly) {
      const twr = twrMonthly.find((row) => row.month === item.month)?.twr ?? 0;
      factor *= 1 + twr;
      map.set(item.month, factor - 1);
    }
    return map;
  }, [monthly, twrMonthly]);
  const latestTwrMonth = useMemo(() => {
    for (let i = monthly.length - 1; i >= 0; i -= 1) {
      const month = monthly[i];
      const twr = twrMonthly.find((row) => row.month === month.month)?.twr ?? 0;
      if (Math.abs(twr) > 0.0001) return { month: month.month, twr };
    }
    if (monthly.length === 0) return null;
    const last = monthly[monthly.length - 1];
    return { month: last.month, twr: twrMonthly.find((row) => row.month === last.month)?.twr ?? 0 };
  }, [monthly, twrMonthly]);
  const movementRows = useMemo(
    () =>
      (overview?.rows ?? [])
        .filter((row) => (row.increment ?? 0) !== 0 || (row.decrement ?? 0) !== 0)
        .slice()
        .sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0)),
    [overview?.rows]
  );
  const incrementDetailRows = useMemo(
    () => movementRows.filter((row) => (row.increment ?? 0) > 0).slice(-24).reverse(),
    [movementRows]
  );
  const decrementDetailRows = useMemo(
    () => movementRows.filter((row) => (row.decrement ?? 0) > 0).slice(-24).reverse(),
    [movementRows]
  );

  const showKpiHint = (event: React.MouseEvent<HTMLElement>, text: string) => {
    setKpiHint({ text, x: event.clientX + 12, y: event.clientY + 12 });
  };
  const moveKpiHint = (event: React.MouseEvent<HTMLElement>) => {
    setKpiHint((prev) => (prev ? { ...prev, x: event.clientX + 12, y: event.clientY + 12 } : prev));
  };

  const downloadClientPdf = async () => {
    if (!overview) return;
    try {
      setPdfBusy(true);
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
      ]);
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const now = new Date();

      doc.setFontSize(18);
      doc.text(`Portfolio - ${clientName}`, 40, 44);
      doc.setFontSize(10);
      doc.text(`Cliente: ${clientId}`, 40, 62);
      doc.text(`Emitido: ${now.toLocaleString('es-ES')}`, 40, 76);

      autoTable(doc, {
        startY: 92,
        head: [['KPI', 'Valor']],
        body: [
          ['Saldo actual', formatEuro(overview.currentBalance)],
          ['Beneficio total', formatEuro(overview.cumulativeProfit)],
          ['Beneficio dia', formatEuro(overview.dailyProfit ?? 0)],
          ['% dia', formatPct(overview.dailyProfitPct ?? 0)],
          ['Participacion', formatPct(overview.participation ?? 0)],
          ['Incrementos totales', formatEuro(overview.totalIncrements ?? 0)],
          ['Decrementos totales', formatEuro(overview.totalDecrements ?? 0)],
          ['Rentabilidad acumulada anual (TWR YTD)', formatPct(twrYtd)]
        ],
        styles: { fontSize: 9 }
      });

      autoTable(doc, {
        startY: (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
          ? ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16)
          : 260,
        head: [['Mes', 'Estado', 'Beneficio', 'TWR mensual', 'TWR acumulado ano']],
        body: monthly.map((item) => {
          const twr = twrMonthly.find((row) => row.month === item.month)?.twr ?? 0;
          const twrCumulative = twrCumulativeByMonth.get(item.month) ?? 0;
          return [
            formatMonthLabel(item.month),
            item.month === activeMonthIso ? 'En curso' : 'Cerrado',
            formatEuro(item.profit),
            formatPct(twr),
            formatPct(twrCumulative)
          ];
        }),
        styles: { fontSize: 9 }
      });

      autoTable(doc, {
        startY: (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
          ? ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16)
          : 400,
        head: [['Fecha', 'Ingreso', 'Retiro', 'Saldo', 'Beneficio dia', '% dia']],
        body: (overview.rows ?? [])
          .slice()
          .reverse()
          .slice(0, 40)
          .map((row) => [
            new Date(row.iso).toLocaleDateString('es-ES'),
            row.increment ? formatEuro(row.increment) : '-',
            row.decrement ? formatEuro(row.decrement) : '-',
            row.finalBalance !== null ? formatEuro(row.finalBalance) : '-',
            row.profit !== null ? formatEuro(row.profit) : '-',
            row.profitPct !== null ? formatPct(row.profitPct) : '-'
          ]),
        styles: { fontSize: 8 }
      });

      doc.save(`portfolio-${clientId}-${now.toISOString().slice(0, 10)}.pdf`);
    } catch (pdfError) {
      console.error(pdfError);
      setError('No se pudo generar el PDF.');
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '24px 16px',
        maxWidth: 980,
        margin: '0 auto',
        background: `radial-gradient(circle at top right, rgba(15,109,122,0.12), transparent 40%), ${palette.bg}`,
        color: palette.text
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
          border: `1px solid ${palette.border}`,
          background: palette.card,
          borderRadius: 14,
          padding: '12px 14px'
        }}
      >
        <div>
          <h1 style={{ margin: 0, color: palette.text }}>Area Cliente</h1>
          <p style={{ margin: '6px 0 0 0', color: palette.muted }}>
            {headerName}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: palette.muted }}>{email ?? ''}</span>
          <button
            type="button"
            onClick={() => {
              void downloadClientPdf();
            }}
            disabled={!overview || pdfBusy}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: `1px solid ${palette.border}`,
              background: '#ffffff',
              color: palette.text,
              fontWeight: 600,
              cursor: 'pointer',
              opacity: !overview || pdfBusy ? 0.7 : 1
            }}
          >
            {pdfBusy ? 'Generando PDF...' : 'Descargar PDF'}
          </button>
          <button
            type="button"
            onClick={() => {
              void onLogout();
            }}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: 0,
              background: palette.accent,
              color: palette.accentText,
              fontWeight: 600
            }}
          >
            Salir
          </button>
        </div>
      </header>

      {kpiHint ? (
        <div
          style={{
            position: 'fixed',
            left: kpiHint.x,
            top: kpiHint.y,
            zIndex: 2000,
            maxWidth: 280,
            pointerEvents: 'none',
            background: '#111827',
            color: '#ffffff',
            fontSize: 12,
            lineHeight: 1.35,
            borderRadius: 10,
            padding: '8px 10px',
            boxShadow: '0 12px 28px rgba(0, 0, 0, 0.28)'
          }}
        >
          {kpiHint.text}
        </div>
      ) : null}

      {error ? <p style={{ color: palette.error, fontWeight: 600 }}>{error}</p> : null}
      {!loaded ? <p style={{ color: palette.muted }}>Cargando tu resumen...</p> : null}
      {loaded && !overview ? (
        <p style={{ color: palette.muted }}>
          Aun no hay resumen publicado para tu cuenta. El administrador debe sincronizar tus datos.
        </p>
      ) : null}

      {overview ? (
        <>
          <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', marginBottom: 18 }}>
            <article
              onMouseEnter={(event) => showKpiHint(event, 'Cuanto dinero total tienes ahora mismo en tu cuenta de inversion.')}
              onMouseMove={moveKpiHint}
              onMouseLeave={() => setKpiHint(null)}
              style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}
            >
              <p style={{ margin: 0, color: palette.muted }}>Saldo actual</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatEuro(overview.currentBalance)}</h3>
            </article>
            <article
              onMouseEnter={(event) => showKpiHint(event, 'Dinero ganado o perdido sumando todo el ano.')}
              onMouseMove={moveKpiHint}
              onMouseLeave={() => setKpiHint(null)}
              style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}
            >
              <p style={{ margin: 0, color: palette.muted }}>Beneficio total</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatEuro(overview.cumulativeProfit)}</h3>
            </article>
            <article
              onMouseEnter={(event) => showKpiHint(event, 'Cuanto ganaste o perdiste solo en el ultimo dia con datos.')}
              onMouseMove={moveKpiHint}
              onMouseLeave={() => setKpiHint(null)}
              style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}
            >
              <p style={{ margin: 0, color: palette.muted }}>Beneficio dia</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatEuro(overview.dailyProfit ?? 0)}</h3>
            </article>
            <article
              onMouseEnter={(event) => showKpiHint(event, 'Porcentaje ganado o perdido en el ultimo dia comparado con el dinero que habia ese dia.')}
              onMouseMove={moveKpiHint}
              onMouseLeave={() => setKpiHint(null)}
              style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}
            >
              <p style={{ margin: 0, color: palette.muted }}>% dia</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatPct(overview.dailyProfitPct ?? 0)}</h3>
            </article>
            <article
              onMouseEnter={(event) => showKpiHint(event, 'Que parte del total de la cartera representas.')}
              onMouseMove={moveKpiHint}
              onMouseLeave={() => setKpiHint(null)}
              style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}
            >
              <p style={{ margin: 0, color: palette.muted }}>Participacion</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatPct(overview.participation ?? 0)}</h3>
            </article>
            <article
              onMouseEnter={(event) => {
                showKpiHint(event, 'Suma de todas tus entradas de dinero del ano.');
                setFlowPopup('inc');
              }}
              onMouseMove={moveKpiHint}
              onMouseLeave={() => {
                setKpiHint(null);
                setFlowPopup((prev) => (prev === 'inc' ? null : prev));
              }}
              style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card, position: 'relative' }}
            >
              <p style={{ margin: 0, color: palette.muted }}>Incrementos totales</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatEuro(overview.totalIncrements ?? 0)}</h3>
              {flowPopup === 'inc' ? (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 8, zIndex: 70, width: 340, maxHeight: 260, overflow: 'auto', background: '#fff', border: `1px solid ${palette.border}`, borderRadius: 12, boxShadow: '0 18px 34px rgba(0,0,0,0.14)', padding: 10 }}>
                  <strong style={{ fontSize: 12 }}>Detalle incrementos</strong>
                  <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                    {incrementDetailRows.length === 0 ? (
                      <span style={{ color: palette.muted, fontSize: 12 }}>Sin incrementos.</span>
                    ) : (
                      incrementDetailRows.map((row) => (
                        <div key={`inc-${row.iso}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, fontSize: 12 }}>
                          <span>{new Date(row.iso).toLocaleDateString('es-ES')}</span>
                          <strong style={{ color: '#0f8d52' }}>{row.increment ? formatEuro(row.increment) : '-'}</strong>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </article>
            <article
              onMouseEnter={(event) => {
                showKpiHint(event, 'Suma de todas tus retiradas de dinero del ano.');
                setFlowPopup('dec');
              }}
              onMouseMove={moveKpiHint}
              onMouseLeave={() => {
                setKpiHint(null);
                setFlowPopup((prev) => (prev === 'dec' ? null : prev));
              }}
              style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card, position: 'relative' }}
            >
              <p style={{ margin: 0, color: palette.muted }}>Decrementos totales</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatEuro(overview.totalDecrements ?? 0)}</h3>
              {flowPopup === 'dec' ? (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 8, zIndex: 70, width: 340, maxHeight: 260, overflow: 'auto', background: '#fff', border: `1px solid ${palette.border}`, borderRadius: 12, boxShadow: '0 18px 34px rgba(0,0,0,0.14)', padding: 10 }}>
                  <strong style={{ fontSize: 12 }}>Detalle decrementos</strong>
                  <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                    {decrementDetailRows.length === 0 ? (
                      <span style={{ color: palette.muted, fontSize: 12 }}>Sin decrementos.</span>
                    ) : (
                      decrementDetailRows.map((row) => (
                        <div key={`dec-${row.iso}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, fontSize: 12 }}>
                          <span>{new Date(row.iso).toLocaleDateString('es-ES')}</span>
                          <strong style={{ color: '#b42318' }}>{row.decrement ? formatEuro(row.decrement) : '-'}</strong>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </article>
            <article
              onMouseEnter={(event) => showKpiHint(event, 'Lo ganado o perdido en el ultimo mes con datos.')}
              onMouseMove={moveKpiHint}
              onMouseLeave={() => setKpiHint(null)}
              style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}
            >
              <p style={{ margin: 0, color: palette.muted }}>Beneficio mensual</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatEuro(latestProfitMonth?.profit ?? 0)}</h3>
              <p style={{ marginTop: 6, color: palette.muted, fontSize: 12 }}>
                {latestProfitMonth ? formatMonthLabel(latestProfitMonth.month) : '-'}
              </p>
            </article>
            <article
              onMouseEnter={(event) => showKpiHint(event, 'TWR mensual: rendimiento del ultimo mes sin distorsion por ingresos ni retiros.')}
              onMouseMove={moveKpiHint}
              onMouseLeave={() => setKpiHint(null)}
              style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}
            >
              <p style={{ margin: 0, color: palette.muted }}>TWR mensual</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatPct(latestTwrMonth?.twr ?? 0)}</h3>
              <p style={{ marginTop: 6, color: palette.muted, fontSize: 12 }}>
                {latestTwrMonth ? formatMonthLabel(latestTwrMonth.month) : '-'}
              </p>
            </article>
            <article
              onMouseEnter={(event) => showKpiHint(event, 'TWR mide el rendimiento real evitando que entradas y salidas distorsionen el resultado.')}
              onMouseMove={moveKpiHint}
              onMouseLeave={() => setKpiHint(null)}
              style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}
            >
              <p style={{ margin: 0, color: palette.muted }}>Rentabilidad acumulada anual</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatPct(twrYtd)}</h3>
              <p style={{ marginTop: 6, color: palette.muted, fontSize: 12 }}>TWR YTD</p>
            </article>
            <article
              onMouseEnter={(event) => showKpiHint(event, 'Fecha y hora de la ultima actualizacion de tus datos.')}
              onMouseMove={moveKpiHint}
              onMouseLeave={() => setKpiHint(null)}
              style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}
            >
              <p style={{ margin: 0, color: palette.muted }}>Actualizado</p>
              <h3 style={{ margin: '8px 0 0 0', fontSize: 16, color: palette.text }}>{new Date(overview.updatedAt).toLocaleString('es-ES')}</h3>
            </article>
          </section>

          <section
            style={{
              marginBottom: 16,
              border: `1px solid ${palette.border}`,
              background: '#ffffff',
              borderRadius: 12,
              padding: 12
            }}
          >
            <strong style={{ display: 'block', marginBottom: 10 }}>Rentabilidad acumulada del ano (sin flujos)</strong>
            <article style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: 10, background: '#f8fbfd' }}>
              <p style={{ margin: 0, color: palette.muted, fontSize: 13 }}>
                Esta metrica usa TWR: mide rendimiento real del ano y no se distorsiona por ingresos o retiros.
                El dato acumulado mensual se calcula encadenando los TWR de cada mes.
              </p>
            </article>
          </section>

          <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', marginBottom: 16 }}>
            <article
              style={{
                borderRadius: 14,
                border: `1px solid ${palette.border}`,
                background: 'linear-gradient(180deg, #ffffff 0%, #f5fbfd 100%)',
                padding: 14,
                boxShadow: '0 12px 26px rgba(15, 109, 122, 0.10)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div>
                  <p style={{ margin: 0, color: palette.muted }}>Grafico de saldo mensual</p>
                  <h4 style={{ margin: '6px 0 0', color: palette.text }}>Evolucion de balance</h4>
                </div>
                <ChartTypeSelector value={balanceChartType} onChange={setBalanceChartType} />
              </div>
              {balanceSeries.length === 0 ? (
                <p style={{ margin: 0, color: palette.muted }}>Aun no hay datos de saldo mensual.</p>
              ) : balanceChartType === 'line' ? (
                <Sparkline values={balanceSeries.map((row) => row.value)} color="#0f6d7a" />
              ) : (
                <VerticalBars data={balanceSeries} color="#0f6d7a" />
              )}
              {balanceSeries.length > 0 ? (
                <ChartLegend data={balanceSeries} valueFormatter={formatEuro} />
              ) : null}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: palette.muted }}>
                <span>Meses con datos: {balanceSeries.length}</span>
                <span>{balanceSeries.length ? `Ultimo: ${formatEuro(balanceSeries[balanceSeries.length - 1].value)}` : ''}</span>
              </div>
            </article>
            <article
              style={{
                borderRadius: 14,
                border: `1px solid ${palette.border}`,
                background: 'linear-gradient(180deg, #ffffff 0%, #f9f7ff 100%)',
                padding: 14,
                boxShadow: '0 12px 26px rgba(70, 38, 140, 0.08)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div>
                  <p style={{ margin: 0, color: palette.muted }}>Grafico TWR mensual</p>
                  <h4 style={{ margin: '6px 0 0', color: palette.text }}>Rendimiento mensual sin flujos</h4>
                </div>
                <ChartTypeSelector value={returnChartType} onChange={setReturnChartType} />
              </div>
              {twrSeries.length === 0 ? (
                <p style={{ margin: 0, color: palette.muted }}>Aun no hay datos de TWR mensual.</p>
              ) : returnChartType === 'line' ? (
                <Sparkline values={twrSeries.map((row) => row.value)} color="#4a2f8f" />
              ) : (
                <HorizontalBars data={twrSeries} />
              )}
              {twrSeries.length > 0 ? (
                <ChartLegend data={twrSeries} valueFormatter={formatPct} />
              ) : null}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: palette.muted }}>
                <span>Meses con datos: {twrSeries.length}</span>
                <span>{twrSeries.length ? `Ultimo: ${formatPct(twrSeries[twrSeries.length - 1].value)}` : ''}</span>
              </div>
            </article>
          </section>

          <section style={{ borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: 14, borderBottom: `1px solid ${palette.border}` }}>
              <strong>Detalle mensual</strong>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 12, color: palette.muted }}>Mes</th>
                    <th style={{ textAlign: 'left', padding: 12, color: palette.muted }}>Estado</th>
                    <th style={{ textAlign: 'right', padding: 12, color: palette.muted }}>Beneficio</th>
                    <th style={{ textAlign: 'right', padding: 12, color: palette.muted }}>TWR mensual</th>
                    <th style={{ textAlign: 'right', padding: 12, color: palette.muted }}>TWR acumulado ano</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 12, color: palette.muted }}>Sin datos mensuales.</td>
                    </tr>
                  ) : (
                    monthly.map((month) => {
                      const twrItem = twrMonthly.find((row) => row.month === month.month);
                      const twrCumulative = twrCumulativeByMonth.get(month.month) ?? 0;
                      return (
                        <tr key={month.month}>
                          <td style={{ padding: 12, borderTop: `1px solid ${palette.border}` }}>{formatMonthLabel(month.month)}</td>
                          <td style={{ padding: 12, borderTop: `1px solid ${palette.border}`, color: palette.muted }}>
                            {month.month === activeMonthIso ? 'En curso' : 'Cerrado'}
                          </td>
                          <td style={{ padding: 12, textAlign: 'right', borderTop: `1px solid ${palette.border}` }}>{formatEuro(month.profit)}</td>
                          <td style={{ padding: 12, textAlign: 'right', borderTop: `1px solid ${palette.border}` }}>{formatPct(twrItem?.twr ?? 0)}</td>
                          <td style={{ padding: 12, textAlign: 'right', borderTop: `1px solid ${palette.border}` }}>{formatPct(twrCumulative)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.cardAlt, overflow: 'hidden' }}>
            <div style={{ padding: 14, borderBottom: `1px solid ${palette.border}` }}>
              <strong>Detalle de movimientos (incrementos y decrementos)</strong>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 12, color: palette.muted }}>Fecha</th>
                    <th style={{ textAlign: 'right', padding: 12, color: palette.muted }}>Ingreso</th>
                    <th style={{ textAlign: 'right', padding: 12, color: palette.muted }}>Retiro</th>
                    <th style={{ textAlign: 'right', padding: 12, color: palette.muted }}>Saldo</th>
                    <th style={{ textAlign: 'right', padding: 12, color: palette.muted }}>Beneficio dia</th>
                    <th style={{ textAlign: 'right', padding: 12, color: palette.muted }}>% dia</th>
                  </tr>
                </thead>
                <tbody>
                  {movementRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 12, color: palette.muted }}>Sin movimientos recientes.</td>
                    </tr>
                  ) : (
                    movementRows
                      .map((row) => (
                        <tr key={row.iso}>
                          <td style={{ padding: 12, borderTop: `1px solid ${palette.border}` }}>{new Date(row.iso).toLocaleDateString('es-ES')}</td>
                          <td style={{ padding: 12, textAlign: 'right', borderTop: `1px solid ${palette.border}`, color: row.increment ? '#0f8d52' : palette.muted, fontWeight: row.increment ? 700 : 400 }}>
                            {row.increment ? formatEuro(row.increment) : '-'}
                          </td>
                          <td style={{ padding: 12, textAlign: 'right', borderTop: `1px solid ${palette.border}`, color: row.decrement ? '#b42318' : palette.muted, fontWeight: row.decrement ? 700 : 400 }}>
                            {row.decrement ? formatEuro(row.decrement) : '-'}
                          </td>
                          <td style={{ padding: 12, textAlign: 'right', borderTop: `1px solid ${palette.border}` }}>{row.finalBalance !== null ? formatEuro(row.finalBalance) : '-'}</td>
                          <td style={{ padding: 12, textAlign: 'right', borderTop: `1px solid ${palette.border}` }}>{row.profit !== null ? formatEuro(row.profit) : '-'}</td>
                          <td style={{ padding: 12, textAlign: 'right', borderTop: `1px solid ${palette.border}` }}>{row.profitPct !== null ? formatPct(row.profitPct) : '-'}</td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
};

const AuthShell = () => {
  const [session, setSession] = useState<SessionState>({
    loading: true,
    role: null,
    clientId: null,
    email: null,
    displayName: null,
    error: null
  });
  const [loginBusy, setLoginBusy] = useState(false);
  const [loadingDots, setLoadingDots] = useState('.');

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        usePortfolioStore.setState({ canWrite: false, initialized: false });
        setSession({ loading: false, role: null, clientId: null, email: null, displayName: null, error: null });
        return;
      }

      try {
        const email = (user.email ?? '').toLowerCase();
        const isAdmin = ADMIN_EMAILS.has(email);

        if (isAdmin) {
          usePortfolioStore.getState().setWriteAccess(true);
          await initializePortfolioStore();
          await syncClientOverviews(usePortfolioStore.getState().snapshot, CLIENTS);
          setSession({ loading: false, role: 'admin', clientId: null, email: user.email, displayName: user.displayName ?? null, error: null });
          return;
        }

        const profile = await fetchAccessProfile(user.uid);
        if (!profile || profile.active === false || profile.role !== 'client' || !profile.clientId) {
          await auth.signOut();
          setSession({
            loading: false,
            role: null,
            clientId: null,
            email: null,
            displayName: null,
            error: 'Tu usuario no tiene perfil activo. Contacta con el administrador.'
          });
          return;
        }

        usePortfolioStore.getState().setWriteAccess(false);
        usePortfolioStore.getState().setInitialized(true);
        setSession({
          loading: false,
          role: 'client',
          clientId: profile.clientId,
          email: user.email,
          displayName: profile.displayName ?? user.displayName ?? null,
          error: null
        });
      } catch (error) {
        console.error(error);
        setSession({
          loading: false,
          role: null,
          clientId: null,
          email: null,
          displayName: null,
          error: 'Error validando tu sesion.'
        });
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!session.loading) return;
    const timer = window.setInterval(() => {
      setLoadingDots((prev) => (prev.length >= 3 ? '.' : `${prev}.`));
    }, 350);
    return () => window.clearInterval(timer);
  }, [session.loading]);

  const handleLogin = async (email: string, password: string) => {
    try {
      setLoginBusy(true);
      setSession((prev) => ({ ...prev, error: null }));
      await auth.signInWithEmailAndPassword(email.trim(), password);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar sesion';
      setSession((prev) => ({ ...prev, error: message }));
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
  };

  if (session.loading) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          color: palette.text,
          background: `radial-gradient(circle at top left, rgba(15,109,122,0.14), transparent 45%), ${palette.bg}`
        }}
      >
        <div style={{ textAlign: 'center', display: 'grid', gap: 8 }}>
          <div style={{ width: 46, height: 46, borderRadius: 999, border: `3px solid ${palette.border}`, borderTopColor: palette.accent, margin: '0 auto' }} />
          <strong>Cargando sesion{loadingDots}</strong>
          <span style={{ color: palette.muted, fontSize: 13 }}>Estamos validando tu acceso</span>
        </div>
      </main>
    );
  }

  if (!session.role) {
    return <LoginCard onLogin={handleLogin} busy={loginBusy} error={session.error} />;
  }

  if (session.role === 'client' && session.clientId) {
    return <ClientPortal clientId={session.clientId} email={session.email} displayName={session.displayName} onLogout={handleLogout} />;
  }

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 10,
          right: 12,
          zIndex: 9999,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          background: '#ffffff',
          border: `1px solid ${palette.border}`,
          borderRadius: 999,
          padding: '6px 10px',
          color: palette.text,
          boxShadow: '0 10px 24px rgba(0, 0, 0, 0.08)'
        }}
      >
        <span style={{ fontSize: 12, color: palette.muted }}>{session.email}</span>
        <button
          type="button"
          onClick={() => {
            void handleLogout();
          }}
          style={{
            border: 0,
            borderRadius: 999,
            padding: '6px 10px',
            background: palette.accent,
            color: palette.accentText,
            fontWeight: 600
          }}
        >
          Salir
        </button>
      </div>
      <App />
    </>
  );
};

export default AuthShell;
