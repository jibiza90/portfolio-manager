import React, { useEffect, useMemo, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import {
  buildCapitalModel,
  type CapitalLot,
  type FlowMonth,
  type FlowPendingMovement
} from './CapitalFlowReportPage';
import './ContributionJourneyModule.css';

interface ContributionJourneyModuleProps {
  report: ReportData;
  pendingCashMovements?: FlowPendingMovement[];
  onAnalyticsEvent?: (event: {
    type: string;
    label: string;
    durationMs?: number;
    metadata?: Record<string, string | number | boolean>;
  }) => void;
}

type JourneyFilter = 'all' | 'active' | 'withdrawn';

const monthIndexByLabel: Record<string, number> = {
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

const monthToKey = (value: string) => {
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  const parts = value.trim().toLowerCase().split(/\s+/);
  const month = monthIndexByLabel[parts[0]];
  const year = Number(parts[parts.length - 1]);
  if (month === undefined || !Number.isFinite(year)) return value;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
};

const formatDate = (iso: string) => {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${day}/${month}/${year}` : iso;
};

const formatSignedCurrency = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) < 0.005) return formatCurrency(0);
  return `${safe > 0 ? '+' : '-'}${formatCurrency(Math.abs(safe))}`;
};

const formatSignedPercent = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) < 0.005) return '0,00 %';
  return `${safe > 0 ? '+' : '-'}${Math.abs(safe).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} %`;
};

const lotStatus = (lot: CapitalLot) => {
  if (lot.pending) return { label: 'Incorporada tras el último cierre', tone: 'pending' };
  if (lot.remainingCapital <= 0.005) return { label: 'Retirada completamente', tone: 'closed' };
  if (lot.allocatedWithdrawal > 0.005) return { label: 'Retirada parcialmente', tone: 'partial' };
  return { label: 'Activa', tone: 'active' };
};

export const ContributionJourneyModule: React.FC<ContributionJourneyModuleProps> = ({
  report,
  pendingCashMovements = [],
  onAnalyticsEvent
}) => {
  const months = useMemo<FlowMonth[]>(() => {
    const validStats = report.monthlyStats
      .filter((item) => item.hasData && Number.isFinite(item.endBalance))
      .sort((left, right) => monthToKey(left.month).localeCompare(monthToKey(right.month)));
    const latestKey = validStats.length > 0 ? monthToKey(validStats[validStats.length - 1].month) : '';

    return validStats.map((item) => ({
      key: monthToKey(item.month),
      label: item.month,
      returnPct: monthToKey(item.month) === latestKey && Number.isFinite(report.rentabilidadUltimoMes)
        ? report.rentabilidadUltimoMes
        : Number.isFinite(item.profitPct) ? item.profitPct : 0,
      profit: Number.isFinite(item.profit) ? item.profit : 0,
      balance: Number.isFinite(item.endBalance) ? item.endBalance : 0,
      hasClose: true
    }));
  }, [report]);

  const model = useMemo(
    () => buildCapitalModel(report, months, pendingCashMovements),
    [months, pendingCashMovements, report]
  );
  const [filter, setFilter] = useState<JourneyFilter>('all');
  const [selectedLotId, setSelectedLotId] = useState('');

  const visibleLots = useMemo(() => model.lots.filter((lot) => {
    if (filter === 'active') return lot.remainingCapital > 0.005;
    if (filter === 'withdrawn') return lot.allocatedWithdrawal > 0.005;
    return true;
  }), [filter, model.lots]);

  useEffect(() => {
    const selectedIsVisible = visibleLots.some((lot) => lot.id === selectedLotId);
    if (!selectedIsVisible) setSelectedLotId(visibleLots[visibleLots.length - 1]?.id ?? '');
  }, [report.clientId, report.createdAt, selectedLotId, visibleLots]);

  const selectedLot = visibleLots.find((lot) => lot.id === selectedLotId)
    ?? visibleLots[visibleLots.length - 1];
  const totalAttributedProfit = model.lots.reduce((sum, lot) => sum + lot.attributedProfit, 0);
  const totalAttributedValue = model.lots.reduce((sum, lot) => sum + lot.currentValue, 0);
  const totalWithdrawn = model.lots.reduce((sum, lot) => sum + lot.allocatedWithdrawal, 0);

  if (model.lots.length === 0) return null;

  const chooseLot = (lot: CapitalLot) => {
    setSelectedLotId(lot.id);
    onAnalyticsEvent?.({
      type: 'contribution_journey_select',
      label: lot.label,
      metadata: { pending: lot.pending }
    });
  };

  const chooseFilter = (nextFilter: JourneyFilter) => {
    setFilter(nextFilter);
    onAnalyticsEvent?.({ type: 'contribution_journey_filter', label: nextFilter });
  };

  const selectedStatus = selectedLot ? lotStatus(selectedLot) : null;

  return (
    <section className="report-pro-contribution-journey" aria-labelledby="contribution-journey-title">
      <header className="contribution-journey-heading">
        <div>
          <span className="contribution-journey-eyebrow">Trazabilidad del capital</span>
          <h4 id="contribution-journey-title">Evolución de cada aportación</h4>
          <p>Consulta el recorrido estimado de cada entrada de capital desde su incorporación hasta el último cierre publicado.</p>
        </div>
        <details className="contribution-journey-method">
          <summary>Cómo se calcula</summary>
          <p>
            Las retiradas se distribuyen proporcionalmente entre las aportaciones activas y el resultado atribuido se
            reconcilia con el saldo y los cierres publicados. Es una lectura explicativa, no una contabilidad independiente.
          </p>
        </details>
      </header>

      <div className="contribution-journey-summary" aria-label="Resumen de aportaciones">
        <article><span>Capital incorporado</span><strong>{formatCurrency(model.grossCapital)}</strong></article>
        <article><span>Capital retirado atribuido</span><strong>{formatCurrency(totalWithdrawn)}</strong></article>
        <article><span>Beneficio atribuido</span><strong className={totalAttributedProfit >= 0 ? 'positive' : 'negative'}>{formatSignedCurrency(totalAttributedProfit)}</strong></article>
        <article className="is-total"><span>Valor actual atribuido</span><strong>{formatCurrency(totalAttributedValue)}</strong></article>
      </div>

      <div className="contribution-journey-controls">
        <div className="contribution-journey-filters" role="group" aria-label="Filtrar aportaciones">
          <button type="button" className={filter === 'all' ? 'is-active' : ''} aria-pressed={filter === 'all'} onClick={() => chooseFilter('all')}>Todas</button>
          <button type="button" className={filter === 'active' ? 'is-active' : ''} aria-pressed={filter === 'active'} onClick={() => chooseFilter('active')}>Activas</button>
          <button type="button" className={filter === 'withdrawn' ? 'is-active' : ''} aria-pressed={filter === 'withdrawn'} onClick={() => chooseFilter('withdrawn')}>Con retiradas</button>
        </div>
        <span>{visibleLots.length} {visibleLots.length === 1 ? 'posición' : 'posiciones'}</span>
      </div>

      {visibleLots.length > 0 ? (
        <div className="contribution-journey-layout">
          <div className="contribution-journey-selector" role="list" aria-label="Seleccionar aportación">
            {visibleLots.map((lot, index) => {
              const status = lotStatus(lot);
              return (
                <button
                  type="button"
                  role="listitem"
                  key={lot.id}
                  className={selectedLot?.id === lot.id ? 'is-active' : ''}
                  aria-pressed={selectedLot?.id === lot.id}
                  onClick={() => chooseLot(lot)}
                >
                  <span className="contribution-journey-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="contribution-journey-selector-copy">
                    <small>{lot.label}</small>
                    <strong>{formatCurrency(lot.amount)}</strong>
                    <em>{formatDate(lot.iso)}</em>
                  </span>
                  <span className={`contribution-journey-status is-${status.tone}`}>{status.label}</span>
                </button>
              );
            })}
          </div>

          {selectedLot && selectedStatus ? (
            <article className="contribution-journey-detail" aria-live="polite">
              <div className="contribution-journey-detail-head">
                <div>
                  <span>Aportación seleccionada</span>
                  <h5>{selectedLot.label}</h5>
                  <p>Incorporada el {formatDate(selectedLot.iso)} · {selectedLot.activeMonths} cierres publicados</p>
                </div>
                <span className={`contribution-journey-status is-${selectedStatus.tone}`}>{selectedStatus.label}</span>
              </div>

              <div className="contribution-journey-flow" aria-label="Recorrido de la aportación seleccionada">
                <div><span>Capital incorporado</span><strong>{formatCurrency(selectedLot.amount)}</strong></div>
                <b aria-hidden="true">−</b>
                <div><span>Retiradas atribuidas</span><strong>{formatCurrency(selectedLot.allocatedWithdrawal)}</strong></div>
                <b aria-hidden="true">+</b>
                <div><span>Beneficio atribuido</span><strong className={selectedLot.attributedProfit >= 0 ? 'positive' : 'negative'}>{formatSignedCurrency(selectedLot.attributedProfit)}</strong></div>
                <b aria-hidden="true">=</b>
                <div className="is-total"><span>Valor actual atribuido</span><strong>{formatCurrency(selectedLot.currentValue)}</strong></div>
              </div>

              <div className="contribution-journey-facts">
                <div><span>Capital todavía invertido</span><strong>{formatCurrency(selectedLot.remainingCapital)}</strong></div>
                <div><span>Rentabilidad atribuida</span><strong className={selectedLot.accumulatedReturnPct >= 0 ? 'positive' : 'negative'}>{formatSignedPercent(selectedLot.accumulatedReturnPct)}</strong></div>
                <div><span>Peso sobre el saldo actual</span><strong>{selectedLot.sharePct.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %</strong></div>
              </div>

              {selectedLot.specificEntryReturnPct !== undefined ? (
                <p className="contribution-journey-entry-note">
                  En el mes de entrada se aplicó una rentabilidad específica de <strong>{formatSignedPercent(selectedLot.specificEntryReturnPct)}</strong>.
                </p>
              ) : null}
            </article>
          ) : null}
        </div>
      ) : (
        <div className="contribution-journey-empty">No hay aportaciones que coincidan con este filtro.</div>
      )}
    </section>
  );
};
