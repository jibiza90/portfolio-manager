import React, { useEffect, useMemo, useState } from 'react';
import App from './App';
import { CLIENTS } from './constants/clients';
import { fetchAccessProfile, subscribeClientOverview, syncClientOverviews } from './services/cloudPortfolio';
import { auth, firebase } from './services/firebaseApp';
import { initializePortfolioStore, usePortfolioStore } from './store/portfolio';

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const ADMIN_EMAILS = new Set(['jibiza90@gmail.com', 'jpujola@alogroup.es'].map(normalizeEmail));

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

const PremiumAreaChart = ({
  data,
  valueFormatter,
  color,
  expanded = false
}: {
  data: Array<{ label: string; value: number }>;
  valueFormatter: (value: number) => string;
  color: string;
  expanded?: boolean;
}) => {
  if (data.length === 0) return null;

  const width = expanded ? 940 : 760;
  const height = expanded ? 360 : 280;
  const margin = { top: 20, right: 24, bottom: 66, left: 74 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = data.map((item) => item.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const spread = maxValue - minValue;
  const valuePad = spread > 0 ? spread * 0.12 : Math.max(1, Math.abs(maxValue) * 0.12, 0.01);
  const yMin = minValue - valuePad;
  const yMax = maxValue + valuePad;
  const yRange = Math.max(0.000001, yMax - yMin);
  const xStep = data.length > 1 ? plotWidth / (data.length - 1) : 0;
  const gradientId = `premium-area-${color.replace('#', '')}-${data.length}`;

  const getX = (idx: number) => margin.left + idx * xStep;
  const getY = (value: number) => margin.top + (1 - (value - yMin) / yRange) * plotHeight;

  const points = data.map((item, idx) => ({ x: getX(idx), y: getY(item.value), ...item }));
  const linePath = points.map((point, idx) => `${idx === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${margin.left + plotWidth} ${margin.top + plotHeight} L ${margin.left} ${margin.top + plotHeight} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + (yMax - yMin) * t);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.30} />
          <stop offset="100%" stopColor={color} stopOpacity={0.04} />
        </linearGradient>
      </defs>

      {yTicks.map((tick, idx) => {
        const y = getY(tick);
        return (
          <g key={`y-tick-${idx}`}>
            <line x1={margin.left} y1={y} x2={margin.left + plotWidth} y2={y} stroke="#e7e3da" strokeDasharray="4 6" />
            <text x={margin.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill={palette.muted}>
              {valueFormatter(tick)}
            </text>
          </g>
        );
      })}

      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

      {points.map((point) => (
        <g key={`point-${point.label}`}>
          <circle cx={point.x} cy={point.y} r="4" fill={color} />
          <text x={point.x} y={point.y - 10} textAnchor="middle" fontSize="10.5" fill="#22313e" fontWeight="700">
            {valueFormatter(point.value)}
          </text>
          <text x={point.x} y={margin.top + plotHeight + 20} textAnchor="middle" fontSize="10.5" fill={palette.muted}>
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  );
};

const PremiumTwrBarChart = ({
  data,
  valueFormatter,
  expanded = false
}: {
  data: Array<{ label: string; value: number }>;
  valueFormatter: (value: number) => string;
  expanded?: boolean;
}) => {
  if (data.length === 0) return null;

  const width = expanded ? 940 : 760;
  const height = expanded ? 380 : 300;
  const margin = { top: 20, right: 24, bottom: 68, left: 74 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxAbsRaw = Math.max(...data.map((item) => Math.abs(item.value)));
  const maxAbs = Math.max(0.01, maxAbsRaw * 1.15);
  const yMin = -maxAbs;
  const yMax = maxAbs;
  const yRange = yMax - yMin;
  const xStep = plotWidth / Math.max(1, data.length);
  const barWidth = Math.min(34, Math.max(14, xStep * 0.52));
  const getY = (value: number) => margin.top + (1 - (value - yMin) / yRange) * plotHeight;
  const zeroY = getY(0);
  const yTicks = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {yTicks.map((tick, idx) => {
        const y = getY(tick);
        return (
          <g key={`twr-y-${idx}`}>
            <line
              x1={margin.left}
              y1={y}
              x2={margin.left + plotWidth}
              y2={y}
              stroke={tick === 0 ? '#a9a298' : '#e9e5dd'}
              strokeDasharray={tick === 0 ? '0' : '4 6'}
            />
            <text x={margin.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill={palette.muted}>
              {valueFormatter(tick)}
            </text>
          </g>
        );
      })}

      {data.map((item, idx) => {
        const centerX = margin.left + xStep * idx + xStep / 2;
        const barTop = getY(Math.max(0, item.value));
        const barBottom = getY(Math.min(0, item.value));
        const barHeight = Math.max(2, Math.abs(barBottom - barTop));
        const isPositive = item.value >= 0;
        const barColor = isPositive ? '#0f8d52' : '#b42318';
        const labelY = isPositive ? barTop - 8 : barBottom + 14;

        return (
          <g key={`twr-bar-${item.label}`}>
            <rect
              x={centerX - barWidth / 2}
              y={Math.min(barTop, barBottom)}
              width={barWidth}
              height={barHeight}
              rx="7"
              fill={barColor}
              opacity="0.92"
            />
            <text x={centerX} y={labelY} textAnchor="middle" fontSize="10.5" fill="#22313e" fontWeight="700">
              {valueFormatter(item.value)}
            </text>
            <text x={centerX} y={margin.top + plotHeight + 20} textAnchor="middle" fontSize="10.5" fill={palette.muted}>
              {item.label}
            </text>
          </g>
        );
      })}

      <line x1={margin.left} y1={zeroY} x2={margin.left + plotWidth} y2={zeroY} stroke="#a9a298" strokeWidth="1.4" />
    </svg>
  );
};

const LoginCard = ({ onLogin, busy, error }: { onLogin: (email: string, password: string) => Promise<void>; busy: boolean; error: string | null }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const currentYear = new Date().getFullYear();

  return (
    <main className="pmLoginRoot">
      <style>{`
        .pmLoginRoot {
          min-height: 100vh;
          padding: clamp(16px, 2vw, 28px);
          color: #1f1d1b;
          background:
            radial-gradient(1200px 700px at 6% 8%, rgba(15, 109, 122, 0.16), transparent 58%),
            radial-gradient(900px 620px at 94% 10%, rgba(240, 195, 104, 0.26), transparent 54%),
            radial-gradient(940px 620px at 50% 100%, rgba(86, 173, 196, 0.12), transparent 62%),
            linear-gradient(180deg, #f5f9ff 0%, #f6efe3 100%);
        }
        .pmLoginWrap {
          max-width: 1260px;
          margin: 0 auto;
        }
        .pmShell {
          position: relative;
          overflow: hidden;
          border-radius: 32px;
          border: 1px solid rgba(36, 43, 54, 0.16);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(252, 248, 241, 0.88));
          box-shadow:
            0 34px 70px rgba(22, 27, 39, 0.16),
            inset 0 1px 0 rgba(255, 255, 255, 0.85);
          display: grid;
          grid-template-columns: 1.18fr 0.82fr;
          min-height: 680px;
        }
        .pmShell::before {
          content: "";
          position: absolute;
          inset: -35% -18%;
          pointer-events: none;
          background:
            radial-gradient(680px 260px at 16% 16%, rgba(250, 196, 94, 0.26), transparent 64%),
            radial-gradient(760px 340px at 76% 18%, rgba(66, 166, 191, 0.2), transparent 66%),
            radial-gradient(500px 260px at 54% 84%, rgba(76, 146, 187, 0.14), transparent 70%);
          filter: blur(10px);
        }
        .pmShell > * {
          position: relative;
          z-index: 1;
        }
        .pmBrand {
          padding: clamp(24px, 3vw, 40px);
          border-right: 1px solid rgba(36, 43, 54, 0.12);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 22px;
        }
        .pmLogo {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .pmMark {
          width: 52px;
          height: 52px;
          border-radius: 16px;
          display: grid;
          place-items: center;
          background: linear-gradient(145deg, #f2c45f, #56b4cb);
          box-shadow: 0 16px 34px rgba(50, 122, 153, 0.24);
        }
        .pmTitle {
          margin: 0;
          font-size: clamp(34px, 4vw, 56px);
          line-height: 1.02;
          letter-spacing: -0.03em;
          color: #111a27;
          max-width: 15ch;
        }
        .pmCopy {
          margin: 0;
          color: #465362;
          line-height: 1.7;
          max-width: 60ch;
          font-size: 15px;
        }
        .pmPills {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .pmPill {
          border: 1px solid rgba(36, 43, 54, 0.14);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.86);
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 700;
          color: #233247;
          display: flex;
          align-items: center;
          gap: 9px;
        }
        .pmPill i {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #0f8d52;
          box-shadow: 0 0 0 4px rgba(15, 141, 82, 0.16);
          display: inline-block;
        }
        .pmBand {
          border-radius: 16px;
          border: 1px solid rgba(36, 43, 54, 0.14);
          background: linear-gradient(90deg, rgba(15, 109, 122, 0.12), rgba(82, 169, 194, 0.06));
          padding: 12px 14px;
          font-size: 12px;
          font-weight: 700;
          color: #2f4b63;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .pmLegal {
          color: #6a7178;
          font-size: 12px;
          margin-top: 2px;
        }
        .pmCard {
          padding: clamp(22px, 2.4vw, 36px);
          display: flex;
          flex-direction: column;
          justify-content: center;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(247, 250, 255, 0.58));
        }
        .pmCardHead {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin-bottom: 18px;
        }
        .pmCardTitle {
          margin: 0;
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #6a737d;
          font-weight: 800;
        }
        .pmStatus {
          border: 1px solid rgba(36, 43, 54, 0.12);
          border-radius: 999px;
          padding: 8px 11px;
          font-size: 12px;
          color: #4a5a67;
          background: #ffffff;
          display: flex;
          align-items: center;
          gap: 7px;
          font-weight: 700;
        }
        .pmStatus i {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #0f8d52;
          box-shadow: 0 0 0 4px rgba(15, 141, 82, 0.14);
          display: inline-block;
        }
        .pmField {
          margin-bottom: 13px;
        }
        .pmLabel {
          display: block;
          margin-bottom: 7px;
          color: #5b6874;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.13em;
          text-transform: uppercase;
        }
        .pmControl {
          position: relative;
        }
        .pmInput {
          width: 100%;
          border: 1px solid rgba(36, 43, 54, 0.18);
          border-radius: 15px;
          background: #ffffff;
          color: #1f1d1b;
          padding: 13px 44px 13px 13px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
        }
        .pmInput:focus {
          border-color: #0f6d7a;
          box-shadow: 0 0 0 4px rgba(15, 109, 122, 0.14);
          transform: translateY(-1px);
        }
        .pmIconBtn {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          width: 31px;
          height: 31px;
          border-radius: 10px;
          border: 1px solid rgba(36, 43, 54, 0.14);
          background: #f8fbff;
          color: #4f5a64;
          cursor: pointer;
          font-size: 12px;
          font-weight: 700;
        }
        .pmSubmit {
          margin-top: 14px;
          width: 100%;
          border: 0;
          border-radius: 15px;
          padding: 14px;
          background: linear-gradient(135deg, #0f6d7a, #4aa8c2);
          color: #ffffff;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: 0 20px 36px rgba(15, 109, 122, 0.28);
          transition: transform 0.14s ease, opacity 0.14s ease, box-shadow 0.18s ease;
        }
        .pmSubmit:disabled {
          cursor: not-allowed;
          opacity: 0.66;
          transform: none;
          box-shadow: none;
        }
        .pmSubmit:not(:disabled):hover {
          box-shadow: 0 22px 42px rgba(15, 109, 122, 0.34);
        }
        .pmSubmit:not(:disabled):active {
          transform: translateY(1px);
        }
        .pmError {
          margin-top: 12px;
          border-radius: 12px;
          border: 1px solid rgba(180, 35, 24, 0.34);
          background: rgba(180, 35, 24, 0.09);
          color: #9e2017;
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 650;
        }
        @media (max-width: 1100px) {
          .pmShell {
            grid-template-columns: 1fr;
            min-height: auto;
          }
          .pmBrand {
            border-right: 0;
            border-bottom: 1px solid rgba(36, 43, 54, 0.12);
          }
          .pmTitle {
            max-width: none;
          }
        }
        @media (max-width: 720px) {
          .pmPills {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="pmLoginWrap">
        <section className="pmShell">
          <div className="pmBrand" aria-label="Panel de marca">
            <div>
              <div className="pmLogo">
                <div className="pmMark" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2l8.5 5v10L12 22 3.5 17V7L12 2Z" stroke="rgba(255,255,255,.95)" strokeWidth="1.6" />
                    <path d="M7.2 14.1 12 16.9l4.8-2.8" stroke="rgba(255,255,255,.92)" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M12 6.5v10.4" stroke="rgba(255,255,255,.86)" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <strong style={{ display: 'block', color: '#1d2938', fontSize: 20, letterSpacing: '-.01em' }}>Portfolio Manager</strong>
                  <span style={{ fontSize: 12, color: '#62707d', letterSpacing: '.14em', textTransform: 'uppercase' }}>
                    Client and Admin Access
                  </span>
                </div>
              </div>

              <h1 className="pmTitle">Acceso seguro para revisar cartera, KPIs y reportes en segundos.</h1>
              <p className="pmCopy">
                Entra con tu cuenta para ver tus datos. Los clientes solo pueden leer su informacion.
                El administrador mantiene el control total de la gestion y las publicaciones.
              </p>

              <div className="pmPills" aria-label="Caracteristicas">
                <div className="pmPill"><i /> Lectura segura de datos</div>
                <div className="pmPill"><i /> Perfil cliente de solo lectura</div>
                <div className="pmPill"><i /> Exportacion PDF desde panel</div>
                <div className="pmPill"><i /> Historial con trazabilidad</div>
              </div>
            </div>

            <div>
              <div className="pmBand">Secure Session Mode</div>
              <div className="pmLegal">(c) {currentYear} Portfolio Manager</div>
            </div>
          </div>

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
                    placeholder="************"
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
  const [kpiHint, setKpiHint] = useState<{ text: string; x: number; y: number } | null>(null);
  const [flowPopup, setFlowPopup] = useState<'inc' | 'dec' | 'profit' | null>(null);
  const [expandedBalanceChart, setExpandedBalanceChart] = useState(false);
  const [expandedTwrChart, setExpandedTwrChart] = useState(false);

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
        month: item.month,
        label: formatMonthLabel(item.month),
        value: monthEndBalance.get(item.month) ?? 0
      })),
    [monthEndBalance, monthly]
  );
  const twrSeries = useMemo(
    () =>
      monthly.map((item) => ({
        month: item.month,
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
  const profitDetailRows = useMemo(
    () =>
      monthly
        .map((item) => ({ month: item.month, profit: item.profit }))
        .slice()
        .reverse(),
    [monthly]
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
      doc.text(`Portfolio - ${headerName}`, 40, 44);
      doc.setFontSize(10);
      doc.text(`Cliente: ${headerName}`, 40, 62);
      doc.text(`ID interno: ${clientId}`, 40, 76);
      if (email) {
        doc.text(`Email: ${email}`, 40, 90);
      }
      doc.text(`Emitido: ${now.toLocaleString('es-ES')}`, 40, 104);

      autoTable(doc, {
        startY: 118,
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
        body: movementRows.map((row) => [
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
              onMouseEnter={(event) => {
                showKpiHint(event, 'Lo ganado o perdido en el ultimo mes con datos.');
                setFlowPopup('profit');
              }}
              onMouseMove={moveKpiHint}
              onMouseLeave={() => {
                setKpiHint(null);
                setFlowPopup((prev) => (prev === 'profit' ? null : prev));
              }}
              style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card, position: 'relative' }}
            >
              <p style={{ margin: 0, color: palette.muted }}>Beneficio mensual</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatEuro(latestProfitMonth?.profit ?? 0)}</h3>
              <p style={{ marginTop: 6, color: palette.muted, fontSize: 12 }}>
                {latestProfitMonth ? formatMonthLabel(latestProfitMonth.month) : '-'}
              </p>
              {flowPopup === 'profit' ? (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 8, zIndex: 70, width: 340, maxHeight: 260, overflow: 'auto', background: '#fff', border: `1px solid ${palette.border}`, borderRadius: 12, boxShadow: '0 18px 34px rgba(0,0,0,0.14)', padding: 10 }}>
                  <strong style={{ fontSize: 12 }}>Detalle beneficio mensual</strong>
                  <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                    {profitDetailRows.length === 0 ? (
                      <span style={{ color: palette.muted, fontSize: 12 }}>Sin meses con datos.</span>
                    ) : (
                      profitDetailRows.map((row) => (
                        <div key={`profit-${row.month}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, fontSize: 12 }}>
                          <span>{formatMonthLabel(row.month)}</span>
                          <strong style={{ color: row.profit >= 0 ? '#0f8d52' : '#b42318' }}>{formatEuro(row.profit)}</strong>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
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

          <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', marginBottom: 16 }}>
            <article
              style={{
                borderRadius: 14,
                border: `1px solid ${palette.border}`,
                background: 'linear-gradient(180deg, #ffffff 0%, #f5fbfd 100%)',
                padding: 14,
                boxShadow: '0 12px 26px rgba(15, 109, 122, 0.10)',
                gridColumn: expandedBalanceChart ? '1 / -1' : undefined
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                <div>
                  <p style={{ margin: 0, color: palette.muted }}>Grafico de saldo mensual</p>
                  <h4 style={{ margin: '6px 0 0', color: palette.text }}>Evolucion de balance</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedBalanceChart((prev) => !prev)}
                  style={{
                    border: `1px solid ${palette.border}`,
                    background: '#ffffff',
                    color: palette.text,
                    borderRadius: 10,
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {expandedBalanceChart ? 'Minimizar' : 'Expandir'}
                </button>
              </div>
              {balanceSeries.length === 0 ? (
                <p style={{ margin: 0, color: palette.muted }}>Aun no hay datos de saldo mensual.</p>
              ) : (
                <PremiumAreaChart data={balanceSeries} valueFormatter={formatEuro} color="#0f6d7a" expanded={expandedBalanceChart} />
              )}
              {expandedBalanceChart && balanceSeries.length > 0 ? (
                <div style={{ marginTop: 10, border: `1px solid ${palette.border}`, borderRadius: 10, background: '#ffffff', maxHeight: 280, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: 10, color: palette.muted, fontSize: 12 }}>Mes</th>
                        <th style={{ textAlign: 'right', padding: 10, color: palette.muted, fontSize: 12 }}>Saldo cierre</th>
                      </tr>
                    </thead>
                    <tbody>
                      {balanceSeries.map((row) => (
                        <tr key={`balance-expand-${row.month}`}>
                          <td style={{ padding: 10, borderTop: `1px solid ${palette.border}`, fontSize: 13 }}>{row.label}</td>
                          <td style={{ padding: 10, borderTop: `1px solid ${palette.border}`, textAlign: 'right', fontSize: 13 }}>{formatEuro(row.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                background: 'linear-gradient(180deg, #ffffff 0%, #fff7f5 100%)',
                padding: 14,
                boxShadow: '0 12px 26px rgba(180, 35, 24, 0.08)',
                gridColumn: expandedTwrChart ? '1 / -1' : undefined
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                <div>
                  <p style={{ margin: 0, color: palette.muted }}>Grafico TWR mensual</p>
                  <h4 style={{ margin: '6px 0 0', color: palette.text }}>Rendimiento mensual sin flujos</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedTwrChart((prev) => !prev)}
                  style={{
                    border: `1px solid ${palette.border}`,
                    background: '#ffffff',
                    color: palette.text,
                    borderRadius: 10,
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {expandedTwrChart ? 'Minimizar' : 'Expandir'}
                </button>
              </div>
              {twrSeries.length === 0 ? (
                <p style={{ margin: 0, color: palette.muted }}>Aun no hay datos de TWR mensual.</p>
              ) : (
                <PremiumTwrBarChart data={twrSeries} valueFormatter={formatPct} expanded={expandedTwrChart} />
              )}
              {expandedTwrChart && twrSeries.length > 0 ? (
                <div style={{ marginTop: 10, border: `1px solid ${palette.border}`, borderRadius: 10, background: '#ffffff', maxHeight: 280, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: 10, color: palette.muted, fontSize: 12 }}>Mes</th>
                        <th style={{ textAlign: 'right', padding: 10, color: palette.muted, fontSize: 12 }}>TWR mensual</th>
                        <th style={{ textAlign: 'right', padding: 10, color: palette.muted, fontSize: 12 }}>TWR acumulado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {twrSeries.map((row) => (
                        <tr key={`twr-expand-${row.month}`}>
                          <td style={{ padding: 10, borderTop: `1px solid ${palette.border}`, fontSize: 13 }}>{row.label}</td>
                          <td style={{ padding: 10, borderTop: `1px solid ${palette.border}`, textAlign: 'right', fontSize: 13, color: row.value >= 0 ? '#0f8d52' : '#b42318' }}>
                            {formatPct(row.value)}
                          </td>
                          <td style={{ padding: 10, borderTop: `1px solid ${palette.border}`, textAlign: 'right', fontSize: 13 }}>
                            {formatPct(twrCumulativeByMonth.get(row.month) ?? 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
    void auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((error) => {
      console.error('No se pudo fijar persistencia LOCAL en auth', error);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        usePortfolioStore.setState({ canWrite: false, initialized: false });
        setSession({ loading: false, role: null, clientId: null, email: null, displayName: null, error: null });
        return;
      }

      setSession((prev) => (prev.role ? { ...prev, error: null } : { ...prev, loading: true, error: null }));

      try {
        const email = normalizeEmail(user.email ?? '');
        let profile: Awaited<ReturnType<typeof fetchAccessProfile>> = null;
        const adminByEmail = ADMIN_EMAILS.has(email);

        if (!adminByEmail) {
          profile = await fetchAccessProfile(user.uid);
        }

        const adminByProfile = profile?.role === 'admin' && profile.active !== false;
        const isAdmin = adminByEmail || adminByProfile;

        if (isAdmin) {
          usePortfolioStore.getState().setWriteAccess(true);
          await initializePortfolioStore();
          setSession({ loading: false, role: 'admin', clientId: null, email: user.email, displayName: user.displayName ?? null, error: null });
          // Sync in background to avoid blocking admin login UX.
          void syncClientOverviews(usePortfolioStore.getState().snapshot, CLIENTS).catch((syncError) => {
            console.error('Background admin sync failed', syncError);
          });
          return;
        }

        if (!profile) {
          profile = await fetchAccessProfile(user.uid);
        }
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
        setSession((prev) =>
          prev.role
            ? { ...prev, loading: false, error: 'Conexion inestable. Intentando recuperar sesion...' }
            : {
                loading: false,
                role: null,
                clientId: null,
                email: null,
                displayName: null,
                error: 'Error validando tu sesion.'
              }
        );
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
      await auth.signInWithEmailAndPassword(normalizeEmail(email), password);
    } catch (error) {
      let message = 'No se pudo iniciar sesion';
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : '';
      if (code === 'auth/invalid-credential') message = 'Email o contrasena incorrectos.';
      if (code === 'auth/user-not-found') message = 'No existe ese usuario.';
      if (code === 'auth/wrong-password') message = 'Contrasena incorrecta.';
      if (code === 'auth/too-many-requests') message = 'Demasiados intentos. Espera un momento e intentalo otra vez.';
      setSession((prev) => ({ ...prev, loading: false, error: message }));
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
  };

  if (session.loading) {
    return (
      <main className="pmLoadingRoot">
        <style>{`
          .pmLoadingRoot {
            min-height: 100vh;
            display: grid;
            place-items: center;
            color: ${palette.text};
            background:
              radial-gradient(920px 520px at 8% 10%, rgba(15,109,122,.16), transparent 58%),
              radial-gradient(900px 520px at 92% 8%, rgba(240,195,104,.24), transparent 56%),
              linear-gradient(180deg, #f6faff 0%, #f3efe7 100%);
            padding: 16px;
          }
          .pmLoadingCard {
            width: min(460px, 96vw);
            border-radius: 24px;
            border: 1px solid rgba(36, 43, 54, 0.16);
            background: linear-gradient(180deg, rgba(255,255,255,.92), rgba(252,248,241,.86));
            box-shadow: 0 30px 60px rgba(22, 27, 39, 0.16);
            padding: 26px 22px;
            display: grid;
            gap: 14px;
            justify-items: center;
            text-align: center;
          }
          .pmLoadingOrb {
            width: 64px;
            height: 64px;
            border-radius: 999px;
            background: conic-gradient(from 0deg, #0f6d7a, #52a9c2, #f2c45f, #0f6d7a);
            display: grid;
            place-items: center;
            animation: pmSpin 1.4s linear infinite;
            box-shadow: 0 18px 30px rgba(15,109,122,.26);
          }
          .pmLoadingOrb::after {
            content: "";
            width: 44px;
            height: 44px;
            border-radius: 999px;
            background: rgba(255,255,255,.96);
            border: 1px solid rgba(36,43,54,.1);
          }
          .pmLoadingBars {
            width: 100%;
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
          }
          .pmLoadingBar {
            height: 8px;
            border-radius: 999px;
            background: linear-gradient(90deg, rgba(15,109,122,.2), rgba(15,109,122,.56));
            transform-origin: left;
            animation: pmPulse 1.2s ease-in-out infinite;
          }
          .pmLoadingBar:nth-child(2) { animation-delay: .15s; }
          .pmLoadingBar:nth-child(3) { animation-delay: .3s; }
          @keyframes pmSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes pmPulse {
            0%, 100% { transform: scaleX(.35); opacity: .5; }
            50% { transform: scaleX(1); opacity: 1; }
          }
        `}</style>
        <div className="pmLoadingCard">
          <div className="pmLoadingOrb" />
          <strong style={{ fontSize: 20 }}>Cargando sesion{loadingDots}</strong>
          <span style={{ color: palette.muted, fontSize: 13 }}>Estamos validando tu acceso y preparando tu panel</span>
          <div className="pmLoadingBars">
            <div className="pmLoadingBar" />
            <div className="pmLoadingBar" />
            <div className="pmLoadingBar" />
          </div>
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
