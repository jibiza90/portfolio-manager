import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './PrismaBridgeReportPage.css';

interface PrismaPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface PrismaBridgeReportPageProps {
  report: ReportData;
  pendingCashMovements?: PrismaPendingMovement[];
  rootRef?: React.RefObject<HTMLDivElement>;
  onDownload?: () => void | Promise<void>;
  onPeriodChange?: (startMonth: string, endMonth: string, isAll: boolean) => void;
  onAnalyticsEvent?: (event: {
    type: string;
    label: string;
    durationMs?: number;
    metadata?: Record<string, string | number | boolean>;
  }) => void;
}

interface PrismaMonth {
  key: string;
  label: string;
  shortLabel: string;
  opening: number;
  balance: number;
  profit: number;
  returnPct: number;
  increments: number;
  decrements: number;
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
}

type PeriodPreset = '3m' | '6m' | '12m' | 'all' | 'custom';

const monthNumbers: Record<string, number> = {
  ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2,
  abr: 3, abril: 3, may: 4, mayo: 4, jun: 5, junio: 5,
  jul: 6, julio: 6, ago: 7, agosto: 7, sep: 8, sept: 8,
  septiembre: 8, oct: 9, octubre: 9, nov: 10, noviembre: 10,
  dic: 11, diciembre: 11
};

const monthToKey = (value: string) => {
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  const parts = value.trim().toLowerCase().split(/\s+/);
  const month = monthNumbers[parts[0]];
  const year = Number(parts[parts.length - 1]);
  if (month === undefined || !Number.isFinite(year)) return value;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
};

const monthLabel = (key: string, short = false) => {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  const label = new Date(year, month - 1, 1).toLocaleDateString('es-ES', {
    month: short ? 'short' : 'long',
    year: short ? '2-digit' : 'numeric'
  }).replace('.', '').replace(' de ', ' ');
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
};

const dateLabel = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString('es-ES');
};

const signedMoney = (value: number) => {
  if (Math.abs(value) < 0.005) return formatCurrency(0);
  return `${value > 0 ? '+' : '−'}${formatCurrency(Math.abs(value))}`;
};

const signedPercent = (value: number) => {
  if (Math.abs(value) < 0.005) return '0,00 %';
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} %`;
};

const compactMoney = (value: number) => {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} M EUR`;
  if (absolute >= 1_000) return `${(value / 1_000).toLocaleString('es-ES', { maximumFractionDigits: 0 })} k EUR`;
  return `${Math.round(value).toLocaleString('es-ES')} EUR`;
};

const tone = (value: number) => value > 0.005 ? 'is-positive' : value < -0.005 ? 'is-negative' : 'is-neutral';

const sumByType = (movements: Array<{ type: string; amount: number }>, type: 'increment' | 'decrement') =>
  movements.filter((movement) => movement.type === type).reduce((sum, movement) => sum + movement.amount, 0);

const monthEndDay = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month, 0).getDate();
};

const nearlyEqual = (left: number, right: number) => Math.abs(left - right) < 0.01;

const niceDomain = (values: number[]) => {
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const range = Math.max(1, maximum - minimum);
  const rough = range / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  return {
    min: Math.floor(minimum / step) * step,
    max: Math.ceil(maximum / step) * step || step,
    step
  };
};

const PrismaHow: React.FC<{
  id: string;
  openId: string | null;
  onOpen: (id: string | null) => void;
  children: React.ReactNode;
}> = ({ id, openId, onOpen, children }) => (
  <details
    className="prisma-how"
    open={openId === id}
    onToggle={(event) => {
      const isOpen = event.currentTarget.open;
      if (isOpen && openId !== id) onOpen(id);
      if (!isOpen && openId === id) onOpen(null);
    }}
  >
    <summary>Cómo se calcula</summary>
    <div>{children}</div>
  </details>
);

const TrancheTimeline: React.FC<{ month: PrismaMonth }> = ({ month }) => {
  const breakdown = month.breakdown;
  if (!breakdown) return <p className="prisma-no-breakdown">Este mes no tiene desglose intrames publicado.</p>;

  const rows = 1 + breakdown.contributions.length + (breakdown.withdrawals?.length ?? 0);
  const height = 42 + rows * 34;
  const days = monthEndDay(month.key);
  const x = (day: number) => 190 + ((day - 1) / Math.max(1, days - 1)) * 710;
  const dateDay = (iso: string) => Math.min(days, Math.max(1, Number(iso.slice(8, 10)) || 1));
  const displayedOpening = breakdown.openingCapital ?? breakdown.initialCapital;

  const lines: Array<{
    label: string;
    start: number;
    end: number;
    className: string;
    value: string;
    title: string;
  }> = [{
    label: 'Posición inicial',
    start: 190,
    end: 900,
    className: 'is-opening',
    value: `${signedPercent(breakdown.initialReturnPct * 100)} · ${signedMoney(breakdown.initialProfit)}`,
    title: `Invertido del 01/${month.key.slice(5, 7)} al ${days}/${month.key.slice(5, 7)} · ${days} días`
  }];

  breakdown.contributions.forEach((item) => {
    const day = dateDay(item.iso);
    lines.push({
      label: `Aportación ${item.iso.slice(8, 10)}/${item.iso.slice(5, 7)}`,
      start: x(day),
      end: 900,
      className: 'is-contribution',
      value: `${signedPercent(item.returnPct * 100)} · ${signedMoney(item.profit)}`,
      title: `Invertido del ${dateLabel(item.iso)} al ${days}/${month.key.slice(5, 7)} · ${days - day + 1} días`
    });
  });

  (breakdown.withdrawals ?? []).forEach((item) => {
    const day = dateDay(item.iso);
    lines.push({
      label: `Retirada ${item.iso.slice(8, 10)}/${item.iso.slice(5, 7)}`,
      start: 190,
      end: x(day),
      className: 'is-withdrawal',
      value: `${item.returnPct === undefined ? '—' : signedPercent(item.returnPct * 100)} · ${signedMoney(item.profit)}`,
      title: `Invertido del 01/${month.key.slice(5, 7)} al ${dateLabel(item.iso)} · ${day} días`
    });
  });

  return (
    <div className="prisma-tranches">
      <div className="prisma-tranche-head">
        <div>
          <span>Capital al inicio del mes</span>
          <strong>{formatCurrency(displayedOpening)}</strong>
        </div>
        <p>La longitud de cada barra indica únicamente el tiempo que el capital estuvo invertido.</p>
      </div>
      <svg viewBox={`0 0 940 ${height}`} role="img" aria-label={`Tramos de inversión de ${month.label}`}>
        {lines.map((line, index) => {
          const y = 14 + index * 34;
          return (
            <g key={`${line.label}-${index}`} className={`prisma-tranche-line ${line.className}`}>
              <title>{line.title}</title>
              <text x="176" y={y + 13} textAnchor="end">{line.label}</text>
              <rect x={line.start} y={y} width={Math.max(4, line.end - line.start)} height="16" rx="4" />
              {line.className === 'is-withdrawal' ? (
                <line x1={line.end} x2="900" y1={y + 8} y2={y + 8} className="prisma-tranche-dash" />
              ) : null}
              <text x="912" y={y + 13} className="prisma-tranche-value">{line.value}</text>
            </g>
          );
        })}
        <line x1="190" x2="900" y1={height - 22} y2={height - 22} className="prisma-day-axis" />
        {[1, 10, 20, days].filter((day, index, array) => array.indexOf(day) === index && day <= days).map((day) => (
          <g key={day}>
            <line x1={x(day)} x2={x(day)} y1={height - 26} y2={height - 18} className="prisma-day-mark" />
            <text x={x(day)} y={height - 5} textAnchor="middle" className="prisma-day-label">Día {day}</text>
          </g>
        ))}
      </svg>
      <table className="prisma-tranche-table">
        <thead><tr><th>Concepto</th><th>Capital</th><th>Rentabilidad</th><th>Resultado</th></tr></thead>
        <tbody>
          <tr>
            <td>Posición inicial del mes</td><td>{formatCurrency(displayedOpening)}</td>
            <td>{signedPercent(breakdown.initialReturnPct * 100)}</td><td>{signedMoney(breakdown.initialProfit)}</td>
          </tr>
          {breakdown.contributions.map((item) => (
            <tr key={`inc-${item.iso}`}>
              <td>Aportación incorporada el {dateLabel(item.iso)}</td><td>{formatCurrency(item.amount)}</td>
              <td>{signedPercent(item.returnPct * 100)}</td><td>{signedMoney(item.profit)}</td>
            </tr>
          ))}
          {(breakdown.withdrawals ?? []).map((item) => (
            <tr key={`dec-${item.iso}`}>
              <td>Capital retirado el {dateLabel(item.iso)}</td><td>{formatCurrency(item.amount)}</td>
              <td>{item.returnPct === undefined ? '—' : signedPercent(item.returnPct * 100)}</td><td>{signedMoney(item.profit)}</td>
            </tr>
          ))}
          <tr className="is-total"><td>Resultado explicado</td><td>—</td><td>—</td><td>{signedMoney(breakdown.totalProfit)}</td></tr>
        </tbody>
      </table>
      <div className={`prisma-reconciliation ${nearlyEqual(breakdown.totalProfit, month.profit) ? 'is-sealed' : 'is-warning'}`}>
        {nearlyEqual(breakdown.totalProfit, month.profit)
          ? 'El desglose cuadra con el resultado publicado.'
          : `Diferencia de conciliación: ${signedMoney(month.profit - breakdown.totalProfit)}.`}
      </div>
    </div>
  );
};

export const PrismaBridgeReportPage: React.FC<PrismaBridgeReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onDownload,
  onPeriodChange,
  onAnalyticsEvent
}) => {
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLElement>(null);
  const pending = useMemo(() => pendingCashMovements
    .filter((movement) => Number.isFinite(movement.amount) && movement.amount > 0)
    .sort((left, right) => left.iso.localeCompare(right.iso)), [pendingCashMovements]);
  const pendingIncrements = sumByType(pending, 'increment');
  const pendingDecrements = sumByType(pending, 'decrement');
  const visibleBalance = report.saldo + pendingIncrements - pendingDecrements;
  const visibleContributed = report.incrementos + pendingIncrements;
  const visibleWithdrawn = report.decrementos + pendingDecrements;
  const publishedNetCapital = report.incrementos - report.decrementos;
  const visibleNetCapital = visibleContributed - visibleWithdrawn;
  const twrPct = (report.twrYtd ?? 0) * 100;

  const months = useMemo<PrismaMonth[]>(() => {
    const balances = new Map(report.patrimonioEvolution
      .filter((entry) => entry.hasData && Number.isFinite(entry.balance))
      .map((entry) => [monthToKey(entry.month), Number(entry.balance)]));
    const breakdowns = new Map((report.contributionBreakdowns ?? []).map((item) => [monthToKey(item.month), item]));
    const valid = report.monthlyStats
      .filter((item) => item.hasData)
      .map((item) => ({ ...item, key: monthToKey(item.month) }))
      .sort((left, right) => left.key.localeCompare(right.key));

    return valid.map((item, index) => {
      const monthMovements = report.movements.filter((movement) => movement.iso.slice(0, 7) === item.key);
      const increments = sumByType(monthMovements, 'increment');
      const decrements = sumByType(monthMovements, 'decrement');
      const balance = balances.get(item.key) ?? item.endBalance;
      const previousBalance = index > 0 ? (balances.get(valid[index - 1].key) ?? valid[index - 1].endBalance) : undefined;
      const opening = previousBalance ?? balance - item.profit - increments + decrements;
      const isLatest = index === valid.length - 1;
      return {
        key: item.key,
        label: monthLabel(item.key),
        shortLabel: monthLabel(item.key, true),
        opening,
        balance,
        profit: item.profit,
        returnPct: isLatest ? report.rentabilidadUltimoMes : item.profitPct,
        increments,
        decrements,
        breakdown: breakdowns.get(item.key)
      };
    });
  }, [report]);

  const [period, setPeriod] = useState<PeriodPreset>('all');
  const [customStart, setCustomStart] = useState(months[0]?.key ?? '');
  const [customEnd, setCustomEnd] = useState(months[months.length - 1]?.key ?? '');
  const [focusKey, setFocusKey] = useState(months[months.length - 1]?.key ?? '');
  const [openHow, setOpenHow] = useState<string | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [yearsOpen, setYearsOpen] = useState(false);
  const [annualFocusMonth, setAnnualFocusMonth] = useState(12);

  useEffect(() => {
    if (!months.some((month) => month.key === focusKey)) setFocusKey(months[months.length - 1]?.key ?? '');
  }, [focusKey, months]);

  const visibleMonths = useMemo(() => {
    if (period === 'all') return months;
    if (period === 'custom') return months.filter((month) => month.key >= customStart && month.key <= customEnd);
    const count = period === '3m' ? 3 : period === '6m' ? 6 : 12;
    return months.slice(-count);
  }, [customEnd, customStart, months, period]);

  useEffect(() => {
    const start = visibleMonths[0]?.key ?? '';
    const end = visibleMonths[visibleMonths.length - 1]?.key ?? '';
    onPeriodChange?.(start, end, period === 'all');
  }, [onPeriodChange, period, visibleMonths]);

  useEffect(() => {
    const latest = visibleMonths[visibleMonths.length - 1];
    if (latest && !visibleMonths.some((month) => month.key === focusKey)) setFocusKey(latest.key);
  }, [focusKey, visibleMonths]);

  useEffect(() => {
    const element = chartScrollRef.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [period, visibleMonths.length]);

  const focused = visibleMonths.find((month) => month.key === focusKey) ?? visibleMonths[visibleMonths.length - 1] ?? months[months.length - 1];
  const lastMonth = months[months.length - 1];
  const hasPending = pending.length > 0;
  const publishedReturnAvailable = report.rentabilidadDisponible !== false && publishedNetCapital > 0;
  const capitalShare = Math.max(0, visibleNetCapital);
  const benefitShare = Math.max(0, report.beneficioTotal);
  const compositionTotal = Math.max(1, capitalShare + benefitShare);

  const updatePeriod = (next: PeriodPreset) => {
    setPeriod(next);
    onAnalyticsEvent?.({ type: 'report_period_change', label: `PRISMA ${next}` });
  };

  const chart = useMemo(() => {
    if (visibleMonths.length === 0) return null;
    const pendingCount = hasPending ? 1 : 0;
    const width = Math.max(1420, (visibleMonths.length + 2 + pendingCount) * 102);
    const height = 500;
    const left = 96;
    const right = 44;
    const top = 48;
    const bottom = 72;
    const plotHeight = height - top - bottom;
    const startBalance = visibleMonths[0].opening;
    const values = [0, startBalance, ...visibleMonths.flatMap((month) => [month.opening, month.balance])];
    if (hasPending) values.push(visibleBalance);
    const domain = niceDomain(values);
    const y = (value: number) => top + ((domain.max - value) / Math.max(1, domain.max - domain.min)) * plotHeight;
    const entryCount = visibleMonths.length + 2 + pendingCount;
    const step = (width - left - right) / entryCount;
    const barWidth = Math.min(54, step * 0.58);
    const startX = left + step * 0.5;
    const monthX = (index: number) => left + step * (index + 1.5);
    const pendingX = left + step * (visibleMonths.length + 1.5);
    const finalX = left + step * (visibleMonths.length + 1.5 + pendingCount);
    const ticks: number[] = [];
    for (let value = domain.min; value <= domain.max + domain.step / 2; value += domain.step) ticks.push(value);
    return { width, height, top, bottom, y, ticks, startBalance, step, barWidth, startX, monthX, pendingX, finalX };
  }, [hasPending, visibleBalance, visibleMonths]);

  const years = useMemo(() => {
    const grouped = new Map<number, PrismaMonth[]>();
    months.forEach((month) => {
      const year = Number(month.key.slice(0, 4));
      grouped.set(year, [...(grouped.get(year) ?? []), month]);
    });
    return [...grouped.entries()].sort(([left], [right]) => left - right).map(([year, entries]) => {
      let factor = 1;
      const series = Array.from({ length: 12 }, (_, index) => {
        const entry = entries.find((item) => Number(item.key.slice(5, 7)) === index + 1);
        if (entry) factor *= 1 + entry.returnPct / 100;
        return entry ? (factor - 1) * 100 : null;
      });
      return { year, entries, series, total: (factor - 1) * 100 };
    });
  }, [months]);

  const annualChart = useMemo(() => {
    if (years.length < 2) return null;
    const values = years.flatMap((year) => year.series.filter((value): value is number => value !== null));
    const maximum = Math.max(1, ...values.map((value) => Math.abs(value))) * 1.12;
    const colors = ['#CBD5E1', '#64748B', '#0F172A', '#3B4CF0'];
    const x = (monthIndex: number) => 72 + monthIndex * (858 / 11);
    const y = (value: number) => 24 + ((maximum - value) / (2 * maximum)) * 272;
    const paths = years.map((year, index) => {
      const points = year.series.map((value, monthIndex) => value === null ? null : { x: x(monthIndex), y: y(value) }).filter((point): point is { x: number; y: number } => point !== null);
      return {
        ...year,
        color: colors[Math.max(0, colors.length - years.length + index)] ?? '#CBD5E1',
        path: points.map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' '),
        points
      };
    });
    return { maximum, x, y, paths };
  }, [years]);

  const latestYear = years[years.length - 1];
  const previousYear = years[years.length - 2];
  const comparisonMonth = Math.max(1, lastMonth ? Number(lastMonth.key.slice(5, 7)) : 12);
  const latestAtMonth = latestYear?.series[comparisonMonth - 1] ?? latestYear?.total ?? 0;
  const previousAtMonth = previousYear?.series[comparisonMonth - 1] ?? previousYear?.total ?? 0;
  const movementRows = report.movements.filter((movement) => {
    const key = movement.iso.slice(0, 7);
    return visibleMonths.some((month) => month.key === key);
  });

  const focusCalculated = focused ? focused.opening + focused.increments - focused.decrements + focused.profit : 0;
  const focusDifference = focused ? focused.balance - focusCalculated : 0;

  return (
    <article className="prisma-root" ref={rootRef}>
      <header className="prisma-top">
        <div className="prisma-brand"><span>P</span><div><strong>PRISMA</strong><small>El puente de su patrimonio</small></div></div>
        <div className="prisma-top-actions">
          <span>{report.clientCode}</span>
          <button type="button" onClick={() => { onAnalyticsEvent?.({ type: 'report_download', label: 'PRISMA PDF' }); void onDownload?.(); }}>Descargar PDF</button>
        </div>
      </header>

      <section className="prisma-hero" aria-labelledby="prisma-balance-title">
        <div className="prisma-balance-card">
          <p id="prisma-balance-title">Saldo hoy</p>
          <strong>{formatCurrency(visibleBalance)}</strong>
          <div className="prisma-composition" aria-label="Composición entre capital neto y beneficio">
            <span className="is-capital" style={{ width: `${capitalShare / compositionTotal * 100}%` }} />
            <span className="is-benefit" style={{ width: `${benefitShare / compositionTotal * 100}%` }} />
          </div>
          <div className="prisma-composition-labels"><span>Capital neto {formatCurrency(visibleNetCapital)}</span><span>Beneficio {signedMoney(report.beneficioTotal)}</span></div>
          <PrismaHow id="balance" openId={openHow} onOpen={setOpenHow}>
            {hasPending
              ? <p>{formatCurrency(report.saldo)} + {formatCurrency(pendingIncrements)} − {formatCurrency(pendingDecrements)} = <strong>{formatCurrency(visibleBalance)}</strong></p>
              : <p>Saldo del último cierre publicado: <strong>{formatCurrency(report.saldo)}</strong></p>}
          </PrismaHow>
        </div>
        <div className="prisma-month-pulse">
          <span>Último mes publicado</span>
          <strong>{lastMonth?.label ?? 'Sin cierre'}</strong>
          <b className={tone(report.rentabilidadUltimoMes)}>{signedPercent(report.rentabilidadUltimoMes)}</b>
          <em>{signedMoney(report.beneficioUltimoMes)}</em>
          <PrismaHow id="latest" openId={openHow} onOpen={setOpenHow}>
            <p>Rentabilidad TWR publicada del mes. Si hubo movimientos intrames, cada tramo se explica en el detalle mensual.</p>
          </PrismaHow>
        </div>
        <div className="prisma-kpi-grid">
          <div><span>Capital aportado</span><strong>{formatCurrency(visibleContributed)}</strong><PrismaHow id="contributed" openId={openHow} onOpen={setOpenHow}><p>Aportaciones publicadas {formatCurrency(report.incrementos)} + posteriores {formatCurrency(pendingIncrements)} = <strong>{formatCurrency(visibleContributed)}</strong></p></PrismaHow></div>
          <div><span>Capital retirado</span><strong>{formatCurrency(visibleWithdrawn)}</strong><PrismaHow id="withdrawn" openId={openHow} onOpen={setOpenHow}><p>Retiradas publicadas {formatCurrency(report.decrementos)} + posteriores {formatCurrency(pendingDecrements)} = <strong>{formatCurrency(visibleWithdrawn)}</strong></p></PrismaHow></div>
          <div><span>Capital neto</span><strong>{formatCurrency(visibleNetCapital)}</strong><PrismaHow id="net" openId={openHow} onOpen={setOpenHow}><p>{formatCurrency(visibleContributed)} − {formatCurrency(visibleWithdrawn)} = <strong>{formatCurrency(visibleNetCapital)}</strong></p></PrismaHow></div>
          <div><span>Beneficio acumulado</span><strong className={tone(report.beneficioTotal)}>{signedMoney(report.beneficioTotal)}</strong><PrismaHow id="profit" openId={openHow} onOpen={setOpenHow}><p>{formatCurrency(report.saldo)} + {formatCurrency(report.decrementos)} − {formatCurrency(report.incrementos)} = <strong>{signedMoney(report.beneficioTotal)}</strong></p></PrismaHow></div>
          <div><span>Rentabilidad total</span><strong className={tone(report.rentabilidad)}>{publishedReturnAvailable ? signedPercent(report.rentabilidad) : 'No aplicable'}</strong><PrismaHow id="return" openId={openHow} onOpen={setOpenHow}>{publishedReturnAvailable ? <p>{signedMoney(report.beneficioTotal)} ÷ {formatCurrency(publishedNetCapital)} = <strong>{signedPercent(report.rentabilidad)}</strong></p> : <p>Se calcula cuando el capital neto aportado es positivo.</p>}</PrismaHow></div>
          <div><span>TWR acumulado</span><strong className={tone(twrPct)}>{signedPercent(twrPct)}</strong><PrismaHow id="twr" openId={openHow} onOpen={setOpenHow}><p>Valor oficial publicado. Encadena los periodos de inversión y neutraliza el efecto de aportaciones y retiradas.</p></PrismaHow></div>
        </div>
      </section>

      {hasPending ? (
        <section className="prisma-pending">
          <div><span>EN TRÁNSITO</span><strong>Actualización de capital</strong><p>Movimientos posteriores al último cierre publicado. La rentabilidad se incorporará cuando se publique el siguiente cierre.</p></div>
          <ul>{pending.map((movement) => <li key={`${movement.iso}-${movement.type}-${movement.amount}`}><span>{dateLabel(movement.iso)}</span><b>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</b><strong>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong></li>)}</ul>
        </section>
      ) : null}

      <section className="prisma-controls" aria-label="Periodo del informe">
        <div><strong>Periodo</strong><span>Afecta al puente, detalle, tabla y movimientos</span></div>
        <div className="prisma-period-buttons">
          {(['3m', '6m', '12m', 'all', 'custom'] as PeriodPreset[]).map((item) => (
            <button key={item} type="button" className={period === item ? 'is-active' : ''} aria-pressed={period === item} onClick={() => updatePeriod(item)}>
              {item === '3m' ? '3 meses' : item === '6m' ? '6 meses' : item === '12m' ? '12 meses' : item === 'all' ? 'Todo' : 'Personalizado'}
            </button>
          ))}
        </div>
        {period === 'custom' ? <div className="prisma-custom-period"><label>Desde<select value={customStart} onChange={(event) => setCustomStart(event.target.value)}>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label><label>Hasta<select value={customEnd} onChange={(event) => setCustomEnd(event.target.value)}>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label></div> : null}
      </section>

      <section className="prisma-bridge" aria-labelledby="prisma-bridge-title">
        <div className="prisma-section-head"><div><span>IDENTIDAD CONTABLE</span><h2 id="prisma-bridge-title">El puente de su patrimonio</h2><p>Cada cierre enlaza el capital, los movimientos y el resultado de gestión.</p></div><div className="prisma-legend"><span><i className="is-positive" />Subida</span><span><i className="is-negative" />Bajada</span><span><i className="is-flow" />Movimiento</span></div></div>
        <div className="prisma-chart-scroll" ref={chartScrollRef}>
          {chart ? (
            <svg className="prisma-waterfall" width={chart.width} height={chart.height} viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Puente mensual de evolución del patrimonio" tabIndex={0} onKeyDown={(event) => {
              const index = visibleMonths.findIndex((month) => month.key === focusKey);
              if (event.key === 'ArrowLeft') setFocusKey(visibleMonths[Math.max(0, index - 1)]?.key ?? focusKey);
              if (event.key === 'ArrowRight') setFocusKey(visibleMonths[Math.min(visibleMonths.length - 1, index + 1)]?.key ?? focusKey);
              if (event.key === 'Home') setFocusKey(visibleMonths[0]?.key ?? focusKey);
              if (event.key === 'End') setFocusKey(visibleMonths[visibleMonths.length - 1]?.key ?? focusKey);
              if (event.key === 'Enter') tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}>
              {chart.ticks.map((tick) => <g key={tick}><line x1="88" x2={chart.width - 34} y1={chart.y(tick)} y2={chart.y(tick)} className="prisma-gridline" /><text x="78" y={chart.y(tick) + 4} textAnchor="end" className="prisma-axis-label">{compactMoney(tick)}</text></g>)}
              <g className="prisma-total-bar"><rect x={chart.startX - chart.barWidth / 2} y={chart.y(Math.max(0, chart.startBalance))} width={chart.barWidth} height={Math.max(2, Math.abs(chart.y(chart.startBalance) - chart.y(0)))} rx="6" /><text x={chart.startX} y={chart.y(chart.startBalance) - 12} textAnchor="middle">{compactMoney(chart.startBalance)}</text><text x={chart.startX} y={chart.height - 30} textAnchor="middle">Inicio</text></g>
              {visibleMonths.map((month, index) => {
                const x = chart.monthX(index);
                const previous = index === 0 ? chart.startBalance : visibleMonths[index - 1].balance;
                const topY = chart.y(Math.max(previous, month.balance));
                const bottomY = chart.y(Math.min(previous, month.balance));
                const delta = month.balance - previous;
                const nextX = index === visibleMonths.length - 1 ? (hasPending ? chart.pendingX : chart.finalX) : chart.monthX(index + 1);
                return <g key={month.key} className={`prisma-month-bar ${tone(delta)} ${focusKey === month.key ? 'is-focused' : ''}`} onMouseEnter={() => setFocusKey(month.key)} onClick={() => setFocusKey(month.key)}>
                  <line x1={x + chart.barWidth / 2} x2={nextX - chart.barWidth / 2} y1={chart.y(month.balance)} y2={chart.y(month.balance)} className="prisma-connector" />
                  <rect x={x - chart.barWidth / 2} y={topY} width={chart.barWidth} height={Math.max(3, bottomY - topY)} rx="5" />
                  <circle cx={x} cy={chart.y(month.balance)} r="5" />
                  {(month.increments > 0 || month.decrements > 0) ? <path d={`M ${x} ${chart.y(month.balance) + 11} l -6 8 h 12 z`} className="prisma-flow-marker" /> : null}
                  <text x={x} y={topY - 11} textAnchor="middle" className="prisma-bar-value">{signedMoney(delta)}</text>
                  <text x={x} y={chart.height - 30} textAnchor="middle" className="prisma-month-label">{month.shortLabel}</text>
                </g>;
              })}
              {hasPending ? <g className="prisma-pending-bar"><line x1={chart.pendingX + chart.barWidth / 2} x2={chart.finalX - chart.barWidth / 2} y1={chart.y(visibleBalance)} y2={chart.y(visibleBalance)} className="prisma-connector" /><rect x={chart.pendingX - chart.barWidth / 2} y={chart.y(Math.max(report.saldo, visibleBalance))} width={chart.barWidth} height={Math.max(3, Math.abs(chart.y(visibleBalance) - chart.y(report.saldo)))} rx="5" /><text x={chart.pendingX} y={chart.y(Math.max(report.saldo, visibleBalance)) - 11} textAnchor="middle">{signedMoney(visibleBalance - report.saldo)}</text><text x={chart.pendingX} y={chart.height - 30} textAnchor="middle">En tránsito</text></g> : null}
              <g className="prisma-total-bar is-final"><rect x={chart.finalX - chart.barWidth / 2} y={chart.y(Math.max(0, visibleBalance))} width={chart.barWidth} height={Math.max(2, Math.abs(chart.y(visibleBalance) - chart.y(0)))} rx="6" /><text x={chart.finalX} y={chart.y(visibleBalance) - 12} textAnchor="middle">{compactMoney(visibleBalance)}</text><text x={chart.finalX} y={chart.height - 30} textAnchor="middle">Hoy</text></g>
            </svg>
          ) : <p className="prisma-empty">Todavía no hay cierres publicados en este periodo.</p>}
        </div>
      </section>

      {focused ? <section className="prisma-focus" aria-live="polite">
        <div className="prisma-focus-title"><span>MES EN FOCO</span><strong>{focused.label}</strong></div>
        <dl><div><dt>Saldo inicial</dt><dd>{formatCurrency(focused.opening)}</dd></div><div><dt>Aportaciones</dt><dd>{formatCurrency(focused.increments)}</dd></div><div><dt>Retiradas</dt><dd>{formatCurrency(focused.decrements)}</dd></div><div><dt>Resultado</dt><dd className={tone(focused.profit)}>{signedMoney(focused.profit)}</dd></div><div><dt>Rentabilidad</dt><dd className={tone(focused.returnPct)}>{signedPercent(focused.returnPct)}</dd></div><div><dt>Saldo final</dt><dd>{formatCurrency(focused.balance)}</dd></div></dl>
        <p>En {focused.label} empezó con {formatCurrency(focused.opening)}{focused.increments > 0 ? `, aportó ${formatCurrency(focused.increments)}` : ''}{focused.decrements > 0 ? `, retiró ${formatCurrency(focused.decrements)}` : ''}, la gestión {focused.profit >= 0 ? 'generó' : 'registró'} {signedMoney(focused.profit)} ({signedPercent(focused.returnPct)}) y cerró con {formatCurrency(focused.balance)}.</p>
        <div className={`prisma-focus-equation ${nearlyEqual(focusCalculated, focused.balance) ? '' : 'is-warning'}`}><span>{formatCurrency(focused.opening)} + {formatCurrency(focused.increments)} − {formatCurrency(focused.decrements)} + {signedMoney(focused.profit)} = {formatCurrency(focusCalculated)}</span>{!nearlyEqual(focusCalculated, focused.balance) ? <b>Diferencia de conciliación: {signedMoney(focusDifference)}</b> : <b>Cuadra con el cierre publicado</b>}</div>
      </section> : null}

      <section className="prisma-table-section" ref={tableRef} aria-labelledby="prisma-table-title">
        <div className="prisma-section-head"><div><span>TRAZABILIDAD MENSUAL</span><h2 id="prisma-table-title">Cierres y composición del resultado</h2><p>Abra un mes para ver cuánto tiempo estuvo invertido cada tramo de capital.</p></div></div>
        <div className="prisma-table-wrap"><table className="prisma-month-table"><thead><tr><th aria-label="Abrir detalle" /><th>Mes</th><th>Saldo inicial</th><th>Aportaciones</th><th>Retiradas</th><th>Resultado</th><th>Rentabilidad</th><th>Saldo final</th></tr></thead><tbody>{visibleMonths.map((month) => <React.Fragment key={month.key}><tr className={expandedMonth === month.key ? 'is-open' : ''}><td><button type="button" aria-label={`${expandedMonth === month.key ? 'Ocultar' : 'Ver'} detalle de ${month.label}`} aria-expanded={expandedMonth === month.key} onClick={() => { setExpandedMonth((current) => current === month.key ? null : month.key); setFocusKey(month.key); }}>{expandedMonth === month.key ? '−' : '+'}</button></td><td><strong>{month.label}</strong>{month.breakdown ? <span>Con movimientos</span> : null}</td><td>{formatCurrency(month.opening)}</td><td>{month.increments ? `+${formatCurrency(month.increments)}` : '—'}</td><td>{month.decrements ? `−${formatCurrency(month.decrements)}` : '—'}</td><td className={tone(month.profit)}>{signedMoney(month.profit)}</td><td className={tone(month.returnPct)}>{signedPercent(month.returnPct)}</td><td><strong>{formatCurrency(month.balance)}</strong></td></tr>{expandedMonth === month.key ? <tr className="prisma-detail-row"><td colSpan={8}><TrancheTimeline month={month} /></td></tr> : null}</React.Fragment>)}</tbody></table></div>
      </section>

      {years.length >= 2 && annualChart ? <section className={`prisma-years ${yearsOpen ? 'is-open' : ''}`}>
        <button className="prisma-years-toggle" type="button" aria-expanded={yearsOpen} onClick={() => setYearsOpen((value) => !value)}><div><strong>Comparar años</strong><span>Historial completo · A {monthLabel(`2026-${String(comparisonMonth).padStart(2, '0')}`).split(' ')[0]}, {latestYear.year} acumula {signedPercent(latestAtMonth)} frente a {signedPercent(previousAtMonth)} de {previousYear.year}.</span></div><b>{yearsOpen ? 'Cerrar comparación' : 'Ver comparación'} <i>{yearsOpen ? '−' : '+'}</i></b></button>
        {yearsOpen ? <div className="prisma-years-body"><div className="prisma-years-chart"><h3>Evolución acumulada por año</h3><svg viewBox="0 0 1000 340" role="img" aria-label="Comparación de rentabilidad acumulada por año" tabIndex={0} onKeyDown={(event) => { if (event.key === 'ArrowLeft') setAnnualFocusMonth((value) => Math.max(1, value - 1)); if (event.key === 'ArrowRight') setAnnualFocusMonth((value) => Math.min(12, value + 1)); }}><line x1="72" x2="930" y1={annualChart.y(0)} y2={annualChart.y(0)} className="prisma-year-zero" />{Array.from({ length: 12 }, (_, index) => <g key={index}><line x1={annualChart.x(index)} x2={annualChart.x(index)} y1="24" y2="296" className={annualFocusMonth === index + 1 ? 'prisma-year-focus' : 'prisma-year-grid'} /><text x={annualChart.x(index)} y="322" textAnchor="middle">{monthLabel(`2026-${String(index + 1).padStart(2, '0')}`, true).split(' ')[0]}</text></g>)}{annualChart.paths.map((year) => <g key={year.year}><path d={year.path} fill="none" stroke={year.color} strokeWidth={year.year === latestYear.year ? 3 : 1.7} />{year.points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={annualFocusMonth === index + 1 ? 5 : 2.5} fill={year.color}><title>{year.year}: {signedPercent(year.series[index] ?? 0)}</title></circle>)}<text x={year.points[year.points.length - 1]?.x ?? 930} y={(year.points[year.points.length - 1]?.y ?? 0) - 8} fill={year.color} textAnchor="end">{year.year}</text></g>)}</svg></div><div className="prisma-calendar"><h3>Calendario mensual</h3><div className="prisma-calendar-scroll"><table><thead><tr><th>Año</th>{Array.from({ length: 12 }, (_, index) => <th key={index}>{monthLabel(`2026-${String(index + 1).padStart(2, '0')}`, true).split(' ')[0]}</th>)}<th>Total</th></tr></thead><tbody>{years.map((year) => <tr key={year.year}><th>{year.year}</th>{Array.from({ length: 12 }, (_, index) => { const entry = year.entries.find((item) => Number(item.key.slice(5, 7)) === index + 1); const intensity = entry ? Math.min(1, 0.08 + Math.abs(entry.returnPct) / 12) : 0; return <td key={index}><button type="button" disabled={!entry} className={entry ? tone(entry.returnPct) : ''} style={entry ? { backgroundColor: entry.returnPct >= 0 ? `rgba(59,76,240,${intensity})` : `rgba(180,35,24,${intensity})` } : undefined} onClick={() => setAnnualFocusMonth(index + 1)}>{entry ? signedPercent(entry.returnPct).replace(' %', '') : '—'}</button></td>;})}<td><strong title="Encadena las rentabilidades mensuales publicadas de este año, igual que el TWR.">{signedPercent(year.total)}</strong></td></tr>)}</tbody></table></div><p>Seleccione una celda para enfocar ese mes dentro de esta comparación.</p></div><p className="prisma-years-note">La rentabilidad anual encadenada es un dato derivado de los cierres mensuales publicados.</p></div> : null}
      </section> : null}

      <section className="prisma-movements" aria-labelledby="prisma-movements-title"><div className="prisma-section-head"><div><span>FLUJOS DE CAPITAL</span><h2 id="prisma-movements-title">Aportaciones y retiradas</h2><p>Movimientos registrados dentro del periodo seleccionado.</p></div></div><div className="prisma-table-wrap"><table><thead><tr><th>Fecha</th><th>Movimiento</th><th>Importe</th><th>Rentabilidad específica</th></tr></thead><tbody>{movementRows.length ? movementRows.map((movement, index) => <tr key={`${movement.iso}-${movement.type}-${index}`}><td>{dateLabel(movement.iso)}</td><td><span className={`prisma-movement-kind ${movement.type === 'increment' ? 'is-increment' : 'is-decrement'}`}>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</span></td><td className={movement.type === 'increment' ? 'is-increment' : 'is-decrement'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</td><td>{movement.returnPct === undefined ? '—' : signedPercent(movement.returnPct * 100)}</td></tr>) : <tr><td colSpan={4} className="prisma-empty-cell">No hay movimientos registrados en este periodo.</td></tr>}</tbody></table></div></section>

      <section className="prisma-method"><div><span>TWR</span><h2>Rentabilidad ponderada por el tiempo</h2><p>Mide la evolución de la cartera aislando el efecto de las aportaciones y retiradas. Permite conocer cómo se han comportado las inversiones durante el periodo, independientemente de cuándo entró o salió capital.</p><strong>Valor oficial publicado: {signedPercent(twrPct)}</strong></div><div><span>RENTABILIDAD TOTAL</span><h2>Resultado sobre el capital neto aportado</h2><p>Mide el resultado acumulado en relación con el capital neto aportado. Por este motivo, puede variar cuando se realizan nuevas aportaciones o retiradas de dinero.</p><strong>{publishedReturnAvailable ? signedPercent(report.rentabilidad) : 'No aplicable'}</strong></div></section>

      <footer className="prisma-footer"><div><strong>PRISMA</strong><span>Informe patrimonial · {report.clientCode}</span></div><p>Datos actualizados el {new Date(report.createdAt).toLocaleDateString('es-ES')} · Diseño Claude Fable 5.1</p></footer>
    </article>
  );
};
