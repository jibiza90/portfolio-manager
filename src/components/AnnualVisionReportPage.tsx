import React, { useEffect, useMemo, useState } from 'react';
import type { GeneralReferenceMonth } from '../services/cloudPortfolio';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './AnnualVisionReportPage.css';

interface AnnualPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface AnnualVisionReportPageProps {
  report: ReportData;
  generalReferenceMonthly?: GeneralReferenceMonth[];
  pendingCashMovements?: AnnualPendingMovement[];
  rootRef?: React.RefObject<HTMLDivElement>;
  onAnalyticsEvent?: (event: {
    type: string;
    label: string;
    durationMs?: number;
    metadata?: Record<string, string | number | boolean>;
  }) => void;
}

type MatrixLayer = 'return' | 'profit' | 'balance' | 'flow';

interface AnnualMonth {
  key: string;
  year: number;
  monthIndex: number;
  label: string;
  profit: number;
  returnPct: number;
  balance: number;
  movements: ReportData['movements'];
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
}

const monthLookup: Record<string, number> = {
  ene: 0,
  enero: 0,
  feb: 1,
  febrero: 1,
  mar: 2,
  marzo: 2,
  abr: 3,
  abril: 3,
  may: 4,
  mayo: 4,
  jun: 5,
  junio: 5,
  jul: 6,
  julio: 6,
  ago: 7,
  agosto: 7,
  sep: 8,
  sept: 8,
  septiembre: 8,
  oct: 9,
  octubre: 9,
  nov: 10,
  noviembre: 10,
  dic: 11,
  diciembre: 11
};

const shortMonthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const rankingLabels = ['primer', 'segundo', 'tercer', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno', 'décimo', 'undécimo', 'duodécimo'];

const monthToKey = (value: string) => {
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  const parts = value.trim().toLowerCase().split(/\s+/);
  const month = monthLookup[parts[0]];
  const year = Number(parts[parts.length - 1]);
  if (month === undefined || !Number.isFinite(year)) return value;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
};

const longMonth = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  const value = new Date(year, Math.max(0, month - 1), 1).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric'
  });
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
};

const shortDate = (iso: string) => {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${day}.${month}.${year}` : iso;
};

const signedMoney = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) < 0.005) return formatCurrency(0);
  return `${safe > 0 ? '+' : '-'}${formatCurrency(Math.abs(safe))}`;
};

const signedPercent = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) < 0.005) return '0,00 %';
  return `${safe > 0 ? '+' : '-'}${Math.abs(safe).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} %`;
};

const compactMoney = (value: number, signed = false) => {
  const safe = Number.isFinite(value) ? value : 0;
  const absolute = Math.abs(safe);
  const formatted = new Intl.NumberFormat('es-ES', {
    notation: 'compact',
    maximumFractionDigits: absolute >= 100000 ? 0 : 1
  }).format(absolute);
  if (!signed || Math.abs(safe) < 0.005) return `${formatted} €`;
  return `${safe > 0 ? '+' : '-'}${formatted} €`;
};

const movementNet = (movements: Array<{ type: string; amount: number }>) => movements.reduce(
  (sum, movement) => sum + (movement.type === 'increment' ? movement.amount : -movement.amount),
  0
);

const calculateTwrPct = (months: AnnualMonth[]) => (
  (months.reduce((factor, month) => factor * (1 + month.returnPct / 100), 1) - 1) * 100
);

const layerLabels: Record<MatrixLayer, string> = {
  return: 'Rentabilidad',
  profit: 'Beneficio €',
  balance: 'Saldo',
  flow: 'Flujos'
};

const getLayerValue = (month: AnnualMonth, layer: MatrixLayer) => {
  if (layer === 'return') return month.returnPct;
  if (layer === 'profit') return month.profit;
  if (layer === 'balance') return month.balance;
  return movementNet(month.movements);
};

const formatLayerValue = (month: AnnualMonth, layer: MatrixLayer) => {
  if (layer === 'return') return signedPercent(month.returnPct);
  if (layer === 'profit') return compactMoney(month.profit, true);
  if (layer === 'balance') return compactMoney(month.balance);
  return compactMoney(movementNet(month.movements), true);
};

export const AnnualVisionReportPage: React.FC<AnnualVisionReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onAnalyticsEvent
}) => {
  const months = useMemo<AnnualMonth[]>(() => {
    const breakdownByMonth = new Map(
      (report.contributionBreakdowns ?? []).map((item) => [monthToKey(item.month), item])
    );
    const validStats = report.monthlyStats
      .filter((item) => item.hasData && Number.isFinite(item.endBalance) && (
        item.endBalance !== 0 || item.profit !== 0 || item.profitPct !== 0
      ))
      .sort((left, right) => monthToKey(left.month).localeCompare(monthToKey(right.month)));
    const latestKey = validStats.length ? monthToKey(validStats[validStats.length - 1].month) : '';

    return validStats.map((item) => {
      const key = monthToKey(item.month);
      const [year, month] = key.split('-').map(Number);
      return {
        key,
        year,
        monthIndex: Math.max(0, month - 1),
        label: longMonth(key),
        profit: Number.isFinite(item.profit) ? item.profit : 0,
        returnPct: key === latestKey && Number.isFinite(report.rentabilidadUltimoMes)
          ? report.rentabilidadUltimoMes
          : Number.isFinite(item.profitPct) ? item.profitPct : 0,
        balance: Number.isFinite(item.endBalance) ? item.endBalance : 0,
        movements: (report.movements ?? []).filter((movement) => movement.iso.slice(0, 7) === key),
        breakdown: breakdownByMonth.get(key)
      };
    });
  }, [report]);

  const years = useMemo(
    () => [...new Set(months.map((month) => month.year))].sort((left, right) => left - right),
    [months]
  );
  const latestYear = years[years.length - 1] ?? new Date().getFullYear();
  const latestMonthKey = months[months.length - 1]?.key ?? '';
  const [selectedYear, setSelectedYear] = useState(latestYear);
  const [showAllYears, setShowAllYears] = useState(false);
  const [layer, setLayer] = useState<MatrixLayer>('return');
  const [activeMonthKey, setActiveMonthKey] = useState(latestMonthKey);
  const [previewMonthKey, setPreviewMonthKey] = useState<string | null>(null);

  useEffect(() => {
    setSelectedYear(latestYear);
    setShowAllYears(false);
    setActiveMonthKey(latestMonthKey);
    setPreviewMonthKey(null);
  }, [latestMonthKey, latestYear, report.clientId, report.createdAt]);

  const monthByKey = useMemo(() => new Map(months.map((month) => [month.key, month])), [months]);
  const displayedMonth = monthByKey.get(previewMonthKey ?? activeMonthKey)
    ?? months[months.length - 1];
  const displayedYearMonths = displayedMonth
    ? months.filter((month) => month.year === displayedMonth.year)
    : [];
  const visibleYears = showAllYears ? years : years.filter((year) => year === selectedYear);
  const visibleMonths = months.filter((month) => visibleYears.includes(month.year));
  const scopeMonths = showAllYears ? months : months.filter((month) => month.year === selectedYear);

  const allMovements = useMemo(() => [
    ...(report.movements ?? []).map((movement) => ({ ...movement, pending: false })),
    ...pendingCashMovements.map((movement) => ({ ...movement, balance: 0, pending: true }))
  ], [pendingCashMovements, report.movements]);

  const pendingIncrements = pendingCashMovements
    .filter((movement) => movement.type === 'increment')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const pendingDecrements = pendingCashMovements
    .filter((movement) => movement.type === 'decrement')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const visibleBalance = report.saldo + pendingIncrements - pendingDecrements;
  const scopedMovements = allMovements.filter((movement) => {
    const year = Number(movement.iso.slice(0, 4));
    return showAllYears ? years.includes(year) : year === selectedYear;
  });
  const scopeProfit = scopeMonths.reduce((sum, month) => sum + month.profit, 0);
  const scopeReturnPct = calculateTwrPct(scopeMonths);
  const scopeNetFlow = movementNet(scopedMovements);
  const scopeBestMonth = [...scopeMonths].sort((left, right) => right.returnPct - left.returnPct)[0];
  const scopeBestProfitMonth = [...scopeMonths].sort((left, right) => right.profit - left.profit)[0];
  const scopeLabel = showAllYears ? 'Todo el histórico' : `Año ${selectedYear}`;

  const layerValues = visibleMonths.map((month) => getLayerValue(month, layer));
  const maxAbsoluteLayerValue = Math.max(1, ...layerValues.map((value) => Math.abs(value)));
  const minBalance = layer === 'balance' ? Math.min(...layerValues, 0) : 0;
  const maxBalance = layer === 'balance' ? Math.max(...layerValues, 1) : 1;

  const displayedYearProfit = displayedYearMonths.reduce((sum, month) => sum + month.profit, 0);
  const displayedYearAverage = displayedYearMonths.length
    ? displayedYearMonths.reduce((sum, month) => sum + month.returnPct, 0) / displayedYearMonths.length
    : 0;
  const displayedYearBest = [...displayedYearMonths].sort((left, right) => right.returnPct - left.returnPct)[0];
  const displayedRanking = displayedMonth
    ? [...displayedYearMonths].sort((left, right) => right.profit - left.profit)
      .findIndex((month) => month.key === displayedMonth.key) + 1
    : 0;
  const displayedProfitWeight = displayedMonth && displayedYearProfit !== 0
    ? Math.abs(displayedMonth.profit / displayedYearProfit) * 100
    : 0;

  const displayedMovements = displayedMonth?.movements ?? [];
  const displayedIncrements = displayedMovements
    .filter((movement) => movement.type === 'increment')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const displayedDecrements = displayedMovements
    .filter((movement) => movement.type === 'decrement')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const displayedIndex = months.findIndex((month) => month.key === displayedMonth?.key);
  const previousMonth = displayedIndex > 0 ? months[displayedIndex - 1] : undefined;
  const openingBalance = displayedMonth?.breakdown?.openingCapital
    ?? previousMonth?.balance
    ?? Math.max(0, (displayedMonth?.balance ?? 0) - (displayedMonth?.profit ?? 0) - displayedIncrements + displayedDecrements);
  const displayedBreakdown = displayedMonth?.breakdown;
  const comparisonMax = Math.max(
    0.01,
    Math.abs(displayedMonth?.returnPct ?? 0),
    Math.abs(displayedYearAverage),
    Math.abs(displayedYearBest?.returnPct ?? 0)
  );

  const activateYear = (year: number) => {
    const nextMonths = months.filter((month) => month.year === year);
    const nextMonth = nextMonths[nextMonths.length - 1];
    setSelectedYear(year);
    setShowAllYears(false);
    setActiveMonthKey(nextMonth?.key ?? '');
    setPreviewMonthKey(null);
    onAnalyticsEvent?.({ type: 'annual_year_change', label: String(year) });
  };

  const moveYear = (direction: -1 | 1) => {
    const currentIndex = years.indexOf(selectedYear);
    const nextYear = years[currentIndex + direction];
    if (nextYear !== undefined) activateYear(nextYear);
  };

  const activateMonth = (month: AnnualMonth, source: string) => {
    setActiveMonthKey(month.key);
    setPreviewMonthKey(null);
    if (month.year !== selectedYear) setSelectedYear(month.year);
    onAnalyticsEvent?.({
      type: 'annual_month_focus',
      label: month.label,
      metadata: { source, layer }
    });
  };

  const focusCell = (key: string) => {
    const element = rootRef?.current?.querySelector<HTMLElement>(`[data-month-key="${key}"]`);
    element?.focus();
  };

  const handleCellKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, month: AnnualMonth) => {
    const visibleDataMonths = [...visibleMonths].sort((left, right) => left.key.localeCompare(right.key));
    const currentIndex = visibleDataMonths.findIndex((item) => item.key === month.key);
    let target: AnnualMonth | undefined;
    if (event.key === 'ArrowRight') target = visibleDataMonths[currentIndex + 1];
    if (event.key === 'ArrowLeft') target = visibleDataMonths[currentIndex - 1];
    if (event.key === 'Home') target = visibleDataMonths[0];
    if (event.key === 'End') target = visibleDataMonths[visibleDataMonths.length - 1];
    if (showAllYears && event.key === 'ArrowUp') target = monthByKey.get(`${month.year - 1}-${String(month.monthIndex + 1).padStart(2, '0')}`);
    if (showAllYears && event.key === 'ArrowDown') target = monthByKey.get(`${month.year + 1}-${String(month.monthIndex + 1).padStart(2, '0')}`);
    if (!target) return;
    event.preventDefault();
    activateMonth(target, 'keyboard');
    window.requestAnimationFrame(() => focusCell(target.key));
  };

  const getCellStyle = (month: AnnualMonth): React.CSSProperties => {
    const value = getLayerValue(month, layer);
    const normalized = layer === 'balance'
      ? (value - minBalance) / Math.max(1, maxBalance - minBalance)
      : Math.abs(value) / maxAbsoluteLayerValue;
    const alpha = 0.08 + Math.min(1, Math.max(0, normalized)) * 0.46;
    const rgb = layer === 'balance'
      ? '169, 118, 63'
      : value < 0 ? '177, 74, 78' : '12, 122, 99';
    return {
      '--pv3-cell-alpha': alpha.toFixed(3),
      '--pv3-cell-rgb': rgb
    } as React.CSSProperties;
  };

  const activeContributions = displayedBreakdown?.contributions ?? [];
  const activeWithdrawals = displayedBreakdown?.withdrawals ?? [];
  const profitableMonths = scopeMonths.filter((month) => month.profit > 0).length;
  const negativeMonths = scopeMonths.filter((month) => month.profit < 0).length;

  if (!months.length) {
    return (
      <div className="pv3-report" ref={rootRef}>
        <div className="pv3-empty"><span>Visión anual</span><h1>No hay cierres mensuales disponibles</h1></div>
      </div>
    );
  }

  return (
    <div className="pv3-report" ref={rootRef}>
      <header className="pv3-topbar">
        <div className="pv3-wordmark"><i />JIGSA <span>Private Office</span></div>
        <div className="pv3-topbar-meta">
          <span><small>Cuenta</small><strong>{report.clientCode}</strong></span>
          <span><small>Publicado</small><strong>{new Date(report.createdAt).toLocaleDateString('es-ES')}</strong></span>
        </div>
      </header>

      <section className="pv3-overview">
        <div className="pv3-overview-copy">
          <span className="pv3-kicker">Visión anual</span>
          <h1>Tu año,<br />de un vistazo.</h1>
          <p>Cada bloque representa un mes. El color revela su intensidad y el detalle explica qué ocurrió.</p>
        </div>
        <div className="pv3-balance">
          <span>Saldo actual</span>
          <strong>{formatCurrency(visibleBalance)}</strong>
          <small className={report.beneficioTotal >= 0 ? 'is-positive' : 'is-negative'}>
            {signedMoney(report.beneficioTotal)} de beneficio acumulado
          </small>
          {pendingCashMovements.length ? <em>Incluye capital posterior al último cierre</em> : null}
        </div>
        <div className="pv3-scope" aria-label={`Resumen de ${scopeLabel}`}>
          <div className="pv3-scope-title"><span>Lectura seleccionada</span><strong>{scopeLabel}</strong></div>
          <article><span>TWR</span><strong className={scopeReturnPct >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(scopeReturnPct)}</strong><small>Rentabilidad encadenada</small></article>
          <article><span>Beneficio</span><strong className={scopeProfit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(scopeProfit)}</strong><small>Resultado de los cierres</small></article>
          <article><span>Flujo neto</span><strong className={scopeNetFlow >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(scopeNetFlow)}</strong><small>Aportado menos retirado</small></article>
          <article><span>Mejor mes</span><strong>{scopeBestMonth?.label ?? '—'}</strong><small>{scopeBestMonth ? signedPercent(scopeBestMonth.returnPct) : 'Sin datos'}</small></article>
        </div>
      </section>

      {pendingCashMovements.length ? (
        <section className="pv3-pending" aria-label="Movimientos posteriores al último cierre">
          <div><span>Capital actualizado</span><strong>Movimientos posteriores al último cierre</strong></div>
          <div className="pv3-pending-list">
            {pendingCashMovements.map((movement, index) => (
              <span key={`${movement.iso}-${movement.type}-${index}`}>
                <small>{shortDate(movement.iso)}</small>
                <b>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</b>
                <strong className={movement.type === 'increment' ? 'is-positive' : 'is-negative'}>
                  {movement.type === 'increment' ? '+' : '-'}{formatCurrency(movement.amount)}
                </strong>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="pv3-matrix-section">
        <header className="pv3-matrix-heading">
          <div>
            <span>Mapa temporal</span>
            <h2>El caleidoscopio del año</h2>
            <p>Compara el mismo calendario desde cuatro lecturas distintas.</p>
          </div>
          <div className="pv3-year-controls" aria-label="Seleccionar año">
            <button type="button" aria-label="Año anterior" disabled={showAllYears || selectedYear === years[0]} onClick={() => moveYear(-1)}>←</button>
            <strong>{showAllYears ? 'Todo' : selectedYear}</strong>
            <button type="button" aria-label="Año siguiente" disabled={showAllYears || selectedYear === years[years.length - 1]} onClick={() => moveYear(1)}>→</button>
            <button
              type="button"
              className={showAllYears ? 'is-active' : ''}
              aria-pressed={showAllYears}
              onClick={() => {
                const nextShowAllYears = !showAllYears;
                setShowAllYears(nextShowAllYears);
                if (!nextShowAllYears) {
                  const selectedYearMonths = months.filter((month) => month.year === selectedYear);
                  setActiveMonthKey(selectedYearMonths[selectedYearMonths.length - 1]?.key ?? '');
                }
                setPreviewMonthKey(null);
                onAnalyticsEvent?.({ type: 'annual_year_change', label: showAllYears ? String(selectedYear) : 'Todo el historico' });
              }}
            >Todo</button>
          </div>
        </header>

        <div className="pv3-layer-toggle" role="group" aria-label="Dato mostrado en la matriz">
          {(Object.keys(layerLabels) as MatrixLayer[]).map((item) => (
            <button
              type="button"
              key={item}
              className={layer === item ? 'is-active' : ''}
              aria-pressed={layer === item}
              onClick={() => {
                setLayer(item);
                onAnalyticsEvent?.({ type: 'annual_layer_change', label: layerLabels[item] });
              }}
            >
              <span>{layerLabels[item]}</span>
              <small>{item === 'return' ? 'TWR mensual' : item === 'profit' ? 'Resultado en euros' : item === 'balance' ? 'Cierre de cartera' : 'Capital neto del mes'}</small>
            </button>
          ))}
        </div>

        <div className="pv3-calendar" role="grid" aria-label={`Matriz mensual de ${scopeLabel}`}>
          <div className="pv3-calendar-months" aria-hidden="true">
            <span />
            {shortMonthNames.map((month) => <span key={month}>{month}</span>)}
          </div>
          {visibleYears.map((year) => (
            <div className="pv3-calendar-row" role="row" key={year}>
              <div className="pv3-calendar-year"><span>Año</span><strong>{year}</strong></div>
              <div className="pv3-calendar-cells">
                {shortMonthNames.map((monthName, monthIndex) => {
                  const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
                  const month = monthByKey.get(key);
                  const cellMovements = allMovements.filter((movement) => movement.iso.slice(0, 7) === key);
                  if (!month) {
                    const isPendingClose = key > latestMonthKey;
                    const emptyStatus = isPendingClose ? 'Sin cierre todavía' : 'Sin datos';
                    return (
                      <div
                        className={`pv3-month-cell is-empty${isPendingClose ? ' is-pending-close' : ''}${cellMovements.length ? ' has-pending' : ''}`}
                        key={key}
                        role="gridcell"
                        aria-disabled="true"
                        aria-label={`${monthName} ${year}: ${emptyStatus.toLowerCase()}`}
                      >
                        <span>{monthName}</span>
                        <strong>{isPendingClose ? 'Pend.' : '—'}</strong>
                        <small>{emptyStatus}</small>
                        {cellMovements.length ? (
                          <div className="pv3-flow-markers">
                            {cellMovements.some((movement) => movement.type === 'increment') ? <i className="is-increment">+</i> : null}
                            {cellMovements.some((movement) => movement.type === 'decrement') ? <i className="is-decrement">−</i> : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  }
                  const isActive = month.key === (previewMonthKey ?? activeMonthKey);
                  const value = getLayerValue(month, layer);
                  return (
                    <button
                      type="button"
                      role="gridcell"
                      key={month.key}
                      data-month-key={month.key}
                      className={`pv3-month-cell has-data${isActive ? ' is-active' : ''}${value < 0 ? ' is-negative' : ' is-positive'}`}
                      style={getCellStyle(month)}
                      aria-selected={isActive}
                      aria-label={`${month.label}: ${formatLayerValue(month, layer)}. Beneficio ${signedMoney(month.profit)}. Saldo ${formatCurrency(month.balance)}.`}
                      tabIndex={month.key === activeMonthKey ? 0 : -1}
                      onMouseEnter={() => setPreviewMonthKey(month.key)}
                      onMouseLeave={() => setPreviewMonthKey(null)}
                      onFocus={() => setPreviewMonthKey(month.key)}
                      onBlur={() => setPreviewMonthKey(null)}
                      onClick={() => activateMonth(month, 'matrix')}
                      onKeyDown={(event) => handleCellKeyDown(event, month)}
                    >
                      <span>{monthName}</span>
                      <strong>{formatLayerValue(month, layer)}</strong>
                      <small>{layer === 'return' ? signedMoney(month.profit) : layer === 'balance' ? signedPercent(month.returnPct) : month.label}</small>
                      {cellMovements.length ? (
                        <div className="pv3-flow-markers" aria-label="Movimientos registrados">
                          {cellMovements.some((movement) => movement.type === 'increment') ? <i className="is-increment">+</i> : null}
                          {cellMovements.some((movement) => movement.type === 'decrement') ? <i className="is-decrement">−</i> : null}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="pv3-matrix-key" aria-label="Leyenda de la matriz">
          <span><i className="is-increment">+</i>Aportación</span>
          <span><i className="is-decrement">−</i>Retirada</span>
          <span><i className="is-no-data">—</i>Sin datos</span>
          <span><i className="is-pending-close">·</i>Sin cierre todavía</span>
        </div>
      </section>

      {displayedMonth ? (
        <section className="pv3-month-insight" aria-live="polite">
          <header>
            <div><span>Mes en contexto</span><h2>{displayedMonth.label}</h2></div>
            <div className="pv3-month-result">
              <span>Resultado</span>
              <strong className={displayedMonth.profit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(displayedMonth.profit)}</strong>
              <small className={displayedMonth.returnPct >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(displayedMonth.returnPct)}</small>
            </div>
          </header>

          <div className="pv3-month-story">
            <div>
              <span>Lectura del mes</span>
              <p>
                <strong>{displayedMonth.label.split(' de ')[0]}</strong> fue {displayedRanking === 1
                  ? 'el mes con mayor beneficio'
                  : `el ${rankingLabels[displayedRanking - 1] ?? `${displayedRanking}.º`} mes con mayor beneficio`} de {displayedMonth.year}.
                {displayedYearProfit > 0 && displayedMonth.profit > 0 && displayedProfitWeight > 0 && displayedProfitWeight <= 100
                  ? <> Representó el <strong>{displayedProfitWeight.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %</strong> del resultado anual.</>
                  : null}
              </p>
            </div>
            <div className="pv3-context-bars" aria-label="Comparación de rentabilidad">
              {[
                { label: 'Este mes', value: displayedMonth.returnPct },
                { label: 'Media del año', value: displayedYearAverage },
                { label: 'Mejor mes', value: displayedYearBest?.returnPct ?? 0 }
              ].map((item) => (
                <span key={item.label}>
                  <small>{item.label}</small>
                  <i><b style={{ width: `${Math.max(2, Math.abs(item.value) / comparisonMax * 100)}%` }} /></i>
                  <strong>{signedPercent(item.value)}</strong>
                </span>
              ))}
            </div>
          </div>

          <div className="pv3-month-ledger">
            <article><span>Saldo inicial</span><strong>{formatCurrency(openingBalance)}</strong><small>Capital al comenzar</small></article>
            <article><span>Aportaciones</span><strong className="is-positive">{displayedIncrements ? `+${formatCurrency(displayedIncrements)}` : formatCurrency(0)}</strong><small>Capital incorporado</small></article>
            <article><span>Retiradas</span><strong className={displayedDecrements ? 'is-negative' : ''}>{displayedDecrements ? `-${formatCurrency(displayedDecrements)}` : formatCurrency(0)}</strong><small>Capital retirado</small></article>
            <article><span>Beneficio</span><strong className={displayedMonth.profit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(displayedMonth.profit)}</strong><small>Resultado generado</small></article>
            <article className="is-total"><span>Saldo final</span><strong>{formatCurrency(displayedMonth.balance)}</strong><small>Cierre publicado</small></article>
          </div>

          {displayedBreakdown ? (
            <div className="pv3-breakdown">
              <div className="pv3-breakdown-head">
                <div><span>Composición del resultado</span><strong>Rentabilidad efectiva de cada tramo de capital</strong></div>
                <small>{activeContributions.length + activeWithdrawals.length} movimientos con detalle</small>
              </div>
              <div className="pv3-breakdown-rows">
                <div>
                  <span><i className="is-opening" />Posición inicial del mes</span>
                  <strong>{formatCurrency(displayedBreakdown.initialCapital)}</strong>
                  <b className={displayedBreakdown.initialReturnPct >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(displayedBreakdown.initialReturnPct * 100)}</b>
                  <em className={displayedBreakdown.initialProfit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(displayedBreakdown.initialProfit)}</em>
                </div>
                {activeContributions.map((contribution) => (
                  <div key={`${contribution.iso}-${contribution.amount}`}>
                    <span><i className="is-increment" />Aportación · {shortDate(contribution.iso)}</span>
                    <strong>{formatCurrency(contribution.amount)}</strong>
                    <b className={contribution.returnPct >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(contribution.returnPct * 100)}</b>
                    <em className={contribution.profit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(contribution.profit)}</em>
                  </div>
                ))}
                {activeWithdrawals.map((withdrawal) => (
                  <div key={`${withdrawal.iso}-${withdrawal.amount}-withdrawal`}>
                    <span><i className="is-decrement" />Capital retirado · {shortDate(withdrawal.iso)}</span>
                    <strong>{formatCurrency(withdrawal.amount)}</strong>
                    <b className={(withdrawal.returnPct ?? 0) >= 0 ? 'is-positive' : 'is-negative'}>{withdrawal.returnPct === undefined ? '—' : signedPercent(withdrawal.returnPct * 100)}</b>
                    <em className={withdrawal.profit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(withdrawal.profit)}</em>
                  </div>
                ))}
              </div>
              <div className="pv3-breakdown-total"><span>Beneficio explicado</span><strong>{signedMoney(displayedBreakdown.totalProfit)}</strong></div>
            </div>
          ) : (
            <div className="pv3-month-note">
              <span>Cómo leer este mes</span>
              <p>El resultado corresponde al capital mantenido durante el periodo. El porcentaje mide el rendimiento de la inversión sin alterar su lectura por aportaciones o retiradas.</p>
            </div>
          )}
        </section>
      ) : null}

      <section className="pv3-year-digest">
        <header><span>Lectura del periodo</span><h2>{scopeLabel} en tres señales</h2></header>
        <div>
          <article><span>Mejor rentabilidad</span><strong>{scopeBestMonth?.label ?? '—'}</strong><small>{scopeBestMonth ? signedPercent(scopeBestMonth.returnPct) : 'Sin datos'}</small></article>
          <article><span>Mayor beneficio mensual</span><strong>{scopeBestProfitMonth?.label ?? '—'}</strong><small>{scopeBestProfitMonth ? signedMoney(scopeBestProfitMonth.profit) : 'Sin datos'}</small></article>
          <article><span>Meses con beneficio</span><strong>{profitableMonths} de {scopeMonths.length}</strong><small>{negativeMonths ? `${negativeMonths} con resultado negativo` : 'Ningún cierre negativo'}</small></article>
        </div>
        <div className="pv3-legend">
          <span>Menor intensidad</span><i /><span>Mayor intensidad</span>
        </div>
      </section>

      <footer className="pv3-footer">
        <div><span>JIGSA</span><small>Portfolio intelligence</small></div>
        <details>
          <summary>Cómo interpretar el TWR</summary>
          <p>Mide la evolución de la cartera aislando el efecto de las aportaciones y retiradas. Permite conocer el comportamiento de la inversión durante un periodo determinado.</p>
        </details>
        <strong>{report.clientCode}</strong>
      </footer>
    </div>
  );
};
