import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './ConsultaReportPage.css';

interface ConsultaPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface ConsultaReportPageProps {
  report: ReportData;
  pendingCashMovements?: ConsultaPendingMovement[];
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

interface ConsultaMonth {
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

type QuestionKey = 'balance' | 'profit' | 'capital' | 'returns' | 'latest' | 'month' | 'contributions' | 'withdrawals' | 'evolution' | 'pending';
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
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
};

const compactMoney = (value: number) => {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} M €`;
  if (absolute >= 1_000) return `${(value / 1_000).toLocaleString('es-ES', { maximumFractionDigits: 0 })} k €`;
  return `${Math.round(value).toLocaleString('es-ES')} €`;
};

const niceAxisMaximum = (value: number) => {
  const safe = Math.max(1, value);
  const magnitude = 10 ** Math.floor(Math.log10(safe));
  const normalized = safe / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 1.5 ? 1.5 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
};

const tone = (value: number) => value > 0.005 ? 'is-positive' : value < -0.005 ? 'is-negative' : 'is-neutral';
const sumByType = (movements: Array<{ type: string; amount: number }>, type: 'increment' | 'decrement') =>
  movements.filter((movement) => movement.type === type).reduce((sum, movement) => sum + movement.amount, 0);
const nearlyEqual = (left: number, right: number) => Math.abs(left - right) < 0.01;

const Calculation: React.FC<{ children: React.ReactNode; note?: string }> = ({ children, note }) => (
  <details className="consulta-calculation">
    <summary>Cómo se calcula</summary>
    <div><div className="consulta-equation">{children}</div>{note ? <p>{note}</p> : null}</div>
  </details>
);

const CenteredResultBar: React.FC<{ value: number; maximum: number; label: string }> = ({ value, maximum, label }) => {
  const width = Math.min(45, Math.abs(value) / Math.max(1, maximum) * 45);
  return (
    <div className="consulta-result-figure" role="img" aria-label={`${label}: ${signedMoney(value)}`}>
      <span className="consulta-result-axis" />
      <span className={`consulta-result-bar ${tone(value)}`} style={value >= 0 ? { left: '50%', width: `${width}%` } : { right: '50%', width: `${width}%` }} />
      <strong className={tone(value)}>{signedMoney(value)}</strong>
    </div>
  );
};

export const ConsultaReportPage: React.FC<ConsultaReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onDownload,
  onPeriodChange,
  onAnalyticsEvent
}) => {
  const questionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const monthButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const pending = useMemo(() => pendingCashMovements
    .filter((movement) => Number.isFinite(movement.amount) && movement.amount > 0)
    .sort((left, right) => left.iso.localeCompare(right.iso)), [pendingCashMovements]);
  const pendingIncrements = sumByType(pending, 'increment');
  const pendingDecrements = sumByType(pending, 'decrement');
  const visibleBalance = report.saldo + pendingIncrements - pendingDecrements;
  const visibleContributed = report.incrementos + pendingIncrements;
  const visibleWithdrawn = report.decrementos + pendingDecrements;
  const publishedNet = report.incrementos - report.decrementos;
  const visibleNet = visibleContributed - visibleWithdrawn;
  const twrPct = (report.twrYtd ?? 0) * 100;

  const months = useMemo<ConsultaMonth[]>(() => {
    const balances = new Map(report.patrimonioEvolution
      .filter((entry) => entry.hasData && Number.isFinite(entry.balance))
      .map((entry) => [monthToKey(entry.month), Number(entry.balance)]));
    const breakdowns = new Map((report.contributionBreakdowns ?? []).map((item) => [monthToKey(item.month), item]));
    const valid = report.monthlyStats.filter((item) => item.hasData)
      .map((item) => ({ ...item, key: monthToKey(item.month) }))
      .sort((left, right) => left.key.localeCompare(right.key));
    return valid.map((item, index) => {
      const movements = report.movements.filter((movement) => movement.iso.slice(0, 7) === item.key);
      const increments = sumByType(movements, 'increment');
      const decrements = sumByType(movements, 'decrement');
      const balance = balances.get(item.key) ?? item.endBalance;
      const previous = index > 0 ? (balances.get(valid[index - 1].key) ?? valid[index - 1].endBalance) : undefined;
      return {
        key: item.key,
        label: monthLabel(item.key),
        shortLabel: monthLabel(item.key, true),
        opening: previous ?? balance - item.profit - increments + decrements,
        balance,
        profit: item.profit,
        returnPct: index === valid.length - 1 ? report.rentabilidadUltimoMes : item.profitPct,
        increments,
        decrements,
        breakdown: breakdowns.get(item.key)
      };
    });
  }, [report]);

  const [activeQuestion, setActiveQuestion] = useState<QuestionKey>('balance');
  const [period, setPeriod] = useState<PeriodPreset>('all');
  const [customStart, setCustomStart] = useState(months[0]?.key ?? '');
  const [customEnd, setCustomEnd] = useState(months[months.length - 1]?.key ?? '');
  const [selectedMonthKey, setSelectedMonthKey] = useState(months[months.length - 1]?.key ?? '');
  const [evolutionFocus, setEvolutionFocus] = useState(Math.max(0, months.length - 1));

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
    if (!visibleMonths.some((month) => month.key === selectedMonthKey)) {
      setSelectedMonthKey(visibleMonths[visibleMonths.length - 1]?.key ?? '');
    }
    setEvolutionFocus(Math.max(0, visibleMonths.length - 1));
  }, [selectedMonthKey, visibleMonths]);

  useEffect(() => {
    if (activeQuestion !== 'month' || !selectedMonthKey) return;
    monthButtonRefs.current[selectedMonthKey]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeQuestion, selectedMonthKey]);

  const selectedMonth = visibleMonths.find((month) => month.key === selectedMonthKey) ?? visibleMonths[visibleMonths.length - 1] ?? months[months.length - 1];
  const lastMonth = months[months.length - 1];
  const visibleMovements = report.movements.filter((movement) => visibleMonths.some((month) => month.key === movement.iso.slice(0, 7)));
  const contributions = visibleMovements.filter((movement) => movement.type === 'increment');
  const withdrawals = visibleMovements.filter((movement) => movement.type === 'decrement');
  const maximumMonthlyProfit = Math.max(1, ...months.map((month) => Math.abs(month.profit)));

  const findContribution = (iso: string, amount: number) => {
    const breakdown = months.find((month) => month.key === iso.slice(0, 7))?.breakdown;
    return breakdown?.contributions.find((item) => item.iso === iso && Math.abs(item.amount - amount) < 0.01);
  };
  const findWithdrawal = (iso: string, amount: number) => {
    const breakdown = months.find((month) => month.key === iso.slice(0, 7))?.breakdown;
    return breakdown?.withdrawals?.find((item) => item.iso === iso && Math.abs(item.amount - amount) < 0.01);
  };

  const questions = useMemo<Array<{ key: QuestionKey; question: string; summary: string; scoped?: boolean }>>(() => {
    const base: Array<{ key: QuestionKey; question: string; summary: string; scoped?: boolean }> = [
      { key: 'balance', question: '¿Cuánto tengo hoy?', summary: formatCurrency(visibleBalance) },
      { key: 'profit', question: '¿Cuánto he ganado en total?', summary: signedMoney(report.beneficioTotal) },
      { key: 'capital', question: '¿Cuánto dinero he puesto y cuánto he retirado?', summary: `Neto ${formatCurrency(visibleNet)}` },
      { key: 'returns', question: '¿Qué rentabilidad ha tenido la gestión?', summary: `TWR ${signedPercent(twrPct)}` },
      { key: 'latest', question: '¿Cómo fue el último mes?', summary: `${lastMonth?.shortLabel ?? 'Sin cierre'} · ${signedPercent(report.rentabilidadUltimoMes)}` },
      { key: 'month', question: '¿Qué ocurrió en un mes concreto?', summary: selectedMonth?.shortLabel ?? 'Seleccione un mes', scoped: true },
      { key: 'contributions', question: '¿Qué pasó con cada aportación que hice?', summary: `${contributions.length} en el periodo`, scoped: true },
      { key: 'withdrawals', question: '¿Y con el dinero que retiré?', summary: `${withdrawals.length} en el periodo`, scoped: true },
      { key: 'evolution', question: '¿Cómo ha evolucionado mi patrimonio?', summary: `${visibleMonths.length} cierres`, scoped: true }
    ];
    if (pending.length) base.push({ key: 'pending', question: '¿Hay movimientos que aún no están en el último cierre?', summary: `${pending.length} en tránsito` });
    return base;
  }, [contributions.length, lastMonth?.shortLabel, pending.length, report.beneficioTotal, report.rentabilidadUltimoMes, selectedMonth?.shortLabel, twrPct, visibleBalance, visibleMonths.length, visibleNet, withdrawals.length]);

  const activeIndex = Math.max(0, questions.findIndex((question) => question.key === activeQuestion));
  const selectQuestion = (key: QuestionKey) => {
    setActiveQuestion(key);
    onAnalyticsEvent?.({ type: 'report_consulta_question', label: `CONSULTA ${key}` });
  };
  const handleQuestionKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = Math.min(questions.length - 1, index + 1);
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = Math.max(0, index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = questions.length - 1;
    else return;
    event.preventDefault();
    selectQuestion(questions[next].key);
    questionRefs.current[next]?.focus();
  };

  const updatePeriod = (next: PeriodPreset) => {
    setPeriod(next);
    onAnalyticsEvent?.({ type: 'report_period_change', label: `CONSULTA ${next}` });
  };

  const renderMonthBreakdown = (month: ConsultaMonth) => {
    const calculated = month.opening + month.increments - month.decrements + month.profit;
    const difference = month.balance - calculated;
    const breakdown = month.breakdown;
    return (
      <div className="consulta-month-breakdown">
        <div className="consulta-month-metrics">
          <div><span>Saldo inicial</span><strong>{formatCurrency(month.opening)}</strong></div>
          <div><span>Aportaciones</span><strong>{formatCurrency(month.increments)}</strong></div>
          <div><span>Retiradas</span><strong>{formatCurrency(month.decrements)}</strong></div>
          <div><span>Resultado</span><strong className={tone(month.profit)}>{signedMoney(month.profit)}</strong></div>
          <div><span>Rentabilidad</span><strong className={tone(month.returnPct)}>{signedPercent(month.returnPct)}</strong></div>
          <div><span>Saldo final</span><strong>{formatCurrency(month.balance)}</strong></div>
        </div>
        <CenteredResultBar value={month.profit} maximum={maximumMonthlyProfit} label={`Resultado de ${month.label}`} />
        {breakdown ? <div className="consulta-tranche-list">
          <div><span>Posición inicial del mes</span><b>{formatCurrency(breakdown.openingCapital ?? breakdown.initialCapital)}</b><em>{signedPercent(breakdown.initialReturnPct * 100)}</em><strong>{signedMoney(breakdown.initialProfit)}</strong></div>
          {breakdown.contributions.map((item) => <div key={`inc-${item.iso}`}><span>Aportación del {dateLabel(item.iso)}</span><b>{formatCurrency(item.amount)}</b><em>{signedPercent(item.returnPct * 100)}</em><strong>{signedMoney(item.profit)}</strong></div>)}
          {(breakdown.withdrawals ?? []).map((item) => <div key={`dec-${item.iso}`}><span>Capital retirado el {dateLabel(item.iso)}</span><b>{formatCurrency(item.amount)}</b><em>{item.returnPct === undefined ? '—' : signedPercent(item.returnPct * 100)}</em><strong>{signedMoney(item.profit)}</strong></div>)}
        </div> : <p className="consulta-empty-note">Este mes no tiene desglose intrames publicado.</p>}
        <Calculation note={!nearlyEqual(calculated, month.balance) ? `Diferencia de conciliación: ${signedMoney(difference)}.` : 'La operación cuadra con el cierre publicado.'}>
          <span>{formatCurrency(month.opening)}</span><i>+</i><span>{formatCurrency(month.increments)}</span><i>−</i><span>{formatCurrency(month.decrements)}</span><i>+</i><span>{signedMoney(month.profit)}</span><i>=</i><strong>{formatCurrency(calculated)}</strong>
        </Calculation>
      </div>
    );
  };

  const evolution = useMemo(() => {
    if (!visibleMonths.length) return null;
    const width = Math.max(720, 56 + visibleMonths.length * 96);
    const height = 300;
    const left = 28;
    const right = 28;
    const top = 42;
    const bottom = 58;
    const maximum = niceAxisMaximum(Math.max(1, ...visibleMonths.map((month) => month.balance)) * 1.08);
    const minimum = 0;
    const x = (index: number) => left + index * ((width - left - right) / Math.max(1, visibleMonths.length - 1));
    const y = (value: number) => top + ((maximum - value) / Math.max(1, maximum - minimum)) * (height - top - bottom);
    const points = visibleMonths.map((month, index) => ({ x: x(index), y: y(month.balance) }));
    const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
    const ticks = Array.from({ length: 5 }, (_, index) => maximum - index * (maximum / 4));
    return { width, height, left, right, top, bottom, minimum, maximum, x, y, points, path, ticks };
  }, [visibleMonths]);

  const renderAnswer = () => {
    if (activeQuestion === 'balance') return <>
      <div className="consulta-answer-kicker">CARTERA COMPLETA</div><h2>¿Cuánto tengo hoy?</h2>
      <p className="consulta-answer-sentence">Hoy su patrimonio es de:</p><strong className="consulta-main-number">{formatCurrency(visibleBalance)}</strong>
      <div className="consulta-composition"><span style={{ width: `${Math.max(0, visibleNet) / Math.max(1, Math.max(0, visibleNet) + Math.max(0, report.beneficioTotal)) * 100}%` }} /><b style={{ width: `${Math.max(0, report.beneficioTotal) / Math.max(1, Math.max(0, visibleNet) + Math.max(0, report.beneficioTotal)) * 100}%` }} /></div>
      <div className="consulta-composition-labels"><span>Capital neto <b>{formatCurrency(visibleNet)}</b></span><span>Beneficio acumulado <b>{signedMoney(report.beneficioTotal)}</b></span></div>
      {pending.length ? <p className="consulta-context-note">Incluye {pending.length} movimiento{pending.length === 1 ? '' : 's'} posterior{pending.length === 1 ? '' : 'es'} al último cierre.</p> : null}
      <Calculation><span>{formatCurrency(report.saldo)}</span><i>+</i><span>{formatCurrency(pendingIncrements)}</span><i>−</i><span>{formatCurrency(pendingDecrements)}</span><i>=</i><strong>{formatCurrency(visibleBalance)}</strong></Calculation>
    </>;

    if (activeQuestion === 'profit') return <>
      <div className="consulta-answer-kicker">CARTERA COMPLETA</div><h2>¿Cuánto he ganado en total?</h2>
      <p className="consulta-answer-sentence">{report.beneficioTotal >= 0 ? 'Desde el inicio, la gestión ha generado:' : 'Desde el inicio, el resultado acumulado es:'}</p>
      <strong className={`consulta-main-number ${tone(report.beneficioTotal)}`}>{signedMoney(report.beneficioTotal)}</strong>
      <CenteredResultBar value={report.beneficioTotal} maximum={Math.max(1, Math.abs(report.beneficioTotal))} label="Beneficio acumulado" />
      <Calculation><span>{formatCurrency(report.saldo)}</span><i>+</i><span>{formatCurrency(report.decrementos)}</span><i>−</i><span>{formatCurrency(report.incrementos)}</span><i>=</i><strong>{signedMoney(report.beneficioTotal)}</strong></Calculation>
    </>;

    if (activeQuestion === 'capital') {
      const maximum = Math.max(1, visibleContributed, visibleWithdrawn, Math.abs(visibleNet));
      return <><div className="consulta-answer-kicker">CARTERA COMPLETA</div><h2>¿Cuánto dinero he puesto y cuánto he retirado?</h2>
        <p className="consulta-answer-sentence">El capital neto que permanece aportado es de <b>{formatCurrency(visibleNet)}</b>.</p>
        <div className="consulta-capital-bars">
          <div><span>Capital aportado</span><i><b className="is-inflow" style={{ width: `${visibleContributed / maximum * 100}%` }} /></i><strong>{formatCurrency(visibleContributed)}</strong></div>
          <div><span>Capital retirado</span><i><b className="is-outflow" style={{ width: `${visibleWithdrawn / maximum * 100}%` }} /></i><strong>{formatCurrency(visibleWithdrawn)}</strong></div>
          <div><span>Capital neto</span><i><b className="is-net" style={{ width: `${Math.abs(visibleNet) / maximum * 100}%` }} /></i><strong>{formatCurrency(visibleNet)}</strong></div>
        </div>
        <Calculation><span>{formatCurrency(visibleContributed)}</span><i>−</i><span>{formatCurrency(visibleWithdrawn)}</span><i>=</i><strong>{formatCurrency(visibleNet)}</strong></Calculation>
      </>;
    }

    if (activeQuestion === 'returns') return <>
      <div className="consulta-answer-kicker">CARTERA COMPLETA</div><h2>¿Qué rentabilidad ha tenido la gestión?</h2>
      <p className="consulta-answer-sentence">Son dos medidas distintas y ambas responden a una pregunta diferente.</p>
      <div className="consulta-return-pair"><div><span>TWR acumulado</span><strong className={tone(twrPct)}>{signedPercent(twrPct)}</strong><p>Mide la evolución de la inversión aislando aportaciones y retiradas.</p></div><div><span>Rentabilidad total</span><strong className={tone(report.rentabilidad)}>{report.rentabilidadDisponible === false ? 'No aplicable' : signedPercent(report.rentabilidad)}</strong><p>Compara el beneficio acumulado con el capital neto aportado.</p></div></div>
      <Calculation note="El TWR mostrado es el valor oficial publicado; no se reconstruye ni se altera en esta vista."><span>TWR oficial</span><i>=</i><strong>{signedPercent(twrPct)}</strong></Calculation>
      <Calculation note={report.rentabilidadDisponible === false ? 'Se calcula cuando el capital neto aportado es positivo.' : undefined}><span>{signedMoney(report.beneficioTotal)}</span><i>÷</i><span>{formatCurrency(publishedNet)}</span><i>=</i><strong>{report.rentabilidadDisponible === false ? 'No aplicable' : signedPercent(report.rentabilidad)}</strong></Calculation>
    </>;

    if (activeQuestion === 'latest') return <>
      <div className="consulta-answer-kicker">ÚLTIMO CIERRE PUBLICADO</div><h2>¿Cómo fue el último mes?</h2>
      <p className="consulta-answer-sentence">En {lastMonth?.label ?? 'el último mes'}, la gestión registró:</p>
      <div className="consulta-latest-result"><strong className={tone(report.beneficioUltimoMes)}>{signedMoney(report.beneficioUltimoMes)}</strong><span className={tone(report.rentabilidadUltimoMes)}>{signedPercent(report.rentabilidadUltimoMes)}</span></div>
      <CenteredResultBar value={report.beneficioUltimoMes} maximum={maximumMonthlyProfit} label="Resultado del último mes" />
      <Calculation note={lastMonth?.breakdown ? 'Si hubo movimientos durante el mes, el detalle de cada tramo aparece en la pregunta del mes concreto.' : 'Rentabilidad TWR oficial publicada para el último mes.'}><span>Resultado publicado</span><i>=</i><strong>{signedMoney(report.beneficioUltimoMes)}</strong><span>Rentabilidad publicada</span><i>=</i><strong>{signedPercent(report.rentabilidadUltimoMes)}</strong></Calculation>
    </>;

    if (activeQuestion === 'month') {
      const selectedIndex = Math.max(0, visibleMonths.findIndex((month) => month.key === selectedMonth?.key));
      return <>
      <div className="consulta-answer-kicker">DEL PERIODO SELECCIONADO</div><h2>¿Qué ocurrió en un mes concreto?</h2>
      <div className="consulta-month-picker">
        <button type="button" disabled={selectedIndex <= 0} aria-label="Mes anterior" onClick={() => setSelectedMonthKey(visibleMonths[selectedIndex - 1]?.key ?? selectedMonthKey)}>←</button>
        <label><span>Mes analizado</span><select aria-label="Mes analizado" value={selectedMonth?.key ?? ''} onChange={(event) => setSelectedMonthKey(event.target.value)}>{visibleMonths.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label>
        <button type="button" disabled={selectedIndex >= visibleMonths.length - 1} aria-label="Mes siguiente" onClick={() => setSelectedMonthKey(visibleMonths[selectedIndex + 1]?.key ?? selectedMonthKey)}>→</button>
      </div>
      <div className="consulta-month-timeline" aria-label="Meses disponibles">{visibleMonths.map((month) => <button type="button" key={month.key} ref={(element) => { monthButtonRefs.current[month.key] = element; }} className={month.key === selectedMonth?.key ? 'is-active' : ''} aria-pressed={month.key === selectedMonth?.key} onClick={() => setSelectedMonthKey(month.key)}><span>{month.shortLabel}</span><strong className={tone(month.returnPct)}>{signedPercent(month.returnPct)}</strong></button>)}</div>
      {selectedMonth ? renderMonthBreakdown(selectedMonth) : <p className="consulta-empty-note">No hay cierres publicados en este periodo.</p>}
    </>;
    }

    if (activeQuestion === 'contributions') return <>
      <div className="consulta-answer-kicker">DEL PERIODO SELECCIONADO</div><h2>¿Qué pasó con cada aportación que hice?</h2>
      <p className="consulta-answer-sentence">Cada aportación se muestra con la información intrames que realmente está publicada.</p>
      <div className="consulta-movement-cards">{contributions.length ? contributions.map((movement, index) => { const detail = findContribution(movement.iso, movement.amount); return <article key={`${movement.iso}-${movement.amount}-${index}`}><div><span>{dateLabel(movement.iso)}</span><strong>{formatCurrency(movement.amount)}</strong></div>{detail ? <p>Desde su incorporación hasta el cierre obtuvo <b>{signedPercent(detail.returnPct * 100)}</b> y generó <b>{signedMoney(detail.profit)}</b>.</p> : movement.returnPct !== undefined ? <p>Rentabilidad aplicada según el movimiento: <b>{signedPercent(movement.returnPct * 100)}</b>.</p> : <p>Este movimiento no tiene desglose intrames publicado.</p>}</article>; }) : <p className="consulta-empty-note">No hay aportaciones en este periodo.</p>}</div>
      <Calculation note="Los resultados de una aportación solo se muestran cuando existe desglose publicado o una rentabilidad específica registrada en el movimiento."><span>Aportaciones del periodo</span><i>=</i><strong>{formatCurrency(sumByType(contributions, 'increment'))}</strong></Calculation>
    </>;

    if (activeQuestion === 'withdrawals') return <>
      <div className="consulta-answer-kicker">DEL PERIODO SELECCIONADO</div><h2>¿Y con el dinero que retiré?</h2>
      <p className="consulta-answer-sentence">La retirada reduce el saldo, pero no se presenta como una pérdida de inversión.</p>
      <div className="consulta-movement-cards is-withdrawal">{withdrawals.length ? withdrawals.map((movement, index) => { const detail = findWithdrawal(movement.iso, movement.amount); return <article key={`${movement.iso}-${movement.amount}-${index}`}><div><span>{dateLabel(movement.iso)}</span><strong>{formatCurrency(movement.amount)}</strong></div>{detail ? <p>Este capital permaneció invertido hasta esa fecha, obtuvo <b>{detail.returnPct === undefined ? 'una rentabilidad no publicada' : signedPercent(detail.returnPct * 100)}</b> y generó <b>{signedMoney(detail.profit)}</b>.</p> : movement.returnPct !== undefined ? <p>Rentabilidad aplicada hasta la salida: <b>{signedPercent(movement.returnPct * 100)}</b>.</p> : <p>Rentabilidad hasta la salida no publicada.</p>}</article>; }) : <p className="consulta-empty-note">No hay retiradas en este periodo.</p>}</div>
      <Calculation><span>Retiradas del periodo</span><i>=</i><strong>{formatCurrency(sumByType(withdrawals, 'decrement'))}</strong></Calculation>
    </>;

    if (activeQuestion === 'evolution') return <>
      <div className="consulta-answer-kicker">DEL PERIODO SELECCIONADO</div><h2>¿Cómo ha evolucionado mi patrimonio?</h2>
      {visibleMonths.length && evolution ? <><p className="consulta-answer-sentence">Pasó de <b>{formatCurrency(visibleMonths[0].balance)}</b> en {visibleMonths[0].label} a <b>{formatCurrency(visibleMonths[visibleMonths.length - 1].balance)}</b> en {visibleMonths[visibleMonths.length - 1].label}.</p>
        <p className="consulta-chart-help">Cada punto muestra el saldo publicado. Púlselo para abrir directamente el detalle de ese mes.</p>
        <div className="consulta-evolution-wrap"><div className="consulta-evolution-chart"><div className="consulta-evolution-y-axis" aria-hidden="true">{evolution.ticks.map((tick) => <span key={tick} style={{ top: `${evolution.y(tick)}px` }}>{compactMoney(tick)}</span>)}</div><div className="consulta-evolution-scroll"><svg viewBox={`0 0 ${evolution.width} ${evolution.height}`} width={evolution.width} height={evolution.height} role="img" aria-label="Evolución del patrimonio" tabIndex={0} onKeyDown={(event) => { if (event.key === 'ArrowLeft') setEvolutionFocus((value) => Math.max(0, value - 1)); if (event.key === 'ArrowRight') setEvolutionFocus((value) => Math.min(visibleMonths.length - 1, value + 1)); }}>{evolution.ticks.map((tick) => <line key={tick} x1={0} x2={evolution.width} y1={evolution.y(tick)} y2={evolution.y(tick)} className="consulta-evolution-grid" />)}<path d={evolution.path} className="consulta-evolution-line" />{evolution.points.map((point, index) => <g key={visibleMonths[index].key} role="button" tabIndex={0} aria-label={`Abrir ${visibleMonths[index].label}: ${formatCurrency(visibleMonths[index].balance)}`} className={evolutionFocus === index ? 'is-focused' : ''} onMouseEnter={() => setEvolutionFocus(index)} onFocus={() => setEvolutionFocus(index)} onClick={() => { setSelectedMonthKey(visibleMonths[index].key); selectQuestion('month'); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedMonthKey(visibleMonths[index].key); selectQuestion('month'); } }}><line x1={point.x} x2={point.x} y1={point.y} y2={evolution.height - evolution.bottom} className="consulta-evolution-guide" /><circle cx={point.x} cy={point.y} r={evolutionFocus === index ? 6 : 4} /><text className="consulta-evolution-value" x={point.x} y={Math.max(18, point.y + (index % 2 === 0 ? -15 : 22))} textAnchor="middle">{compactMoney(visibleMonths[index].balance)}</text><text className="consulta-evolution-month" x={point.x} y={evolution.height - 18} textAnchor="middle">{visibleMonths[index].shortLabel}</text></g>)}</svg></div></div><div className="consulta-evolution-focus"><span>{visibleMonths[evolutionFocus]?.label}</span><strong>{formatCurrency(visibleMonths[evolutionFocus]?.balance ?? 0)}</strong></div></div>
      </> : <p className="consulta-empty-note">No hay cierres publicados en este periodo.</p>}
      <Calculation note="La línea utiliza exclusivamente los saldos de cierre publicados."><span>Primer cierre</span><i>→</i><strong>{visibleMonths[0] ? formatCurrency(visibleMonths[0].balance) : '—'}</strong><span>Último cierre</span><i>→</i><strong>{visibleMonths[visibleMonths.length - 1] ? formatCurrency(visibleMonths[visibleMonths.length - 1].balance) : '—'}</strong></Calculation>
    </>;

    return <>
      <div className="consulta-answer-kicker">CAPITAL EN TRÁNSITO</div><h2>¿Hay movimientos que aún no están en el último cierre?</h2>
      <p className="consulta-answer-sentence">Estos movimientos ya forman parte del saldo visible. Su resultado se incorporará cuando se publique el próximo cierre.</p>
      <div className="consulta-pending-list">{pending.map((movement, index) => <div key={`${movement.iso}-${movement.type}-${index}`}><span>{dateLabel(movement.iso)}</span><b>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</b><strong>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong></div>)}</div>
      <Calculation><span>{formatCurrency(report.saldo)}</span><i>+</i><span>{formatCurrency(pendingIncrements)}</span><i>−</i><span>{formatCurrency(pendingDecrements)}</span><i>=</i><strong>{formatCurrency(visibleBalance)}</strong></Calculation>
    </>;
  };

  return (
    <article className="consulta-root" ref={rootRef}>
      <header className="consulta-head">
        <div><span>INFORME INTERACTIVO</span><h1>CONSULTA</h1><p>Sus preguntas, respondidas con sus cifras · {report.clientCode}</p></div>
        <button type="button" onClick={() => { onAnalyticsEvent?.({ type: 'report_download', label: 'CONSULTA PDF' }); void onDownload?.(); }}>Descargar informe oficial</button>
      </header>

      {pending.length ? <section className="consulta-pending-strip"><div><span>ACTUALIZACIÓN DE CAPITAL</span><strong>{pending.length} movimiento{pending.length === 1 ? '' : 's'} posterior{pending.length === 1 ? '' : 'es'} al último cierre</strong></div><b>{pendingIncrements > 0 ? `+${formatCurrency(pendingIncrements)}` : ''}{pendingIncrements > 0 && pendingDecrements > 0 ? ' · ' : ''}{pendingDecrements > 0 ? `−${formatCurrency(pendingDecrements)}` : ''}</b></section> : null}

      <section className="consulta-period" aria-label="Periodo de consulta">
        <div><strong>Periodo de las preguntas marcadas</strong><span>Las cifras de cartera completa no cambian</span></div>
        <div>{(['3m', '6m', '12m', 'all', 'custom'] as PeriodPreset[]).map((item) => <button key={item} type="button" aria-pressed={period === item} className={period === item ? 'is-active' : ''} onClick={() => updatePeriod(item)}>{item === '3m' ? '3 meses' : item === '6m' ? '6 meses' : item === '12m' ? '12 meses' : item === 'all' ? 'Todo' : 'Personalizado'}</button>)}</div>
        {period === 'custom' ? <div className="consulta-custom-period"><label>Desde<select value={customStart} onChange={(event) => { const value = event.target.value; setCustomStart(value); if (value > customEnd) setCustomEnd(value); }}>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label><label>Hasta<select value={customEnd} onChange={(event) => { const value = event.target.value; setCustomEnd(value); if (value < customStart) setCustomStart(value); }}>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label></div> : null}
      </section>

      <div className="consulta-split">
        <nav className="consulta-questions" role="tablist" aria-label="Preguntas sobre su cartera">
          <div className="consulta-questions-intro"><span>ELIJA UNA PREGUNTA</span><strong>Todo lo importante, explicado sin tecnicismos innecesarios.</strong></div>
          {questions.map((question, index) => <button key={question.key} ref={(element) => { questionRefs.current[index] = element; }} type="button" role="tab" id={`consulta-tab-${question.key}`} aria-controls="consulta-answer" aria-selected={activeQuestion === question.key} tabIndex={activeQuestion === question.key ? 0 : -1} className={activeQuestion === question.key ? 'is-active' : ''} onClick={() => selectQuestion(question.key)} onKeyDown={(event) => handleQuestionKey(event, index)}><span>{question.question}</span><small>{question.scoped ? <i>Periodo</i> : <i>Cartera completa</i>}{question.summary}</small></button>)}
        </nav>
        <section className="consulta-answer" id="consulta-answer" role="tabpanel" aria-labelledby={`consulta-tab-${questions[activeIndex]?.key}`} aria-live="polite">{renderAnswer()}</section>
      </div>

      <footer className="consulta-footer"><div><strong>CONSULTA</strong><span>Informe patrimonial · {report.clientCode}</span></div><p>Datos actualizados el {new Date(report.createdAt).toLocaleDateString('es-ES')} · Diseño Claude Fable 5.1</p></footer>
    </article>
  );
};
