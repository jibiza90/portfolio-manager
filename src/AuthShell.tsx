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

const LoginCard = ({ onLogin, busy, error }: { onLogin: (email: string, password: string) => Promise<void>; busy: boolean; error: string | null }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        background: `radial-gradient(circle at top left, rgba(15,109,122,0.14), transparent 45%), ${palette.bg}`,
        color: palette.text
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 430,
          border: `1px solid ${palette.border}`,
          borderRadius: 16,
          padding: 22,
          background: palette.card,
          boxShadow: '0 20px 45px rgba(20, 24, 31, 0.12)'
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 8, color: palette.text }}>Portfolio Manager</h1>
        <p style={{ marginTop: 0, marginBottom: 14, color: palette.muted }}>
          Accede con tu cuenta para ver tus datos.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={{
              padding: 11,
              borderRadius: 10,
              border: `1px solid ${palette.border}`,
              background: '#ffffff',
              color: palette.text
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={{
              padding: 11,
              borderRadius: 10,
              border: `1px solid ${palette.border}`,
              background: '#ffffff',
              color: palette.text
            }}
          />
          <button
            type="button"
            onClick={() => {
              void onLogin(email, password);
            }}
            disabled={busy || !email.trim() || !password}
            style={{
              padding: 11,
              borderRadius: 10,
              border: 0,
              fontWeight: 600,
              background: palette.accent,
              color: palette.accentText,
              cursor: 'pointer',
              opacity: busy ? 0.75 : 1
            }}
          >
            {busy ? 'Entrando...' : 'Entrar'}
          </button>
          {error ? <p style={{ margin: 0, color: palette.error, fontWeight: 600 }}>{error}</p> : null}
        </div>
      </section>
    </main>
  );
};

const ClientPortal = ({ clientId, email, onLogout }: { clientId: string; email: string | null; onLogout: () => Promise<void> }) => {
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
  const latestReturnMonth = useMemo(
    () => [...monthly].reverse().find((item) => item.retPct !== 0) ?? monthly[monthly.length - 1] ?? null,
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
  const returnSeries = useMemo(
    () =>
      monthly.map((item) => ({
        label: formatMonthLabel(item.month),
        value: item.retPct
      })),
    [monthly]
  );
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
          ['Rentabilidad TWR YTD', formatPct(twrYtd)],
          ['Rentabilidad YTD', formatPct(overview.ytdReturnPct ?? 0)]
        ],
        styles: { fontSize: 9 }
      });

      autoTable(doc, {
        startY: (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
          ? ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16)
          : 260,
        head: [['Mes', 'Estado', 'Beneficio', 'Rentabilidad', 'TWR mensual']],
        body: monthly.map((item) => {
          const twr = twrMonthly.find((row) => row.month === item.month)?.twr ?? 0;
          return [
            formatMonthLabel(item.month),
            item.month === activeMonthIso ? 'En curso' : 'Cerrado',
            formatEuro(item.profit),
            formatPct(item.retPct),
            formatPct(twr)
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
            {clientName} - {clientId}
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
              onMouseEnter={(event) => showKpiHint(event, 'Porcentaje de ganancia del mes frente al dinero base de ese mismo mes.')}
              onMouseMove={moveKpiHint}
              onMouseLeave={() => setKpiHint(null)}
              style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}
            >
              <p style={{ margin: 0, color: palette.muted }}>Rentabilidad mensual</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatPct(latestReturnMonth?.retPct ?? 0)}</h3>
              <p style={{ marginTop: 6, color: palette.muted, fontSize: 12 }}>
                {latestReturnMonth ? formatMonthLabel(latestReturnMonth.month) : '-'}
              </p>
            </article>
            <article
              onMouseEnter={(event) => showKpiHint(event, 'TWR mide el rendimiento real evitando que entradas y salidas distorsionen el resultado.')}
              onMouseMove={moveKpiHint}
              onMouseLeave={() => setKpiHint(null)}
              style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}
            >
              <p style={{ margin: 0, color: palette.muted }}>Rentabilidad TWR</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatPct(twrYtd)}</h3>
              <p style={{ marginTop: 6, color: palette.muted, fontSize: 12 }}>YTD</p>
            </article>
            <article
              onMouseEnter={(event) => showKpiHint(event, 'YTD es la rentabilidad acumulada del ano usando el resultado final respecto al capital base.')}
              onMouseMove={moveKpiHint}
              onMouseLeave={() => setKpiHint(null)}
              style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}
            >
              <p style={{ margin: 0, color: palette.muted }}>Rentabilidad YTD</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatPct(overview.ytdReturnPct ?? 0)}</h3>
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
            <strong style={{ display: 'block', marginBottom: 10 }}>Diferencia entre rentabilidad TWR y YTD</strong>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
              <article style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: 10, background: '#f8fbfd' }}>
                <strong style={{ display: 'block', marginBottom: 6 }}>TWR</strong>
                <p style={{ margin: 0, color: palette.muted, fontSize: 13 }}>
                  Mide el rendimiento real de tu estrategia y evita que entradas o salidas de dinero distorsionen el dato.
                </p>
              </article>
              <article style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: 10, background: '#fbf8f2' }}>
                <strong style={{ display: 'block', marginBottom: 6 }}>YTD</strong>
                <p style={{ margin: 0, color: palette.muted, fontSize: 13 }}>
                  Es la rentabilidad acumulada del ano sobre el capital base. Sirve para ver el resultado anual total.
                </p>
              </article>
            </div>
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
                  <p style={{ margin: 0, color: palette.muted }}>Grafico de rentabilidad mensual</p>
                  <h4 style={{ margin: '6px 0 0', color: palette.text }}>Tendencia por mes</h4>
                </div>
                <ChartTypeSelector value={returnChartType} onChange={setReturnChartType} />
              </div>
              {returnSeries.length === 0 ? (
                <p style={{ margin: 0, color: palette.muted }}>Aun no hay datos de rentabilidad mensual.</p>
              ) : returnChartType === 'line' ? (
                <Sparkline values={returnSeries.map((row) => row.value)} color="#4a2f8f" />
              ) : (
                <HorizontalBars data={returnSeries} />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: palette.muted }}>
                <span>Meses con datos: {returnSeries.length}</span>
                <span>{returnSeries.length ? `Ultimo: ${formatPct(returnSeries[returnSeries.length - 1].value)}` : ''}</span>
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
                    <th style={{ textAlign: 'right', padding: 12, color: palette.muted }}>Rentabilidad</th>
                    <th style={{ textAlign: 'right', padding: 12, color: palette.muted }}>TWR mensual</th>
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
                      return (
                        <tr key={month.month}>
                          <td style={{ padding: 12, borderTop: `1px solid ${palette.border}` }}>{formatMonthLabel(month.month)}</td>
                          <td style={{ padding: 12, borderTop: `1px solid ${palette.border}`, color: palette.muted }}>
                            {month.month === activeMonthIso ? 'En curso' : 'Cerrado'}
                          </td>
                          <td style={{ padding: 12, textAlign: 'right', borderTop: `1px solid ${palette.border}` }}>{formatEuro(month.profit)}</td>
                          <td style={{ padding: 12, textAlign: 'right', borderTop: `1px solid ${palette.border}` }}>{formatPct(month.retPct)}</td>
                          <td style={{ padding: 12, textAlign: 'right', borderTop: `1px solid ${palette.border}` }}>{formatPct(twrItem?.twr ?? 0)}</td>
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
    error: null
  });
  const [loginBusy, setLoginBusy] = useState(false);
  const [loadingDots, setLoadingDots] = useState('.');

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        usePortfolioStore.setState({ canWrite: false, initialized: false });
        setSession({ loading: false, role: null, clientId: null, email: null, error: null });
        return;
      }

      try {
        const email = (user.email ?? '').toLowerCase();
        const isAdmin = ADMIN_EMAILS.has(email);

        if (isAdmin) {
          usePortfolioStore.getState().setWriteAccess(true);
          await initializePortfolioStore();
          await syncClientOverviews(usePortfolioStore.getState().snapshot, CLIENTS);
          setSession({ loading: false, role: 'admin', clientId: null, email: user.email, error: null });
          return;
        }

        const profile = await fetchAccessProfile(user.uid);
        if (!profile || profile.active === false || profile.role !== 'client' || !profile.clientId) {
          await auth.signOut();
          setSession({ loading: false, role: null, clientId: null, email: null, error: 'Tu usuario no tiene perfil activo. Contacta con el administrador.' });
          return;
        }

        usePortfolioStore.getState().setWriteAccess(false);
        usePortfolioStore.getState().setInitialized(true);
        setSession({ loading: false, role: 'client', clientId: profile.clientId, email: user.email, error: null });
      } catch (error) {
        console.error(error);
        setSession({ loading: false, role: null, clientId: null, email: null, error: 'Error validando tu sesion.' });
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
    return <ClientPortal clientId={session.clientId} email={session.email} onLogout={handleLogout} />;
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
