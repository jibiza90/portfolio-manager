import React, { useEffect, useMemo, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import {
  buildCapitalModel,
  type CapitalLot,
  type FlowMonth,
  type FlowPendingMovement
} from './capitalModel';
import { useLang } from '../i18n';
import './ContributionJourneyModule.css';
import { NUMBER_LOCALE, withGrouping } from '../utils/format';

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

// Importe con punto de miles siempre (es-ES no lo pone en cifras de 4 digitos).
const formatGroupedCurrency = (value: number) => {
  const safe = Number.isFinite(value) ? Math.abs(value) : 0;
  const [integer, decimals] = safe.toFixed(2).split('.');
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimals} €`;
};

const formatSignedCurrency = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) < 0.005) return formatCurrency(0);
  return `${safe > 0 ? '+' : '-'}${formatCurrency(Math.abs(safe))}`;
};

const formatSignedPercent = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) < 0.005) return '0,00 %';
  return `${safe > 0 ? '+' : '-'}${Math.abs(safe).toLocaleString(NUMBER_LOCALE, withGrouping({
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }))} %`;
};

const lotStatus = (lot: CapitalLot) => {
  if (lot.pending) return { label: 'Incorporada tras el último cierre', tone: 'pending' };
  if (lot.remainingCapital <= 0.005) return { label: 'Aportación completada', tone: 'closed' };
  if (lot.allocatedWithdrawal > 0.005) return { label: 'Retirada parcial', tone: 'partial' };
  return { label: 'Capital activo', tone: 'active' };
};

const preferredLotId = (lots: CapitalLot[]) => (
  lots.find((lot) => lot.allocatedWithdrawal > 0.005)?.id
  ?? lots[lots.length - 1]?.id
  ?? ''
);

export const ContributionJourneyModule: React.FC<ContributionJourneyModuleProps> = ({
  report,
  pendingCashMovements = [],
  onAnalyticsEvent
}) => {
  const { t } = useLang();
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
    if (!selectedIsVisible) setSelectedLotId(preferredLotId(visibleLots));
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

  return (
    <section className="report-pro-contribution-journey" aria-labelledby="contribution-journey-title">
      <header className="contribution-journey-heading" data-tour="retiradas">
        <div>
          <span className="contribution-journey-eyebrow">{t('Recorrido del capital')}</span>
          <h4 id="contribution-journey-title">{t('Qué ocurrió con cada aportación')}</h4>
          <p>{t('Selecciona una aportación para consultar su capital activo, las retiradas imputadas y el valor que representa actualmente.')}</p>
        </div>
        <details className="contribution-journey-method">
          <summary>{t('Criterio de cálculo')}</summary>
          <p>
            {t('Las retiradas se imputan por orden cronológico: primero reducen la aportación más antigua y, cuando esta se completa, continúan en la siguiente. El resultado atribuido se reconcilia con los cierres publicados.')}
          </p>
        </details>
      </header>

      <div className="contribution-journey-summary" aria-label={t('Resumen de aportaciones')}>
        <article><span>{t('Capital aportado')}</span><strong>{formatCurrency(model.grossCapital)}</strong></article>
        <article><span>{t('Capital retirado')}</span><strong>{formatCurrency(totalWithdrawn)}</strong></article>
        <article><span>{t('Beneficio acumulado')}</span><strong className={totalAttributedProfit >= 0 ? 'positive' : 'negative'}>{formatSignedCurrency(totalAttributedProfit)}</strong></article>
        <article className="is-total"><span>{t('Saldo conciliado')}</span><strong>{formatCurrency(totalAttributedValue)}</strong></article>
      </div>

      <div className="contribution-journey-controls">
        <div className="contribution-journey-filters" role="group" aria-label={t('Filtrar aportaciones')}>
          <button type="button" className={filter === 'all' ? 'is-active' : ''} aria-pressed={filter === 'all'} onClick={() => chooseFilter('all')}>{t('Todas')}</button>
          <button type="button" className={filter === 'active' ? 'is-active' : ''} aria-pressed={filter === 'active'} onClick={() => chooseFilter('active')}>{t('Activas')}</button>
          <button type="button" className={filter === 'withdrawn' ? 'is-active' : ''} aria-pressed={filter === 'withdrawn'} onClick={() => chooseFilter('withdrawn')}>{t('Con retiradas')}</button>
        </div>
        <span>{visibleLots.length === 1 ? t('{total} posición', { total: visibleLots.length }) : t('{total} posiciones', { total: visibleLots.length })}</span>
      </div>

      {visibleLots.length > 0 ? (
        <div className="contribution-journey-map" role="list" aria-label={t('Recorrido de las aportaciones')}>
          {visibleLots.map((lot, index) => {
            const status = lotStatus(lot);
            const isSelected = selectedLot?.id === lot.id;
            return (
              <React.Fragment key={lot.id}>
                <button
                  type="button"
                  role="listitem"
                  className={isSelected ? 'is-active' : ''}
                  aria-expanded={isSelected}
                  onClick={() => chooseLot(lot)}
                >
                  <span className="contribution-journey-identity">
                    <i>{String(index + 1).padStart(2, '0')}</i>
                    <small>{t('Aportación {numero}', { numero: index + 1 })}</small>
                    <strong>{formatDate(lot.iso)}</strong>
                    <em className={`contribution-journey-status is-${status.tone}`}>{t(status.label)}</em>
                  </span>
                  <span className="contribution-journey-map-step is-origin">
                    <small>{t('Capital aportado')}</small>
                    <strong>{formatCurrency(lot.amount)}</strong>
                    <em>{t('Importe incorporado')}</em>
                  </span>
                  <b aria-hidden="true">→</b>
                  <span className="contribution-journey-map-step is-withdrawal">
                    <small>{t('Capital retirado')}</small>
                    <strong>{lot.allocatedWithdrawal > 0 ? `−${formatCurrency(lot.allocatedWithdrawal)}` : formatCurrency(0)}</strong>
                    <em>{lot.allocatedWithdrawal > 0 ? t('Imputación cronológica') : t('Sin retiradas imputadas')}</em>
                  </span>
                  <b aria-hidden="true">→</b>
                  <span className="contribution-journey-map-step is-result">
                    <small>{t('Beneficio atribuido')}</small>
                    <strong className={lot.attributedProfit >= 0 ? 'positive' : 'negative'}>{formatSignedCurrency(lot.attributedProfit)}</strong>
                    <em>{formatSignedPercent(lot.accumulatedReturnPct)}</em>
                  </span>
                  <b aria-hidden="true">→</b>
                  <span className="contribution-journey-map-step is-current">
                    <small>{t('Valor actual atribuido')}</small>
                    <strong>{formatCurrency(lot.currentValue)}</strong>
                    <em>{t('{porcentaje} % del saldo', { porcentaje: lot.sharePct.toLocaleString(NUMBER_LOCALE, withGrouping({ minimumFractionDigits: 1, maximumFractionDigits: 1 })) })}</em>
                  </span>
                  <span className="contribution-journey-map-formula">
                    {t('{importe} aportados', { importe: formatCurrency(lot.amount) })}
                    {lot.allocatedWithdrawal > 0 ? ` − ${t('{importe} retirados', { importe: formatCurrency(lot.allocatedWithdrawal) })}` : ''}
                    {lot.attributedProfit >= 0
                      ? ` + ${t('{importe} de beneficio', { importe: formatCurrency(lot.attributedProfit) })}`
                      : ` − ${t('{importe} de resultado', { importe: formatCurrency(Math.abs(lot.attributedProfit)) })}`}
                    {' = '}<strong>{formatCurrency(lot.currentValue)}</strong>
                  </span>
                  <span className="contribution-journey-map-action">{isSelected ? t('Detalle abierto') : t('Ver detalle')}</span>
                </button>
                {isSelected ? (
                  <article className="contribution-journey-detail" aria-live="polite">
                    <div className="contribution-journey-detail-head">
                      <div>
                        <span>{t('Detalle de la aportación {numero}', { numero: index + 1 })}</span>
                        <h5>{t('Retiradas y posición actual')}</h5>
                        <p>{t('Capital incorporado el {fecha} · {cierres} cierres publicados', { fecha: formatDate(lot.iso), cierres: lot.activeMonths })}</p>
                      </div>
                      <span className={`contribution-journey-status is-${status.tone}`}>{t(status.label)}</span>
                    </div>

                    {lot.withdrawalAllocations.length > 0 ? (
                      <div className="contribution-journey-withdrawals">
                        <div className="contribution-journey-withdrawals-head">
                          <strong>{t('Retiradas imputadas a esta aportación')}</strong>
                          <span>{t('Aplicadas por orden cronológico')}</span>
                        </div>
                        <div className="contribution-journey-withdrawal-list">
                          {lot.withdrawalAllocations.map((withdrawal) => (
                            <div key={`${withdrawal.withdrawalId}-${withdrawal.iso}`}>
                              <span>{formatDate(withdrawal.iso)}</span>
                              <strong>−{formatGroupedCurrency(withdrawal.amount)}</strong>
                              <em>{withdrawal.pending
                                ? t('Pendiente del próximo cierre')
                                : withdrawal.returnSinceEntryPct !== undefined
                                  ? t('Rentabilidad desde la aportación {porcentaje}', { porcentaje: formatSignedPercent(withdrawal.returnSinceEntryPct) })
                                  : t('Sin rentabilidad específica registrada')}</em>
                              {!withdrawal.pending && withdrawal.returnSinceEntryPct !== undefined ? (
                                <small>{t('Desde el {fecha}', { fecha: formatDate(lot.iso) })}</small>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="contribution-journey-no-withdrawals">
                        {t('Esta aportación no tiene retiradas imputadas.')}
                      </div>
                    )}

                    <div className="contribution-journey-facts">
                      <div><span>{t('Capital todavía activo')}</span><strong>{formatCurrency(lot.remainingCapital)}</strong></div>
                      <div><span>{t('Rentabilidad atribuida')}</span><strong className={lot.accumulatedReturnPct >= 0 ? 'positive' : 'negative'}>{formatSignedPercent(lot.accumulatedReturnPct)}</strong></div>
                      <div><span>{t('Peso sobre el saldo actual')}</span><strong>{lot.sharePct.toLocaleString(NUMBER_LOCALE, withGrouping({ minimumFractionDigits: 1, maximumFractionDigits: 1 }))} %</strong></div>
                      <div><span>{t('Cierres con actividad')}</span><strong>{lot.activeMonths}</strong></div>
                    </div>

                    {lot.specificEntryReturnPct !== undefined ? (
                      <p className="contribution-journey-entry-note">
                        {t('En el mes de entrada se aplicó una rentabilidad específica de')} <strong>{formatSignedPercent(lot.specificEntryReturnPct)}</strong>.
                      </p>
                    ) : null}
                  </article>
                ) : null}
              </React.Fragment>
            );
          })}
        </div>
      ) : (
        <div className="contribution-journey-empty">{t('No hay aportaciones que coincidan con este filtro.')}</div>
      )}
    </section>
  );
};
