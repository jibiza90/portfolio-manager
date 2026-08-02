import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getReportByToken, isValidReportToken, ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import { calculateTWR, calculateAllMonthsTWR } from '../utils/twr';
import type { GeneralReferenceMonth } from '../services/cloudPortfolio';

interface ReportViewProps {
  token?: string;
  reportData?: ReportData | null;
  downloadSignal?: number;
  generalReferenceMonthly?: GeneralReferenceMonth[];
}

interface PatrimonyTooltipState {
  month: string;
  value: number;
  x: number;
  y: number;
}

interface InfoTooltipState {
  visible: boolean;
}

const axisCurrencyFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0
});

const formatAxisCurrency = (value: number) => axisCurrencyFormatter.format(value);
const formatCurrencyNoCents = (value: number) => axisCurrencyFormatter.format(Number.isFinite(value) ? value : 0);
const formatSignedCurrency = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (Math.abs(safeValue) < 0.005) return formatCurrency(0);
  return `${safeValue > 0 ? '+' : '-'}${formatCurrency(Math.abs(safeValue))}`;
};
const formatSignedPercent = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (Math.abs(safeValue) < 0.005) return '0.00%';
  return `${safeValue > 0 ? '+' : '-'}${Math.abs(safeValue).toFixed(2)}%`;
};

const getNiceStep = (rawStep: number) => {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const fraction = rawStep / power;
  if (fraction <= 1) return power;
  if (fraction <= 2) return 2 * power;
  if (fraction <= 5) return 5 * power;
  return 10 * power;
};

const buildAxisTicks = (minValue: number, maxValue: number, step: number) => {
  const ticks: number[] = [];
  for (let value = maxValue; value >= minValue; value -= step) {
    ticks.push(value);
  }
  if (ticks[ticks.length - 1] !== minValue) {
    ticks.push(minValue);
  }
  return ticks;
};

const buildNiceAxis = (values: number[], approxTickCount = 6) => {
  if (!values.length) {
    const fallbackTicks = [100000, 75000, 50000, 25000, 0];
    return { min: 0, max: 100000, ticks: fallbackTicks };
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  if (minValue === maxValue) {
    const step = getNiceStep(Math.max(1, Math.abs(maxValue) / Math.max(1, approxTickCount - 1)));
    const min = Math.max(0, Math.floor((minValue - step) / step) * step);
    const max = Math.ceil((maxValue + step) / step) * step;
    return { min, max, ticks: buildAxisTicks(min, max, step) };
  }

  const step = getNiceStep((maxValue - minValue) / Math.max(1, approxTickCount - 1));
  const min = Math.max(0, Math.floor(minValue / step) * step);
  const max = Math.ceil(maxValue / step) * step;
  return { min, max, ticks: buildAxisTicks(min, max, step) };
};

const monthIndexByLabel: Record<string, number> = {
  ene: 0,
  enero: 0,
  jan: 0,
  january: 0,
  feb: 1,
  febrero: 1,
  february: 1,
  mar: 2,
  marzo: 2,
  march: 2,
  abr: 3,
  abril: 3,
  apr: 3,
  april: 3,
  may: 4,
  mayo: 4,
  jun: 5,
  junio: 5,
  june: 5,
  jul: 6,
  julio: 6,
  july: 6,
  ago: 7,
  agosto: 7,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  septiembre: 8,
  september: 8,
  oct: 9,
  octubre: 9,
  october: 9,
  nov: 10,
  noviembre: 10,
  november: 10,
  dic: 11,
  diciembre: 11,
  dec: 11,
  december: 11
};

const getMonthEndLabel = (monthLabel: string) => {
  const parts = monthLabel.trim().split(/\s+/);
  if (parts.length < 2) return monthLabel;
  const monthIndex = monthIndexByLabel[parts[0].toLowerCase()];
  const year = Number(parts[parts.length - 1]);
  if (monthIndex === undefined || !Number.isFinite(year)) return monthLabel;
  const monthEnd = new Date(year, monthIndex + 1, 0);
  return monthEnd.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const getLongMonthLabel = (monthLabel: string) => {
  const parts = monthLabel.trim().split(/\s+/);
  if (parts.length < 2) return monthLabel;
  const monthIndex = monthIndexByLabel[parts[0].toLowerCase()];
  const year = Number(parts[parts.length - 1]);
  if (monthIndex === undefined || !Number.isFinite(year)) return monthLabel;
  const date = new Date(year, monthIndex, 1);
  return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
};

const getCompactMonthLabel = (monthLabel: string) => {
  const parts = monthLabel.trim().split(/\s+/);
  if (parts.length < 2) return monthLabel;
  const monthIndex = monthIndexByLabel[parts[0].toLowerCase()];
  const year = Number(parts[parts.length - 1]);
  if (monthIndex === undefined || !Number.isFinite(year)) return monthLabel;
  const date = new Date(year, monthIndex, 1);
  const month = date.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${String(year).slice(-2)}`;
};

const CONTRIBUTION_BREAKDOWN_START_MONTH = '2026-04';

const reportMonthToKey = (monthValue: string) => {
  if (/^\d{4}-\d{2}$/.test(monthValue)) return monthValue;
  const parts = monthValue.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return monthValue;
  const monthIndex = monthIndexByLabel[parts[0]];
  const year = Number(parts[parts.length - 1]);
  if (monthIndex === undefined || !Number.isFinite(year)) return monthValue;
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
};

const getShortDateLabel = (iso: string) => {
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}.${month}.${year}`;
};

export const ReportView: React.FC<ReportViewProps> = ({
  token,
  reportData,
  downloadSignal,
  generalReferenceMonthly = []
}) => {
  const [report, setReport] = useState<ReportData | null>(reportData ?? null);
  const [loading, setLoading] = useState(!reportData);
  const [expired, setExpired] = useState(false);
  const [hoveredPatrimonyPoint, setHoveredPatrimonyPoint] = useState<PatrimonyTooltipState | null>(null);
  const [hoveredMonthlyBar, setHoveredMonthlyBar] = useState<{ month: string; value: number } | null>(null);
  const [infoTooltip, setInfoTooltip] = useState<InfoTooltipState>({ visible: false });
  const [expandedContributionMonths, setExpandedContributionMonths] = useState<Record<string, boolean>>({});
  const [periodPreset, setPeriodPreset] = useState('all');
  const [periodStartMonth, setPeriodStartMonth] = useState('');
  const [periodEndMonth, setPeriodEndMonth] = useState('');
  const [chartView, setChartView] = useState<'return' | 'profit' | 'balance' | 'general'>('return');
  const [isPatrimonyExpanded, setIsPatrimonyExpanded] = useState(false);
  const [expandedStartMonth, setExpandedStartMonth] = useState('');
  const [expandedEndMonth, setExpandedEndMonth] = useState('');
  const reportRef = useRef<HTMLDivElement>(null);
  const lastDownloadSignalRef = useRef(downloadSignal ?? 0);
  const twrExplanation = 'Mide la evolución de la cartera aislando el efecto de las aportaciones y retiradas de dinero. Permite conocer cómo se han comportado las inversiones durante un periodo determinado, independientemente de cuándo el cliente haya ingresado o retirado capital.';
  const totalReturnExplanation = 'Mide el resultado acumulado de la inversión en relación con el capital neto aportado por el cliente. Por este motivo, puede variar cuando se realizan nuevas aportaciones o retiradas de dinero.';

  useEffect(() => {
    if (reportData) {
      setReport(reportData);
      setLoading(false);
      setExpired(false);
      return;
    }
    if (!token) {
      setLoading(false);
      setExpired(true);
      return;
    }
    const loadReport = async () => {
      if (!isValidReportToken(token)) {
        setExpired(true);
        setLoading(false);
        return;
      }
      const data = await getReportByToken(token);
      if (data) {
        setReport(data);
      } else {
        setExpired(true);
      }
      setLoading(false);
    };
    loadReport();
  }, [reportData, token]);

  useEffect(() => {
    setExpandedContributionMonths({});
  }, [report?.clientId]);

  useEffect(() => {
    if (chartView === 'general' && generalReferenceMonthly.length === 0) {
      setChartView('return');
    }
  }, [chartView, generalReferenceMonthly.length]);

  useEffect(() => {
    if (!report) return;
    setPeriodPreset('last12');
  }, [report?.clientId]);

  useEffect(() => {
    if (!isPatrimonyExpanded) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPatrimonyExpanded(false);
        setHoveredPatrimonyPoint(null);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isPatrimonyExpanded]);

  const handleDownload = async () => {
    if (!report) return;
    await handleDownloadModernReport();
  };

  useEffect(() => {
    if (downloadSignal === undefined) return;
    if (downloadSignal === lastDownloadSignalRef.current) return;
    lastDownloadSignalRef.current = downloadSignal;
    void handleDownload();
  }, [downloadSignal]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="informes-container informes-pro-page fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <div className="glass-card report-pro-panel" style={{ padding: 40, textAlign: 'center' }}>
          <p>Cargando informe...</p>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="informes-container informes-pro-page fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <div className="glass-card report-pro-panel" style={{ padding: 40, textAlign: 'center' }}>
          <h2>Enlace caducado</h2>
          <p>Este enlace de informe ha caducado o no es valido.</p>
          <p className="muted">Los enlaces de informe tienen una validez de 24 horas.</p>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const monthlyWithData = report.monthlyStats.filter(
    (m) =>
      m.hasData &&
      m.profit !== null &&
      m.profitPct !== null &&
      m.endBalance !== null &&
      ((m.profit ?? 0) !== 0 || (m.profitPct ?? 0) !== 0 || (m.endBalance ?? 0) !== 0)
  );
  const contributionBreakdowns = (report.contributionBreakdowns ?? []).filter(
    (item) => reportMonthToKey(item.month) >= CONTRIBUTION_BREAKDOWN_START_MONTH
  );
  const tableContributionBreakdowns = (report.contributionBreakdowns ?? []).filter(
    (item) =>
      reportMonthToKey(item.month) >= CONTRIBUTION_BREAKDOWN_START_MONTH &&
      (item.contributions.length > 0 || (item.withdrawals?.length ?? 0) > 0)
  );
  const tableContributionByMonth = new Map(
    tableContributionBreakdowns.map((item) => [reportMonthToKey(item.month), item])
  );
  const latestVisibleMonthKey = monthlyWithData.length > 0
    ? reportMonthToKey(monthlyWithData[monthlyWithData.length - 1].month)
    : '';
  const getVisibleMonthReturnPct = (monthKey: string, fallbackPct: number) => {
    if (monthKey === latestVisibleMonthKey && Number.isFinite(report.rentabilidadUltimoMes)) {
      return report.rentabilidadUltimoMes;
    }
    const month = monthlyWithData.find((item) => reportMonthToKey(item.month) === monthKey);
    return Number.isFinite(month?.profitPct) ? month?.profitPct ?? fallbackPct : fallbackPct;
  };
  const getDisplayedMonthReturnPct = (month: (typeof monthlyWithData)[number]) => {
    return getVisibleMonthReturnPct(reportMonthToKey(month.month), month.profitPct);
  };
  const visibleContributionBreakdowns: typeof contributionBreakdowns = [];
  const periodOptions = monthlyWithData.map((m) => ({
    key: reportMonthToKey(m.month),
    label: m.month
  }));
  const firstPeriodKey = periodOptions[0]?.key ?? '';
  const lastPeriodKey = periodOptions[periodOptions.length - 1]?.key ?? '';
  const periodKeys = periodOptions.map((option) => option.key);
  const presetRange = (() => {
    if (periodPreset === '2025') return { start: '2025-01', end: '2025-12' };
    if (periodPreset === '2026') return { start: '2026-01', end: '2026-12' };
    if (periodPreset === 'last3') {
      const start = periodKeys[Math.max(0, periodKeys.length - 3)] ?? firstPeriodKey;
      return { start, end: lastPeriodKey };
    }
    if (periodPreset === 'last6') {
      const start = periodKeys[Math.max(0, periodKeys.length - 6)] ?? firstPeriodKey;
      return { start, end: lastPeriodKey };
    }
    if (periodPreset === 'last12') {
      const start = periodKeys[Math.max(0, periodKeys.length - 12)] ?? firstPeriodKey;
      return { start, end: lastPeriodKey };
    }
    if (periodPreset === 'custom') {
      return {
        start: periodStartMonth || firstPeriodKey,
        end: periodEndMonth || lastPeriodKey
      };
    }
    return { start: firstPeriodKey, end: lastPeriodKey };
  })();
  const selectedStart = presetRange.start || firstPeriodKey;
  const selectedEnd = presetRange.end || lastPeriodKey;
  const rangeStart = selectedStart <= selectedEnd ? selectedStart : selectedEnd;
  const rangeEnd = selectedStart <= selectedEnd ? selectedEnd : selectedStart;
  const filteredMonthlyWithData = rangeStart && rangeEnd
    ? monthlyWithData.filter((m) => {
      const key = reportMonthToKey(m.month);
      return key >= rangeStart && key <= rangeEnd;
    })
    : monthlyWithData;
  const effectiveMonthlyWithData = filteredMonthlyWithData.length > 0 ? filteredMonthlyWithData : monthlyWithData;
  const generalReturnByMonth = new Map(
    generalReferenceMonthly.map((item) => [item.month, item.returnPct * 100])
  );
  const hasGeneralReference = monthlyWithData.some((month) => generalReturnByMonth.has(reportMonthToKey(month.month)));
  const chartMonthlyData = chartView === 'general'
    ? effectiveMonthlyWithData.filter((month) => generalReturnByMonth.has(reportMonthToKey(month.month)))
    : effectiveMonthlyWithData;
  const getChartValue = (month: (typeof monthlyWithData)[number]) => {
    if (chartView === 'profit') return month.profit ?? 0;
    if (chartView === 'balance') return month.endBalance ?? 0;
    if (chartView === 'general') return generalReturnByMonth.get(reportMonthToKey(month.month)) ?? 0;
    return getDisplayedMonthReturnPct(month);
  };
  const isPercentageChart = chartView === 'return' || chartView === 'general';
  const formatChartValue = (value: number) =>
    isPercentageChart ? `${value.toFixed(2)}%` : formatCurrencyNoCents(value);
  const formatChartTooltipValue = (value: number) =>
    isPercentageChart ? `${value.toFixed(2)}%` : formatCurrency(value);
  const chartTitle = chartView === 'profit'
    ? 'Beneficio mensual'
    : chartView === 'balance'
      ? 'Saldo mensual'
      : chartView === 'general'
        ? 'Rentabilidad general de la estrategia'
        : 'Rentabilidad mensual';
  const chartSubtitle = chartView === 'general'
    ? 'Referencia informativa de la rentabilidad mensual general'
    : 'Comparativa mensual segun el periodo seleccionado';
  const monthlyChartMinWidth = chartMonthlyData.length > 12 ? `${chartMonthlyData.length * 86}px` : '100%';
  const hasNegativeMonth = chartMonthlyData.some((m) => getChartValue(m) < 0);
  const maxMonthPct = Math.max(1, ...chartMonthlyData.map((m) => Math.abs(getChartValue(m))));
  const patrimonioWithData = report.patrimonioEvolution.filter((p) => p.hasData && p.balance !== undefined && (p.balance ?? 0) !== 0);
  const patrimonioChartData = rangeStart && rangeEnd
    ? patrimonioWithData.filter((p) => {
      const key = reportMonthToKey(p.month);
      return key >= rangeStart && key <= rangeEnd;
    })
    : patrimonioWithData;
  const effectivePatrimonioData = patrimonioChartData.length > 0 ? patrimonioChartData : patrimonioWithData;
  const buildPatrimonyGeometry = (
    data: typeof patrimonioWithData,
    width: number,
    height: number,
    pads: { left: number; right: number; top: number; bottom: number }
  ) => {
    const plotW = width - pads.left - pads.right;
    const plotH = height - pads.top - pads.bottom;
    const plotBottom = pads.top + plotH;
    const values = data.map((p) => p.balance as number);
    const axis = buildNiceAxis([0, ...values]);
    const min = 0;
    const max = axis.max;
    const ticks = axis.ticks.includes(0) ? axis.ticks : [...axis.ticks, 0];
    const axisSpan = Math.max(1, max - min);
    const points = data.map((p, idx) => {
      const value = p.balance as number;
      const x = data.length <= 1
        ? pads.left + plotW / 2
        : pads.left + ((idx + 0.5) / data.length) * plotW;
      const y = pads.top + (1 - (value - min) / axisSpan) * plotH;
      return { x, y, value, month: p.month };
    });
    const linePoints = points.map((pt) => `${pt.x},${pt.y}`).join(' ');
    const areaPath = points.length > 1
      ? `M ${points[0].x},${plotBottom} L ${linePoints} L ${points[points.length - 1].x},${plotBottom} Z`
      : '';
    const yTicks = ticks.map((value) => ({
      value,
      y: pads.top + (1 - (value - min) / axisSpan) * plotH
    }));

    return { width, height, ...pads, plotBottom, points, linePoints, areaPath, yTicks };
  };
  const chartW = 1000;
  const chartH = 360;
  const patrimonyGeometry = buildPatrimonyGeometry(effectivePatrimonioData, chartW, chartH, {
    left: 78,
    right: 24,
    top: 20,
    bottom: 18
  });
  const expandedSelectedStart = expandedStartMonth || rangeStart || firstPeriodKey;
  const expandedSelectedEnd = expandedEndMonth || rangeEnd || lastPeriodKey;
  const expandedRangeStart = expandedSelectedStart <= expandedSelectedEnd ? expandedSelectedStart : expandedSelectedEnd;
  const expandedRangeEnd = expandedSelectedStart <= expandedSelectedEnd ? expandedSelectedEnd : expandedSelectedStart;
  const expandedPatrimonioData = expandedRangeStart && expandedRangeEnd
    ? patrimonioWithData.filter((p) => {
      const key = reportMonthToKey(p.month);
      return key >= expandedRangeStart && key <= expandedRangeEnd;
    })
    : patrimonioWithData;
  const effectiveExpandedPatrimonioData = expandedPatrimonioData.length > 0 ? expandedPatrimonioData : patrimonioWithData;
  const expandedChartW = 1600;
  const expandedChartH = 760;
  const expandedPatrimonyGeometry = buildPatrimonyGeometry(effectiveExpandedPatrimonioData, expandedChartW, expandedChartH, {
    left: 118,
    right: 60,
    top: 42,
    bottom: 28
  });
  const movementCapitalSeries = (report.movements ?? []).reduce<Array<{ iso: string; type: string; amount: number; netCapital: number }>>((acc, mov) => {
    const previousNet = acc.length ? acc[acc.length - 1].netCapital : 0;
    acc.push({
      iso: mov.iso,
      type: mov.type,
      amount: mov.amount,
      netCapital: previousNet + (mov.type === 'increment' ? mov.amount : -mov.amount)
    });
    return acc;
  }, []);
  const periodMovements = (report.movements ?? []).filter((movement) => {
    const monthKey = movement.iso.slice(0, 7);
    return !rangeStart || !rangeEnd || (monthKey >= rangeStart && monthKey <= rangeEnd);
  });
  const visibleMovementCapitalSeries = periodMovements.reduce<Array<{ iso: string; type: string; amount: number; netCapital: number }>>((acc, mov) => {
    const previousNet = acc.length ? acc[acc.length - 1].netCapital : 0;
    acc.push({
      iso: mov.iso,
      type: mov.type,
      amount: mov.amount,
      netCapital: previousNet + (mov.type === 'increment' ? mov.amount : -mov.amount)
    });
    return acc;
  }, []);
  const periodIncrements = periodMovements
    .filter((movement) => movement.type === 'increment')
    .reduce((sum, movement) => sum + (movement.amount ?? 0), 0);
  const periodDecrements = periodMovements
    .filter((movement) => movement.type === 'decrement')
    .reduce((sum, movement) => sum + (movement.amount ?? 0), 0);
  const periodProfit = effectiveMonthlyWithData.reduce((sum, month) => sum + (month.profit ?? 0), 0);
  const firstMonth = effectiveMonthlyWithData[0];
  const lastMonth = effectiveMonthlyWithData[effectiveMonthlyWithData.length - 1];
  const firstMonthKey = firstMonth ? reportMonthToKey(firstMonth.month) : '';
  const firstMonthMovements = (report.movements ?? []).filter((movement) => movement.iso.slice(0, 7) === firstMonthKey);
  const firstMonthNetFlow = firstMonthMovements.reduce((sum, movement) => (
    sum + (movement.type === 'increment' ? movement.amount : -movement.amount)
  ), 0);
  const previousMonth = firstMonth
    ? [...monthlyWithData].reverse().find((month) => reportMonthToKey(month.month) < firstMonthKey)
    : undefined;
  const periodStartBalance = previousMonth?.endBalance ?? (
    firstMonth ? (firstMonth.endBalance ?? 0) - (firstMonth.profit ?? 0) - firstMonthNetFlow : 0
  );
  const periodEndBalance = lastMonth?.endBalance ?? 0;
  const periodReturnPct = effectiveMonthlyWithData.reduce(
    (factor, month) => factor * (1 + getDisplayedMonthReturnPct(month) / 100),
    1
  ) - 1;
  const accumulatedNetCapital = report.incrementos - report.decrementos;
  const firstMovementIso = (report.movements ?? [])
    .map((movement) => movement.iso)
    .filter(Boolean)
    .sort()[0];
  const firstRegisteredDateLabel = firstMovementIso
    ? getShortDateLabel(firstMovementIso)
    : monthlyWithData[0]
      ? getMonthEndLabel(monthlyWithData[0].month)
      : 'el inicio';
  const latestMonth = monthlyWithData[monthlyWithData.length - 1];
  const latestMonthLabel = latestMonth ? getLongMonthLabel(latestMonth.month) : 'ultimo mes';
  const waterfallValues = [report.incrementos, report.decrementos, report.beneficioTotal, report.saldo];
  const waterfallScaleMax = Math.max(...waterfallValues.map((value) => Math.abs(value)), 1);
  const waterfallHeight = (value: number, min = 16) => `${Math.max(min, Math.min(100, (Math.abs(value) / waterfallScaleMax) * 100))}%`;
  const waterfallFormulaOk = Math.abs((report.incrementos - report.decrementos + report.beneficioTotal) - report.saldo) < 1;
  const monthlyMovementType = (monthKey: string) => {
    const movements = (report.movements ?? []).filter((movement) => movement.iso.slice(0, 7) === monthKey);
    const hasIncrement = movements.some((movement) => movement.type === 'increment');
    const hasDecrement = movements.some((movement) => movement.type === 'decrement');
    if (hasIncrement && hasDecrement) return 'Movimientos';
    if (hasIncrement) return 'Aportacion';
    if (hasDecrement) return 'Retirada';
    return '';
  };
  const hasVisibleMonthlyBreakdowns = effectiveMonthlyWithData.some((month) =>
    tableContributionByMonth.has(reportMonthToKey(month.month))
  );
  const toggleMonthlyBreakdown = (monthKey: string, source: 'benefits' | 'monthly') => {
    const willExpand = !expandedContributionMonths[monthKey];
    setExpandedContributionMonths((prev) => ({ ...prev, [monthKey]: willExpand }));
    if (!willExpand) return;

    window.setTimeout(() => {
      document
        .getElementById(`report-month-detail-${source}-${monthKey}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };
  const renderMonthlyDetailButton = (
    monthKey: string,
    monthLabel: string,
    source: 'benefits' | 'monthly'
  ) => {
    const expanded = !!expandedContributionMonths[monthKey];
    return (
      <button
        type="button"
        className="report-pro-detail-button"
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Ocultar' : 'Ver'} detalle de ${monthLabel}`}
        title={`${expanded ? 'Ocultar' : 'Ver'} el desglose de rentabilidad y beneficio`}
        onClick={() => toggleMonthlyBreakdown(monthKey, source)}
      >
        <span className="report-pro-detail-button-icon" aria-hidden="true">{expanded ? '-' : '+'}</span>
        <span>{expanded ? 'Ocultar detalle' : 'Ver detalle'}</span>
      </button>
    );
  };
  const renderWithdrawalDistribution = (
    openingCapital: number,
    retainedCapital: number,
    retainedProfit: number,
    contributions: NonNullable<ReportData['contributionBreakdowns']>[number]['contributions'],
    withdrawals: NonNullable<NonNullable<ReportData['contributionBreakdowns']>[number]['withdrawals']>,
    totalProfit: number
  ) => (
    <div className="report-pro-withdrawal-story">
      <strong className="report-pro-withdrawal-story-opening">
        Saldo al inicio del mes: {formatCurrency(openingCapital)}
      </strong>
      <p>Este saldo se distribuye de la siguiente manera:</p>
      <ul>
        <li>
          <strong>{formatCurrency(retainedCapital)}</strong> continuaron invertidos hasta final de mes y generaron <strong>{formatCurrency(retainedProfit)}</strong>.
        </li>
        {withdrawals.map((withdrawal) => (
          <li key={`story-withdrawal-${withdrawal.iso}-${withdrawal.amount}`}>
            <strong>{formatCurrency(withdrawal.amount)}</strong> estuvieron invertidos hasta su retirada el <strong>{getShortDateLabel(withdrawal.iso)}</strong> y generaron <strong>{formatCurrency(withdrawal.profit)}</strong>.
          </li>
        ))}
        {contributions.map((contribution) => (
          <li key={`story-contribution-${contribution.iso}-${contribution.amount}`}>
            La aportaci&oacute;n de <strong>{formatCurrency(contribution.amount)}</strong> del <strong>{getShortDateLabel(contribution.iso)}</strong> gener&oacute; <strong>{formatCurrency(contribution.profit)}</strong>.
          </li>
        ))}
      </ul>
      <div className="report-pro-withdrawal-story-total">
        <span>Beneficio total del mes</span>
        <strong>{formatCurrency(totalProfit)}</strong>
      </div>
    </div>
  );
  const renderMonthlyBreakdownRow = (
    month: (typeof monthlyWithData)[number],
    breakdown: NonNullable<ReportData['contributionBreakdowns']>[number],
    colSpan: number,
    source: 'benefits' | 'monthly'
  ) => {
    const monthKey = reportMonthToKey(month.month);
    if (!expandedContributionMonths[monthKey]) return null;

    const visibleInitialPct = getVisibleMonthReturnPct(monthKey, breakdown.initialReturnPct * 100);
    const visibleInitialProfit = breakdown.initialCapital * (visibleInitialPct / 100);
    const withdrawals = breakdown.withdrawals ?? [];
    const openingCapital = breakdown.openingCapital ?? breakdown.initialCapital;
    const totalContributions = breakdown.contributions.reduce((sum, contribution) => sum + contribution.amount, 0);
    const totalWithdrawals = withdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0);
    const explainedTotalProfit =
      visibleInitialProfit +
      breakdown.contributions.reduce((sum, contribution) => sum + contribution.profit, 0) +
      withdrawals.reduce((sum, withdrawal) => sum + withdrawal.profit, 0);

    return (
      <tr id={`report-month-detail-${source}-${monthKey}`} className="report-pro-expanded-row">
        <td colSpan={colSpan}>
          <div className="report-pro-inline-breakdown">
            <div className="report-pro-inline-title">
              <strong>Detalle de rentabilidad del mes - {month.month}</strong>
            </div>
            {totalWithdrawals > 0
              ? renderWithdrawalDistribution(
                  openingCapital,
                  breakdown.initialCapital,
                  visibleInitialProfit,
                  breakdown.contributions,
                  withdrawals,
                  explainedTotalProfit
                )
              : (
                <div className="report-pro-flow-summary">
                  <div><span>Saldo al inicio del mes</span><strong>{formatCurrency(openingCapital)}</strong></div>
                  {totalContributions > 0 ? <div><span>Aportaciones del mes</span><strong>+{formatCurrency(totalContributions)}</strong></div> : null}
                  <div className="is-final"><span>Saldo al cierre del mes</span><strong>{formatCurrency(month.endBalance ?? 0)}</strong></div>
                </div>
              )}
            <table>
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th className="text-right">Importe</th>
                  <th className="text-right">Rentabilidad aplicada</th>
                  <th className="text-right">Beneficio generado</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{withdrawals.length > 0 ? 'Capital mantenido hasta final de mes' : 'Posición inicial del mes'}</td>
                  <td className="text-right">{formatCurrency(breakdown.initialCapital)}</td>
                  <td className={`text-right ${visibleInitialPct >= 0 ? 'positive' : 'negative'}`}>
                    {visibleInitialPct.toFixed(2)}%
                  </td>
                  <td className={`text-right ${visibleInitialProfit >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(visibleInitialProfit)}
                  </td>
                </tr>
                {breakdown.contributions.map((contribution) => (
                  <tr key={`${monthKey}-${contribution.iso}-${contribution.amount}`}>
                    <td>Aportaci&oacute;n incorporada el {getShortDateLabel(contribution.iso)}</td>
                    <td className="text-right">{formatCurrency(contribution.amount)}</td>
                    <td className={`text-right ${contribution.returnPct >= 0 ? 'positive' : 'negative'}`}>
                      {(contribution.returnPct * 100).toFixed(2)}%
                    </td>
                    <td className={`text-right ${contribution.profit >= 0 ? 'positive' : 'negative'}`}>
                      {formatCurrency(contribution.profit)}
                    </td>
                  </tr>
                ))}
                {withdrawals.map((withdrawal) => (
                  <tr key={`${monthKey}-${withdrawal.iso}-${withdrawal.amount}-withdrawal`}>
                    <td>Capital retirado el {getShortDateLabel(withdrawal.iso)}</td>
                    <td className="text-right">{formatCurrency(withdrawal.amount)}</td>
                    <td className={`text-right ${(withdrawal.returnPct ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                      {withdrawal.returnPct === undefined ? '—' : `${(withdrawal.returnPct * 100).toFixed(2)}%`}
                    </td>
                    <td className={`text-right ${withdrawal.profit >= 0 ? 'positive' : 'negative'}`}>
                      {formatCurrency(withdrawal.profit)}
                    </td>
                  </tr>
                ))}
                <tr className="report-pro-breakdown-total">
                  <td>Beneficio total del mes</td>
                  <td className="text-right">—</td>
                  <td className="text-right">—</td>
                  <td className={`text-right ${explainedTotalProfit >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(explainedTotalProfit)}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="report-pro-balance-formula">
              <span>Comprobaci&oacute;n del saldo final</span>
              <strong>
                {formatCurrency(openingCapital)}
                {totalContributions > 0 ? ` + ${formatCurrency(totalContributions)}` : ''}
                {totalWithdrawals > 0 ? ` - ${formatCurrency(totalWithdrawals)}` : ''}
                {` ${formatSignedCurrency(explainedTotalProfit)} = ${formatCurrency(month.endBalance ?? 0)}`}
              </strong>
            </div>
          </div>
        </td>
      </tr>
    );
  };

  async function handleDownloadModernReport() {
    const currentReport = report;
    if (!currentReport) return;
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 34;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const colors = {
      ink: [7, 27, 43] as const,
      muted: [83, 102, 124] as const,
      teal: [15, 109, 122] as const,
      blue: [14, 165, 233] as const,
      soft: [244, 249, 252] as const,
      border: [213, 226, 235] as const,
      green: [15, 109, 122] as const,
      red: [220, 38, 38] as const,
      white: [255, 255, 255] as const
    };

    const setText = (color: readonly [number, number, number]) => doc.setTextColor(color[0], color[1], color[2]);
    const setFill = (color: readonly [number, number, number]) => doc.setFillColor(color[0], color[1], color[2]);
    const setDraw = (color: readonly [number, number, number]) => doc.setDrawColor(color[0], color[1], color[2]);
    const money = (value: number) => formatCurrency(Number.isFinite(value) ? value : 0);
    const money0 = (value: number) => `${Math.round(Number.isFinite(value) ? value : 0).toLocaleString('es-ES')} \u20ac`;
    const pct = (value: number) => `${(Number.isFinite(value) ? value : 0).toFixed(2)}%`;
    const selectedMonthLabel = firstMonth && lastMonth
      ? `${firstMonth.month} - ${lastMonth.month}`
      : 'Todo el periodo';

    const addPage = () => {
      doc.addPage();
      y = margin;
    };

    const ensure = (needed: number) => {
      if (y + needed > pageHeight - margin) addPage();
    };

    const sectionTitle = (title: string, subtitle?: string, keepWith = 0) => {
      ensure((subtitle ? 44 : 28) + keepWith);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      setText(colors.ink);
      doc.text(title, margin, y);
      if (subtitle) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        setText(colors.muted);
        doc.text(subtitle, margin, y + 16);
        y += 36;
      } else {
        y += 24;
      }
    };

    const card = (x: number, cy: number, w: number, h: number, label: string, value: string, positive?: boolean) => {
      setFill(colors.white);
      setDraw(colors.border);
      doc.roundedRect(x, cy, w, h, 12, 12, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      setText(colors.muted);
      doc.text(label.toUpperCase(), x + 14, cy + 18);
      doc.setFontSize(17);
      setText(positive === undefined ? colors.ink : positive ? colors.green : colors.red);
      doc.text(value, x + 14, cy + 44);
    };

    const drawLineChart = (data: typeof effectivePatrimonioData, x: number, cy: number, w: number, h: number) => {
      setFill(colors.soft);
      setDraw(colors.border);
      doc.roundedRect(x, cy, w, h, 12, 12, 'FD');
      const values = data.map((item) => item.balance ?? 0).filter((value) => value > 0);
      if (values.length === 0) return;
      const maxValue = Math.max(...values);
      const maxAxis = buildNiceAxis([0, maxValue]).max;
      const minAxis = 0;
      const axisSpan = Math.max(1, maxAxis - minAxis);
      const left = x + 70;
      const right = x + w - 22;
      const top = cy + 22;
      const bottom = cy + h - 46;
      const plotW = right - left;
      const plotH = bottom - top;
      const chartPoints = data.map((item, idx) => {
        const value = item.balance ?? 0;
        return {
          x: data.length <= 1 ? left + plotW / 2 : left + (idx / (data.length - 1)) * plotW,
          y: top + (1 - (value - minAxis) / axisSpan) * plotH,
          value,
          label: item.month
        };
      });

      setDraw([221, 231, 238]);
      doc.setLineWidth(0.5);
      for (let i = 0; i <= 4; i += 1) {
        const gy = top + (i / 4) * plotH;
        doc.line(left, gy, right, gy);
        const tick = maxAxis - (i / 4) * axisSpan;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        setText(colors.muted);
        doc.text(money0(tick), x + 10, gy + 2);
      }

      setDraw(colors.teal);
      doc.setLineWidth(2);
      for (let i = 0; i < chartPoints.length - 1; i += 1) {
        doc.line(chartPoints[i].x, chartPoints[i].y, chartPoints[i + 1].x, chartPoints[i + 1].y);
      }
      const labelStep = Math.max(1, Math.ceil(chartPoints.length / 10));
      chartPoints.forEach((point, idx) => {
        setFill(colors.ink);
        doc.circle(point.x, point.y, 3, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.4);
        setText(colors.ink);
        const valueLabelY = idx % 2 === 0 ? point.y - 7 : point.y + 12;
        doc.text(money0(point.value), point.x, valueLabelY, { align: 'center' });
        if (idx % labelStep === 0 || idx === chartPoints.length - 1) {
          doc.setFontSize(7);
          setText(colors.ink);
          doc.text(point.label, point.x, bottom + 20, { align: 'center' });
        }
      });
    };

    const drawReturnBars = (data: typeof effectiveMonthlyWithData, x: number, cy: number, w: number, h: number) => {
      setFill(colors.soft);
      setDraw(colors.border);
      doc.roundedRect(x, cy, w, h, 12, 12, 'FD');
      if (data.length === 0) return;
      const left = x + 42;
      const right = x + w - 16;
      const top = cy + 20;
      const bottom = cy + h - 34;
      const plotW = right - left;
      const plotH = bottom - top;
      const maxAbs = Math.max(1, ...data.map((month) => Math.abs(getDisplayedMonthReturnPct(month))));
      setDraw([221, 231, 238]);
      doc.line(left, bottom, right, bottom);
      const gap = 5;
      const barW = Math.max(8, (plotW - gap * (data.length - 1)) / Math.max(1, data.length));
      data.forEach((month, idx) => {
        const value = getDisplayedMonthReturnPct(month);
        const barH = Math.max(3, (Math.abs(value) / maxAbs) * (plotH - 8));
        const bx = left + idx * (barW + gap);
        const by = value >= 0 ? bottom - barH : bottom;
        setFill(value >= 0 ? colors.teal : colors.red);
        doc.roundedRect(bx, by, barW, barH, 3, 3, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        setText(value >= 0 ? colors.green : colors.red);
        const pctY = value >= 0 ? Math.max(top + 8, by - 5) : Math.min(bottom + 13, by + barH + 10);
        doc.text(pct(value), bx + barW / 2, pctY, { align: 'center' });
        if (data.length <= 10 || idx % Math.ceil(data.length / 10) === 0 || idx === data.length - 1) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          setText(colors.ink);
          doc.text(month.month, bx + barW / 2, bottom + 15, { align: 'center' });
        }
      });
    };

    const tableRow = (columns: string[], widths: number[], rowY: number, opts: { header?: boolean; positiveIndex?: number; positiveValue?: number } = {}) => {
      if (opts.header) {
        setFill(colors.teal);
        doc.roundedRect(margin, rowY - 13, contentWidth, 22, 5, 5, 'F');
        setText(colors.white);
        doc.setFont('helvetica', 'bold');
      } else {
        setText(colors.ink);
        doc.setFont('helvetica', 'normal');
      }
      doc.setFontSize(opts.header ? 8 : 8.5);
      let tx = margin + 10;
      columns.forEach((column, idx) => {
        if (!opts.header && opts.positiveIndex === idx && opts.positiveValue !== undefined) {
          setText(opts.positiveValue >= 0 ? colors.green : colors.red);
        } else {
          setText(opts.header ? colors.white : colors.ink);
        }
        const align = idx === 0 ? 'left' : 'right';
        doc.text(column, align === 'left' ? tx : tx + widths[idx] - 8, rowY, { align });
        tx += widths[idx];
      });
    };

    // Cover / header
    setFill(colors.ink);
    doc.roundedRect(margin, y, contentWidth, 88, 16, 16, 'F');
    setFill(colors.blue);
    doc.roundedRect(margin, y, 8, 88, 4, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(23);
    setText(colors.white);
    doc.text('Investment Report', margin + 26, y + 34);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`${currentReport.clientCode} - ${selectedMonthLabel}`, margin + 28, y + 57);
    doc.text(`Emitido: ${new Date().toLocaleDateString('es-ES')}`, pageWidth - margin - 145, y + 34);
    y += 110;

    const cardW = (contentWidth - 30) / 3;
    card(margin, y, cardW, 68, 'Valor final del periodo', money(periodEndBalance), periodEndBalance >= 0);
    card(margin + cardW + 15, y, cardW, 68, 'Beneficio del periodo', money(periodProfit), periodProfit >= 0);
    card(margin + (cardW + 15) * 2, y, cardW, 68, 'Rentabilidad periodo', pct(periodReturnPct * 100), periodReturnPct >= 0);
    y += 82;
    card(margin, y, cardW, 62, 'Capital aportado del periodo', money(periodIncrements), true);
    card(margin + cardW + 15, y, cardW, 62, 'Capital retirado del periodo', money(periodDecrements), periodDecrements <= 0);
    card(margin + (cardW + 15) * 2, y, cardW, 62, 'Capital neto del periodo', money(periodIncrements - periodDecrements), periodIncrements - periodDecrements >= 0);
    y += 86;

    sectionTitle('Evolucion patrimonio', 'Saldo al cierre de cada mes del periodo seleccionado.', 205);
    drawLineChart(effectivePatrimonioData, margin, y, contentWidth, 190);
    y += 216;

    sectionTitle('Rentabilidad mensual', 'TWR mensual segun los meses visibles en pantalla.', 165);
    drawReturnBars(effectiveMonthlyWithData, margin, y, contentWidth, 150);
    y += 178;

    sectionTitle('Tabla mensual', 'Beneficio, rentabilidad y saldo por mes.', 48);
    const widths = [170, 170, 130, contentWidth - 470];
    tableRow(['Fecha', 'Beneficio', 'Rentabilidad', 'Saldo'], widths, y, { header: true });
    y += 24;
    effectiveMonthlyWithData.forEach((month, idx) => {
      ensure(22);
      if (idx % 2 === 0) {
        setFill([248, 251, 253]);
        doc.rect(margin, y - 13, contentWidth, 20, 'F');
      }
      tableRow(
        [getMonthEndLabel(month.month), money(month.profit ?? 0), pct(getDisplayedMonthReturnPct(month)), money(month.endBalance ?? 0)],
        widths,
        y,
        { positiveIndex: 1, positiveValue: month.profit ?? 0 }
      );
      y += 20;
    });

    const selectedBreakdowns = tableContributionBreakdowns.filter((item) => {
      const key = reportMonthToKey(item.month);
      return key >= rangeStart && key <= rangeEnd;
    });
    if (selectedBreakdowns.length > 0) {
      y += 12;
      sectionTitle('Detalle de meses con movimientos', 'Rentabilidad aplicada a cada tramo de capital dentro del periodo.', 80);
      selectedBreakdowns.forEach((breakdown) => {
        const withdrawals = breakdown.withdrawals ?? [];
        ensure(74 + (breakdown.contributions.length + withdrawals.length) * 18);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        setText(colors.ink);
        doc.text(breakdown.month, margin, y);
        y += 18;
        tableRow(['Concepto', 'Importe', 'Rentabilidad', 'Beneficio'], widths, y, { header: true });
        y += 22;
        const visiblePct = getVisibleMonthReturnPct(reportMonthToKey(breakdown.month), breakdown.initialReturnPct * 100);
        const initialProfit = breakdown.initialCapital * (visiblePct / 100);
        tableRow([withdrawals.length > 0 ? 'Posicion mantenida todo el mes' : 'Posicion inicial del mes', money(breakdown.initialCapital), pct(visiblePct), money(initialProfit)], widths, y, {
          positiveIndex: 3,
          positiveValue: initialProfit
        });
        y += 18;
        breakdown.contributions.forEach((contribution) => {
          tableRow(
            [`Aportacion ${getShortDateLabel(contribution.iso)}`, money(contribution.amount), pct(contribution.returnPct * 100), money(contribution.profit)],
            widths,
            y,
            { positiveIndex: 3, positiveValue: contribution.profit }
          );
          y += 18;
        });
        withdrawals.forEach((withdrawal) => {
          tableRow(
            [`Posicion retirada ${getShortDateLabel(withdrawal.iso)}`, money(withdrawal.amount), withdrawal.returnPct === undefined ? '-' : pct(withdrawal.returnPct * 100), money(withdrawal.profit)],
            widths,
            y,
            { positiveIndex: 3, positiveValue: withdrawal.profit }
          );
          y += 18;
        });
        const total = initialProfit +
          breakdown.contributions.reduce((sum, contribution) => sum + contribution.profit, 0) +
          withdrawals.reduce((sum, withdrawal) => sum + withdrawal.profit, 0);
        tableRow(['Beneficio explicado', '-', '-', money(total)], widths, y, { positiveIndex: 3, positiveValue: total });
        y += 24;
      });
    }

    if (periodMovements.length > 0) {
      sectionTitle('Capital aportado y retirado', 'Capital aportado y capital retirado dentro del periodo seleccionado.', 54);
      const movementWidths = [150, 170, 170, contentWidth - 490];
      tableRow(['Fecha', 'Aportacion', 'Retirada', 'Capital neto del periodo'], movementWidths, y, { header: true });
      y += 24;
      let runningNet = 0;
      periodMovements.forEach((movement, idx) => {
        ensure(22);
        runningNet += movement.type === 'increment' ? movement.amount : -movement.amount;
        if (idx % 2 === 0) {
          setFill([248, 251, 253]);
          doc.rect(margin, y - 13, contentWidth, 20, 'F');
        }
        tableRow(
          [
            getShortDateLabel(movement.iso),
            movement.type === 'increment' ? money(movement.amount) : '-',
            movement.type === 'decrement' ? money(movement.amount) : '-',
            money(runningNet)
          ],
          movementWidths,
          y,
          { positiveIndex: 3, positiveValue: runningNet }
        );
        y += 20;
      });
    }

    const filename = `informe-${currentReport.clientCode}-${rangeStart || 'todo'}-${rangeEnd || 'todo'}.pdf`;
    doc.save(filename);
  }

  const renderPatrimonyChart = (expanded: boolean) => {
    const chartData = expanded ? effectiveExpandedPatrimonioData : effectivePatrimonioData;
    const geometry = expanded ? expandedPatrimonyGeometry : patrimonyGeometry;
    const chartMinWidth = !expanded && chartData.length > 12 ? `${chartData.length * 92}px` : '100%';
    return (
      <div className={`report-pro-patrimony-scroll ${expanded ? 'is-expanded' : ''} ${!expanded && chartData.length > 12 ? 'is-scrollable' : ''}`}>
        <div className="report-pro-patrimony-scroll-inner" style={{ minWidth: chartMinWidth }}>
          <div className={`report-pro-line-wrap ${expanded ? 'report-pro-line-wrap-expanded' : ''}`}>
          {hoveredPatrimonyPoint ? (
            <div
              className={`report-pro-line-tooltip ${expanded ? 'report-pro-line-tooltip-expanded' : ''}`}
              style={{
                left: `clamp(${expanded ? '118px' : '88px'}, ${(hoveredPatrimonyPoint.x / geometry.width) * 100}%, calc(100% - ${expanded ? '118px' : '88px'}))`,
                top: `clamp(${expanded ? '82px' : '64px'}, ${(hoveredPatrimonyPoint.y / geometry.height) * 100}%, calc(100% - ${expanded ? '26px' : '20px'}))`
              }}
            >
              <strong>{hoveredPatrimonyPoint.month}</strong>
              <span>{formatCurrency(hoveredPatrimonyPoint.value)}</span>
            </div>
          ) : null}
          <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none" className={`report-pro-line-chart ${expanded ? 'report-pro-line-chart-expanded' : ''}`}>
            <defs>
              <linearGradient id={expanded ? 'patrimonyAreaExpanded' : 'patrimonyAreaShared'} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(14,165,233,0.30)" />
                <stop offset="100%" stopColor="rgba(14,165,233,0.03)" />
              </linearGradient>
            </defs>
            {geometry.yTicks.map((tick, idx) => (
              <g key={`tick-${idx}`}>
                <line className="report-pro-grid-line" x1={geometry.left} y1={tick.y} x2={geometry.width - geometry.right} y2={tick.y} />
                <text className={`report-pro-y-label ${expanded ? 'report-pro-y-label-expanded' : ''}`} x={geometry.left - 10} y={tick.y + 4} textAnchor="end">
                  {formatAxisCurrency(tick.value)}
                </text>
              </g>
            ))}
            {geometry.areaPath && <path d={geometry.areaPath} className="report-pro-area" fill={`url(#${expanded ? 'patrimonyAreaExpanded' : 'patrimonyAreaShared'})`} />}
            {geometry.points.length > 1 && <polyline className={`report-pro-line ${expanded ? 'report-pro-line-expanded' : ''}`} points={geometry.linePoints} />}
            {geometry.points.map((pt, idx) => (
              <g key={`${pt.month}-${idx}`}>
                <circle cx={pt.x} cy={pt.y} r={expanded ? '6.2' : '4.2'} className={`report-pro-dot ${expanded ? 'report-pro-dot-expanded' : ''}`} pointerEvents="none" />
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={expanded ? '28' : '18'}
                  className="report-pro-dot-hit"
                  fill="transparent"
                  pointerEvents="all"
                  onMouseEnter={() => setHoveredPatrimonyPoint(pt)}
                  onMouseMove={() => setHoveredPatrimonyPoint(pt)}
                  onMouseLeave={() => setHoveredPatrimonyPoint(null)}
                />
              </g>
            ))}
            {geometry.points.map((pt, idx) => {
              const label = formatCurrencyNoCents(pt.value);
              const approxWidth = expanded
                ? Math.min(154, Math.max(86, label.length * 7.1))
                : Math.min(122, Math.max(68, label.length * 6.2));
              const labelX = Math.max(geometry.left + approxWidth / 2, Math.min(pt.x, geometry.width - geometry.right - approxWidth / 2));
              const preferredY = pt.y + (idx % 2 === 0 ? (expanded ? -24 : -18) : (expanded ? 30 : 22));
              const labelY = Math.max(geometry.top + (expanded ? 14 : 10), Math.min(preferredY, geometry.plotBottom - (expanded ? 14 : 10)));
              return (
                <g key={`${pt.month}-${idx}-label`} className={`report-pro-point-label ${expanded ? 'report-pro-point-label-expanded' : ''}`} pointerEvents="none">
                  <rect x={labelX - approxWidth / 2} y={labelY - (expanded ? 18 : 14)} width={approxWidth} height={expanded ? '26' : '20'} rx={expanded ? '9' : '7'} />
                  <text x={labelX} y={labelY} textAnchor="middle">{label}</text>
                </g>
              );
            })}
          </svg>
          <div
            className={`report-pro-month-row ${expanded ? 'report-pro-month-row-expanded' : ''}`}
            style={{
              marginLeft: `${(geometry.left / geometry.width) * 100}%`,
              width: `${((geometry.width - geometry.left - geometry.right) / geometry.width) * 100}%`,
              gridTemplateColumns: `repeat(${Math.max(1, geometry.points.length)}, minmax(0, 1fr))`
            }}
          >
            {geometry.points.map((pt) => (
              <span key={pt.month}>{getCompactMonthLabel(pt.month)}</span>
            ))}
          </div>
        </div>
        </div>
      </div>
    );
  };

  const expandedPatrimonyOverlay = isPatrimonyExpanded && typeof document !== 'undefined'
    ? createPortal(
      <div className="report-pro-chart-overlay" role="dialog" aria-modal="true" aria-label="Grafico de evolucion de patrimonio ampliado">
        <section className="report-pro-panel report-pro-panel-xl report-pro-patrimony-section is-expanded">
          <div className="report-pro-panel-head">
            <div>
              <h4>Evolucion patrimonio</h4>
              <p>Saldo al cierre de cada mes</p>
            </div>
            <button
              type="button"
              className="report-pro-expand-chart-button"
              onClick={() => {
                setIsPatrimonyExpanded(false);
                setHoveredPatrimonyPoint(null);
              }}
            >
              Cerrar ampliado
            </button>
          </div>
          <div className="report-pro-expanded-period-toolbar">
            <label>
              Desde
              <select
                value={expandedStartMonth}
                onChange={(event) => {
                  setExpandedStartMonth(event.target.value);
                  setHoveredPatrimonyPoint(null);
                }}
              >
                {periodOptions.map((option) => (
                  <option key={`expanded-from-${option.key}`} value={option.key}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              Hasta
              <select
                value={expandedEndMonth}
                onChange={(event) => {
                  setExpandedEndMonth(event.target.value);
                  setHoveredPatrimonyPoint(null);
                }}
              >
                {periodOptions.map((option) => (
                  <option key={`expanded-to-${option.key}`} value={option.key}>{option.label}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="report-pro-expanded-reset"
              onClick={() => {
                setExpandedStartMonth(firstPeriodKey);
                setExpandedEndMonth(lastPeriodKey);
                setHoveredPatrimonyPoint(null);
              }}
            >
              Ver todo
            </button>
            <span>Pulsa ESC para salir</span>
          </div>
          {renderPatrimonyChart(true)}
        </section>
      </div>,
      document.body
    )
    : null;

  return (
    <div className="informes-container informes-pro-page fade-in report-pro-page-demo">
      {expandedPatrimonyOverlay}
      <article className="informe-preview glass-card report-pro-sheet report-pro-demo-sheet" ref={reportRef}>
        <header className="report-pro-header">
          <div>
            <p className="report-pro-kicker">Portfolio Manager</p>
            <h2>Investment Report</h2>
            <p className="report-pro-date">{new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          <div className="report-pro-client-tag">{report.clientCode}</div>
        </header>

        <section className="report-pro-executive report-pro-executive-demo">
          <div className="report-pro-info-card" data-tooltip="Saldo actual de tu cartera a fecha del informe.">
            <p>Saldo actual</p>
            <strong>{formatCurrency(report.saldo)}</strong>
          </div>
          <div className="report-pro-info-card" data-tooltip={`Rentabilidad TWR de ${latestMonthLabel}. Mide el rendimiento de la estrategia sin contar aportaciones ni retiradas.`}>
            <p>{`Rentabilidad ${latestMonthLabel}`}</p>
            <strong className={report.rentabilidadUltimoMes >= 0 ? 'positive' : 'negative'}>{formatSignedPercent(report.rentabilidadUltimoMes)}</strong>
          </div>
          <div className="report-pro-info-card" data-tooltip={`Beneficio generado en euros durante ${latestMonthLabel}. Incluye el efecto real del capital invertido y de las aportaciones del mes.`}>
            <p>{`Beneficio ${latestMonthLabel}`}</p>
            <strong className={report.beneficioUltimoMes >= 0 ? 'positive' : 'negative'}>{formatSignedCurrency(report.beneficioUltimoMes)}</strong>
          </div>
        </section>

        <section className="report-pro-kpis report-pro-kpis-demo">
          <div className="report-pro-kpi report-pro-info-card" data-tooltip={`Beneficio acumulado generado desde ${firstRegisteredDateLabel} hasta la fecha del informe.`}><span>Beneficio acumulado</span><strong className={report.beneficioTotal >= 0 ? 'positive' : 'negative'}>{formatSignedCurrency(report.beneficioTotal)}</strong></div>
          <div className="report-pro-kpi report-pro-info-card" data-tooltip={`Rentabilidad acumulada de la estrategia desde ${firstRegisteredDateLabel}. No se ve afectada por aportaciones o retiradas.`}><span>TWR acumulado</span><strong className={(report.twrYtd ?? 0) >= 0 ? 'positive' : 'negative'}>{formatSignedPercent((report.twrYtd ?? 0) * 100)}</strong></div>
          <div className="report-pro-kpi report-pro-info-card" data-tooltip={`Suma total de todas tus aportaciones registradas desde ${firstRegisteredDateLabel}.`}><span>Capital aportado</span><strong>{formatCurrency(report.incrementos)}</strong></div>
          <div className="report-pro-kpi report-pro-info-card" data-tooltip={`Suma total de todas tus retiradas registradas desde ${firstRegisteredDateLabel}.`}><span>Capital retirado</span><strong>{formatCurrency(report.decrementos)}</strong></div>
          <div className="report-pro-kpi report-pro-info-card" data-tooltip="Beneficio acumulado dividido entre el capital neto aportado. A diferencia del TWR, si depende de aportaciones y retiradas."><span>Rentabilidad total</span><strong className={report.rentabilidad >= 0 ? 'positive' : 'negative'}>{formatSignedPercent(report.rentabilidad)}</strong></div>
        </section>

        <section className="report-pro-note">
          <div className="report-pro-note-head">
            <strong>Cómo interpretar el TWR y la rentabilidad total</strong>
            <button
              type="button"
              className="report-pro-note-help"
              onMouseEnter={() => setInfoTooltip({ visible: true })}
              onMouseLeave={() => setInfoTooltip({ visible: false })}
              onFocus={() => setInfoTooltip({ visible: true })}
              onBlur={() => setInfoTooltip({ visible: false })}
            >
              Ejemplo
            </button>
            {infoTooltip.visible ? (
              <div className="report-pro-note-tooltip">
                <strong>TWR:</strong>
                <p>Mide la rentabilidad de la inversion sin contar aportaciones ni retiradas.</p>
                <p>Ejemplo: inviertes 10.000 EUR y sube a 11.000 EUR. El TWR es +10 %. Si despues anades 20.000 EUR mas, el TWR sigue siendo +10 %.</p>
                <strong>Rentabilidad total:</strong>
                <p>Mide cuanto has ganado sobre todo el dinero aportado.</p>
                <p>En ese ejemplo, si has aportado 30.000 EUR y ahora tienes 31.000 EUR, la rentabilidad total es +3,33 %.</p>
              </div>
            ) : null}
          </div>
          <p><strong>TWR (rentabilidad ponderada por el tiempo):</strong> {twrExplanation}</p>
          <p><strong>Rentabilidad total:</strong> {totalReturnExplanation}</p>
        </section>

        <section className="report-pro-capital-panel">
            <div className="report-pro-panel-head">
              <h4>Capital y beneficio acumulado</h4>
              <p>Separacion entre capital aportado, retiradas y beneficio obtenido.</p>
            </div>
            <div className="report-pro-capital-grid">
              <div className="report-pro-info-card" data-tooltip="Total de dinero ingresado historicamente por el cliente."><span>Capital aportado</span><strong>{formatCurrency(report.incrementos)}</strong></div>
              <div className="report-pro-info-card" data-tooltip="Total de dinero retirado historicamente por el cliente."><span>Capital retirado</span><strong>{formatCurrency(report.decrementos)}</strong></div>
              <div className="report-pro-info-card" data-tooltip="Capital aportado menos capital retirado."><span>Capital neto aportado</span><strong>{formatCurrency(accumulatedNetCapital)}</strong></div>
              <div className="report-pro-info-card" data-tooltip="Beneficio acumulado generado desde el inicio de la relacion."><span>Beneficio acumulado</span><strong className={report.beneficioTotal >= 0 ? 'positive' : 'negative'}>{formatSignedCurrency(report.beneficioTotal)}</strong></div>
              <div className="report-pro-info-card" data-tooltip="Saldo actual de la cartera del cliente."><span>Saldo actual</span><strong>{formatCurrency(report.saldo)}</strong></div>
            </div>
        </section>

        <section className="report-pro-demo-control-panel">
            <div className="report-pro-panel-head">
              <span className="report-pro-global-filter-badge">Filtro global</span>
              <h4>Análisis por periodo</h4>
              <p>Este filtro afecta solo a los gráficos, tablas, resultados y movimientos de abajo.</p>
            </div>
            <div className="report-pro-period-toolbar">
              <label>
                Periodo
                <select
                  value={periodPreset}
                  onChange={(event) => {
                    setPeriodPreset(event.target.value);
                    setHoveredPatrimonyPoint(null);
                  }}
                >
                  <option value="last12">Ultimos 12 meses</option>
                  <option value="all">Todo el historico</option>
                  <option value="2025">Año 2025</option>
                  <option value="2026">Año 2026</option>
                  <option value="last3">Ultimos 3 meses</option>
                  <option value="last6">Ultimos 6 meses</option>
                  <option value="custom">Personalizado</option>
                </select>
              </label>
              {periodPreset === 'custom' ? (
                <>
                  <label>
                    Desde
                    <select
                      value={periodStartMonth}
                      onChange={(event) => {
                        setPeriodStartMonth(event.target.value);
                        setHoveredPatrimonyPoint(null);
                      }}
                    >
                      <option value="">Inicio</option>
                      {periodOptions.map((option) => (
                        <option key={`from-${option.key}`} value={option.key}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Hasta
                    <select
                      value={periodEndMonth}
                      onChange={(event) => {
                        setPeriodEndMonth(event.target.value);
                        setHoveredPatrimonyPoint(null);
                      }}
                    >
                      <option value="">Actual</option>
                      {periodOptions.map((option) => (
                        <option key={`to-${option.key}`} value={option.key}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
            </div>
            <div className="report-pro-period-summary">
              {Math.abs(periodStartBalance) > 0.01 ? (
                <div className="report-pro-info-card" data-tooltip="Valor de la cartera al inicio del periodo seleccionado.">
                  <span>Valor inicial periodo</span><strong>{formatCurrency(periodStartBalance)}</strong>
                </div>
              ) : null}
              <div className="report-pro-info-card" data-tooltip="Valor de la cartera al final del periodo seleccionado.">
                <span>Valor final del periodo</span><strong>{formatCurrency(periodEndBalance)}</strong>
              </div>
              <div className="report-pro-info-card" data-tooltip="Beneficio generado dentro del periodo seleccionado.">
                <span>Beneficio del periodo</span><strong className={periodProfit >= 0 ? 'positive' : 'negative'}>{formatSignedCurrency(periodProfit)}</strong>
              </div>
              <div className="report-pro-info-card" data-tooltip="Rentabilidad acumulada del periodo, sin mezclarla con aportaciones o retiradas.">
                <span>Rentabilidad periodo</span><strong className={periodReturnPct >= 0 ? 'positive' : 'negative'}>{formatSignedPercent(periodReturnPct * 100)}</strong>
              </div>
              <div className="report-pro-info-card" data-tooltip="Dinero ingresado por el cliente dentro del periodo seleccionado.">
                <span>Capital aportado del periodo</span><strong>{formatCurrency(periodIncrements)}</strong>
              </div>
              <div className="report-pro-info-card" data-tooltip="Dinero retirado por el cliente dentro del periodo seleccionado.">
                <span>Capital retirado del periodo</span><strong>{formatCurrency(periodDecrements)}</strong>
              </div>
              <div className="report-pro-info-card" data-tooltip="Capital aportado menos capital retirado dentro del periodo seleccionado.">
                <span>Capital neto del periodo</span><strong>{formatCurrency(periodIncrements - periodDecrements)}</strong>
              </div>
            </div>
        </section>

        {visibleContributionBreakdowns.length > 0 && (
          <section className="report-pro-panel">
            <div className="report-pro-panel-head">
              <h4>Detalle de meses con aportaciones</h4>
              <p>Separamos el capital inicial del mes y cada aportacion para que veas que ha generado cada parte.</p>
            </div>
            <div className="report-pro-breakdown-list">
              {visibleContributionBreakdowns.map((breakdown) => {
                const breakdownMonthKey = reportMonthToKey(breakdown.month);
                const visibleInitialPct = getVisibleMonthReturnPct(breakdownMonthKey, breakdown.initialReturnPct * 100);
                const visibleInitialProfit = breakdown.initialCapital * (visibleInitialPct / 100);
                const withdrawals = breakdown.withdrawals ?? [];
                const explainedTotalProfit = visibleInitialProfit +
                  breakdown.contributions.reduce((sum, contribution) => sum + contribution.profit, 0) +
                  withdrawals.reduce((sum, withdrawal) => sum + withdrawal.profit, 0);
                return (
                <div className="report-pro-breakdown-card" key={breakdown.month}>
                  <div className="report-pro-breakdown-title">
                    <strong>{breakdown.month}</strong>
                    <span>Beneficio explicado: {formatCurrency(explainedTotalProfit)}</span>
                  </div>
                  <div className="table-scroll">
                    <table className="monthly-table report-pro-table report-pro-breakdown-table">
                      <colgroup>
                        <col style={{ width: '42%' }} />
                        <col style={{ width: '19%' }} />
                        <col style={{ width: '19%' }} />
                        <col style={{ width: '20%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Concepto</th>
                          <th className="text-right">Capital</th>
                          <th className="text-right">Rentabilidad</th>
                          <th className="text-right">Beneficio</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>{withdrawals.length > 0 ? 'Posición mantenida durante todo el mes' : 'Posición inicial del mes'}</td>
                          <td className="text-right">{formatCurrency(breakdown.initialCapital)}</td>
                          <td className={`text-right ${visibleInitialPct >= 0 ? 'positive' : 'negative'}`}>
                            {visibleInitialPct.toFixed(2)}%
                          </td>
                          <td className={`text-right ${visibleInitialProfit >= 0 ? 'positive' : 'negative'}`}>
                            {formatCurrency(visibleInitialProfit)}
                          </td>
                        </tr>
                        {breakdown.contributions.map((contribution) => (
                          <tr key={`${breakdown.month}-${contribution.iso}-${contribution.amount}`}>
                            <td>Aportaci&oacute;n incorporada el {getShortDateLabel(contribution.iso)}</td>
                            <td className="text-right">{formatCurrency(contribution.amount)}</td>
                            <td className={`text-right ${contribution.returnPct >= 0 ? 'positive' : 'negative'}`}>
                              {(contribution.returnPct * 100).toFixed(2)}%
                            </td>
                            <td className={`text-right ${contribution.profit >= 0 ? 'positive' : 'negative'}`}>
                              {formatCurrency(contribution.profit)}
                            </td>
                          </tr>
                        ))}
                        {withdrawals.map((withdrawal) => (
                          <tr key={`${breakdown.month}-${withdrawal.iso}-${withdrawal.amount}-withdrawal`}>
                            <td>Posici&oacute;n retirada el {getShortDateLabel(withdrawal.iso)}</td>
                            <td className="text-right">{formatCurrency(withdrawal.amount)}</td>
                            <td className={`text-right ${(withdrawal.returnPct ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                              {withdrawal.returnPct === undefined ? '—' : `${(withdrawal.returnPct * 100).toFixed(2)}%`}
                            </td>
                            <td className={`text-right ${withdrawal.profit >= 0 ? 'positive' : 'negative'}`}>
                              {formatCurrency(withdrawal.profit)}
                            </td>
                          </tr>
                        ))}
                        <tr className="report-pro-breakdown-total">
                          <td>Beneficio explicado</td>
                          <td className="text-right">—</td>
                          <td className="text-right">—</td>
                          <td className={`text-right ${explainedTotalProfit >= 0 ? 'positive' : 'negative'}`}>
                            {formatCurrency(explainedTotalProfit)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
              })}
            </div>
          </section>
        )}

        <section className="report-pro-panel report-pro-panel-xl">
          <div className="report-pro-panel-head">
            <h4>{chartTitle}</h4>
            <p>{chartSubtitle}</p>
          </div>
          <div className="report-pro-chart-toolbar">
            <label>
              Vista de graficos
              <select value={chartView} onChange={(event) => { setChartView(event.target.value as typeof chartView); setHoveredMonthlyBar(null); }}>
                <option value="return">Rentabilidad</option>
                <option value="profit">Beneficio EUR</option>
                <option value="balance">Saldo</option>
                {hasGeneralReference ? <option value="general">Rentabilidad general</option> : null}
              </select>
            </label>
          </div>
          {chartView === 'general' ? (
            <div className="report-pro-reference-note" role="note">
              <strong>Solo como referencia</strong>
              <span>Esta rentabilidad es la general de la estrategia. No se aplica a tu saldo, beneficio, rentabilidad ni TWR.</span>
            </div>
          ) : null}
          <div className={`report-pro-chart-scroll ${chartMonthlyData.length > 12 ? 'is-scrollable' : ''}`}>
            <div
              className={`report-pro-bars ${hasNegativeMonth ? 'has-negative' : ''} ${chartView === 'general' ? 'is-general-reference' : ''}`}
              style={{
                gridTemplateColumns: chartMonthlyData.length > 12
                  ? `repeat(${Math.max(1, chartMonthlyData.length)}, minmax(76px, 1fr))`
                  : `repeat(${Math.max(1, chartMonthlyData.length)}, minmax(0, 1fr))`,
                minWidth: monthlyChartMinWidth
              }}
            >
              {chartMonthlyData.map((m) => {
              const maxBarHeight = hasNegativeMonth ? 46 : 92;
              const chartValue = getChartValue(m);
              const height = Math.min(maxBarHeight, Math.max(4, (Math.abs(chartValue) / maxMonthPct) * maxBarHeight));
              return (
                <div
                  key={m.month}
                  className="report-pro-bar-col"
                  onMouseEnter={() => setHoveredMonthlyBar({ month: m.month, value: chartValue })}
                  onMouseMove={() => setHoveredMonthlyBar({ month: m.month, value: chartValue })}
                  onMouseLeave={() => setHoveredMonthlyBar(null)}
                >
                  {hoveredMonthlyBar?.month === m.month ? (
                    <div className="report-pro-bar-tooltip">
                      <strong>{m.month}</strong>
                      <span>{formatChartTooltipValue(hoveredMonthlyBar.value)}</span>
                    </div>
                  ) : null}
                  <span className={`report-pro-bar-value ${chartValue >= 0 ? 'positive' : 'negative'}`}>{formatChartValue(chartValue)}</span>
                  <div className="report-pro-bar-track">
                    <div
                      className={`report-pro-bar ${chartValue >= 0 ? 'positive' : 'negative'}`}
                      style={{
                        height: `${height}%`,
                        ...(hasNegativeMonth
                          ? (chartValue >= 0 ? { bottom: '50%' } : { top: '50%' })
                          : { bottom: 0 })
                      }}
                    />
                  </div>
                  <span className="report-pro-bar-label">{m.month}</span>
                </div>
              );
              })}
            </div>
          </div>
        </section>

        <section className="report-pro-panel">
          <div className="report-pro-panel-head">
            <h4>Beneficios mensuales</h4>
            <p>Beneficio generado en cada cierre de mes</p>
          </div>
          {hasVisibleMonthlyBreakdowns ? (
            <div className="report-pro-detail-hint">
              <span className="report-pro-detail-hint-icon" aria-hidden="true">+</span>
              <span>Los meses con aportaciones permiten ver c&oacute;mo se reparte la rentabilidad y el beneficio. Pulsa <strong>Ver detalle</strong>.</span>
            </div>
          ) : null}
          <div className="table-scroll">
            <table className="monthly-table report-pro-table report-pro-benefits-table">
              <colgroup>
                <col style={{ width: '50%' }} />
                <col style={{ width: '50%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th className="text-right">Beneficio</th>
                </tr>
              </thead>
              <tbody>
                {effectiveMonthlyWithData.map((m) => {
                  const monthKey = reportMonthToKey(m.month);
                  const breakdown = tableContributionByMonth.get(monthKey);
                  return (
                    <React.Fragment key={`${m.month}-benefit`}>
                      <tr>
                        <td>
                          <span className="report-pro-benefit-month-cell">
                            <span>{getMonthEndLabel(m.month)}</span>
                            {breakdown ? renderMonthlyDetailButton(monthKey, m.month, 'benefits') : null}
                          </span>
                        </td>
                        <td className={`text-right ${(m.profit ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                          {formatCurrency(m.profit ?? 0)}
                        </td>
                      </tr>
                      {breakdown ? renderMonthlyBreakdownRow(m, breakdown, 2, 'benefits') : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="report-pro-panel report-pro-panel-xl report-pro-patrimony-section">
          <div className="report-pro-panel-head">
            <div>
              <h4>Evolucion patrimonio</h4>
              <p>Saldo al cierre de cada mes</p>
            </div>
            <button
              type="button"
              className="report-pro-expand-chart-button"
              onClick={() => {
                setExpandedStartMonth(rangeStart);
                setExpandedEndMonth(rangeEnd);
                setHoveredPatrimonyPoint(null);
                setIsPatrimonyExpanded(true);
              }}
            >
              Ampliar grafico
            </button>
          </div>
          {renderPatrimonyChart(false)}
        </section>

        <section className="report-pro-panel">
          <div className="report-pro-panel-head">
            <h4>Tabla mensual</h4>
            <p>Beneficio, rentabilidad y saldo por mes</p>
          </div>
          {hasVisibleMonthlyBreakdowns ? (
            <div className="report-pro-detail-hint">
              <span className="report-pro-detail-hint-icon" aria-hidden="true">+</span>
              <span>Los meses con aportaciones incluyen un desglose de cada parte. Pulsa <strong>Ver detalle</strong> para consultarlo.</span>
            </div>
          ) : null}
          <div className="table-scroll">
            <table className="monthly-table report-pro-table report-pro-demo-monthly-table">
              <colgroup>
                <col style={{ width: '34%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '24%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Mes</th>
                  <th className="text-right">Beneficio</th>
                  <th className="text-right">Rentabilidad</th>
                  <th className="text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {effectiveMonthlyWithData.map((m) => {
                  const monthKey = reportMonthToKey(m.month);
                  const breakdown = tableContributionByMonth.get(monthKey);
                  const expanded = !!expandedContributionMonths[monthKey];
                  const displayedPct = getDisplayedMonthReturnPct(m);
                  const movementTag = monthlyMovementType(monthKey);
                  const visibleInitialPct = breakdown
                    ? getVisibleMonthReturnPct(monthKey, breakdown.initialReturnPct * 100)
                    : displayedPct;
                  const visibleInitialProfit = breakdown
                    ? breakdown.initialCapital * (visibleInitialPct / 100)
                    : 0;
                  const withdrawals = breakdown?.withdrawals ?? [];
                  const openingCapital = breakdown?.openingCapital ?? breakdown?.initialCapital ?? 0;
                  const totalContributions = breakdown?.contributions.reduce(
                    (sum, contribution) => sum + contribution.amount,
                    0
                  ) ?? 0;
                  const totalWithdrawals = withdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0);
                  const explainedTotalProfit = breakdown
                    ? visibleInitialProfit +
                      breakdown.contributions.reduce((sum, contribution) => sum + contribution.profit, 0) +
                      withdrawals.reduce((sum, withdrawal) => sum + withdrawal.profit, 0)
                    : m.profit ?? 0;

                  return (
                    <React.Fragment key={m.month}>
                      <tr>
                        <td>
                          <span className="report-pro-month-cell">
                            <span>{getMonthEndLabel(m.month)}</span>
                            {breakdown ? renderMonthlyDetailButton(monthKey, m.month, 'monthly') : null}
                            {movementTag ? <span className="report-pro-movement-pill">{movementTag}</span> : null}
                          </span>
                        </td>
                        <td className={`text-right ${(m.profit ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                          {formatCurrency(m.profit ?? 0)}
                        </td>
                        <td className={`text-right ${displayedPct >= 0 ? 'positive' : 'negative'}`}>
                          {`${displayedPct.toFixed(2)}%`}
                        </td>
                        <td className="text-right">{formatCurrency(m.endBalance ?? 0)}</td>
                      </tr>
                      {breakdown && expanded ? (
                        <tr id={`report-month-detail-monthly-${monthKey}`} className="report-pro-expanded-row">
                          <td colSpan={4}>
                            <div className="report-pro-inline-breakdown">
                              <div className="report-pro-inline-title">
                                <strong>Detalle de rentabilidad del mes - {m.month}</strong>
                              </div>
                              {totalWithdrawals > 0
                                ? renderWithdrawalDistribution(
                                    openingCapital,
                                    breakdown.initialCapital,
                                    visibleInitialProfit,
                                    breakdown.contributions,
                                    withdrawals,
                                    explainedTotalProfit
                                  )
                                : (
                                    <div className="report-pro-flow-summary">
                                      <div><span>Saldo al inicio del mes</span><strong>{formatCurrency(openingCapital)}</strong></div>
                                      {totalContributions > 0 ? <div><span>Aportaciones del mes</span><strong>+{formatCurrency(totalContributions)}</strong></div> : null}
                                      <div className="is-final"><span>Saldo al cierre del mes</span><strong>{formatCurrency(m.endBalance ?? 0)}</strong></div>
                                    </div>
                                  )}
                              <table>
                                <thead>
                                  <tr>
                                    <th>Concepto</th>
                                    <th className="text-right">Importe</th>
                                    <th className="text-right">Rentabilidad aplicada</th>
                                    <th className="text-right">Beneficio generado</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    <td>{withdrawals.length > 0 ? 'Capital mantenido hasta final de mes' : 'Posición inicial del mes'}</td>
                                    <td className="text-right">{formatCurrency(breakdown.initialCapital)}</td>
                                    <td className={`text-right ${visibleInitialPct >= 0 ? 'positive' : 'negative'}`}>
                                      {visibleInitialPct.toFixed(2)}%
                                    </td>
                                    <td className={`text-right ${visibleInitialProfit >= 0 ? 'positive' : 'negative'}`}>
                                      {formatCurrency(visibleInitialProfit)}
                                    </td>
                                  </tr>
                                  {breakdown.contributions.map((contribution) => (
                                    <tr key={`${monthKey}-${contribution.iso}-${contribution.amount}`}>
                                      <td>Aportaci&oacute;n incorporada el {getShortDateLabel(contribution.iso)}</td>
                                      <td className="text-right">{formatCurrency(contribution.amount)}</td>
                                      <td className={`text-right ${contribution.returnPct >= 0 ? 'positive' : 'negative'}`}>
                                        {(contribution.returnPct * 100).toFixed(2)}%
                                      </td>
                                      <td className={`text-right ${contribution.profit >= 0 ? 'positive' : 'negative'}`}>
                                        {formatCurrency(contribution.profit)}
                                      </td>
                                    </tr>
                                  ))}
                                  {withdrawals.map((withdrawal) => (
                                    <tr key={`${monthKey}-${withdrawal.iso}-${withdrawal.amount}-withdrawal`}>
                                      <td>Capital retirado el {getShortDateLabel(withdrawal.iso)}</td>
                                      <td className="text-right">{formatCurrency(withdrawal.amount)}</td>
                                      <td className={`text-right ${(withdrawal.returnPct ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                                        {withdrawal.returnPct === undefined ? '—' : `${(withdrawal.returnPct * 100).toFixed(2)}%`}
                                      </td>
                                      <td className={`text-right ${withdrawal.profit >= 0 ? 'positive' : 'negative'}`}>
                                        {formatCurrency(withdrawal.profit)}
                                      </td>
                                    </tr>
                                  ))}
                                  <tr className="report-pro-breakdown-total">
                                    <td>Beneficio total del mes</td>
                                    <td className="text-right">—</td>
                                    <td className="text-right">—</td>
                                    <td className={`text-right ${explainedTotalProfit >= 0 ? 'positive' : 'negative'}`}>
                                      {formatCurrency(explainedTotalProfit)}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                              <div className="report-pro-balance-formula">
                                <span>Comprobaci&oacute;n del saldo final</span>
                                <strong>
                                  {formatCurrency(openingCapital)}
                                  {totalContributions > 0 ? ` + ${formatCurrency(totalContributions)}` : ''}
                                  {totalWithdrawals > 0 ? ` - ${formatCurrency(totalWithdrawals)}` : ''}
                                  {` ${formatSignedCurrency(explainedTotalProfit)} = ${formatCurrency(m.endBalance ?? 0)}`}
                                </strong>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {visibleMovementCapitalSeries.length > 0 && (
          <section className="report-pro-panel">
            <div className="report-pro-panel-head">
              <h4>Capital aportado y retirado</h4>
              <p>Detalle de aportaciones y retiradas</p>
            </div>
            <div className="table-scroll">
              <table className="movements-table report-pro-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th className="text-right">Importe</th>
                    <th className="text-right">Capital neto aportado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMovementCapitalSeries.map((mov, i) => {
                    const [yy, mm, dd] = mov.iso.split('-');
                    const isIncrement = mov.type === 'increment';
                    return (
                      <tr key={`${mov.iso}-${i}`}>
                        <td>{`${dd}.${mm}.${yy}`}</td>
                        <td className={isIncrement ? 'positive' : 'negative'}>
                          {isIncrement ? 'Aportacion' : 'Retirada'}
                        </td>
                        <td className={`text-right ${isIncrement ? 'positive' : 'negative'}`}>
                          {isIncrement ? '+' : '-'}{formatCurrency(mov.amount ?? 0)}
                        </td>
                        <td className="text-right">{formatCurrency(mov.netCapital)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}


        <section className="report-pro-waterfall-panel" aria-label="Composicion financiera de la cartera">
            <div className="report-pro-panel-head report-pro-waterfall-head">
              <div>
                <span className="report-pro-waterfall-eyebrow">Resumen financiero</span>
                <h4>Composici&oacute;n del valor actual</h4>
                <p>Desglose claro de c&oacute;mo se forma el saldo actual: capital aportado, retiradas y beneficio acumulado.</p>
              </div>
              <div className={`report-pro-waterfall-check ${waterfallFormulaOk ? 'is-ok' : 'is-warning'}`}>
                {waterfallFormulaOk ? 'Cuadra con el saldo actual' : 'Revisar diferencia de redondeo'}
              </div>
            </div>
            <div className="report-pro-waterfall-visual">
              <div className="report-pro-waterfall-axis" />
              <div className="report-pro-waterfall-step is-capital" style={{ '--bar-height': waterfallHeight(report.incrementos) } as React.CSSProperties}>
                <div className="report-pro-waterfall-value">{formatCurrency(report.incrementos)}</div>
                <div className="report-pro-waterfall-bar"><span /></div>
                <strong>Capital aportado</strong>
                <small>Todo el dinero ingresado</small>
              </div>
              <div className="report-pro-waterfall-connector" />
              <div className="report-pro-waterfall-step is-withdrawal" style={{ '--bar-height': waterfallHeight(report.decrementos, 10) } as React.CSSProperties}>
                <div className="report-pro-waterfall-value negative">-{formatCurrency(report.decrementos)}</div>
                <div className="report-pro-waterfall-bar"><span /></div>
                <strong>Capital retirado</strong>
                <small>Dinero que ya ha salido</small>
              </div>
              <div className="report-pro-waterfall-connector" />
              <div className="report-pro-waterfall-step is-profit" style={{ '--bar-height': waterfallHeight(report.beneficioTotal, 10) } as React.CSSProperties}>
                <div className={`report-pro-waterfall-value ${report.beneficioTotal >= 0 ? 'positive' : 'negative'}`}>{formatSignedCurrency(report.beneficioTotal)}</div>
                <div className="report-pro-waterfall-bar"><span /></div>
                <strong>Beneficio acumulado</strong>
                <small>Resultado generado</small>
              </div>
              <div className="report-pro-waterfall-connector is-final" />
              <div className="report-pro-waterfall-step is-total" style={{ '--bar-height': waterfallHeight(report.saldo) } as React.CSSProperties}>
                <div className="report-pro-waterfall-value total">{formatCurrency(report.saldo)}</div>
                <div className="report-pro-waterfall-bar"><span /></div>
                <strong>Saldo actual</strong>
                <small>Valor final de cartera</small>
              </div>
            </div>
            <div className="report-pro-waterfall-formula">
              <span>{formatCurrency(report.incrementos)}</span>
              <b>-</b>
              <span>{formatCurrency(report.decrementos)}</span>
              <b>+</b>
              <span className={report.beneficioTotal >= 0 ? 'positive' : 'negative'}>{formatSignedCurrency(report.beneficioTotal)}</span>
              <b>=</b>
              <span className="total">{formatCurrency(report.saldo)}</span>
            </div>
        </section>

      </article>
    </div>
  );
};
