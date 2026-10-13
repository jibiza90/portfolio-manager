import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './VaultReportPage.css';

interface VaultPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface VaultReportPageProps {
  report: ReportData;
  pendingCashMovements?: VaultPendingMovement[];
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

interface VaultMonth {
  key: string;
  label: string;
  shortLabel: string;
  balance: number;
  opening: number;
  profit: number;
  returnPct: number;
  increments: number;
  decrements: number;
  movements: ReportData['movements'];
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
}

type VaultPeriod = '3m' | '6m' | '12m' | 'all' | 'custom';

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
  const label = new Date(year, month - 1, 1).toLocaleDateString('es-ES', {
    month: short ? 'short' : 'long',
    year: short ? '2-digit' : 'numeric'
  }).replace('.', '').replace(' de ', ' ');
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
};

const formatDate = (iso: string) => {
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

const sumMovements = (movements: Array<{ type: string; amount: number }>, type: 'increment' | 'decrement') => movements
  .filter((movement) => movement.type === type)
  .reduce((total, movement) => total + movement.amount, 0);

export const VaultReportPage: React.FC<VaultReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onDownload,
  onPeriodChange,
  onAnalyticsEvent
}) => {
  const pending = useMemo(() => pendingCashMovements
    .filter((movement) => Number.isFinite(movement.amount) && movement.amount > 0)
    .sort((left, right) => left.iso.localeCompare(right.iso)), [pendingCashMovements]);
  const pendingIncrements = sumMovements(pending, 'increment');
  const pendingDecrements = sumMovements(pending, 'decrement');
  const visibleBalance = report.saldo + pendingIncrements - pendingDecrements;
  const visibleContributed = report.incrementos + pendingIncrements;
  const visibleWithdrawn = report.decrementos + pendingDecrements;
  const visibleNetCapital = visibleContributed - visibleWithdrawn;

  const months = useMemo<VaultMonth[]>(() => {
    const breakdowns = new Map((report.contributionBreakdowns ?? []).map((item) => [monthToKey(item.month), item]));
    const available = report.monthlyStats
      .filter((month) => month.hasData && Number.isFinite(month.endBalance))
      .sort((left, right) => monthToKey(left.month).localeCompare(monthToKey(right.month)));
    const latestKey = monthToKey(available[available.length - 1]?.month ?? '');
    return available.map((month) => {
      const key = monthToKey(month.month);
      const movements = (report.movements ?? []).filter((movement) => movement.iso.slice(0, 7) === key);
      const increments = sumMovements(movements, 'increment');
      const decrements = sumMovements(movements, 'decrement');
      const balance = Number.isFinite(month.endBalance) ? month.endBalance : 0;
      const profit = Number.isFinite(month.profit) ? month.profit : 0;
      return {
        key,
        label: monthLabel(key),
        shortLabel: monthLabel(key, true),
        balance,
        opening: balance - profit - increments + decrements,
        profit,
        returnPct: key === latestKey && Number.isFinite(report.rentabilidadUltimoMes)
          ? report.rentabilidadUltimoMes
          : Number.isFinite(month.profitPct) ? month.profitPct : 0,
        increments,
        decrements,
        movements,
        breakdown: breakdowns.get(key)
      };
    });
  }, [report]);

  const latestKey = months[months.length - 1]?.key ?? '';
  const [period, setPeriod] = useState<VaultPeriod>('all');
  const [customStart, setCustomStart] = useState(months[0]?.key ?? '');
  const [customEnd, setCustomEnd] = useState(latestKey);
  const [focusedKey, setFocusedKey] = useState(latestKey);
  const [isTrayOpen, setIsTrayOpen] = useState(false);
  const aisleScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPeriod('all');
    setCustomStart(months[0]?.key ?? '');
    setCustomEnd(latestKey);
    setFocusedKey(latestKey);
    setIsTrayOpen(false);
  }, [latestKey, months, report.clientId, report.createdAt]);

  const visibleMonths = useMemo(() => {
    if (period === '12m') return months.slice(-12);
    if (period === '6m') return months.slice(-6);
    if (period === '3m') return months.slice(-3);
    if (period === 'custom') return months.filter((month) => month.key >= customStart && month.key <= customEnd);
    return months;
  }, [customEnd, customStart, months, period]);

  const focusedMonth = visibleMonths.find((month) => month.key === focusedKey)
    ?? visibleMonths[visibleMonths.length - 1];
  const focusedIndex = visibleMonths.findIndex((month) => month.key === focusedMonth?.key);
  const periodStart = visibleMonths[0]?.key ?? '';
  const periodEnd = visibleMonths[visibleMonths.length - 1]?.key ?? '';
  const periodLabel = visibleMonths.length ? `${visibleMonths[0].shortLabel} — ${visibleMonths[visibleMonths.length - 1].shortLabel}` : 'Sin cierres';

  useEffect(() => {
    if (visibleMonths.length && !visibleMonths.some((month) => month.key === focusedKey)) setFocusedKey(visibleMonths[visibleMonths.length - 1].key);
  }, [focusedKey, visibleMonths]);

  useEffect(() => {
    onPeriodChange?.(periodStart, periodEnd, period === 'all');
  }, [onPeriodChange, period, periodEnd, periodStart]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (aisleScrollRef.current) aisleScrollRef.current.scrollLeft = Math.max(0, aisleScrollRef.current.scrollWidth - aisleScrollRef.current.clientWidth);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [period, visibleMonths.length]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsTrayOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  const focusMonth = useCallback((key: string, source: string, openTray = false) => {
    setFocusedKey(key);
    if (openTray) setIsTrayOpen(true);
    onAnalyticsEvent?.({ type: 'vault_month_focus', label: key, metadata: { source } });
  }, [onAnalyticsEvent]);

  const stepFocus = (direction: -1 | 1) => {
    const month = visibleMonths[focusedIndex + direction];
    if (month) focusMonth(month.key, 'keyboard');
  };

  const aisle = useMemo(() => {
    const width = Math.max(1080, visibleMonths.length * 82);
    const baseline = 255;
    const left = 70;
    const right = width - 70;
    const maxBalance = Math.max(1, ...visibleMonths.map((month) => month.balance));
    const maxProfit = Math.max(1, ...visibleMonths.map((month) => Math.abs(month.profit)));
    const frames = visibleMonths.map((month, index) => {
      const progress = visibleMonths.length <= 1 ? 1 : index / (visibleMonths.length - 1);
      const depth = 0.58 + progress * 0.42;
      const x = visibleMonths.length <= 1 ? width / 2 : left + index / (visibleMonths.length - 1) * (right - left);
      const frameWidth = 54 + 34 * depth;
      const height = 58 + month.balance / maxBalance * 155 * depth;
      return { month, x, y: baseline - height, width: frameWidth, height, depth, profitOpacity: 0.12 + Math.abs(month.profit) / maxProfit * 0.28 };
    });
    return { width, baseline, frames };
  }, [visibleMonths]);

  const dialRotation = visibleMonths.length > 0 ? focusedIndex / visibleMonths.length * 360 : 0;
  const dialTicks = visibleMonths.map((month, index) => {
    const angle = index / Math.max(visibleMonths.length, 1) * Math.PI * 2 - Math.PI / 2;
    return {
      month,
      x1: 160 + Math.cos(angle) * 135,
      y1: 160 + Math.sin(angle) * 135,
      x2: 160 + Math.cos(angle) * 148,
      y2: 160 + Math.sin(angle) * 148
    };
  });
  const reconciliation = focusedMonth ? focusedMonth.opening + focusedMonth.increments - focusedMonth.decrements + focusedMonth.profit : 0;
  const allMovements = useMemo(() => [
    ...pending.map((movement) => ({ ...movement, balance: 0, pending: true })),
    ...(report.movements ?? []).map((movement) => ({ ...movement, pending: false }))
  ].sort((left, right) => right.iso.localeCompare(left.iso)), [pending, report.movements]);

  return (
    <div className="vault-report" ref={rootRef} role="document">
      <header className="vault-header"><div><small>JIGSA CAPITAL · PRIVATE CUSTODY</small><h1>BÓVEDA</h1><p>Cámara de custodia patrimonial</p></div><div className="vault-header-actions"><span><small>CHAPA DE ACCESO</small><strong>{report.clientCode}</strong></span><button type="button" onClick={() => { onAnalyticsEvent?.({ type: 'vault_pdf_download', label: periodLabel }); void onDownload?.(); }}>Descargar PDF <b>↓</b></button></div></header>

      {pending.length ? <aside className="vault-transit" role="status"><span className="vault-led" /><div><small>CAPITAL EN TRÁNSITO</small><strong>{pending.length} movimiento{pending.length === 1 ? '' : 's'} incorporado{pending.length === 1 ? '' : 's'} al saldo actual</strong></div><div>{pending.map((movement, index) => <span key={`${movement.iso}-${index}`}><small>{formatDate(movement.iso)} · {movement.type === 'increment' ? 'Aportación' : 'Retirada'}</small><strong>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong></span>)}</div></aside> : null}

      <section className="vault-door" aria-label="Puerta de custodia y posición principal">
        <div className="vault-dial-zone">
          <div className="vault-dial-wrap">
            <svg className="vault-dial" viewBox="0 0 320 320" role="application" tabIndex={0} aria-label={`Dial temporal. Mes enfocado: ${focusedMonth?.label ?? 'sin cierres'}`} onKeyDown={(event) => { if (event.key === 'ArrowLeft') { event.preventDefault(); stepFocus(-1); } else if (event.key === 'ArrowRight') { event.preventDefault(); stepFocus(1); } else if (event.key === 'Enter' && focusedMonth) { setIsTrayOpen(true); } }}>
              <circle className="vault-dial-outer" cx="160" cy="160" r="151" />
              {dialTicks.map((tick) => <line key={tick.month.key} className={tick.month.key === focusedMonth?.key ? 'vault-dial-tick is-active' : 'vault-dial-tick'} x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} />)}
              <circle className="vault-dial-brass" cx="160" cy="160" r="108" />
              <g className="vault-dial-knob" style={{ transform: `rotate(${dialRotation}deg)`, transformOrigin: '160px 160px' }}><circle cx="160" cy="160" r="94" /><line x1="160" y1="65" x2="160" y2="89" /></g>
              <text className="vault-dial-label" x="160" y="137" textAnchor="middle">SALDO ACTUAL</text>
              <text className="vault-dial-value" x="160" y="170" textAnchor="middle">{formatCurrency(visibleBalance)}</text>
              <text className="vault-dial-period" x="160" y="194" textAnchor="middle">{periodLabel}</text>
            </svg>
          </div>
          <div className="vault-period-controls" role="group" aria-label="Seleccionar periodo">{([['3m', '3M'], ['6m', '6M'], ['12m', '12M'], ['all', 'TODO'], ['custom', 'RANGO']] as Array<[VaultPeriod, string]>).map(([value, label]) => <button type="button" key={value} className={period === value ? 'is-active' : ''} aria-pressed={period === value} onClick={() => setPeriod(value)}><i />{label}</button>)}</div>
          {period === 'custom' ? <div className="vault-custom-period"><label>Desde<select value={customStart} onChange={(event) => { const value = event.target.value; setCustomStart(value); if (value > customEnd) setCustomEnd(value); }}>{months.map((month) => <option key={month.key} value={month.key}>{month.shortLabel}</option>)}</select></label><label>Hasta<select value={customEnd} onChange={(event) => { const value = event.target.value; setCustomEnd(value); if (value < customStart) setCustomStart(value); }}>{months.map((month) => <option key={month.key} value={month.key}>{month.shortLabel}</option>)}</select></label></div> : null}
        </div>

        <aside className="vault-access-plate">
          <header><small>LECTURA CERTIFICADA</small><strong>{focusedMonth?.label ?? 'Sin cierre'}</strong></header>
          <div>
            <article><small>Beneficio del cierre</small><strong className={(focusedMonth?.profit ?? 0) >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(focusedMonth?.profit ?? 0)}</strong></article>
            <article><small>Rentabilidad del cierre</small><strong className={(focusedMonth?.returnPct ?? 0) >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(focusedMonth?.returnPct ?? 0)}</strong></article>
            <article><small>Beneficio acumulado</small><strong className={report.beneficioTotal >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(report.beneficioTotal)}</strong></article>
            <article><small>TWR acumulado</small><strong>{signedPercent((report.twrYtd ?? 0) * 100)}</strong></article>
            <article><small>Rentabilidad total</small><strong>{report.rentabilidadDisponible === false ? 'No aplicable' : signedPercent(report.rentabilidad)}</strong></article>
            <article><small>Capital neto custodiado</small><strong>{formatCurrency(visibleNetCapital)}</strong></article>
          </div>
          <button type="button" disabled={!focusedMonth} onClick={() => setIsTrayOpen(true)}>Abrir inspección del mes</button>
        </aside>
      </section>

      <section className="vault-aisle-section"><header><div><small>PASILLO DE CUSTODIA</small><h2>Cada cierre, una cámara verificable</h2></div><p>La altura de cada marco representa el saldo custodiado al cierre del mes.</p></header>{visibleMonths.length ? <div className="vault-aisle-scroll" ref={aisleScrollRef}><svg className="vault-aisle" viewBox={`0 0 ${aisle.width} 300`} style={{ minWidth: `${aisle.width}px` }} role="application" tabIndex={0} aria-label={`Pasillo patrimonial de ${periodLabel}`} onKeyDown={(event) => { if (event.key === 'ArrowLeft') { event.preventDefault(); stepFocus(-1); } else if (event.key === 'ArrowRight') { event.preventDefault(); stepFocus(1); } }}><defs><linearGradient id="vault-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1a1f26" /><stop offset="1" stopColor="#11151a" /></linearGradient></defs><path className="vault-floor" d={`M ${aisle.width * .36} 34 L ${aisle.width * .64} 34 L ${aisle.width - 18} 282 L 18 282 Z`} />{[0, .25, .5, .75, 1].map((ratio) => <line className="vault-floor-line" key={ratio} x1={aisle.width * (.36 - ratio * .34)} y1="34" x2={aisle.width * (.64 + ratio * .34)} y2="282" />)}{aisle.frames.map((frame) => { const active = frame.month.key === focusedMonth?.key; const fillHeight = Math.max(4, frame.height * Math.min(.82, Math.abs(frame.month.profit) / Math.max(Math.abs(frame.month.balance), 1) * 10)); return <g key={frame.month.key} className={`vault-frame ${active ? 'is-active' : ''}`} role="button" tabIndex={0} onClick={() => focusMonth(frame.month.key, 'aisle', true)}><rect className="vault-frame-body" x={frame.x - frame.width / 2} y={frame.y} width={frame.width} height={frame.height} /><rect className={frame.month.profit >= 0 ? 'vault-frame-profit is-positive' : 'vault-frame-profit is-negative'} x={frame.x - frame.width / 2 + 5} y={aisle.baseline - fillHeight - 5} width={frame.width - 10} height={fillHeight} style={{ opacity: frame.profitOpacity }} />{frame.month.profit > 0 ? <line className="vault-frame-lintel" x1={frame.x - frame.width / 2} x2={frame.x + frame.width / 2} y1={frame.y} y2={frame.y} /> : null}{frame.month.movements.map((movement, index) => <g className={`vault-frame-flow is-${movement.type}`} key={`${movement.iso}-${index}`} transform={`translate(${frame.x + (index - (frame.month.movements.length - 1) / 2) * 18} ${frame.y - 8})`}><path d={movement.type === 'increment' ? 'M -5 0 L 0 -9 L 5 0 Z' : 'M -5 -9 L 0 0 L 5 -9 Z'} /></g>)}{(active || frame === aisle.frames[0] || frame === aisle.frames[aisle.frames.length - 1]) ? <><text className="vault-frame-balance" x={frame.x} y={frame.y - 17} textAnchor="middle">{formatCurrency(frame.month.balance)}</text><text className="vault-frame-month" x={frame.x} y="276" textAnchor="middle">{frame.month.shortLabel}</text></> : null}</g>; })}</svg></div> : <div className="vault-empty">La cámara se activará con el primer cierre mensual.</div>}<div className="vault-aisle-legend"><span><i className="is-balance" />Marco = saldo final</span><span><i className="is-profit" />Interior = beneficio</span><span><i className="is-increment" />▲ Aportación</span><span><i className="is-decrement" />▼ Retirada</span></div></section>

      <section className="vault-walls"><article className="vault-wall"><header><small>PARED I</small><h2>Estructura del capital</h2></header><div className="vault-tiles"><span><i /><small>Capital aportado</small><strong>{formatCurrency(visibleContributed)}</strong></span><span><i /><small>Capital retirado</small><strong>{formatCurrency(visibleWithdrawn)}</strong></span><span><i /><small>Capital neto</small><strong>{formatCurrency(visibleNetCapital)}</strong></span></div><p>Capital incorporado menos retiradas registradas. El beneficio se conserva separado para no confundir rendimiento con movimientos de dinero.</p></article><article className="vault-wall"><header><small>PARED II</small><h2>Lectura del rendimiento</h2></header><div className="vault-performance"><span><small>TWR</small><p>Mide la evolución de la estrategia aislando aportaciones y retiradas.</p></span><span><small>Rentabilidad total</small><p>Relaciona el beneficio acumulado con el capital neto aportado.</p></span></div></article><article className="vault-wall is-movements"><header><small>PARED III</small><h2>Movimientos custodiados</h2></header><div className="vault-wall-movements">{allMovements.length ? allMovements.map((movement, index) => <div key={`${movement.iso}-${index}`} className={`${movement.pending ? 'is-pending' : ''}`}><time>{formatDate(movement.iso)}</time><span>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}{movement.pending ? <em>En tránsito</em> : null}</span><strong className={movement.type === 'increment' ? 'is-increment' : 'is-decrement'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong></div>) : <p className="vault-no-movements">Sin movimientos de capital registrados.</p>}</div></article></section>

      {isTrayOpen && focusedMonth ? <section className="vault-tray" aria-live="polite"><header><div><small>BANDEJA DE INSPECCIÓN · {focusedMonth.key}</small><h2>{focusedMonth.label}</h2></div><div><strong className={Math.abs(reconciliation - focusedMonth.balance) <= .02 ? 'is-positive' : 'is-negative'}>{Math.abs(reconciliation - focusedMonth.balance) <= .02 ? 'CONCILIADO ✓' : 'REVISAR'}</strong><button type="button" aria-label="Cerrar inspección" onClick={() => setIsTrayOpen(false)}>×</button></div></header><div className="vault-equation"><span><small>Saldo inicial</small><strong>{formatCurrency(focusedMonth.opening)}</strong></span><b>+</b><span><small>Aportaciones</small><strong className="is-increment">{focusedMonth.increments ? `+${formatCurrency(focusedMonth.increments)}` : '—'}</strong></span><b>−</b><span><small>Retiradas</small><strong className="is-decrement">{focusedMonth.decrements ? formatCurrency(focusedMonth.decrements) : '—'}</strong></span><b>+</b><span><small>Beneficio</small><strong className={focusedMonth.profit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(focusedMonth.profit)}</strong></span><b>=</b><span className="is-final"><small>Saldo final</small><strong>{formatCurrency(focusedMonth.balance)}</strong></span></div>{focusedMonth.breakdown ? <div className="vault-tranches"><article><small>Posición inicial del mes</small><strong>{formatCurrency(focusedMonth.breakdown.initialCapital)}</strong><p>{signedPercent(focusedMonth.breakdown.initialReturnPct * 100)} · {signedMoney(focusedMonth.breakdown.initialProfit)}</p></article>{focusedMonth.breakdown.contributions.map((contribution, index) => <article className="is-increment" key={`${contribution.iso}-${index}`}><small>Aportación · {formatDate(contribution.iso)}</small><strong>+{formatCurrency(contribution.amount)}</strong><p>{signedPercent(contribution.returnPct * 100)} · {signedMoney(contribution.profit)}</p></article>)}{(focusedMonth.breakdown.withdrawals ?? []).map((withdrawal, index) => <article className="is-decrement" key={`${withdrawal.iso}-${index}`}><small>Retirada · {formatDate(withdrawal.iso)}</small><strong>−{formatCurrency(withdrawal.amount)}</strong><p>{withdrawal.returnPct === undefined ? 'Sin rentabilidad específica' : `${signedPercent(withdrawal.returnPct * 100)} · ${signedMoney(withdrawal.profit)}`}</p></article>)}</div> : null}</section> : null}

      <footer className="vault-footer"><div><span>Capital neto <strong>{formatCurrency(visibleNetCapital)}</strong></span><b>+</b><span>Beneficio acumulado <strong>{signedMoney(report.beneficioTotal)}</strong></span><b>=</b><span>Saldo actual <strong>{formatCurrency(visibleBalance)}</strong></span></div><p>Custodia visual del patrimonio con conciliación mensual auditable. Diseño: <strong>GLM 5.3MAX</strong>.</p></footer>
    </div>
  );
};
