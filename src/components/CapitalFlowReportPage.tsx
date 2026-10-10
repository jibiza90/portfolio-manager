import React, { useEffect, useMemo, useState } from 'react';
import type { GeneralReferenceMonth } from '../services/cloudPortfolio';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './CapitalFlowReportPage.css';

interface FlowPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface CapitalFlowReportPageProps {
  report: ReportData;
  generalReferenceMonthly?: GeneralReferenceMonth[];
  pendingCashMovements?: FlowPendingMovement[];
  rootRef?: React.RefObject<HTMLDivElement>;
  onAnalyticsEvent?: (event: {
    type: string;
    label: string;
    durationMs?: number;
    metadata?: Record<string, string | number | boolean>;
  }) => void;
}

interface FlowMonth {
  key: string;
  label: string;
  returnPct: number;
  profit: number;
  balance: number;
  hasClose: boolean;
}

interface SourceLot {
  id: string;
  iso: string;
  entryKey: string;
  label: string;
  amount: number;
  pending: boolean;
  specificEntryReturnPct?: number;
}

interface CapitalLot extends SourceLot {
  remainingCapital: number;
  allocatedWithdrawal: number;
  performanceFactor: number;
  attributedProfit: number;
  currentValue: number;
  sharePct: number;
  activeMonths: number;
  accumulatedReturnPct: number;
}

interface WithdrawalFlow {
  id: string;
  iso: string;
  monthKey: string;
  amount: number;
  pending: boolean;
  returnPct?: number;
}

type FlowDisplayMode = 'euros' | 'return';

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

const lotPalette = ['#55d6c2', '#f0b45c', '#66a9d2', '#a9c96e', '#dc8a6c', '#9bb8b3', '#d4c46c', '#7bc7a8'];

const monthToKey = (value: string) => {
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  const parts = value.trim().toLowerCase().split(/\s+/);
  const month = monthLookup[parts[0]];
  const year = Number(parts[parts.length - 1]);
  if (month === undefined || !Number.isFinite(year)) return value;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
};

const monthLabel = (key: string, style: 'short' | 'long' = 'short') => {
  const [year, month] = key.split('-').map(Number);
  const value = new Date(year, Math.max(0, month - 1), 1).toLocaleDateString('es-ES', {
    month: style,
    year: '2-digit'
  });
  return value.replace('.', '').replace(' de ', ' ');
};

const formatDate = (iso: string) => {
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

const compactMoney = (value: number) => new Intl.NumberFormat('es-ES', {
  notation: 'compact',
  maximumFractionDigits: 1
}).format(value) + ' €';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const calculateTwrPct = (months: FlowMonth[]) => (
  (months.reduce((factor, month) => factor * (1 + month.returnPct / 100), 1) - 1) * 100
);

const buildCapitalModel = (
  report: ReportData,
  months: FlowMonth[],
  pendingCashMovements: FlowPendingMovement[]
) => {
  const publishedIncrements = (report.movements ?? [])
    .filter((movement) => movement.type === 'increment')
    .sort((left, right) => left.iso.localeCompare(right.iso));
  const publishedWithdrawals = (report.movements ?? [])
    .filter((movement) => movement.type === 'decrement')
    .sort((left, right) => left.iso.localeCompare(right.iso));
  const pendingIncrements = pendingCashMovements
    .filter((movement) => movement.type === 'increment')
    .sort((left, right) => left.iso.localeCompare(right.iso));
  const pendingWithdrawals = pendingCashMovements
    .filter((movement) => movement.type === 'decrement')
    .sort((left, right) => left.iso.localeCompare(right.iso));

  const firstMonthKey = months[0]?.key ?? new Date().toISOString().slice(0, 7);
  const firstIso = `${firstMonthKey}-01`;
  const derivedOpeningCapital = Math.max(
    0,
    report.saldo + report.decrementos - report.incrementos - report.beneficioTotal
  );
  const publishedIncrementTotal = publishedIncrements.reduce((sum, movement) => sum + movement.amount, 0);
  const undocumentedIncrement = Math.max(0, report.incrementos - publishedIncrementTotal);

  const contributionReturnByIso = new Map<string, number>();
  (report.contributionBreakdowns ?? []).forEach((breakdown) => {
    breakdown.contributions.forEach((contribution) => {
      contributionReturnByIso.set(contribution.iso, contribution.returnPct * 100);
    });
  });

  const sourceLots: SourceLot[] = [];
  if (derivedOpeningCapital > 0.005) {
    sourceLots.push({
      id: 'opening-capital',
      iso: firstIso,
      entryKey: firstMonthKey,
      label: 'Posición de origen',
      amount: derivedOpeningCapital,
      pending: false
    });
  }
  if (undocumentedIncrement > 0.005) {
    sourceLots.push({
      id: 'documented-capital',
      iso: firstIso,
      entryKey: firstMonthKey,
      label: 'Capital inicial documentado',
      amount: undocumentedIncrement,
      pending: false
    });
  }
  publishedIncrements.forEach((movement, index) => {
    sourceLots.push({
      id: `increment-${movement.iso}-${index}`,
      iso: movement.iso,
      entryKey: movement.iso.slice(0, 7),
      label: `Aportación ${formatDate(movement.iso)}`,
      amount: movement.amount,
      pending: false,
      specificEntryReturnPct: contributionReturnByIso.get(movement.iso)
        ?? (movement.returnPct !== undefined ? movement.returnPct * 100 : undefined)
    });
  });
  pendingIncrements.forEach((movement, index) => {
    sourceLots.push({
      id: `pending-increment-${movement.iso}-${index}`,
      iso: movement.iso,
      entryKey: movement.iso.slice(0, 7),
      label: `Aportación ${formatDate(movement.iso)}`,
      amount: movement.amount,
      pending: true
    });
  });

  if (!sourceLots.length && report.saldo > 0) {
    sourceLots.push({
      id: 'fallback-capital',
      iso: firstIso,
      entryKey: firstMonthKey,
      label: 'Capital de origen',
      amount: Math.max(0, report.saldo - report.beneficioTotal),
      pending: false
    });
  }

  const publishedWithdrawalTotal = publishedWithdrawals.reduce((sum, movement) => sum + movement.amount, 0);
  const undocumentedWithdrawal = Math.max(0, report.decrementos - publishedWithdrawalTotal);
  const withdrawals: WithdrawalFlow[] = [
    ...publishedWithdrawals.map((movement, index) => ({
      id: `withdrawal-${movement.iso}-${index}`,
      iso: movement.iso,
      monthKey: movement.iso.slice(0, 7),
      amount: movement.amount,
      pending: false,
      returnPct: movement.returnPct !== undefined ? movement.returnPct * 100 : undefined
    })),
    ...(undocumentedWithdrawal > 0.005 ? [{
      id: 'documented-withdrawal',
      iso: `${months[months.length - 1]?.key ?? firstMonthKey}-28`,
      monthKey: months[months.length - 1]?.key ?? firstMonthKey,
      amount: undocumentedWithdrawal,
      pending: false
    }] : []),
    ...pendingWithdrawals.map((movement, index) => ({
      id: `pending-withdrawal-${movement.iso}-${index}`,
      iso: movement.iso,
      monthKey: movement.iso.slice(0, 7),
      amount: movement.amount,
      pending: true
    }))
  ].sort((left, right) => left.iso.localeCompare(right.iso));

  const mutableLots = sourceLots.map((lot) => ({ ...lot, remainingCapital: lot.amount, allocatedWithdrawal: 0 }));
  withdrawals.forEach((withdrawal) => {
    const eligible = mutableLots.filter((lot) => lot.iso <= withdrawal.iso && lot.remainingCapital > 0.005);
    const eligibleCapital = eligible.reduce((sum, lot) => sum + lot.remainingCapital, 0);
    if (eligibleCapital <= 0) return;
    let unallocated = withdrawal.amount;
    eligible.forEach((lot, index) => {
      const proportionalAmount = index === eligible.length - 1
        ? unallocated
        : withdrawal.amount * (lot.remainingCapital / eligibleCapital);
      const appliedAmount = Math.min(lot.remainingCapital, proportionalAmount);
      lot.remainingCapital -= appliedAmount;
      lot.allocatedWithdrawal += appliedAmount;
      unallocated -= appliedAmount;
    });
  });

  const closedMonths = months.filter((month) => month.hasClose);
  const latestClosedKey = closedMonths[closedMonths.length - 1]?.key ?? '';
  const lotsWithPerformance = mutableLots.map((lot) => {
    const activeMonths = months.filter((month) => month.hasClose && month.key >= lot.entryKey);
    const performanceFactor = activeMonths.reduce((factor, month, index) => {
      const monthlyReturn = index === 0 && month.key === lot.entryKey && lot.specificEntryReturnPct !== undefined
        ? lot.specificEntryReturnPct
        : month.returnPct;
      return factor * (1 + monthlyReturn / 100);
    }, 1);
    return {
      ...lot,
      performanceFactor,
      activeMonths: activeMonths.length,
      rawGain: lot.remainingCapital * (performanceFactor - 1),
      isAfterLatestClose: Boolean(latestClosedKey && lot.entryKey > latestClosedKey)
    };
  });

  const rawGainTotal = lotsWithPerformance.reduce((sum, lot) => sum + lot.rawGain, 0);
  const exposureTotal = lotsWithPerformance.reduce(
    (sum, lot) => sum + (lot.isAfterLatestClose ? 0 : lot.remainingCapital * Math.max(1, lot.activeMonths)),
    0
  );
  const visibleBalance = report.saldo
    + pendingIncrements.reduce((sum, movement) => sum + movement.amount, 0)
    - pendingWithdrawals.reduce((sum, movement) => sum + movement.amount, 0);

  const lots: CapitalLot[] = lotsWithPerformance.map((lot) => {
    let attributedProfit = 0;
    if (!lot.isAfterLatestClose && Math.abs(report.beneficioTotal) > 0.005) {
      if (Math.abs(rawGainTotal) > 0.005 && Math.sign(rawGainTotal) === Math.sign(report.beneficioTotal)) {
        attributedProfit = report.beneficioTotal * (lot.rawGain / rawGainTotal);
      } else if (exposureTotal > 0) {
        attributedProfit = report.beneficioTotal
          * ((lot.remainingCapital * Math.max(1, lot.activeMonths)) / exposureTotal);
      }
    }
    const currentValue = lot.remainingCapital + attributedProfit;
    return {
      id: lot.id,
      iso: lot.iso,
      entryKey: lot.entryKey,
      label: lot.label,
      amount: lot.amount,
      pending: lot.pending,
      specificEntryReturnPct: lot.specificEntryReturnPct,
      remainingCapital: lot.remainingCapital,
      allocatedWithdrawal: lot.allocatedWithdrawal,
      performanceFactor: lot.performanceFactor,
      attributedProfit,
      currentValue,
      sharePct: visibleBalance !== 0 ? (currentValue / visibleBalance) * 100 : 0,
      activeMonths: lot.activeMonths,
      accumulatedReturnPct: lot.remainingCapital > 0 ? (attributedProfit / lot.remainingCapital) * 100 : 0
    };
  });

  return {
    lots,
    withdrawals,
    visibleBalance,
    grossCapital: sourceLots.reduce((sum, lot) => sum + lot.amount, 0),
    netCapital: sourceLots.reduce((sum, lot) => sum + lot.amount, 0)
      - withdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0)
  };
};

export const CapitalFlowReportPage: React.FC<CapitalFlowReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onAnalyticsEvent
}) => {
  const months = useMemo<FlowMonth[]>(() => {
    const validStats = report.monthlyStats
      .filter((item) => item.hasData && Number.isFinite(item.endBalance))
      .sort((left, right) => monthToKey(left.month).localeCompare(monthToKey(right.month)));
    const latestStat = validStats[validStats.length - 1];
    const latestKey = latestStat ? monthToKey(latestStat.month) : '';
    return validStats.map((item) => ({
      key: monthToKey(item.month),
      label: monthLabel(monthToKey(item.month), 'long'),
      returnPct: monthToKey(item.month) === latestKey && Number.isFinite(report.rentabilidadUltimoMes)
        ? report.rentabilidadUltimoMes
        : Number.isFinite(item.profitPct) ? item.profitPct : 0,
      profit: Number.isFinite(item.profit) ? item.profit : 0,
      balance: Number.isFinite(item.endBalance) ? item.endBalance : 0,
      hasClose: true
    }));
  }, [report]);

  const capitalModel = useMemo(
    () => buildCapitalModel(report, months, pendingCashMovements),
    [months, pendingCashMovements, report]
  );

  const timelineKeys = useMemo(() => {
    const keys = new Set(months.map((month) => month.key));
    (report.movements ?? []).forEach((movement) => keys.add(movement.iso.slice(0, 7)));
    pendingCashMovements.forEach((movement) => keys.add(movement.iso.slice(0, 7)));
    return [...keys].sort();
  }, [months, pendingCashMovements, report.movements]);

  const defaultStartIndex = Math.max(0, timelineKeys.length - 12);
  const [periodStartIndex, setPeriodStartIndex] = useState(defaultStartIndex);
  const [displayMode, setDisplayMode] = useState<FlowDisplayMode>('euros');
  const [selectedLotId, setSelectedLotId] = useState('');

  useEffect(() => {
    setPeriodStartIndex(Math.max(0, timelineKeys.length - 12));
  }, [report.clientId, report.createdAt, timelineKeys.length]);

  useEffect(() => {
    if (!capitalModel.lots.some((lot) => lot.id === selectedLotId)) {
      const largestLot = [...capitalModel.lots].sort((left, right) => right.currentValue - left.currentValue)[0];
      setSelectedLotId(largestLot?.id ?? '');
    }
  }, [capitalModel.lots, selectedLotId]);

  const selectedLot = capitalModel.lots.find((lot) => lot.id === selectedLotId)
    ?? capitalModel.lots[0];
  const selectedStartKey = timelineKeys[periodStartIndex] ?? timelineKeys[0] ?? '';
  const selectedEndKey = timelineKeys[timelineKeys.length - 1] ?? '';
  const visibleTimeline = timelineKeys.slice(periodStartIndex);
  const visibleClosedMonths = months.filter((month) => month.key >= selectedStartKey && month.key <= selectedEndKey);
  const periodProfit = visibleClosedMonths.reduce((sum, month) => sum + month.profit, 0);
  const periodTwr = calculateTwrPct(visibleClosedMonths);
  const periodMovements = [
    ...(report.movements ?? []).map((movement) => ({ ...movement, pending: false })),
    ...pendingCashMovements.map((movement) => ({ ...movement, pending: true }))
  ].filter((movement) => movement.iso.slice(0, 7) >= selectedStartKey && movement.iso.slice(0, 7) <= selectedEndKey);
  const periodNetFlow = periodMovements.reduce(
    (sum, movement) => sum + (movement.type === 'increment' ? movement.amount : -movement.amount),
    0
  );
  const isSixMonths = periodStartIndex === Math.max(0, timelineKeys.length - 6);
  const isTwelveMonths = periodStartIndex === Math.max(0, timelineKeys.length - 12);
  const isAllMonths = periodStartIndex === 0;

  const diagramWidth = 1200;
  const diagramHeight = 690;
  const engineTop = 170;
  const engineBottom = 500;
  const laneStart = 270;
  const laneEnd = 1020;
  const lotCount = Math.max(1, capitalModel.lots.length);
  const maxAbsoluteValue = Math.max(1, ...capitalModel.lots.map((lot) => Math.abs(lot.currentValue)));
  const getLotX = (index: number) => lotCount === 1
    ? (laneStart + laneEnd) / 2
    : laneStart + (index / (lotCount - 1)) * (laneEnd - laneStart);
  const getTimelineY = (key: string) => {
    const visibleIndex = visibleTimeline.indexOf(key);
    if (key <= selectedStartKey || visibleIndex < 0) return engineTop;
    return engineTop + (visibleIndex / Math.max(1, visibleTimeline.length - 1)) * (engineBottom - engineTop);
  };

  const setPreset = (monthsBack: number | 'all') => {
    const nextIndex = monthsBack === 'all' ? 0 : Math.max(0, timelineKeys.length - monthsBack);
    setPeriodStartIndex(nextIndex);
    onAnalyticsEvent?.({
      type: 'capital_flow_period_change',
      label: monthsBack === 'all' ? 'Todo el historico' : `${monthsBack} meses`
    });
  };

  const activateLot = (lot: CapitalLot, source: string) => {
    setSelectedLotId(lot.id);
    onAnalyticsEvent?.({
      type: 'capital_flow_lot_focus',
      label: lot.label,
      metadata: { source, pending: lot.pending }
    });
  };

  if (!capitalModel.lots.length) {
    return (
      <div className="pf4-report" ref={rootRef}>
        <div className="pf4-empty"><span>Sala de máquinas</span><h1>No hay capital que representar</h1></div>
      </div>
    );
  }

  return (
    <div className="pf4-report" ref={rootRef}>
      <header className="pf4-topbar">
        <div className="pf4-wordmark"><i />JIGSA <span>Capital Systems</span></div>
        <div className="pf4-topbar-meta">
          <span><small>Cuenta</small><strong>{report.clientCode}</strong></span>
          <span><small>Última publicación</small><strong>{new Date(report.createdAt).toLocaleDateString('es-ES')}</strong></span>
          <span className="pf4-system-status"><i />Sistema conciliado</span>
        </div>
      </header>

      <section className="pf4-hero">
        <div className="pf4-hero-copy">
          <span>Genealogía del saldo</span>
          <h1>Cada euro tiene<br />un recorrido.</h1>
          <p>Observa cómo las aportaciones atravesaron el tiempo, generaron resultado y construyeron el saldo actual.</p>
        </div>
        <div className="pf4-hero-balance">
          <span>Saldo actual</span>
          <strong>{formatCurrency(capitalModel.visibleBalance)}</strong>
          <small>{capitalModel.lots.length} lotes de capital trazados</small>
        </div>
        <div className="pf4-equation" aria-label="Composición del saldo actual">
          <article><span>Capital de origen</span><strong>{formatCurrency(capitalModel.grossCapital)}</strong><small>Aportaciones y posición inicial</small></article>
          <b>−</b>
          <article><span>Capital retirado</span><strong>{formatCurrency(capitalModel.grossCapital - capitalModel.netCapital)}</strong><small>Salidas acumuladas</small></article>
          <b>+</b>
          <article><span>Beneficio acumulado</span><strong className={report.beneficioTotal >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(report.beneficioTotal)}</strong><small>Resultado generado</small></article>
          <b>=</b>
          <article className="is-total"><span>Saldo actual</span><strong>{formatCurrency(capitalModel.visibleBalance)}</strong><small>Capital neto más beneficio</small></article>
        </div>
      </section>

      <section className="pf4-control-deck">
        <div>
          <span>Ventana de trazado</span>
          <strong>{selectedStartKey ? monthLabel(selectedStartKey, 'long') : 'Inicio'} — {selectedEndKey ? monthLabel(selectedEndKey, 'long') : 'Actualidad'}</strong>
        </div>
        <div className="pf4-period-controls">
          <div role="group" aria-label="Periodo del flujo">
            <button type="button" className={isSixMonths && !isAllMonths ? 'is-active' : ''} onClick={() => setPreset(6)}>6M</button>
            <button type="button" className={isTwelveMonths && !isAllMonths ? 'is-active' : ''} onClick={() => setPreset(12)}>12M</button>
            <button type="button" className={isAllMonths ? 'is-active' : ''} onClick={() => setPreset('all')}>Todo</button>
          </div>
          <label>
            <span>Inicio</span>
            <input
              type="range"
              min={0}
              max={Math.max(0, timelineKeys.length - 1)}
              value={periodStartIndex}
              aria-label="Inicio del trazado"
              onChange={(event) => setPeriodStartIndex(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="pf4-display-toggle" role="group" aria-label="Dato mostrado en los lotes">
          <button type="button" className={displayMode === 'euros' ? 'is-active' : ''} aria-pressed={displayMode === 'euros'} onClick={() => setDisplayMode('euros')}>Valor actual</button>
          <button type="button" className={displayMode === 'return' ? 'is-active' : ''} aria-pressed={displayMode === 'return'} onClick={() => setDisplayMode('return')}>Rentabilidad</button>
        </div>
      </section>

      <section className="pf4-engine-section">
        <header className="pf4-section-heading">
          <div><span>Mapa maestro</span><h2>La sala de máquinas del capital</h2></div>
          <div className="pf4-period-readout">
            <span><small>TWR del periodo</small><strong className={periodTwr >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(periodTwr)}</strong></span>
            <span><small>Beneficio del periodo</small><strong className={periodProfit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(periodProfit)}</strong></span>
            <span><small>Flujo neto</small><strong>{signedMoney(periodNetFlow)}</strong></span>
          </div>
        </header>

        <div className="pf4-origin-strip" aria-label="Lotes de capital de origen">
          {capitalModel.lots.map((lot, index) => (
            <button
              type="button"
              key={lot.id}
              className={`${selectedLot?.id === lot.id ? 'is-active' : ''}${lot.pending ? ' is-pending' : ''}`}
              style={{ '--pf4-lot-color': lotPalette[index % lotPalette.length] } as React.CSSProperties}
              aria-pressed={selectedLot?.id === lot.id}
              onClick={() => activateLot(lot, 'origin')}
            >
              <i />
              <span>{lot.label}</span>
              <strong>{displayMode === 'euros' ? formatCurrency(lot.currentValue) : signedPercent(lot.accumulatedReturnPct)}</strong>
              <small>{lot.pending ? 'Pendiente de cierre' : `${lot.activeMonths} meses de recorrido`}</small>
            </button>
          ))}
        </div>

        <div className="pf4-engine-canvas">
          <svg className="pf4-flow-diagram" viewBox={`0 0 ${diagramWidth} ${diagramHeight}`} role="img" aria-label="Diagrama del recorrido del capital">
            <defs>
              <pattern id="pf4-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(136, 184, 177, 0.09)" strokeWidth="1" />
              </pattern>
              <filter id="pf4-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <rect x="0" y="0" width={diagramWidth} height={diagramHeight} fill="url(#pf4-grid)" />
            <text x="46" y="64" className="pf4-svg-kicker">CAPITAL DE ORIGEN</text>
            <text x="46" y="92" className="pf4-svg-copy">Cada carril conserva la identidad de una aportación.</text>
            <rect x="155" y={engineTop - 22} width="940" height={engineBottom - engineTop + 44} rx="18" className="pf4-engine-frame" />
            <text x="178" y={engineTop + 20} className="pf4-svg-kicker">TIEMPO × ESTRATEGIA</text>

            {visibleTimeline.map((key, index) => {
              const y = getTimelineY(key);
              const showLabel = visibleTimeline.length <= 12 || index % 2 === 0 || index === visibleTimeline.length - 1;
              return (
                <g key={key} className="pf4-time-layer">
                  <line x1="178" x2="1072" y1={y} y2={y} />
                  {showLabel ? <text x="184" y={y + 4}>{monthLabel(key)}</text> : null}
                </g>
              );
            })}

            {capitalModel.withdrawals
              .filter((withdrawal) => withdrawal.monthKey >= selectedStartKey && withdrawal.monthKey <= selectedEndKey)
              .map((withdrawal, index) => {
                const y = getTimelineY(withdrawal.monthKey);
                const branchY = y + (index % 2) * 10;
                return (
                  <g key={withdrawal.id} className="pf4-withdrawal-branch">
                    <path d={`M 610 ${branchY} C 470 ${branchY}, 315 ${branchY + 12}, 150 ${branchY + 12}`} />
                    <circle cx="150" cy={branchY + 12} r="7" />
                    <text x="137" y={branchY + 4} textAnchor="end">Retirada {formatDate(withdrawal.iso)}</text>
                    <text x="137" y={branchY + 20} textAnchor="end">−{compactMoney(withdrawal.amount)}</text>
                  </g>
                );
              })}

            {capitalModel.lots.map((lot, index) => {
              const x = getLotX(index);
              const entryY = getTimelineY(lot.entryKey);
              const destinationX = 600 + (index - (lotCount - 1) / 2) * 22;
              const strokeWidth = clamp(12 + Math.abs(lot.currentValue) / maxAbsoluteValue * 54, 12, 66);
              const color = lotPalette[index % lotPalette.length];
              const isActive = selectedLot?.id === lot.id;
              const path = `M ${x} 118 C ${x} 138, ${x} ${Math.max(145, entryY - 30)}, ${x} ${entryY} L ${x} ${engineBottom} C ${x} 560, ${destinationX} 558, ${destinationX} 610`;
              return (
                <g key={lot.id} className={`pf4-capital-lane${isActive ? ' is-active' : ''}`}>
                  <path
                    d={path}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    tabIndex={0}
                    role="button"
                    aria-label={`${lot.label}: valor actual estimado ${formatCurrency(lot.currentValue)}, rentabilidad atribuida ${signedPercent(lot.accumulatedReturnPct)}`}
                    onClick={() => activateLot(lot, 'diagram')}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        activateLot(lot, 'diagram-keyboard');
                      }
                    }}
                  />
                  <circle cx={x} cy="118" r={isActive ? 11 : 8} fill={color} filter={isActive ? 'url(#pf4-glow)' : undefined} />
                  <text x={x} y="92" textAnchor="middle" className="pf4-lane-value">
                    {displayMode === 'euros' ? compactMoney(lot.currentValue) : signedPercent(lot.accumulatedReturnPct)}
                  </text>
                </g>
              );
            })}

            <g className="pf4-destination">
              <rect x="430" y="590" width="340" height="78" rx="16" />
              <text x="600" y="618" textAnchor="middle">SALDO ACTUAL</text>
              <text x="600" y="650" textAnchor="middle">{formatCurrency(capitalModel.visibleBalance)}</text>
            </g>
          </svg>

          <div className="pf4-mobile-flow" aria-label="Recorrido del capital en formato móvil">
            {capitalModel.lots.map((lot, index) => (
              <button
                type="button"
                key={lot.id}
                className={selectedLot?.id === lot.id ? 'is-active' : ''}
                style={{ '--pf4-lot-color': lotPalette[index % lotPalette.length] } as React.CSSProperties}
                onClick={() => activateLot(lot, 'mobile-flow')}
              >
                <i />
                <span><small>Origen</small><strong>{lot.label}</strong><em>{formatCurrency(lot.amount)}</em></span>
                <b>→</b>
                <span><small>Recorrido</small><strong>{lot.pending ? 'Pendiente de cierre' : `${lot.activeMonths} meses`}</strong><em>{signedPercent(lot.accumulatedReturnPct)}</em></span>
                <b>→</b>
                <span><small>Valor atribuido</small><strong>{formatCurrency(lot.currentValue)}</strong><em>{lot.sharePct.toLocaleString('es-ES', { maximumFractionDigits: 1 })} % del saldo</em></span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {selectedLot ? (
        <section className="pf4-inspector" aria-live="polite">
          <div className="pf4-inspector-title">
            <span>Lote seleccionado</span>
            <h2>{selectedLot.label}</h2>
            <p>Seguimiento estimado desde su incorporación hasta el último cierre publicado.</p>
          </div>
          <div className="pf4-inspector-value">
            <span>Valor actual atribuido</span>
            <strong>{formatCurrency(selectedLot.currentValue)}</strong>
            <small>{selectedLot.sharePct.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} % del saldo actual</small>
          </div>
          <div className="pf4-inspector-grid">
            <article><span>Capital incorporado</span><strong>{formatCurrency(selectedLot.amount)}</strong><small>{formatDate(selectedLot.iso)}</small></article>
            <article><span>Capital aún invertido</span><strong>{formatCurrency(selectedLot.remainingCapital)}</strong><small>{selectedLot.allocatedWithdrawal > 0 ? `${formatCurrency(selectedLot.allocatedWithdrawal)} atribuidos a retiradas` : 'Sin salidas atribuidas'}</small></article>
            <article><span>Beneficio atribuido</span><strong className={selectedLot.attributedProfit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(selectedLot.attributedProfit)}</strong><small>Estimación conciliada</small></article>
            <article><span>Rentabilidad atribuida</span><strong className={selectedLot.accumulatedReturnPct >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(selectedLot.accumulatedReturnPct)}</strong><small>{selectedLot.activeMonths} cierres recorridos</small></article>
          </div>
          {selectedLot.specificEntryReturnPct !== undefined ? (
            <div className="pf4-entry-signal"><i />El mes de entrada utilizó una rentabilidad específica de <strong>{signedPercent(selectedLot.specificEntryReturnPct)}</strong>.</div>
          ) : null}
        </section>
      ) : null}

      <section className="pf4-register">
        <header className="pf4-section-heading">
          <div><span>Registro de lotes</span><h2>De dónde procede el saldo</h2></div>
          <p>Todos los importes terminan en la misma ecuación, pero conservan su historia.</p>
        </header>
        <div className="pf4-register-head" aria-hidden="true">
          <span>Origen</span><span>Capital incorporado</span><span>Retiradas atribuidas</span><span>Beneficio atribuido</span><span>Valor actual</span><span>Peso</span>
        </div>
        <div className="pf4-register-rows">
          {capitalModel.lots.map((lot, index) => (
            <button
              type="button"
              key={lot.id}
              className={selectedLot?.id === lot.id ? 'is-active' : ''}
              onClick={() => activateLot(lot, 'register')}
            >
              <span style={{ '--pf4-lot-color': lotPalette[index % lotPalette.length] } as React.CSSProperties}><i />{lot.label}<small>{lot.pending ? 'Pendiente de cierre' : formatDate(lot.iso)}</small></span>
              <strong data-label="Capital incorporado">{formatCurrency(lot.amount)}</strong>
              <strong data-label="Retiradas atribuidas">{lot.allocatedWithdrawal > 0 ? `−${formatCurrency(lot.allocatedWithdrawal)}` : '—'}</strong>
              <strong data-label="Beneficio atribuido" className={lot.attributedProfit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(lot.attributedProfit)}</strong>
              <strong data-label="Valor actual">{formatCurrency(lot.currentValue)}</strong>
              <strong data-label="Peso">{lot.sharePct.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="pf4-method">
        <div><span>Nota metodológica</span><h2>Una lectura trazable, no una segunda contabilidad.</h2></div>
        <p>La atribución por lote es una estimación pedagógica: combina el rendimiento publicado desde cada fecha de entrada, distribuye proporcionalmente las retiradas y reconcilia el resultado con el saldo total. Los importes oficiales siguen siendo el saldo, los movimientos y los cierres publicados.</p>
      </section>

      <footer className="pf4-footer">
        <div><span>JIGSA</span><small>Capital systems · trace 04</small></div>
        <strong>{capitalModel.netCapital >= 0 ? formatCurrency(capitalModel.netCapital) : signedMoney(capitalModel.netCapital)} capital neto + {signedMoney(report.beneficioTotal)} = {formatCurrency(capitalModel.visibleBalance)}</strong>
        <span>{report.clientCode}</span>
      </footer>
    </div>
  );
};
