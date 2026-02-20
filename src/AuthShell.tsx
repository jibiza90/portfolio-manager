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
const currentMonthIsoLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const Sparkline = ({ values, color = '#0f6d7a' }: { values: number[]; color?: string }) => {
  const width = 360;
  const height = 110;
  const pad = 10;
  const safeValues = values.length > 0 ? values : [0];
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const range = Math.max(1, max - min);
  const points = safeValues.map((value, idx) => {
    const x = pad + (idx / Math.max(1, safeValues.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 120, display: 'block' }}>
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
  const latestProfitMonth = overview?.latestProfitMonth ?? null;
  const latestReturnMonth = overview?.latestReturnMonth ?? null;
  const monthly = overview?.monthly ?? [];
  const twrMonthly = overview?.twrMonthly ?? [];
  const twrYtd = overview?.twrYtd ?? overview?.ytdReturnPct ?? 0;
  const currentMonthIso = currentMonthIsoLocal();
  const monthEndBalance = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of overview?.rows ?? []) {
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
            item.month === currentMonthIso ? 'En curso' : 'Cerrado',
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
            <article style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}>
              <p style={{ margin: 0, color: palette.muted }}>Saldo actual</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatEuro(overview.currentBalance)}</h3>
            </article>
            <article style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}>
              <p style={{ margin: 0, color: palette.muted }}>Beneficio total</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatEuro(overview.cumulativeProfit)}</h3>
            </article>
            <article style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}>
              <p style={{ margin: 0, color: palette.muted }}>Beneficio dia</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatEuro(overview.dailyProfit ?? 0)}</h3>
            </article>
            <article style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}>
              <p style={{ margin: 0, color: palette.muted }}>% dia</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatPct(overview.dailyProfitPct ?? 0)}</h3>
            </article>
            <article style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}>
              <p style={{ margin: 0, color: palette.muted }}>Participacion</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatPct(overview.participation ?? 0)}</h3>
            </article>
            <article style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}>
              <p style={{ margin: 0, color: palette.muted }}>Incrementos totales</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatEuro(overview.totalIncrements ?? 0)}</h3>
            </article>
            <article style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}>
              <p style={{ margin: 0, color: palette.muted }}>Decrementos totales</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatEuro(overview.totalDecrements ?? 0)}</h3>
            </article>
            <article style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}>
              <p style={{ margin: 0, color: palette.muted }}>Beneficio mensual</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatEuro(latestProfitMonth?.profit ?? 0)}</h3>
              <p style={{ marginTop: 6, color: palette.muted, fontSize: 12 }}>
                {latestProfitMonth ? formatMonthLabel(latestProfitMonth.month) : '-'}
              </p>
            </article>
            <article style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}>
              <p style={{ margin: 0, color: palette.muted }}>Rentabilidad mensual</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatPct(latestReturnMonth?.retPct ?? 0)}</h3>
              <p style={{ marginTop: 6, color: palette.muted, fontSize: 12 }}>
                {latestReturnMonth ? formatMonthLabel(latestReturnMonth.month) : '-'}
              </p>
            </article>
            <article style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}>
              <p style={{ margin: 0, color: palette.muted }}>Rentabilidad TWR</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatPct(twrYtd)}</h3>
              <p style={{ marginTop: 6, color: palette.muted, fontSize: 12 }}>YTD</p>
            </article>
            <article style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}>
              <p style={{ margin: 0, color: palette.muted }}>Rentabilidad YTD</p>
              <h3 style={{ margin: '8px 0 0 0', color: palette.text }}>{formatPct(overview.ytdReturnPct ?? 0)}</h3>
            </article>
            <article style={{ padding: 14, borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card }}>
              <p style={{ margin: 0, color: palette.muted }}>Actualizado</p>
              <h3 style={{ margin: '8px 0 0 0', fontSize: 16, color: palette.text }}>{new Date(overview.updatedAt).toLocaleString('es-ES')}</h3>
            </article>
          </section>

          <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', marginBottom: 16 }}>
            <article style={{ borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card, padding: 14 }}>
              <p style={{ margin: 0, color: palette.muted }}>Grafico de saldo mensual</p>
              <h4 style={{ margin: '8px 0 6px', color: palette.text }}>Evolucion de balance</h4>
              <Sparkline values={balanceSeries.map((row) => row.value)} color="#0f6d7a" />
            </article>
            <article style={{ borderRadius: 12, border: `1px solid ${palette.border}`, background: palette.card, padding: 14 }}>
              <p style={{ margin: 0, color: palette.muted }}>Grafico de rentabilidad mensual</p>
              <h4 style={{ margin: '8px 0 10px', color: palette.text }}>Tendencia por mes</h4>
              <HorizontalBars data={returnSeries} />
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
                            {month.month === currentMonthIso ? 'En curso' : 'Cerrado'}
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
              <strong>Movimientos del cliente</strong>
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
                  {overview.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 12, color: palette.muted }}>Sin movimientos recientes.</td>
                    </tr>
                  ) : (
                    overview.rows
                      .slice()
                      .reverse()
                      .map((row) => (
                        <tr key={row.iso}>
                          <td style={{ padding: 12, borderTop: `1px solid ${palette.border}` }}>{new Date(row.iso).toLocaleDateString('es-ES')}</td>
                          <td style={{ padding: 12, textAlign: 'right', borderTop: `1px solid ${palette.border}` }}>{row.increment ? formatEuro(row.increment) : '-'}</td>
                          <td style={{ padding: 12, textAlign: 'right', borderTop: `1px solid ${palette.border}` }}>{row.decrement ? formatEuro(row.decrement) : '-'}</td>
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
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: palette.text }}>
        Cargando sesion...
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
