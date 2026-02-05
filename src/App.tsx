import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { clsx } from 'clsx';
import { CLIENTS } from './constants/clients';
import { GENERAL_OPTION } from './constants/generalOption';
import { usePortfolioStore } from './store/portfolio';
import { formatCurrency, formatPercent, formatNumberEs, parseNumberEs } from './utils/format';
import { YEAR } from './utils/dates';
import { useFocusDate } from './hooks/useFocusDate';
import { InformesView } from './components/InformesView';
import { ReportView } from './components/ReportView';
import { calculateTWR, calculateAllMonthsTWR } from './utils/twr';

const INFO_VIEW = 'INFO_VIEW';
const COMISIONES_VIEW = 'COMISIONES_VIEW';
const INFORMES_VIEW = 'INFORMES_VIEW';
const STATS_VIEW = 'STATS_VIEW';
type ContactInfo = { name: string; surname: string; email: string; phone: string };

function EditableCell({ value, onChange, isPercent = false }: { value: number | undefined; onChange: (v: number | undefined) => void; isPercent?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { setText(isPercent ? formatPercent(value) : formatNumberEs(value)); setTimeout(() => ref.current?.select(), 10); } }, [editing, value]);
  const save = () => {
    const v = parseNumberEs(text);
    onChange(v);
    setEditing(false);
    window.dispatchEvent(new CustomEvent('show-toast', { detail: 'Guardado' }));
  };
  if (editing) return <input ref={ref} className="cell-input" value={text} onChange={(e) => setText(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') save(); else if (e.key === 'Escape') setEditing(false); }} />;
  return <span className="cell-content" onClick={() => setEditing(true)}>{isPercent ? formatPercent(value) : formatNumberEs(value)}</span>;
}

function StatsView({ contacts }: { contacts: Record<string, ContactInfo> }) {
  const { snapshot } = usePortfolioStore();
  const dailyRows = snapshot.dailyRows;
  const [twrHover, setTwrHover] = useState(false);
  const [twrExpanded, setTwrExpanded] = useState(false);

  const lastWithData = useMemo(() => [...dailyRows].reverse().find((r) => r.final !== undefined || r.profit !== undefined), [dailyRows]);
  const currentMonth = lastWithData?.iso?.slice(0, 7);

  // Calcular TWR general
  const twrData = useMemo(() => {
    const ytdResult = calculateTWR(dailyRows);
    const monthlyTWR = calculateAllMonthsTWR(dailyRows);
    return { ytd: ytdResult, monthly: monthlyTWR };
  }, [dailyRows]);

  const aggregates = useMemo(() => {
    const todayProfitPct = lastWithData?.profitPct ?? 0;
    const ytdProfit = snapshot.totals.ytdProfit ?? 0;
    const ytdReturnPct = snapshot.totals.ytdReturnPct ?? 0;

    let mtdProfit = 0;
    let mtdReturnBase = 0;
    let mtdReturn = 0;
    const lastMonthIso = currentMonth;

    const movementsToday = { inc: 0, dec: 0, countInc: 0, countDec: 0 };
    const movementsWeek = { inc: 0, dec: 0, countInc: 0, countDec: 0 };
    const todayIso = lastWithData?.iso;
    const todayIndex = todayIso ? dailyRows.findIndex((r) => r.iso === todayIso) : -1;

    dailyRows.forEach((r, idx) => {
      const month = r.iso.slice(0, 7);
      if (lastMonthIso && month === lastMonthIso && r.profit !== undefined) {
        mtdProfit += r.profit;
        const base = r.initial ?? 0;
        if (base !== 0) {
          mtdReturnBase += base;
          mtdReturn += r.profit;
        }
      }
      if (todayIndex !== -1 && idx >= todayIndex - 6 && idx <= todayIndex) {
        if (r.increments !== undefined && r.increments !== 0) {
          movementsWeek.inc += r.increments;
          movementsWeek.countInc += 1;
        }
        if (r.decrements !== undefined && r.decrements !== 0) {
          movementsWeek.dec += r.decrements;
          movementsWeek.countDec += 1;
        }
      }
    });

    if (todayIndex !== -1) {
      const r = dailyRows[todayIndex];
      if (r.increments !== undefined && r.increments !== 0) {
        movementsToday.inc = r.increments;
        movementsToday.countInc = 1;
      }
      if (r.decrements !== undefined && r.decrements !== 0) {
        movementsToday.dec = r.decrements;
        movementsToday.countDec = 1;
      }
    }

    const mtdReturnPct = mtdReturnBase !== 0 ? mtdReturn / mtdReturnBase : 0;

    // Alertas
    const clientsNoEmail = Object.entries(contacts).filter(([, c]) => !c.email).length;
    const missingClosures = dailyRows.filter((r) => r.final === undefined && r.iso <= (lastWithData?.iso ?? '')).length;
    const extremeReturns = dailyRows.filter((r) => r.profitPct !== undefined && Math.abs(r.profitPct) > 0.05).length;

    // Evolución patrimonio por mes (último final de cada mes)
    const byMonth = new Map<string, number>();
    dailyRows.forEach((r) => {
      if (r.final !== undefined) {
        const month = r.iso.slice(0, 7);
        byMonth.set(month, r.final);
      }
    });
    const evolution = Array.from(byMonth.entries()).sort(([a], [b]) => (a > b ? 1 : -1)).map(([month, balance]) => ({ month, balance }));

    return {
      todayProfitPct,
      mtdProfit,
      mtdReturnPct,
      ytdProfit,
      ytdReturnPct,
      movementsToday,
      movementsWeek,
      clientsNoEmail,
      missingClosures,
      extremeReturns,
      evolution
    };
  }, [dailyRows, lastWithData, currentMonth, contacts, snapshot.totals]);

  return (
    <div className="stats-view">
      <div className="analytics-grid two-row" style={{ marginBottom: 16 }}>
        <div className="stat-card glow">
          <div className="stat-label">Patrimonio total</div>
          <div className="stat-value">{formatCurrency(snapshot.totals.assets)}</div>
          <div className="stat-sub">YTD: {formatPercent(aggregates.ytdReturnPct)}</div>
        </div>
        <div className="stat-card glow">
          <div className="stat-label">Beneficio YTD</div>
          <div className={clsx('stat-value', aggregates.ytdProfit >= 0 ? 'positive' : 'negative')}>{formatCurrency(aggregates.ytdProfit)}</div>
          <div className="stat-sub">Retorno YTD: {formatPercent(aggregates.ytdReturnPct)}</div>
        </div>
        <div className="stat-card glow">
          <div className="stat-label">Rentabilidad diaria</div>
          <div className={clsx('stat-value', aggregates.todayProfitPct >= 0 ? 'positive' : 'negative')}>{formatPercent(aggregates.todayProfitPct)}</div>
          <div className="stat-sub">MTD: {formatPercent(aggregates.mtdReturnPct)}</div>
        </div>
        <div className="stat-card glow">
          <div className="stat-label">Beneficio MTD</div>
          <div className={clsx('stat-value', aggregates.mtdProfit >= 0 ? 'positive' : 'negative')}>{formatCurrency(aggregates.mtdProfit)}</div>
          <div className="stat-sub">Mes: {currentMonth || '—'}</div>
        </div>
      </div>

      <div className="analytics-grid two-row" style={{ marginBottom: 16 }}>
        <div className="stat-card glow">
          <div className="stat-label">Movimientos hoy</div>
          <div className="stat-sub">Incr: {formatCurrency(aggregates.movementsToday.inc)} · Decr: {formatCurrency(aggregates.movementsToday.dec)}</div>
        </div>
        <div className="stat-card glow">
          <div className="stat-label">Movimientos 7 días</div>
          <div className="stat-sub">Incr: {formatCurrency(aggregates.movementsWeek.inc)} · Decr: {formatCurrency(aggregates.movementsWeek.dec)}</div>
        </div>
        <div className="stat-card glow">
          <div className="stat-label">Alertas datos</div>
          <div className="stat-sub">Sin cierre: {aggregates.missingClosures}</div>
          <div className="stat-sub">Rentabilidad extrema: {aggregates.extremeReturns}</div>
        </div>
        <div
          className="stat-card glow clickable"
          style={{ position: 'relative', overflow: 'visible' }}
          onMouseEnter={() => setTwrHover(true)}
          onMouseLeave={() => setTwrHover(false)}
          onClick={() => setTwrExpanded(!twrExpanded)}
        >
          <div className="stat-label">Rentabilidad TWR</div>
          <div className={clsx('stat-value', twrData.ytd.twr >= 0 ? 'positive' : 'negative')}>
            {formatPercent(twrData.ytd.twr)}
          </div>
          <div className="stat-sub">YTD · Click para detalle</div>
          {twrHover && !twrExpanded && (
            <div className="mini-popup wide popup-center" onClick={(e) => e.stopPropagation()}>
              <div className="mini-popup-header">
                <strong>¿Qué es TWR?</strong>
                <button onClick={() => setTwrHover(false)}>×</button>
              </div>
              <div className="mini-popup-body" style={{ fontSize: 12, lineHeight: 1.5 }}>
                <p style={{ margin: '0 0 8px' }}>La <strong>rentabilidad TWR</strong> (Time-Weighted Return) mide el rendimiento real eliminando el efecto de aportes y retiros.</p>
                <p style={{ margin: 0 }}>Se calcula dividiendo el periodo en subperiodos entre cada flujo, calculando el retorno de cada uno y multiplicando los factores (1+r). Así puedes comparar rendimientos de forma justa.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {twrExpanded && (
        <div className="twr-detail glass-card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ margin: 0 }}>Detalle TWR por mes (General)</h4>
            <button className="ghost-btn" onClick={() => setTwrExpanded(false)}>Cerrar</button>
          </div>
          <div className="data-table compact">
            <div className="table-header">
              <div>Mes</div>
              <div>TWR</div>
              <div>Días con datos</div>
            </div>
            {twrData.monthly.length === 0 && <div className="table-row"><div>Sin datos</div></div>}
            {twrData.monthly.map((m) => (
              <div className="table-row" key={m.month}>
                <div>{monthLabel(m.month)}</div>
                <div className={clsx(m.twr >= 0 ? 'positive' : 'negative')}>{formatPercent(m.twr)}</div>
                <div>{m.periods.length}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 12, marginBottom: 0 }}>
            TWR elimina el efecto de aportes/retiros multiplicando los retornos de cada subperiodo: (1+r₁)×(1+r₂)×...−1
          </p>
        </div>
      )}

      <div className="chart-card">
        <div className="chart-card-header">
          <div>
            <p className="eyebrow">Evolución patrimonio</p>
            <h4>Saldo fin de mes</h4>
          </div>
        </div>
        <div className="data-table compact">
          <div className="table-header">
            <div>Mes</div>
            <div>Saldo</div>
          </div>
          {aggregates.evolution.map((e) => (
            <div key={e.month} className="table-row">
              <div>{monthLabel(e.month)}</div>
              <div>{formatCurrency(e.balance)}</div>
            </div>
          ))}
          {aggregates.evolution.length === 0 && <div className="table-row"><div>Sin datos</div></div>}
        </div>
      </div>
    </div>
  );
}

function ModernBarChart({
  data,
  height = 300,
  onHover,
  valueFormatter = formatCurrency
}: {
  data: { label: string; value: number }[];
  height?: number;
  onHover: (text: string, x: number, y: number) => void;
  valueFormatter?: (v?: number | null) => string;
}) {
  const hasNegative = data.some((d) => d.value < 0);
  const maxPos = Math.max(0, ...data.map((d) => d.value));
  const minNeg = Math.min(0, ...data.map((d) => d.value));
  const range = Math.max(1, maxPos - minNeg);
  const zeroOffset = hasNegative ? Math.min(90, Math.max(10, (maxPos / range) * 100)) : 100; // % from top where zero line is
  const barWidth = Math.min(60, Math.max(30, 600 / data.length));

  // Y-axis ticks
  const tickCount = 5;
  const ticks: number[] = [];
  for (let i = 0; i < tickCount; i++) {
    const val = maxPos - (i / (tickCount - 1)) * range;
    ticks.push(val);
  }

  return (
    <div className="modern-chart-container" style={{ height, padding: '32px 28px 52px 68px', position: 'relative' }}>
      {/* Y-axis */}
      <div className="modern-y-axis">
        {ticks.map((t, i) => (
          <div key={i} className="modern-y-tick">
            <span>{valueFormatter(t)}</span>
          </div>
        ))}
      </div>
      {/* Grid lines */}
      <div className="modern-grid">
        {ticks.map((t, i) => (
          <div key={i} className="modern-grid-line" style={{ top: `${(i / (tickCount - 1)) * 100}%` }} />
        ))}
      </div>
      {/* Zero line if negative values exist */}
      {hasNegative && (
        <div className="modern-zero-line" style={{ top: `${zeroOffset}%` }} />
      )}
      {/* Bars */}
      <div className="modern-bars" style={{ position: 'relative', height: '100%' }}>
        {data.map((d, i) => {
          const heightPct = Math.min(85, (Math.abs(d.value) / range) * 100); // cap to avoid overflow
          const isNeg = d.value < 0;
          const barStyle: React.CSSProperties = {
            width: barWidth,
            height: `${heightPct}%`,
            position: 'absolute',
            left: `${(i / data.length) * 100}%`,
            ...(isNeg
              ? { top: `${zeroOffset}%` }
              : { bottom: `${100 - zeroOffset}%` })
          };
          return (
            <div
              key={i}
              className={`modern-bar ${isNeg ? 'negative' : ''}`}
              style={barStyle}
              onMouseMove={(e) => onHover(`${d.label}: ${valueFormatter(d.value)}`, e.clientX, e.clientY - 12)}
              onMouseLeave={() => onHover('', 0, 0)}
            >
              <span className="modern-bar-label" style={{ position: 'absolute', bottom: isNeg ? 'auto' : '-20px', top: isNeg ? '-20px' : 'auto', left: '50%', transform: 'translateX(-50%)' }}>{d.label}</span>
            </div>
          );
        })}
      </div>
      {/* X-axis line */}
      <div className="modern-x-axis" style={{ top: hasNegative ? `${zeroOffset}%` : 'auto' }} />
    </div>
  );
}

function ModernLineChart({
  data,
  color = '#0ea5e9',
  height = 280,
  onHover,
  valueFormatter = formatCurrency
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  onHover: (text: string, x: number, y: number) => void;
  valueFormatter?: (v?: number | null) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) setContainerWidth(containerRef.current.offsetWidth);
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const values = data.map((d) => d.value);
  const minVal = Math.min(0, ...values);
  const rawMax = Math.max(0.0001, ...values);
  const maxVal = rawMax * 1.2; // headroom 20%
  const range = Math.max(0.0001, maxVal - minVal);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => minVal + t * range);

  const padLeft = 70;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 36;
  const chartW = containerWidth - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const points = data.map((d, i) => {
    const x = data.length > 1 ? padLeft + (i / (data.length - 1)) * chartW : padLeft + chartW / 2;
    const y = padTop + (1 - (d.value - minVal) / range) * chartH;
    return { label: d.label, value: d.value, x, y };
  });

  const buildSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    const path: string[] = [];
    const tension = 0.2;
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i - 1] || pts[0];
      const p1 = pts[i];
      const p2 = pts[i + 1] || pts[i];
      const p3 = pts[i + 2] || p2;
      if (i === 0) path.push(`M ${p1.x} ${p1.y}`);
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;
      path.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
    }
    return path.join(' ');
  };

  const linePath = buildSmoothPath(points);
  const areaPath = points.length > 1
    ? `${linePath} L ${points[points.length - 1].x},${padTop + chartH} L ${points[0].x},${padTop + chartH} Z`
    : '';

  return (
    <div ref={containerRef} style={{ height, position: 'relative', background: 'linear-gradient(180deg, rgba(14,165,233,0.04), #fff)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Y-axis */}
      <div style={{ position: 'absolute', left: 0, top: padTop, height: chartH, width: padLeft - 8, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 8 }}>
        {[...ticks].reverse().map((t, i) => (
          <span key={i} style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>{valueFormatter(t)}</span>
        ))}
      </div>
      {/* Grid */}
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{ position: 'absolute', left: padLeft, right: padRight, top: padTop + i * (chartH / 4), height: 1, background: 'rgba(14,165,233,0.1)' }} />
      ))}
      {/* SVG */}
      <svg width={containerWidth} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
        <defs>
          <linearGradient id={`areaGrad-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {/* Area */}
        {areaPath && <path d={areaPath} fill={`url(#areaGrad-${color})`} />}
        {/* Line connecting points */}
        {points.length > 1 && (
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {/* Points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="7"
            fill={color}
            stroke="#fff"
            strokeWidth="2.5"
            style={{ cursor: 'pointer', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.2))' }}
            onMouseMove={(e) => onHover(`${data[i].label}: ${valueFormatter(data[i].value)}`, e.clientX, e.clientY - 12)}
            onMouseLeave={() => onHover('', 0, 0)}
          />
        ))}
      </svg>
      {/* X labels */}
      <div style={{ position: 'absolute', left: padLeft, right: padRight, bottom: 8, display: 'flex', justifyContent: 'space-between' }}>
        {data.map((d, i) => (
          <span key={i} style={{ fontSize: 10, color: '#334155', fontWeight: 600 }}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

function CurrencyCell({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { setText(formatCurrency(value).replace('€', '').trim()); setTimeout(() => ref.current?.select(), 10); } }, [editing, value]);
  const save = () => { const v = parseNumberEs(text); onChange(v); setEditing(false); };
  if (editing) return <input ref={ref} className="cell-input" value={text} onChange={(e) => setText(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') save(); else if (e.key === 'Escape') setEditing(false); }} />;
  return <span className="cell-content currency" onClick={() => setEditing(true)}>{formatCurrency(value)}</span>;
}

function AutosaveIndicator({ status }: { status: string }) {
  if (status === 'idle' || status === 'success') return null;
  const label = status === 'saving' ? 'Guardando…' : status === 'dirty' ? 'Pendiente' : 'Error';
  return <span className={clsx('badge', `status-${status}`)}>{label}</span>;
}

function ClientDropdown({ selected, onSelect }: { selected: string; onSelect: (c: string) => void }) {
  return (
    <div className="client-dropdown glass-card fade-in" style={{ padding: '16px 20px', maxWidth: 320 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>Selecciona vista</div>
      <div className="select-wrapper">
        <select value={selected} onChange={(e) => onSelect(e.target.value)}>
          <option value={GENERAL_OPTION}>General</option>
          {CLIENTS.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function HeroHeader({ today }: { today: string }) {
  return (
    <section className="hero glass-card fade-in">
      <div>
        <div className="eyebrow">Panel diario · {today}</div>
        <h1>Portfolio Manager</h1>
        <p className="hero-copy">Controla rentabilidad diaria, movimientos por cliente y guarda cambios automáticamente.</p>
      </div>
    </section>
  );
}

function DailyGrid({ focusDate, setFocusDate }: { focusDate: string; setFocusDate: (d: string) => void }) {
  const { snapshot } = usePortfolioStore();
  const setDayFinal = usePortfolioStore((s) => s.setDayFinal);
  const rows = useMemo(() => [...snapshot.dailyRows], [snapshot.dailyRows]);
  const tableRef = useRef<HTMLTableElement>(null);
  const lastScrolledRef = useRef<string | null>(null);
  const movementByDate = useMemo(() => {
    const map: Record<string, { clientId: string; name: string; increment?: number; decrement?: number }[]> = {};
    CLIENTS.forEach((c) => {
      const clientRows = snapshot.clientRowsById[c.id] || [];
      clientRows.forEach((r) => {
        const inc = r.increment ?? 0;
        const dec = r.decrement ?? 0;
        if (inc !== 0 || dec !== 0) {
          if (!map[r.iso]) map[r.iso] = [];
          map[r.iso].push({ clientId: c.id, name: c.name, increment: r.increment, decrement: r.decrement });
        }
      });
    });
    return map;
  }, [snapshot.clientRowsById]);
  const [movementPopup, setMovementPopup] = useState<{ iso: string; items: { clientId: string; name: string; increment?: number; decrement?: number }[] } | null>(null);

  useEffect(() => {
    if (!tableRef.current || !focusDate) return;
    if (lastScrolledRef.current === focusDate) return;
    const row = tableRef.current.querySelector<HTMLTableRowElement>(`tr[data-iso='${focusDate}']`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      lastScrolledRef.current = focusDate;
    }
  }, [focusDate]);

  const showValue = (v?: number) => (v === undefined ? '—' : formatCurrency(v));
  const showPercent = (v?: number) => (v === undefined ? '—' : formatPercent(v));
  const handleRowClick = (r: typeof rows[number]) => {
    setFocusDate(r.iso);
    const items = movementByDate[r.iso];
    if (items && items.length > 0) {
      setMovementPopup({ iso: r.iso, items });
    } else {
      setMovementPopup(null);
    }
  };
  return (
    <div className="glass-card grid-card fade-in">
      <div className="grid-header">
        <div>
          <div className="eyebrow">General</div>
          <h2>Grid diario</h2>
          <p className="grid-copy">Valores finales, beneficio y % de cada día.</p>
        </div>
        <span className="badge">{rows.length} días</span>
      </div>
      <div className="table-scroll">
        <table ref={tableRef}>
          <thead><tr><th>Fecha</th><th>Incr.</th><th>Decr.</th><th>Inicial</th><th>Final</th><th>Beneficio</th><th>%</th><th>Acumulado</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.iso} data-iso={r.iso} className={clsx(focusDate === r.iso && 'focus', r.isWeekend && 'weekend')} onClick={() => handleRowClick(r)}>
                <td><span>{r.label}</span><small>{r.weekday}</small></td>
                <td>{showValue(r.increments)}</td>
                <td>{showValue(r.decrements)}</td>
                <td>{showValue(r.initial)}</td>
                <td>{r.isWeekend ? showValue(r.final) : <CurrencyCell value={r.final} onChange={(v) => setDayFinal(r.iso, v)} />}</td>
                <td className={clsx(r.profit !== undefined && r.profit >= 0 ? 'profit' : 'loss')}>{showValue(r.profit)}</td>
                <td className={clsx(r.profitPct !== undefined && r.profitPct >= 0 ? 'profit' : 'loss')}>{showPercent(r.profitPct)}</td>
                <td>{showValue(r.cumulativeProfit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {movementPopup && (
        <div className="modal-backdrop" onClick={() => setMovementPopup(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <strong>Movimientos {movementPopup.iso}</strong>
              <button onClick={() => setMovementPopup(null)}>×</button>
            </div>
            <div className="modal-body">
              {movementPopup.items.map((item) => {
                const inc = item.increment ?? 0;
                const dec = item.decrement ?? 0;
                return (
                  <div key={`${item.clientId}-${item.name}-${movementPopup.iso}`} className="mini-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span>{item.name}</span>
                      <small className="muted">{item.clientId}</small>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {inc !== 0 && <span className="positive">+{formatCurrency(inc)}</span>}
                      {dec !== 0 && <span className="negative">-{formatCurrency(dec)}</span>}
                    </div>
                  </div>
                );
              })}
              {movementPopup.items.length === 0 && <p className="muted">Sin movimientos</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function monthLabel(isoMonth: string): string {
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const [year, month] = isoMonth.split('-');
  return `${months[parseInt(month) - 1]} ${year}`;
}

function ClientPanel({ clientId, focusDate, contacts, setAlertMessage }: {
  clientId: string;
  focusDate: string;
  contacts: Record<string, ContactInfo>;
  setAlertMessage: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const { snapshot } = usePortfolioStore();
  const setClientMovement = usePortfolioStore((s) => s.setClientMovement);
  const clientRows = useMemo(() => snapshot.clientRowsById[clientId] || [], [snapshot, clientId]);
  const yearRows = useMemo(
    () => clientRows.filter((r) => r.iso.startsWith(`${YEAR}-`)),
    [clientRows]
  );
  const tableRef = useRef<HTMLTableElement>(null);
  const lastScrolledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!tableRef.current || !focusDate) return;
    if (lastScrolledRef.current === focusDate) return;
    const row = tableRef.current.querySelector<HTMLTableRowElement>(`tr[data-iso='${focusDate}']`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      lastScrolledRef.current = focusDate;
    }
  }, [focusDate]);

  const [showAnalytics, setShowAnalytics] = useState(false);
  const [hoverOrigin, setHoverOrigin] = useState<'inc' | 'dec' | 'profit' | 'return' | 'twr' | null>(null);
  const [twrExpanded, setTwrExpanded] = useState(false);
  const [tooltip, setTooltip] = useState({ x: 0, y: 0, text: '', visible: false });
  const movementsRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const stats = useMemo(() => {
    const validRows = [...yearRows].reverse();
    const last = validRows.find((r) =>
      r.finalBalance !== undefined || r.baseBalance !== undefined || r.cumulativeProfit !== undefined
    );
    const estimatedBalance = last?.finalBalance ?? last?.baseBalance ?? 0;
    const totalProfit = last?.cumulativeProfit ?? 0;
    const dailyProfit = last?.profit ?? 0;
    const participation = last?.sharePct ?? 0;
    const profitPct = last?.profitPct ?? 0;
    const totalIncrements = yearRows.reduce((sum, r) => sum + (r.increment || 0), 0);
    const totalDecrements = yearRows.reduce((sum, r) => sum + (r.decrement || 0), 0);
    return { estimatedBalance, totalProfit, dailyProfit, participation, profitPct, totalIncrements, totalDecrements };
  }, [yearRows]);

  const movementDetails = useMemo(
    () =>
      yearRows
        .filter((r) => r.increment || r.decrement)
        .map((r) => ({
          iso: r.iso,
          label: r.label,
          increment: r.increment || 0,
          decrement: r.decrement || 0,
          net: (r.increment || 0) - (r.decrement || 0)
        })),
    [yearRows]
  );

  const analytics = useMemo(() => {
    // Recorrer en orden para mantener datos reales
    const byMonth = new Map<string, { profit: number; baseStart?: number; finalEnd?: number }>();
    let lastKnownFinal: number | undefined;

    yearRows.forEach((r) => {
      const month = r.iso.slice(0, 7);
      if (!byMonth.has(month)) {
        byMonth.set(month, { profit: 0, baseStart: undefined, finalEnd: undefined });
      }
      const entry = byMonth.get(month)!;
      if (r.profit !== undefined) entry.profit += r.profit;
      // Solo guardar baseStart si es > 0
      if (entry.baseStart === undefined && r.baseBalance !== undefined && r.baseBalance > 0) entry.baseStart = r.baseBalance;
      if (r.finalBalance !== undefined && r.finalBalance > 0) {
        entry.finalEnd = r.finalBalance;
        lastKnownFinal = r.finalBalance;
      }
    });

    const months = Array.from(byMonth.keys()).sort();
    const monthly = months.map((month) => {
      const entry = byMonth.get(month)!;
      const { profit, finalEnd } = entry;
      let { baseStart } = entry;
      // Fallback si baseStart es undefined o 0
      if (baseStart === undefined || baseStart === 0) {
        const idx = months.indexOf(month);
        if (idx > 0) {
          baseStart = byMonth.get(months[idx - 1])?.finalEnd;
        }
      }
      if (baseStart === undefined || baseStart === 0) {
        if (finalEnd !== undefined && finalEnd > 0) {
          baseStart = Math.max(1, finalEnd - profit);
        }
      }
      let retPct = 0;
      if (baseStart && baseStart > 0) {
        retPct = profit / baseStart;
      }
      return { month, profit, retPct, finalEnd, baseStart };
    });

    // Evolución de patrimonio: usar último final disponible por mes; si falta, mantener último conocido
    let running = lastKnownFinal;
    const evolution = monthly.map((m) => {
      if (m.finalEnd !== undefined) {
        running = m.finalEnd;
      }
      return { month: m.month, balance: running ?? 0 };
    });

    const profitAbsMax = monthly.length ? Math.max(...monthly.map((m) => Math.abs(m.profit))) : 1;
    const profitPosMax = monthly.length ? Math.max(...monthly.map((m) => Math.max(0, m.profit))) : 0;
    const hasPositive = profitPosMax > 0;
    const retMax = monthly.length ? Math.max(...monthly.map((m) => Math.abs(m.retPct))) : 0.01;
    const evoMax = evolution.length ? Math.max(...evolution.map((e) => Math.abs(e.balance))) : 1;

    return {
      monthly,
      evolution,
      hasPositive,
      profitMaxAbs: Math.max(1, profitAbsMax),
      profitMaxPos: Math.max(1, profitPosMax || profitAbsMax),
      retMax: Math.max(0.01, retMax),
      evoMax: Math.max(1, evoMax)
    };
  }, [yearRows]);

  // Buscar último mes con beneficio distinto de 0, o el último disponible
  const latestProfitMonth = (() => {
    for (let i = analytics.monthly.length - 1; i >= 0; i--) {
      if (analytics.monthly[i].profit !== 0) return analytics.monthly[i];
    }
    return analytics.monthly[analytics.monthly.length - 1];
  })();
  
  // Buscar último mes con rentabilidad distinta de 0, o el último disponible
  const latestReturnMonth = (() => {
    for (let i = analytics.monthly.length - 1; i >= 0; i--) {
      if (analytics.monthly[i].retPct !== 0) return analytics.monthly[i];
    }
    return analytics.monthly[analytics.monthly.length - 1];
  })();

  // Calcular TWR (Time-Weighted Return)
  const twrData = useMemo(() => {
    const ytdResult = calculateTWR(yearRows);
    const monthlyTWR = calculateAllMonthsTWR(yearRows);
    return { ytd: ytdResult, monthly: monthlyTWR };
  }, [yearRows]);

  const handleMouseMove = (e: React.MouseEvent, text: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 8, text, visible: true });
  };
  const handleMouseLeave = () => setTooltip({ x: 0, y: 0, text: '', visible: false });

  return (
    <div className="client-panel">
      <div className="glass-card grid-card fade-in" style={{ overflow: 'visible' }}>
        <div className="grid-header">
          <div>
            <div className="eyebrow">Cliente</div>
            <h2>{(() => {
              const client = CLIENTS.find(c => c.id === clientId);
              const ct = contacts[clientId];
              return ct && (ct.name || ct.surname) ? `${client?.name} - ${ct.name} ${ct.surname}`.trim() : client?.name || 'Cliente';
            })()}</h2>
            <p className="grid-copy">Movimientos diarios y rentabilidad</p>
          </div>
          <div className="panel-actions">
            <button className="ghost-btn" onClick={() => window.dispatchEvent(new CustomEvent('goto-general'))}>Volver a General</button>
            <button className="primary" onClick={() => setShowAnalytics(true)}>Ver estadísticas</button>
          </div>
        </div>

        <div className="analytics-grid two-row" style={{ marginBottom: 12 }}>
          <div className="stat-card glow">
            <div className="stat-label">Saldo actual</div>
            <div className="stat-value">{formatCurrency(stats.estimatedBalance)}</div>
          </div>
          <div className="stat-card glow">
            <div className="stat-label">Beneficio total</div>
            <div className={clsx('stat-value', stats.totalProfit >= 0 ? 'positive' : 'negative')}>
              {formatCurrency(stats.totalProfit)}
            </div>
          </div>
          <div className="stat-card glow">
            <div className="stat-label">Beneficio día</div>
            <div className={clsx('stat-value', stats.dailyProfit >= 0 ? 'positive' : 'negative')}>
              {formatCurrency(stats.dailyProfit)}
            </div>
          </div>
          <div className="stat-card glow">
            <div className="stat-label">% diario</div>
            <div className={clsx('stat-value', stats.profitPct >= 0 ? 'positive' : 'negative')}>
              {formatPercent(stats.profitPct)}
            </div>
          </div>
        </div>

        <div className="analytics-grid two-row" style={{ marginBottom: 12 }}>
          <div className="stat-card glow">
            <div className="stat-label">Participación</div>
            <div className="stat-value">{formatPercent(stats.participation)}</div>
          </div>
          <div
            className="stat-card glow clickable"
            style={{ position: 'relative', overflow: 'visible' }}
            onMouseEnter={() => setHoverOrigin('inc')}
            onMouseLeave={() => setHoverOrigin((v) => (v === 'inc' ? null : v))}
          >
            <div className="stat-label">Incrementos totales</div>
            <div className="stat-value positive">{formatCurrency(stats.totalIncrements)}</div>
            <div className="stat-sub">Suma anual</div>
            {hoverOrigin === 'inc' && (
              <div className="mini-popup" ref={popupRef} onClick={(e) => e.stopPropagation()}>
                <div className="mini-popup-header">
                  <strong>Detalle movimientos</strong>
                  <button onClick={() => setHoverOrigin(null)}>×</button>
                </div>
                <div className="mini-popup-body">
                  {movementDetails.length === 0 && <p className="muted">Sin movimientos</p>}
                  {movementDetails.map((m) => (
                    <div key={m.iso} className="mini-row">
                      <span>{m.label}</span>
                      <span className={clsx(m.increment > 0 && 'positive')}>{m.increment > 0 ? `+${formatCurrency(m.increment)}` : ''}</span>
                      <span className={clsx(m.decrement > 0 && 'negative')}>{m.decrement > 0 ? `-${formatCurrency(m.decrement)}` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div
            className="stat-card glow clickable"
            style={{ position: 'relative', overflow: 'visible' }}
            onMouseEnter={() => setHoverOrigin('dec')}
            onMouseLeave={() => setHoverOrigin((v) => (v === 'dec' ? null : v))}
          >
            <div className="stat-label">Decrementos totales</div>
            <div className="stat-value negative">{formatCurrency(stats.totalDecrements)}</div>
            <div className="stat-sub">Suma anual</div>
            {hoverOrigin === 'dec' && (
              <div className="mini-popup" ref={popupRef} onClick={(e) => e.stopPropagation()}>
                <div className="mini-popup-header">
                  <strong>Detalle movimientos</strong>
                  <button onClick={() => setHoverOrigin(null)}>×</button>
                </div>
                <div className="mini-popup-body">
                  {movementDetails.length === 0 && <p className="muted">Sin movimientos</p>}
                  {movementDetails.map((m) => (
                    <div key={m.iso} className="mini-row">
                      <span>{m.label}</span>
                      <span className={clsx(m.increment > 0 && 'positive')}>{m.increment > 0 ? `+${formatCurrency(m.increment)}` : ''}</span>
                      <span className={clsx(m.decrement > 0 && 'negative')}>{m.decrement > 0 ? `-${formatCurrency(m.decrement)}` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div
            className="stat-card glow clickable"
            style={{ position: 'relative', overflow: 'visible' }}
            onMouseEnter={() => setHoverOrigin('profit')}
            onMouseLeave={() => setHoverOrigin((v) => (v === 'profit' ? null : v))}
          >
            <div className="stat-label">Beneficio mensual</div>
            <div className={clsx('stat-value', (latestProfitMonth?.profit ?? 0) >= 0 ? 'positive' : 'negative')}>
              {formatCurrency(latestProfitMonth?.profit ?? 0)}
            </div>
            <div className="stat-sub">Último mes · Hover para ver todos</div>
            {hoverOrigin === 'profit' && (
              <div className="mini-popup wide popup-left" onClick={(e) => e.stopPropagation()}>
                <div className="mini-popup-header">
                  <strong>Beneficio por mes</strong>
                  <button onClick={() => setHoverOrigin(null)}>×</button>
                </div>
                <div className="mini-popup-body">
                  {analytics.monthly.length === 0 && <p className="muted">Sin datos</p>}
                  {analytics.monthly.map((m) => (
                    <div key={m.month} className="mini-row">
                      <span>{monthLabel(m.month)}</span>
                      <span className={clsx(m.profit >= 0 ? 'positive' : 'negative')}>{formatCurrency(m.profit)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div
            className="stat-card glow clickable"
            style={{ position: 'relative', overflow: 'visible' }}
            onMouseEnter={() => setHoverOrigin('return')}
            onMouseLeave={() => setHoverOrigin((v) => (v === 'return' ? null : v))}
          >
            <div className="stat-label">Rentabilidad mensual</div>
            <div className={clsx('stat-value', (latestReturnMonth?.retPct ?? 0) >= 0 ? 'positive' : 'negative')}>
              {formatPercent(latestReturnMonth?.retPct ?? 0)}
            </div>
            <div className="stat-sub">Último mes · Hover para ver todos</div>
            {hoverOrigin === 'return' && (
              <div className="mini-popup wide popup-center" onClick={(e) => e.stopPropagation()}>
                <div className="mini-popup-header">
                  <strong>Rentabilidad por mes</strong>
                  <button onClick={() => setHoverOrigin(null)}>×</button>
                </div>
                <div className="mini-popup-body">
                  {analytics.monthly.length === 0 && <p className="muted">Sin datos</p>}
                  {analytics.monthly.map((m) => (
                    <div key={m.month} className="mini-row">
                      <span>{monthLabel(m.month)}</span>
                      <span className={clsx(m.retPct >= 0 ? 'positive' : 'negative')}>{formatPercent(m.retPct)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div
            className="stat-card glow clickable"
            style={{ position: 'relative', overflow: 'visible' }}
            onMouseEnter={() => setHoverOrigin('twr')}
            onMouseLeave={() => setHoverOrigin((v) => (v === 'twr' ? null : v))}
            onClick={() => setTwrExpanded(!twrExpanded)}
          >
            <div className="stat-label">Rentabilidad TWR</div>
            <div className={clsx('stat-value', twrData.ytd.twr >= 0 ? 'positive' : 'negative')}>
              {formatPercent(twrData.ytd.twr)}
            </div>
            <div className="stat-sub">YTD · Click para detalle</div>
            {hoverOrigin === 'twr' && !twrExpanded && (
              <div className="mini-popup wide popup-center" onClick={(e) => e.stopPropagation()}>
                <div className="mini-popup-header">
                  <strong>¿Qué es TWR?</strong>
                  <button onClick={() => setHoverOrigin(null)}>×</button>
                </div>
                <div className="mini-popup-body" style={{ fontSize: 12, lineHeight: 1.5 }}>
                  <p style={{ margin: '0 0 8px' }}>La <strong>rentabilidad TWR</strong> (Time-Weighted Return) mide el rendimiento real eliminando el efecto de aportes y retiros.</p>
                  <p style={{ margin: 0 }}>Se calcula dividiendo el periodo en subperiodos entre cada flujo, calculando el retorno de cada uno y multiplicando los factores (1+r). Así puedes comparar rendimientos de forma justa.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {twrExpanded && (
          <div className="twr-detail glass-card" style={{ marginBottom: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0 }}>Detalle TWR por mes</h4>
              <button className="ghost-btn" onClick={() => setTwrExpanded(false)}>Cerrar</button>
            </div>
            <div className="data-table compact">
              <div className="table-header">
                <div>Mes</div>
                <div>TWR</div>
                <div>Días con datos</div>
              </div>
              {twrData.monthly.length === 0 && <div className="table-row"><div>Sin datos</div></div>}
              {twrData.monthly.map((m) => (
                <div className="table-row" key={m.month}>
                  <div>{monthLabel(m.month)}</div>
                  <div className={clsx(m.twr >= 0 ? 'positive' : 'negative')}>{formatPercent(m.twr)}</div>
                  <div>{m.periods.length}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 12, marginBottom: 0 }}>
              TWR elimina el efecto de aportes/retiros multiplicando los retornos de cada subperiodo: (1+r₁)×(1+r₂)×...−1
            </p>
          </div>
        )}
        
        <div className="table-scroll" style={{ overflowX: 'hidden' }}>
          <table style={{ tableLayout: 'auto' }} ref={tableRef}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Incremento</th>
                <th>Decremento</th>
                <th>Inicial</th>
                <th>Final</th>
                <th>Beneficio</th>
                <th>%</th>
                <th>Beneficio acum.</th>
                <th>Participación</th>
              </tr>
            </thead>
            <tbody>
              {yearRows.map(r => (
                <tr key={r.iso} data-iso={r.iso} className={clsx(focusDate === r.iso && 'focus', r.isWeekend && 'weekend')}>
                  <td><span>{r.label}</span><small>{r.weekday}</small></td>
                  <td>{r.isWeekend ? (r.increment === undefined ? '—' : formatCurrency(r.increment)) : <CurrencyCell value={r.increment} onChange={(v) => setClientMovement(clientId, r.iso, 'increment', v)} />}</td>
                  <td>{r.isWeekend ? (r.decrement === undefined ? '—' : formatCurrency(r.decrement)) : (
                    <CurrencyCell
                      value={r.decrement}
                      onChange={(v) => {
                        const base = r.baseBalance ?? 0;
                        const inc = r.increment ?? 0;
                        const max = base + inc;
                        if (v !== undefined && !Number.isNaN(v) && v > max) {
                          setAlertMessage(`Saldo excedido. Máximo disponible: ${formatCurrency(max)}`);
                          return;
                        }
                        setClientMovement(clientId, r.iso, 'decrement', v);
                      }}
                    />
                  )}</td>
                  <td>{r.baseBalance === undefined ? '—' : formatCurrency(r.baseBalance)}</td>
                  <td>{r.finalBalance === undefined ? '—' : formatCurrency(r.finalBalance)}</td>
                  <td className={clsx(r.profit !== undefined && r.profit >= 0 ? 'profit' : 'loss')}>
                    {r.profit === undefined ? '—' : formatCurrency(r.profit)}
                  </td>
                  <td className={clsx(r.profitPct !== undefined && r.profitPct >= 0 ? 'profit' : 'loss')}>
                    {r.profitPct === undefined ? '—' : formatPercent(r.profitPct)}
                  </td>
                  <td>{r.cumulativeProfit === undefined ? '—' : formatCurrency(r.cumulativeProfit)}</td>
                  <td>{r.sharePct === undefined ? '—' : formatPercent(r.sharePct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAnalytics && (
        <div className="client-analytics-overlay" onClick={() => setShowAnalytics(false)}>
          <div className="client-analytics-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Análisis de {CLIENTS.find((c) => c.id === clientId)?.name || 'Cliente'}</h3>
              <button onClick={() => setShowAnalytics(false)}>×</button>
            </div>

            <div className="analytics-body">
              <div className="analytics-grid">
                <div className="stat-card glow">
                  <div className="stat-label">Saldo actual</div>
                  <div className="stat-value">{formatCurrency(stats.estimatedBalance)}</div>
                  <div className="stat-sub">Última fecha cerrada</div>
                </div>
                <div className="stat-card glow">
                  <div className="stat-label">Beneficio total</div>
                  <div className={clsx('stat-value', stats.totalProfit >= 0 ? 'positive' : 'negative')}>
                    {formatCurrency(stats.totalProfit)}
                  </div>
                  <div className="stat-sub">Suma acumulada</div>
                </div>
                <div className="stat-card glow">
                  <div className="stat-label">Beneficio día</div>
                  <div className={clsx('stat-value', stats.dailyProfit >= 0 ? 'positive' : 'negative')}>
                    {formatCurrency(stats.dailyProfit)}
                  </div>
                  <div className="stat-sub">Última entrada</div>
                </div>
                <div className="stat-card glow">
                  <div className="stat-label">% diario</div>
                  <div className={clsx('stat-value', stats.profitPct >= 0 ? 'positive' : 'negative')}>
                    {formatPercent(stats.profitPct)}
                  </div>
                </div>
                <div className="stat-card glow">
                  <div className="stat-label">Participación</div>
                  <div className="stat-value">{formatPercent(stats.participation)}</div>
                  <div className="stat-sub">Peso vs patrimonio</div>
                </div>
                <div
                  className="stat-card glow clickable"
                  onClick={() => movementsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  <div className="stat-label">Incrementos totales</div>
                  <div className="stat-value positive">{formatCurrency(stats.totalIncrements)}</div>
                  <div className="stat-sub">Suma anual · <span className="link-text">Ver detalle</span></div>
                </div>
                <div
                  className="stat-card glow clickable"
                  onClick={() => movementsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  <div className="stat-label">Decrementos totales</div>
                  <div className="stat-value negative">{formatCurrency(stats.totalDecrements)}</div>
                  <div className="stat-sub">Suma anual · <span className="link-text">Ver detalle</span></div>
                </div>
              </div>

              <div className="chart-grid-modern">
                <div className="chart-card">
                  <div className="chart-card-header">
                    <div>
                      <p className="eyebrow">Beneficio mensual (€)</p>
                      <h4>Performance mensual</h4>
                      <p className="muted">Escala absoluta con eje cero visible.</p>
                    </div>
                    <div className="badge-soft">Barras</div>
                  </div>
                  <ModernBarChart
                    data={analytics.monthly.map((m) => ({ label: monthLabel(m.month), value: m.profit }))}
                    onHover={(text: string, x: number, y: number) => setTooltip({ x, y, text, visible: !!text })}
                    height={320}
                  />
                </div>

                <div className="chart-card">
                  <div className="chart-card-header">
                    <div>
                      <p className="eyebrow">Rentabilidad mensual (%)</p>
                      <h4>Retorno por mes</h4>
                      <p className="muted">Escala simétrica si hay negativos.</p>
                    </div>
                    <div className="badge-soft">Línea</div>
                  </div>
                  <ModernLineChart
                    data={analytics.monthly.map((m) => ({ label: monthLabel(m.month), value: m.retPct }))}
                    color="#6366f1"
                    valueFormatter={formatPercent}
                    onHover={(text: string, x: number, y: number) => setTooltip({ x, y, text, visible: !!text })}
                    height={280}
                  />
                </div>

                <div className="chart-card">
                  <div className="chart-card-header">
                    <div>
                      <p className="eyebrow">Evolución patrimonio</p>
                      <h4>Saldo a fin de mes</h4>
                      <p className="muted">Usa el saldo del último día con dato en cada mes.</p>
                    </div>
                    <div className="badge-soft">Línea</div>
                  </div>
                  <ModernLineChart
                    data={analytics.evolution.map((m) => ({ label: monthLabel(m.month), value: m.balance }))}
                    color="#0ea5e9"
                    onHover={(text: string, x: number, y: number) => setTooltip({ x, y, text, visible: !!text })}
                    height={280}
                  />
                </div>

                <div className="chart-card compact">
                  <div className="chart-card-header">
                    <p className="eyebrow">Detalle mensual</p>
                    <h4>Tabla rápida</h4>
                  </div>
                  <div className="data-table compact">
                    <div className="table-header">
                      <div>Mes</div>
                      <div>Beneficio</div>
                      <div>% Total</div>
                      <div>Balance</div>
                    </div>
                    {analytics.monthly.map((m, i) => {
                      const profit = m.profit;
                      const balance = analytics.evolution[i]?.balance ?? profit;
                      return (
                        <div className="table-row" key={i}>
                          <div>{monthLabel(m.month)}</div>
                          <div className={clsx(profit >= 0 ? 'positive' : 'negative')}>{formatCurrency(profit)}</div>
                          <div className={clsx(m.retPct >= 0 ? 'positive' : 'negative')}>{formatPercent(m.retPct)}</div>
                          <div>{formatCurrency(balance)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Detalle de movimientos */}
                <div className="chart-card compact" ref={movementsRef}>
                  <div className="chart-card-header">
                    <div>
                      <p className="eyebrow">Detalle movimientos</p>
                      <h4>Incrementos y Decrementos</h4>
                    </div>
                    <div className="movements-totals">
                      <span className="total-badge positive">+{formatCurrency(stats.totalIncrements)}</span>
                      <span className="total-badge negative">-{formatCurrency(stats.totalDecrements)}</span>
                    </div>
                  </div>
                  <div className="data-table compact movements-table">
                    <div className="table-header">
                      <div>Fecha</div>
                      <div>Incremento</div>
                      <div>Decremento</div>
                    </div>
                    {movementDetails.length === 0 && <div className="table-row empty"><div>Sin movimientos registrados</div></div>}
                    {movementDetails.map((m) => (
                      <div className="table-row" key={m.iso}>
                        <div className="date-cell">{m.label}</div>
                        <div className={clsx(m.increment > 0 && 'positive')}>{m.increment > 0 ? formatCurrency(m.increment) : '—'}</div>
                        <div className={clsx(m.decrement > 0 && 'negative')}>{m.decrement > 0 ? formatCurrency(m.decrement) : '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tooltip.visible && (
        <div className="chart-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

function TotalsBanner() {
  const { snapshot } = usePortfolioStore();
  const { totals } = snapshot;
  return (
    <div className="glass-card totals-banner fade-in">
      <div>
        <p>Total portfolio</p>
        <h1>{formatCurrency(totals.assets)}</h1>
      </div>
      <div>
        <p>Beneficio YTD</p>
        <h1 className={clsx((totals.ytdProfit||0)>=0?'profit':'loss')}>{formatCurrency(totals.ytdProfit)}</h1>
      </div>
      <div>
        <p>Retorno YTD</p>
        <h1 className={clsx((totals.ytdReturnPct||0)>=0?'profit':'loss')}>{formatPercent(totals.ytdReturnPct)}</h1>
      </div>
    </div>
  );
}

export default function App() {
  // Check for report token in URL
  const [reportToken, setReportToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('report');
  });

  const [activeView, setActiveView] = useState<string>(GENERAL_OPTION);
  const [menuOpen, setMenuOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Record<string, ContactInfo>>(() => {
    // Try loading from localStorage first
    const raw = localStorage.getItem('portfolio-contacts');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Record<string, ContactInfo>;
        // Merge with defaults for any missing clients
        const merged: Record<string, ContactInfo> = {};
        CLIENTS.forEach((c) => {
          merged[c.id] = parsed[c.id] || { name: '', surname: '', email: '', phone: '' };
        });
        return merged;
      } catch (e) {
        console.warn('Failed to parse contacts', e);
      }
    }
    // Default: empty contact info
    const initial: Record<string, ContactInfo> = {};
    CLIENTS.forEach((c) => {
      initial[c.id] = { name: '', surname: '', email: '', phone: '' };
    });
    return initial;
  });
  const [guarantees, setGuarantees] = useState<Record<string, number>>(() => {
    const raw = localStorage.getItem('portfolio-guarantees');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Record<string, number>;
        const merged: Record<string, number> = {};
        CLIENTS.forEach((c) => { merged[c.id] = parsed[c.id] ?? 0; });
        return merged;
      } catch (e) {
        console.warn('Failed to parse guarantees', e);
      }
    }
    const init: Record<string, number> = {};
    CLIENTS.forEach((c) => { init[c.id] = 0; });
    return init;
  });
  const [comisionesCobradas, setComisionesCobradas] = useState<Record<string, number>>(() => {
    const raw = localStorage.getItem('portfolio-comisiones-cobradas');
    if (raw) {
      try {
        return JSON.parse(raw) as Record<string, number>;
      } catch (e) {
        console.warn('Failed to parse comisiones cobradas', e);
      }
    }
    return {};
  });
  const [comisionEstado, setComisionEstado] = useState<Record<string, boolean>>(() => {
    const raw = localStorage.getItem('portfolio-comision-estado');
    if (raw) {
      try {
        return JSON.parse(raw) as Record<string, boolean>;
      } catch (e) {
        console.warn('Failed to parse comision estado', e);
      }
    }
    return {};
  });
  const derivedFocusDate = useFocusDate();
  const [focusDate, setFocusDate] = useState(derivedFocusDate);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    setFocusDate(derivedFocusDate);
  }, [derivedFocusDate]);

  // Persist contacts changes
  useEffect(() => {
    localStorage.setItem('portfolio-contacts', JSON.stringify(contacts));
  }, [contacts]);

  // Persist guarantees
  useEffect(() => {
    localStorage.setItem('portfolio-guarantees', JSON.stringify(guarantees));
  }, [guarantees]);

  // Persist comisiones cobradas
  useEffect(() => {
    localStorage.setItem('portfolio-comisiones-cobradas', JSON.stringify(comisionesCobradas));
  }, [comisionesCobradas]);

  // Persist estado cobrada/pending
  useEffect(() => {
    localStorage.setItem('portfolio-comision-estado', JSON.stringify(comisionEstado));
  }, [comisionEstado]);


  // Persist fecha cobro
  // (fecha cobro ya no se persiste, se muestra la fecha del último decremento)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (!detail) return;
      setToast(detail);
      setTimeout(() => setToast(null), 2000);
    };
    window.addEventListener('show-toast', handler as EventListener);
    return () => window.removeEventListener('show-toast', handler as EventListener);
  }, []);

  useEffect(() => {
    const handler = () => setActiveView(GENERAL_OPTION);
    window.addEventListener('goto-general', handler);
    return () => window.removeEventListener('goto-general', handler);
  }, []);

  return (
    <div className="app-shell">
      {alertMessage && (
        <div className="modal-backdrop" onClick={() => setAlertMessage(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <strong>Saldo excedido</strong>
              <button onClick={() => setAlertMessage(null)}>×</button>
            </div>
            <div className="modal-body">
              <p>{alertMessage}</p>
            </div>
            <div className="modal-actions">
              <button className="primary" onClick={() => setAlertMessage(null)}>Entendido</button>
            </div>
          </div>
        </div>
      )}
      <div
        className="side-hover-zone"
        onMouseEnter={() => setMenuOpen(true)}
        onMouseLeave={() => setMenuOpen(false)}
      />
      <div
        className={clsx('side-rail', menuOpen && 'open')}
        onMouseEnter={() => setMenuOpen(true)}
        onMouseLeave={() => setMenuOpen(false)}
      >
        <div className="side-rail-header">
          <span className="eyebrow">Menú</span>
          <h4>Accesos</h4>
        </div>
        <button
          className={clsx('side-link', activeView === GENERAL_OPTION && 'active')}
          onClick={() => { setActiveView(GENERAL_OPTION); setMenuOpen(false); }}
        >
          General
        </button>
        <button
          className={clsx('side-link', activeView === INFO_VIEW && 'active')}
          onClick={() => { setActiveView(INFO_VIEW); setMenuOpen(false); }}
        >
          Info Clientes
        </button>
        <button
          className={clsx('side-link', activeView === COMISIONES_VIEW && 'active')}
          onClick={() => { setActiveView(COMISIONES_VIEW); setMenuOpen(false); }}
        >
          Comisiones
        </button>
        <button
          className={clsx('side-link', activeView === INFORMES_VIEW && 'active')}
          onClick={() => { setActiveView(INFORMES_VIEW); setMenuOpen(false); }}
        >
          Informes
        </button>
        <button
          className={clsx('side-link', activeView === STATS_VIEW && 'active')}
          onClick={() => { setActiveView(STATS_VIEW); setMenuOpen(false); }}
        >
          Estadísticas
        </button>
      </div>

      <div className="hero glass-card fade-in">
        <div>
          <div className="eyebrow">Gestión de cartera</div>
          <h1>Portfolio Manager</h1>
          <p className="hero-copy">Seguimiento diario de inversiones y rentabilidad por cliente.</p>
        </div>
        {!reportToken && (
          <div className="hero-side">
            <div className="hero-client-picker">
              <label htmlFor="hero-client-select">Seleccionar cliente</label>
              <div className="select-wrapper">
                <select
                  id="hero-client-select"
                  value={activeView === GENERAL_OPTION ? GENERAL_OPTION : CLIENTS.find((c) => c.id === activeView)?.id || ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    setActiveView(v);
                  }}
                >
                  <option value="">Elige un cliente…</option>
                  <option value={GENERAL_OPTION}>General (todos)</option>
                  {CLIENTS.map((c) => {
                    const ct = contacts[c.id];
                    const label = ct && (ct.name || ct.surname) ? `${c.name} - ${ct.name} ${ct.surname}`.trim() : c.name;
                    return (
                      <option key={c.id} value={c.id}>{label}</option>
                    );
                  })}
                </select>
              </div>
              <p className="hero-helper">Visible en todas las vistas. Cambia rápido entre clientes.</p>
            </div>
          </div>
        )}
      </div>

      {reportToken ? (
        <ReportView token={reportToken} />
      ) : activeView === GENERAL_OPTION ? (
        <>
          <TotalsBanner />
          <DailyGrid focusDate={focusDate} setFocusDate={setFocusDate} />
        </>
      ) : activeView === INFO_VIEW ? (
        <InfoClientes contacts={contacts} setContacts={setContacts} guarantees={guarantees} setGuarantees={setGuarantees} />
      ) : activeView === COMISIONES_VIEW ? (
        <ComisionesView
          contacts={contacts}
          comisionesCobradas={comisionesCobradas}
          setComisionesCobradas={setComisionesCobradas}
          comisionEstado={comisionEstado}
          setComisionEstado={setComisionEstado}
        />
      ) : activeView === INFORMES_VIEW ? (
        <InformesView contacts={contacts} />
      ) : activeView === STATS_VIEW ? (
        <StatsView contacts={contacts} />
      ) : (
        <ClientPanel clientId={activeView} focusDate={focusDate} contacts={contacts} setAlertMessage={setAlertMessage} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function InfoClientes({ contacts, setContacts, guarantees, setGuarantees }: { contacts: Record<string, ContactInfo>; setContacts: React.Dispatch<React.SetStateAction<Record<string, ContactInfo>>>; guarantees: Record<string, number>; setGuarantees: React.Dispatch<React.SetStateAction<Record<string, number>>>; }) {
  const { snapshot } = usePortfolioStore();
  const [selectedId, setSelectedId] = useState(CLIENTS[0]?.id || '');
  const [search, setSearch] = useState('');
  const [monthPopupKey, setMonthPopupKey] = useState<'profit' | 'return' | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CLIENTS;
    return CLIENTS.filter((c) => {
      const ct = contacts[c.id];
      const full = `${c.name} ${ct?.name ?? ''} ${ct?.surname ?? ''}`.toLowerCase();
      return full.includes(q) || c.id.toLowerCase().includes(q);
    });
  }, [search, contacts]);

  const clientRows = useMemo(() => snapshot.clientRowsById[selectedId] || [], [snapshot, selectedId]);
  const yearRows = useMemo(() => clientRows.filter((r) => r.iso.startsWith(`${YEAR}-`)), [clientRows]);
  const stats = useMemo(() => {
    const validRows = [...yearRows].reverse();
    const last = validRows.find((r) => r.finalBalance !== undefined || r.baseBalance !== undefined || r.cumulativeProfit !== undefined);
    const estimatedBalance = last?.finalBalance ?? last?.baseBalance ?? 0;
    const totalProfit = last?.cumulativeProfit ?? 0;
    const dailyProfit = last?.profit ?? 0;
    const profitPct = last?.profitPct ?? 0;
    const participation = last?.sharePct ?? 0;
    const capitalInvertido = yearRows.reduce((s, r) => s + (r.increment || 0), 0);
    const capitalRetirado = yearRows.reduce((s, r) => s + (r.decrement || 0), 0);

    const lastMonthIso = last?.iso.slice(0, 7);
    const monthRows = lastMonthIso ? yearRows.filter((r) => r.iso.startsWith(lastMonthIso)) : [];
    const monthlyProfit = monthRows.reduce((s, r) => s + (r.profit || 0), 0);
    const lastFinalInMonth = [...monthRows].reverse().find((r) => r.finalBalance !== undefined && r.finalBalance > 0)?.finalBalance;
    // Buscar baseBalance > 0
    const firstValidBase = monthRows.find((r) => r.baseBalance !== undefined && r.baseBalance > 0)?.baseBalance;
    const firstValidFinal = monthRows.find((r) => r.finalBalance !== undefined && r.finalBalance > 0)?.finalBalance;
    const prevMonthFinal = (() => {
      const prev = [...yearRows].reverse().find((r) => r.iso < `${lastMonthIso}-01` && r.finalBalance !== undefined && r.finalBalance > 0);
      return prev?.finalBalance;
    })();
    const estimatedBase = lastFinalInMonth !== undefined ? Math.max(1, lastFinalInMonth - monthlyProfit) : 0;
    const monthStart = firstValidBase ?? prevMonthFinal ?? firstValidFinal ?? estimatedBase;
    const monthlyReturn = monthStart ? monthlyProfit / monthStart : 0;

    const proportion = snapshot.totals.assets ? estimatedBalance / snapshot.totals.assets : 0;

    return { estimatedBalance, totalProfit, dailyProfit, profitPct, participation, capitalInvertido, capitalRetirado, monthlyProfit, monthlyReturn, proportion, lastMonthIso };
  }, [yearRows]);

  const monthlySummary = useMemo(() => {
    const profitByMonth = new Map<string, number>();
    const firstBaseByMonth = new Map<string, number>();
    const lastFinalByMonth = new Map<string, number>();
    yearRows.forEach((r) => {
      const m = r.iso.slice(0, 7);
      profitByMonth.set(m, (profitByMonth.get(m) || 0) + (r.profit || 0));
      // Solo guardar baseBalance si es > 0 (ignorar 0 como valor no válido)
      if (!firstBaseByMonth.has(m) && r.baseBalance !== undefined && r.baseBalance > 0) {
        firstBaseByMonth.set(m, r.baseBalance);
      }
      if (r.finalBalance !== undefined && r.finalBalance > 0) {
        lastFinalByMonth.set(m, r.finalBalance);
      }
    });
    const months = Array.from(profitByMonth.keys()).sort();
    return months.map((m) => {
      const profit = profitByMonth.get(m) || 0;
      let base = firstBaseByMonth.get(m);
      if (base === undefined || base === 0) {
        // fallback: último final del mes anterior
        const idx = months.indexOf(m);
        if (idx > 0) {
          base = lastFinalByMonth.get(months[idx - 1]);
        }
      }
      if (base === undefined || base === 0) {
        // fallback: estimar base = último final del mes - beneficio
        const lastFinal = lastFinalByMonth.get(m);
        if (lastFinal !== undefined && lastFinal > 0) {
          base = Math.max(1, lastFinal - profit);
        }
      }
      base = base ?? 0;
      const ret = base ? profit / base : 0;
      return { month: m, label: monthLabel(m), profit, ret };
    });
  }, [yearRows]);

  useEffect(() => {
    if (!monthPopupKey) return;
    const handler = (e: Event) => {
      if (popupRef.current && popupRef.current.contains(e.target as Node)) return;
      setMonthPopupKey(null);
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [monthPopupKey]);

  const currentClient = CLIENTS.find((c) => c.id === selectedId);
  const contact = contacts[selectedId] || { name: '', surname: '', email: '', phone: '' };
  const displayName = `${currentClient?.name || 'Cliente'}${contact.name || contact.surname ? ` - ${contact.name} ${contact.surname}` : ''}`.trim();
  const guaranteeInitial = guarantees[selectedId] ?? 0;
  const guaranteeActual = Math.max(0, guaranteeInitial - stats.capitalRetirado);

  const updateField = (field: keyof ContactInfo, value: string) => {
    setContacts((prev) => ({ ...prev, [selectedId]: { ...contact, [field]: value } }));
  };

  return (
    <div className="info-clients-container fade-in">
      {/* Panel izquierdo: buscador + lista */}
      <aside className="info-sidebar">
        <div className="info-sidebar-header">
          <h4>Clientes</h4>
          <input
            type="text"
            className="info-search"
            id="info-search-clientes"
            name="info-search-clientes"
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="info-list">
          <button
            className={clsx('info-item', selectedId === GENERAL_OPTION && 'active')}
            onClick={() => setSelectedId(GENERAL_OPTION)}
          >
            <span className="info-name">General</span>
            <span className="info-id">Vista</span>
          </button>
          {filteredClients.map((c) => {
            const ct = contacts[c.id];
            const namePart = `${ct?.name ?? ''} ${ct?.surname ?? ''}`.trim();
            const label = namePart ? `${c.name} - ${namePart}` : c.name;
            return (
              <button
                key={c.id}
                className={clsx('info-item', selectedId === c.id && 'active')}
                onClick={() => setSelectedId(c.id)}
              >
                <span className="info-name">{label}</span>
              </button>
            );
          })}
          {filteredClients.length === 0 && <p className="muted" style={{ padding: 12 }}>Sin resultados</p>}
        </div>
      </aside>

      {/* Panel derecho: detalle */}
      <main className="info-detail">
        <header className="info-detail-header">
          <div className="eyebrow">Ficha de cliente</div>
          <h2>{displayName || 'Selecciona un cliente'}</h2>
        </header>

        {/* KPIs */}
        <section className="info-kpis">
          <div className="kpi-card">
            <span className="kpi-label">Saldo actual</span>
            <span className="kpi-value">{formatCurrency(stats.estimatedBalance)}</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Capital invertido</span>
            <span className="kpi-value">{formatCurrency(stats.capitalInvertido)}</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Capital retirado</span>
            <span className="kpi-value">{formatCurrency(stats.capitalRetirado)}</span>
          </div>
          <div className="kpi-card" onClick={() => setMonthPopupKey('profit')} style={{ cursor: 'pointer' }}>
            <span className="kpi-label">Beneficio mensual</span>
            <span className="kpi-value">{formatCurrency(stats.monthlyProfit)}</span>
            {stats.lastMonthIso && <span className="kpi-meta">Mes: {monthLabel(stats.lastMonthIso)}</span>}
            {monthPopupKey === 'profit' && (
              <div className="mini-popup fixed-popup" ref={popupRef}>
                <div className="mini-popup-header">
                  <strong>Beneficios mensuales (año)</strong>
                  <button onClick={() => setMonthPopupKey(null)}>×</button>
                </div>
                <div className="mini-popup-body">
                  {monthlySummary.length === 0 && <p className="muted">Sin datos</p>}
                  {monthlySummary.map((m) => (
                    <div key={m.month} className="mini-row">
                      <span>{m.label}</span>
                      <span className={clsx(m.profit >= 0 ? 'positive' : 'negative')}>{formatCurrency(m.profit)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="kpi-card" onClick={() => setMonthPopupKey('return')} style={{ cursor: 'pointer' }}>
            <span className="kpi-label">Rentabilidad mensual</span>
            <span className="kpi-value">{formatPercent(stats.monthlyReturn)}</span>
            {stats.lastMonthIso && <span className="kpi-meta">Mes: {monthLabel(stats.lastMonthIso)}</span>}
            {monthPopupKey === 'return' && (
              <div className="mini-popup fixed-popup" ref={popupRef}>
                <div className="mini-popup-header">
                  <strong>Rentabilidades mensuales (año)</strong>
                  <button onClick={() => setMonthPopupKey(null)}>×</button>
                </div>
                <div className="mini-popup-body">
                  {monthlySummary.length === 0 && <p className="muted">Sin datos</p>}
                  {monthlySummary.map((m) => (
                    <div key={m.month} className="mini-row">
                      <span>{m.label}</span>
                      <span className={clsx(m.ret >= 0 ? 'positive' : 'negative')}>{formatPercent(m.ret)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Proporción del total</span>
            <span className="kpi-value">{formatPercent(stats.proportion)}</span>
          </div>
        </section>

        {/* Datos de contacto */}
        <section className="info-section">
          <h4>Datos de contacto</h4>
          <div className="info-form">
            <label>
              <span>Nombre</span>
              <input
                id="contact-name"
                name="contact-name"
                autoComplete="name"
                value={contact.name}
                onChange={(e) => { updateField('name', e.target.value); window.dispatchEvent(new CustomEvent('show-toast', { detail: 'Guardado' })); }}
              />
            </label>
            <label>
              <span>Apellidos</span>
              <input
                id="contact-surname"
                name="contact-surname"
                autoComplete="family-name"
                value={contact.surname}
                onChange={(e) => { updateField('surname', e.target.value); window.dispatchEvent(new CustomEvent('show-toast', { detail: 'Guardado' })); }}
              />
            </label>
            <label>
              <span>Email</span>
              <input
                id="contact-email"
                name="contact-email"
                type="email"
                autoComplete="email"
                value={contact.email}
                onChange={(e) => { updateField('email', e.target.value); window.dispatchEvent(new CustomEvent('show-toast', { detail: 'Guardado' })); }}
              />
            </label>
            <label>
              <span>Teléfono</span>
              <input
                id="contact-phone"
                name="contact-phone"
                type="tel"
                autoComplete="tel"
                value={contact.phone}
                onChange={(e) => { updateField('phone', e.target.value); window.dispatchEvent(new CustomEvent('show-toast', { detail: 'Guardado' })); }}
              />
            </label>
          </div>
        </section>

        {/* Garantías */}
        <section className="info-section">
          <h4>Garantías</h4>
          <div className="info-form two-cols">
            <label>
              <span>Garantía inicial</span>
              <input
                id="guarantee-inicial"
                name="guarantee-inicial"
                type="number"
                value={Number.isNaN(guaranteeInitial) ? '' : guaranteeInitial}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setGuarantees((prev) => ({ ...prev, [selectedId]: Number.isNaN(val) ? 0 : val }));
                  window.dispatchEvent(new CustomEvent('show-toast', { detail: 'Guardado' }));
                }}
              />
            </label>
            <label>
              <span>Garantía actual</span>
              <input id="guarantee-actual" name="guarantee-actual" value={formatCurrency(guaranteeActual)} disabled />
            </label>
          </div>
        </section>

      </main>
    </div>
  );
}

function ComisionesView({ contacts, comisionesCobradas, setComisionesCobradas, comisionEstado, setComisionEstado }: {
  contacts: Record<string, ContactInfo>;
  comisionesCobradas: Record<string, number>;
  setComisionesCobradas: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  comisionEstado: Record<string, boolean>;
  setComisionEstado: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  const { snapshot } = usePortfolioStore();
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [comisionEstadoRetiro, setComisionEstadoRetiro] = useState<Record<string, boolean>>(() => {
    const raw = localStorage.getItem('portfolio-comision-estado-retiro');
    if (raw) {
      try {
        return JSON.parse(raw) as Record<string, boolean>;
      } catch (e) {
        console.warn('Failed to parse comision estado retiro', e);
      }
    }
    return {};
  });

  useEffect(() => {
    localStorage.setItem('portfolio-comision-estado-retiro', JSON.stringify(comisionEstadoRetiro));
  }, [comisionEstadoRetiro]);

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    return `${d}.${m}.${y}`;
  };

  const clientStats = useMemo(() => {
    return CLIENTS.map((c) => {
      const rows = snapshot.clientRowsById[c.id] || [];
      const yearRows = rows.filter((r) => r.iso.startsWith(`${YEAR}-`));
      const incrementos = yearRows.reduce((s, r) => s + (r.increment || 0), 0);
      const decrementos = yearRows.reduce((s, r) => s + (r.decrement || 0), 0);
      const validRows = [...yearRows].reverse();
      const lastWithFinal = validRows.find((r) => r.finalBalance !== undefined && r.finalBalance > 0);
      const lastWithBase = validRows.find((r) => r.baseBalance !== undefined && r.baseBalance > 0);
      const saldo = lastWithFinal?.finalBalance ?? lastWithBase?.baseBalance ?? 0;

      const beneficioTotal = saldo + decrementos - incrementos;
      const beneficioRetirado = Math.max(0, decrementos - incrementos);
      const comisionRetirada = beneficioRetirado * 0.05;
      // Comisión si retira hoy: 5% del beneficio total, solo si es positivo (ya recuperó capital)
      const comisionSiRetiraHoy = beneficioTotal > 0 ? beneficioTotal * 0.05 : 0;

      const comisionGenerada = comisionRetirada;
      const estadoCobrada = comisionEstado[c.id] ?? false;

      const lastDecrement = validRows.find((r) => (r.decrement || 0) > 0);
      const fechaDecremento = lastDecrement?.iso ?? '';

      // Retiros individuales con estado
      let cumInc = 0;
      let cumDec = 0;
      const retiros = yearRows
        .slice()
        .sort((a, b) => (a.iso > b.iso ? 1 : -1))
        .flatMap((r) => {
          if (r.increment) cumInc += r.increment;
          if (r.decrement) {
            const prevOver = Math.max(0, cumDec - cumInc);
            cumDec += r.decrement;
            const newOver = Math.max(0, cumDec - cumInc);
            const commissionPortion = Math.max(0, newOver - prevOver);
            const commission = commissionPortion * 0.05;
            const key = `${c.id}-${r.iso}`;
            return [{
              key,
              iso: r.iso,
              retiro: r.decrement,
              comision: commission,
              estado: comisionEstadoRetiro[key] ?? false
            }];
          }
          return [];
        });

      const comisionPendiente = retiros.reduce((s, r) => s + (r.estado ? 0 : r.comision), 0);

      const ct = contacts[c.id];
      const displayName = ct && (ct.name || ct.surname) ? `${c.name} - ${ct.name} ${ct.surname}`.trim() : c.name;

      return {
        id: c.id,
        name: displayName,
        incrementos,
        decrementos,
        saldo,
        beneficioTotal,
        comisionGenerada,
        comisionSiRetiraHoy,
        comisionPendiente,
        estadoCobrada,
        fechaDecremento,
        retiros
      };
    });
  }, [snapshot, contacts, comisionEstado, comisionEstadoRetiro]);

  const totals = useMemo(() => {
    const comisionAcumuladaTotal = clientStats.reduce((s, c) => s + c.comisionGenerada, 0);
    const comisionSiTodosRetiranHoy = clientStats.reduce((s, c) => s + c.comisionSiRetiraHoy, 0);
    const totalPendiente = clientStats.reduce((s, c) => s + c.comisionPendiente, 0);
    const totalBeneficio = clientStats.reduce((s, c) => s + c.beneficioTotal, 0);
    return { comisionAcumuladaTotal, comisionSiTodosRetiranHoy, totalPendiente, totalBeneficio };
  }, [clientStats]);

  const toggleEstado = (clientId: string, val: boolean) => {
    setComisionEstado((prev) => ({ ...prev, [clientId]: val }));
    window.dispatchEvent(new CustomEvent('show-toast', { detail: val ? 'Marcado como cobrada' : 'Marcado como pendiente' }));
  };

  const toggleEstadoRetiro = (key: string, val: boolean) => {
    setComisionEstadoRetiro((prev) => ({ ...prev, [key]: val }));
    window.dispatchEvent(new CustomEvent('show-toast', { detail: val ? 'Cobro marcado' : 'Pendiente' }));
  };

  return (
    <div className="comisiones-container fade-in">
      {/* Header premium */}
      <div className="comisiones-header glass-card">
        <div className="comisiones-header-content">
          <div className="eyebrow">Panel de Comisiones</div>
          <h1>Gestión de Comisiones</h1>
          <p className="hero-copy">Control y seguimiento de comisiones del 5% sobre beneficios</p>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="comisiones-kpis">
        <div className="kpi-card-large">
          <div className="kpi-icon">💰</div>
          <div className="kpi-content">
            <span className="kpi-label">Comisión total generada</span>
            <span className="kpi-value-large">{formatCurrency(totals.comisionAcumuladaTotal)}</span>
            <span className="kpi-subtitle">5% sobre beneficios retirados</span>
          </div>
        </div>
        <div className="kpi-card-large warning">
          <div className="kpi-icon">⏳</div>
          <div className="kpi-content">
            <span className="kpi-label">Comisión pendiente</span>
            <span className="kpi-value-large">{formatCurrency(totals.totalPendiente)}</span>
            <span className="kpi-subtitle">Por cobrar de retiros realizados</span>
          </div>
        </div>
      </div>

      {/* Tabla con expandible por cliente */}
      <div className="comisiones-table-card glass-card">
        <div className="comisiones-table-header">
          <h3>Detalle por cliente</h3>
          <span className="badge-soft">{clientStats.length} clientes</span>
        </div>
        <div className="table-scroll" style={{ maxHeight: 520 }}>
          <table className="data-table comisiones-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="text-right">Invertido</th>
                <th className="text-right">Retirado</th>
                <th className="text-right">Saldo actual</th>
                <th className="text-right">Beneficio</th>
                <th className="text-right">Comisión cobrada</th>
                <th className="text-right">Si retira hoy</th>
                <th className="text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {clientStats.map((c) => (
                <React.Fragment key={c.id}>
                  <tr
                    className={clsx(c.comisionPendiente > 0 ? 'row-pending' : '', openRow === c.id && 'row-open')}
                    onClick={() => setOpenRow((prev) => (prev === c.id ? null : c.id))}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="client-name">{c.name}</td>
                    <td className="text-right">{formatCurrency(c.incrementos)}</td>
                    <td className="text-right">{formatCurrency(c.decrementos)}</td>
                    <td className="text-right font-semibold">{formatCurrency(c.saldo)}</td>
                    <td className={clsx('text-right font-semibold', c.beneficioTotal >= 0 ? 'positive' : 'negative')}>
                      {formatCurrency(c.beneficioTotal)}
                    </td>
                    <td className="text-right">{formatCurrency(c.comisionGenerada)}</td>
                    <td className="text-right">{formatCurrency(c.comisionSiRetiraHoy)}</td>
                    <td className="text-center">
                      {c.comisionPendiente > 0 ? (
                        <span className="status-badge pending">{formatCurrency(c.comisionPendiente)}</span>
                      ) : (
                        <span className="status-badge paid">✓ Cobrada</span>
                      )}
                    </td>
                  </tr>
                  {openRow === c.id && (
                    <tr className="detail-row" onClick={(e) => e.stopPropagation()}>
                      <td colSpan={8}>
                        <div className="detail-panel">
                          <div className="detail-info">
                            <div className="eyebrow">Detalle de comisión</div>
                            <div className="detail-summary">
                              <div className="summary-item">
                                <span className="label">Comisión generada</span>
                                <span className="value">{formatCurrency(c.comisionGenerada)}</span>
                              </div>
                              <div className="summary-item">
                                <span className="label">Si retira hoy</span>
                                <span className="value">{formatCurrency(c.comisionSiRetiraHoy)}</span>
                              </div>
                            </div>
                            {c.retiros.length > 0 && (
                              <div className="retiros-list">
                                <table className="retiros-table">
                                  <thead>
                                    <tr>
                                      <th>Fecha</th>
                                      <th className="text-right">Retirado</th>
                                      <th className="text-right">Comisión (5%)</th>
                                      <th className="text-center">Estado</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {c.retiros.map((r) => (
                                      <tr key={r.key}>
                                        <td>{formatDate(r.iso)}</td>
                                        <td className="text-right">{formatCurrency(r.retiro)}</td>
                                        <td className="text-right">{formatCurrency(r.comision)}</td>
                                        <td className="text-center">
                                          <button
                                            className={`btn-estado ${r.estado ? 'cobrada' : 'pendiente'}`}
                                            onClick={() => toggleEstadoRetiro(r.key, !r.estado)}
                                          >
                                            {r.estado ? '✓ Cobrada' : 'Pendiente'}
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td className="font-semibold">TOTALES</td>
                <td className="text-right font-semibold">{formatCurrency(clientStats.reduce((s, c) => s + c.incrementos, 0))}</td>
                <td className="text-right font-semibold">{formatCurrency(clientStats.reduce((s, c) => s + c.decrementos, 0))}</td>
                <td className="text-right font-semibold">{formatCurrency(clientStats.reduce((s, c) => s + c.saldo, 0))}</td>
                <td className="text-right font-semibold">{formatCurrency(totals.totalBeneficio)}</td>
                <td className="text-right font-semibold">{formatCurrency(totals.comisionAcumuladaTotal)}</td>
                <td className="text-right font-semibold">{formatCurrency(totals.comisionSiTodosRetiranHoy)}</td>
                <td className="text-center font-semibold">
                  {totals.totalPendiente > 0 ? (
                    <span className="status-badge pending">{formatCurrency(totals.totalPendiente)}</span>
                  ) : (
                    <span className="status-badge paid">✓</span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
