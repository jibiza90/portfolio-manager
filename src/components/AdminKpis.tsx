import React, { useMemo, useState } from 'react';
import type { MonthlyHistoryEntry, Movement, PortfolioSnapshot } from '../types';
import { loadCommissionRates } from '../utils/commissions';
import { formatCurrency, formatPercentValue } from '../utils/format';
import { buildFundKpis, type FundMonth } from '../utils/fundKpis';
import { buildFundDetails, getClientSummary, getFundAt } from '../utils/fundKpisDetails';
import { buildBuyerKpis, type BuyerContact } from '../utils/fundBuyerKpis';
import { toIso, type RecurringWithdrawalsState } from '../utils/recurringWithdrawals';
import './AdminKpis.css';

// Pestaña "KPIs" del admin: los datos del fondo a mano para responder cualquier pregunta al momento.
// Solo lee los datos guardados (incluye lo pendiente de publicar). No cambia nada.

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
const dateLabel = (iso?: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const pct = (value?: number) => (value === undefined ? '—' : formatPercentValue(value * 100));
const signedPct = (value?: number) => (value === undefined ? '—' : `${value > 0 ? '+' : ''}${formatPercentValue(value * 100)}`);
const eur = (value: number) => formatCurrency(value);

const readPaidWithdrawals = (): Record<string, boolean> => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem('portfolio-comision-estado-retiro') ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, boolean> : {};
  } catch {
    return {};
  }
};

interface Props {
  clients: Array<{ id: string; label: string }>;
  snapshot: PortfolioSnapshot;
  movementsByClient: Record<string, Record<string, Movement>>;
  monthlyHistoryByClient: Record<string, Record<string, MonthlyHistoryEntry>>;
  recurring: RecurringWithdrawalsState;
  excluded?: Set<string>;
  // Ficha de cada cliente: origen y lista de espera (interes de ampliacion).
  contacts?: Record<string, BuyerContact | undefined>;
  todayIso?: string;
}

const Card: React.FC<{ label: string; value: string; sub?: React.ReactNode; tone?: 'up' | 'down' }> = ({ label, value, sub, tone }) => (
  <div className="kp-card">
    <span className="kp-label">{label}</span>
    <strong className={`kp-value${tone ? ` is-${tone}` : ''}`}>{value}</strong>
    {sub ? <span className="kp-sub">{sub}</span> : null}
  </div>
);

export const AdminKpisView: React.FC<Props> = ({ clients, snapshot, movementsByClient, monthlyHistoryByClient, recurring, excluded, contacts = {}, todayIso = toIso(new Date()) }) => {
  const commissionRates = useMemo(() => loadCommissionRates(), []);
  const paidWithdrawals = useMemo(() => readPaidWithdrawals(), []);
  const kpis = useMemo(() => buildFundKpis({
    clientIds: clients.map((client) => client.id),
    excluded,
    snapshot,
    movementsByClient,
    monthlyHistoryByClient,
    commissionRates,
    paidWithdrawals,
    recurring,
    todayIso
  }), [clients, commissionRates, excluded, monthlyHistoryByClient, movementsByClient, paidWithdrawals, recurring, snapshot, todayIso]);
  const details = useMemo(
    () => buildFundDetails({ kpis, movementsByClient, commissionRates, paidWithdrawals, recurring }),
    [commissionRates, kpis, movementsByClient, paidWithdrawals, recurring]
  );
  const buyer = useMemo(
    () => buildBuyerKpis({ kpis, details, snapshot, movementsByClient, monthlyHistoryByClient, commissionRates, contacts, recurring }),
    [commissionRates, contacts, details, kpis, monthlyHistoryByClient, movementsByClient, recurring, snapshot]
  );
  const nameOf = (clientId: string) => clients.find((client) => client.id === clientId)?.label ?? clientId;
  const searchable = [...kpis.clients].sort((left, right) => nameOf(left.clientId).localeCompare(nameOf(right.clientId), 'es'));
  const [clientId, setClientId] = useState('');
  const summary = useMemo(() => (clientId ? getClientSummary({
    clientId, kpis, snapshot, movementsByClient, monthlyHistoryByClient, commissionRates, paidWithdrawals, recurring
  }) : null), [clientId, commissionRates, kpis, monthlyHistoryByClient, movementsByClient, paidWithdrawals, recurring, snapshot]);
  const snapshotMonths = kpis.months.filter((month) => month.endBalance !== undefined).map((month) => month.month).reverse();
  const [atMonth, setAtMonth] = useState(kpis.lastClosedMonth?.month ?? snapshotMonths[0] ?? '');
  const fundAt = useMemo(
    () => (atMonth ? getFundAt(snapshot, kpis.clients.map((client) => client.clientId), atMonth) : null),
    [atMonth, kpis.clients, snapshot]
  );
  const years = [...new Set(kpis.months.map((month) => month.month.slice(0, 4)))].sort().reverse();
  const [year, setYear] = useState(todayIso.slice(0, 4));
  const yearMonths = kpis.months.filter((month) => month.month.startsWith(`${year}-`));
  const yearTotals = yearMonths.reduce((sum, month) => ({
    contributions: sum.contributions + month.contributions,
    withdrawals: sum.withdrawals + month.withdrawals,
    profit: sum.profit + month.profit
  }), { contributions: 0, withdrawals: 0, profit: 0 });
  const [copied, setCopied] = useState(false);

  const yearLabel = todayIso.slice(0, 4);
  const summaryText = [
    `KPIs del fondo · ${dateLabel(todayIso)}`,
    `Patrimonio gestionado: ${eur(kpis.aum)}`,
    `Clientes activos: ${kpis.activeClients} · saldo medio ${eur(kpis.averageBalance)}`,
    `Aportado ${eur(kpis.totalContributed)} · retirado ${eur(kpis.totalWithdrawn)} · beneficio generado ${eur(kpis.totalProfit)}`,
    kpis.lastClosedMonth ? `Rentabilidad ${monthLabel(kpis.lastClosedMonth.month)}: ${signedPct(kpis.lastClosedMonth.returnPct)}` : '',
    `Rentabilidad ${yearLabel}: ${signedPct(kpis.ytdReturn)} · últimos 12 meses: ${signedPct(kpis.last12Return)} · anualizada: ${signedPct(kpis.annualizedReturn)}`,
    `Meses positivos: ${kpis.positiveMonths} de ${kpis.closedMonths} · desde el inicio ${signedPct(details.periods.sinceStart)} · máxima caída ${details.maxDrawdown.depth < 0 ? signedPct(details.maxDrawdown.depth) : 'ninguna'}`,
    details.growthOf10k ? `10.000 € invertidos en ${monthLabel(details.growthOf10k.since)} hoy serían ${eur(details.growthOf10k.value)}` : '',
    details.medianBalance !== undefined ? `Saldo mediano por cliente: ${eur(details.medianBalance)}` : '',
    `Captación neta ${yearLabel}: ${eur(kpis.flows.year.net)} (ingresos ${eur(kpis.flows.year.contributions)} · retiradas ${eur(kpis.flows.year.withdrawals)})`,
    `Clientes nuevos ${yearLabel}: ${kpis.newClientsThisYear.length}`,
    `Concentración: 3 mayores ${pct(kpis.top3Share)} · 5 mayores ${pct(kpis.top5Share)}`
  ].filter(Boolean).join('\n');

  const copy = () => {
    navigator.clipboard.writeText(summaryText).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }).catch(() => setCopied(false));
  };

  const monthRow = (month: FundMonth) => (
    <tr key={month.month}>
      <td>{monthLabel(month.month)}</td>
      <td className="is-num">{month.contributions > 0 ? eur(month.contributions) : '—'}</td>
      <td className="is-num">{month.withdrawals > 0 ? eur(month.withdrawals) : '—'}</td>
      <td className="is-num">{details.withdrawalsPctByMonth[month.month] !== undefined ? pct(details.withdrawalsPctByMonth[month.month]) : '—'}</td>
      <td className={`is-num ${month.net < 0 ? 'is-down' : ''}`}>{month.net !== 0 ? eur(month.net) : '—'}</td>
      <td className="is-num">{Math.abs(month.profit) >= 0.005 ? eur(month.profit) : '—'}</td>
      <td className="is-num">{month.endBalance !== undefined ? eur(month.endBalance) : '—'}</td>
      <td className={`is-num ${month.returnPct !== undefined && month.returnPct < 0 ? 'is-down' : ''}`}>{month.returnPct !== undefined ? signedPct(month.returnPct) : 'En curso'}</td>
    </tr>
  );

  return (
    <div className="glass-card fade-in kp-root">
      <div className="kp-top">
        <div>
          <h2>KPIs del fondo</h2>
          <p className="kp-note">Con los datos guardados a {dateLabel(todayIso)} (incluye lo pendiente de publicar).</p>
        </div>
        <button type="button" className="info-add-btn kp-copy" onClick={copy}>{copied ? 'Copiado' : 'Copiar resumen'}</button>
      </div>

      <section className="kp-section" aria-label="Buscar cliente">
        <h3>Buscar cliente</h3>
        <label className="kp-field">
          <span>Cliente</span>
          <select value={clientId} onChange={(event) => setClientId(event.target.value)}>
            <option value="">Elige un cliente…</option>
            {searchable.map((client) => <option key={client.clientId} value={client.clientId}>{nameOf(client.clientId)}</option>)}
          </select>
        </label>
        {summary ? (
          <div className="kp-grid">
            <Card label="Saldo" value={eur(summary.balance)} sub={`${pct(summary.share)} del fondo`} />
            <Card label="Aportado" value={eur(summary.contributed)} sub={`${summary.contributions} ${summary.contributions === 1 ? 'aportación' : 'aportaciones'} · última ${dateLabel(summary.lastContribution)}`} />
            <Card label="Retirado" value={eur(summary.withdrawn)} sub={`${summary.withdrawals} ${summary.withdrawals === 1 ? 'retirada' : 'retiradas'} · última ${dateLabel(summary.lastWithdrawalIso)}`} />
            <Card label="Beneficio" value={eur(summary.profit)} tone={summary.profit >= 0 ? 'up' : 'down'} sub={`Rentabilidad total ${signedPct(summary.totalReturn)}`} />
            <Card label="TWR desde el inicio" value={signedPct(summary.twr)} sub={summary.lastMonth ? `Último mes ${summary.lastMonth.monthLabel}: ${signedPct(summary.lastMonth.profitPct / 100)}` : undefined} />
            <Card label="Cliente desde" value={dateLabel(summary.firstContribution)} />
            <Card label="Comisión" value={summary.rate === null ? 'Sin comisión' : pct(summary.rate)} sub={`Pendiente ${eur(summary.commissionsPending)} · cobrada ${eur(summary.commissionsPaid)}`} />
            <Card label="Capital por recuperar" value={eur(summary.capitalPending)} sub="Hasta que empiece a pagar comisión" />
            <Card
              label="Retiradas fijas"
              value={summary.fixedWithdrawals.length === 0 ? 'No tiene' : eur(summary.fixedWithdrawals.reduce((sum, rule) => sum + rule.amount, 0))}
              sub={summary.fixedWithdrawals.length > 0 ? summary.fixedWithdrawals.map((rule) => `${eur(rule.amount)} el día ${rule.day}`).join(' · ') : undefined}
            />
          </div>
        ) : null}
      </section>

      <section className="kp-section" aria-label="Foto a una fecha">
        <div className="kp-head">
          <h3>Foto del fondo a final de mes</h3>
          <label className="kp-field is-inline">
            <span>Mes</span>
            <select value={atMonth} onChange={(event) => setAtMonth(event.target.value)}>
              {snapshotMonths.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
            </select>
          </label>
        </div>
        {fundAt ? (
          <div className="kp-grid">
            <Card label="Patrimonio" value={eur(fundAt.aum)} />
            <Card label="Clientes activos" value={String(fundAt.activeClients)} />
            <Card label="Aportado hasta entonces" value={eur(fundAt.contributed)} sub={`Retirado ${eur(fundAt.withdrawn)}`} />
            <Card label="Beneficio acumulado" value={eur(fundAt.profit)} tone={fundAt.profit >= 0 ? 'up' : 'down'} />
            <Card label="Cliente más grande" value={fundAt.largest ? eur(fundAt.largest.balance) : '—'} sub={fundAt.largest ? nameOf(fundAt.largest.clientId) : undefined} />
          </div>
        ) : null}
      </section>

      <section className="kp-section" aria-label="Ahora">
        <h3>Ahora</h3>
        <div className="kp-grid">
          <Card label="Patrimonio gestionado" value={eur(kpis.aum)} />
          <Card label="Clientes activos" value={String(kpis.activeClients)} sub={`Saldo medio ${eur(kpis.averageBalance)}`} />
          <Card label="Capital neto aportado" value={eur(kpis.netContributed)} sub={`Aportado ${eur(kpis.totalContributed)} · retirado ${eur(kpis.totalWithdrawn)}`} />
          <Card label="Beneficio generado para clientes" value={eur(kpis.totalProfit)} tone={kpis.totalProfit >= 0 ? 'up' : 'down'} />
        </div>
      </section>

      <section className="kp-section" aria-label="Beneficio y capital">
        <h3>Beneficio y capital</h3>
        <div className="kp-grid">
          <Card label="Beneficio ya retirado" value={eur(details.profitWithdrawn)} sub="Lo retirado por encima de lo aportado" />
          <Card label="Beneficio que sigue invertido" value={eur(details.profitInvested)} />
          <Card label="Capital pendiente de recuperar" value={eur(details.capitalPending)} sub="Hasta aquí, las retiradas no pagan comisión" />
        </div>
      </section>

      <section className="kp-section" aria-label="Rentabilidad del fondo">
        <h3>Rentabilidad del fondo</h3>
        <div className="kp-grid">
          <Card label={kpis.lastClosedMonth ? `Último mes · ${monthLabel(kpis.lastClosedMonth.month)}` : 'Último mes'} value={signedPct(kpis.lastClosedMonth?.returnPct)} tone={(kpis.lastClosedMonth?.returnPct ?? 0) >= 0 ? 'up' : 'down'} />
          <Card label={`Año ${yearLabel}`} value={signedPct(kpis.ytdReturn)} tone={(kpis.ytdReturn ?? 0) >= 0 ? 'up' : 'down'} />
          <Card label="Últimos 12 meses" value={signedPct(kpis.last12Return)} sub={kpis.last12Return === undefined ? 'Hace falta un año de datos' : undefined} />
          <Card label="Anualizada" value={signedPct(kpis.annualizedReturn)} sub={kpis.sinceMonth ? `Desde ${monthLabel(kpis.sinceMonth)}` : undefined} />
          <Card label="Meses positivos" value={`${kpis.positiveMonths} de ${kpis.closedMonths}`} />
          <Card
            label="Mejor y peor mes"
            value={kpis.bestMonth ? signedPct(kpis.bestMonth.returnPct) : '—'}
            sub={kpis.bestMonth && kpis.worstMonth ? `Mejor ${monthLabel(kpis.bestMonth.month)} · peor ${monthLabel(kpis.worstMonth.month)} (${signedPct(kpis.worstMonth.returnPct)})` : undefined}
          />
          <Card label="Últimos 3 meses" value={signedPct(details.periods.m3)} />
          <Card label="Últimos 6 meses" value={signedPct(details.periods.m6)} />
          <Card label="Desde el inicio" value={signedPct(details.periods.sinceStart)} sub={kpis.sinceMonth ? `Acumulada desde ${monthLabel(kpis.sinceMonth)}` : undefined} />
          <Card label="10.000 € al principio" value={details.growthOf10k ? eur(details.growthOf10k.value) : '—'} sub={details.growthOf10k ? `Invertidos en ${monthLabel(details.growthOf10k.since)}, hoy` : undefined} />
          {details.netOfCommission.map((item) => (
            <Card
              key={item.rate}
              label={`Neta con comisión del ${pct(item.rate)}`}
              value={signedPct(item.sinceStart)}
              sub={`Desde el inicio, aproximada${item.last12 !== undefined ? ` · 12 meses ${signedPct(item.last12)}` : ''}`}
            />
          ))}
        </div>
        {details.annualReturns.length > 0 ? (
          <>
            <h4>Por año</h4>
            <ul className="kp-list">
              {details.annualReturns.map((item) => (
                <li key={item.year}><span>{item.year}{item.complete ? '' : ` (${item.months} ${item.months === 1 ? 'mes' : 'meses'})`}</span><span>{signedPct(item.returnPct)}</span></li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="kp-section" aria-label="Riesgo">
        <h3>Riesgo</h3>
        <div className="kp-grid">
          <Card label="Máxima caída" value={details.maxDrawdown.depth < 0 ? signedPct(details.maxDrawdown.depth) : 'Ninguna'} sub={details.maxDrawdown.depth < 0 && details.maxDrawdown.peakMonth && details.maxDrawdown.troughMonth ? `De ${monthLabel(details.maxDrawdown.peakMonth)} a ${monthLabel(details.maxDrawdown.troughMonth)}` : 'Con cierres mensuales'} />
          <Card label="Recuperación" value={details.maxDrawdown.depth < 0 ? (details.maxDrawdown.recoveryMonths !== undefined ? `${details.maxDrawdown.recoveryMonths} ${details.maxDrawdown.recoveryMonths === 1 ? 'mes' : 'meses'}` : 'Aún no') : '—'} sub={details.maxDrawdown.recoveredMonth ? `Recuperada en ${monthLabel(details.maxDrawdown.recoveredMonth)}` : undefined} />
          <Card label="Volatilidad anual" value={pct(details.volatility)} sub="Con las rentabilidades mensuales" />
          <Card label="Meses positivos seguidos" value={String(details.streak.current)} sub={`Mejor racha: ${details.streak.best}`} />
        </div>
      </section>

      <section className="kp-section" aria-label="Captación">
        <h3>Captación (ingresos menos retiradas)</h3>
        <div className="kp-grid">
          {([['month', 'Este mes'], ['year', `Año ${yearLabel}`], ['all', 'Desde el inicio']] as const).map(([key, label]) => (
            <Card
              key={key}
              label={label}
              value={eur(kpis.flows[key].net)}
              tone={kpis.flows[key].net >= 0 ? 'up' : 'down'}
              sub={`Ingresos ${eur(kpis.flows[key].contributions)} · retiradas ${eur(kpis.flows[key].withdrawals)}`}
            />
          ))}
          <Card label={`Captación ${yearLabel} sobre patrimonio`} value={kpis.aum > 0 ? pct(kpis.flows.year.net / kpis.aum) : '—'} />
        </div>
        {details.flowsByYear.length > 0 ? (
          <div className="kp-table-wrap">
            <table className="kp-table">
              <thead>
                <tr><th>Año</th><th className="is-num">De clientes nuevos</th><th className="is-num">De clientes que ya estaban</th><th className="is-num">Aportaciones</th><th className="is-num">Aportación media</th><th className="is-num">Retiradas</th><th className="is-num">Retirada media</th></tr>
              </thead>
              <tbody>
                {details.flowsByYear.map((item) => (
                  <tr key={item.year}>
                    <td>{item.year}</td>
                    <td className="is-num">{eur(item.newClientsMoney)}</td>
                    <td className="is-num">{eur(item.existingClientsMoney)}</td>
                    <td className="is-num">{item.contributions}</td>
                    <td className="is-num">{item.averageContribution !== undefined ? eur(item.averageContribution) : '—'}</td>
                    <td className="is-num">{item.withdrawals}</td>
                    <td className="is-num">{item.averageWithdrawal !== undefined ? eur(item.averageWithdrawal) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="kp-section" aria-label="Clientes">
        <h3>Clientes</h3>
        <div className="kp-grid">
          <Card label={`Nuevos en ${yearLabel}`} value={String(kpis.newClientsThisYear.length)} sub={`${kpis.newClientsThisMonth} este mes`} />
          <Card label="Han retirado todo" value={String(kpis.closedClients.length)} />
          <Card label="Antigüedad media" value={kpis.averageTenureMonths !== undefined ? `${kpis.averageTenureMonths.toFixed(1).replace('.', ',')} meses` : '—'} />
        </div>
        <div className="kp-columns">
          <div>
            <h4>Nuevos en {yearLabel}</h4>
            {kpis.newClientsThisYear.length === 0 ? <p className="kp-note">Ninguno.</p> : (
              <ul className="kp-list">
                {kpis.newClientsThisYear.map((client) => (
                  <li key={client.clientId}><span>{nameOf(client.clientId)}</span><span>{dateLabel(client.firstContribution)}</span></li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4>Han retirado todo</h4>
            {kpis.closedClients.length === 0 ? <p className="kp-note">Ninguno.</p> : (
              <ul className="kp-list">
                {kpis.closedClients.map((client) => (
                  <li key={client.clientId}><span>{nameOf(client.clientId)}</span><span>{dateLabel(client.lastWithdrawal)}</span></li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="kp-section" aria-label="Distribución de clientes">
        <h3>Distribución de clientes</h3>
        <div className="kp-grid">
          <Card label="Saldo mediano" value={details.medianBalance !== undefined ? eur(details.medianBalance) : '—'} sub="La mitad de los clientes tiene menos" />
          <Card label="Cliente más grande" value={details.largest ? eur(details.largest.balance) : '—'} sub={details.largest ? nameOf(details.largest.clientId) : undefined} />
          <Card label="Cliente más pequeño" value={details.smallest ? eur(details.smallest.balance) : '—'} sub={details.smallest ? nameOf(details.smallest.clientId) : undefined} />
          <Card label="Con retirada fija" value={String(details.recurringActive.count)} sub={`${eur(details.recurringActive.monthlyTotal)} al mes`} />
        </div>
        <div className="kp-table-wrap">
          <table className="kp-table">
            <thead>
              <tr><th>Saldo</th><th className="is-num">Clientes</th><th className="is-num">Suman</th><th className="is-num">Del patrimonio</th></tr>
            </thead>
            <tbody>
              {details.tiers.map((tier) => (
                <tr key={tier.label}>
                  <td>{tier.label}</td>
                  <td className="is-num">{tier.count}</td>
                  <td className="is-num">{eur(tier.total)}</td>
                  <td className="is-num">{kpis.aum > 0 ? pct(tier.total / kpis.aum) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="kp-section" aria-label="Rentabilidad de los clientes">
        <h3>Rentabilidad de los clientes</h3>
        <div className="kp-grid">
          <Card label="En positivo" value={`${details.clientReturns.positive} de ${details.clientReturns.total}`} />
          <Card label="Rentabilidad total mediana" value={signedPct(details.clientReturns.median)} sub="Beneficio sobre todo lo aportado" />
          <Card label="La más alta" value={signedPct(details.clientReturns.best?.pct)} sub={details.clientReturns.best ? nameOf(details.clientReturns.best.clientId) : undefined} />
          <Card label="La más baja" value={signedPct(details.clientReturns.worst?.pct)} sub={details.clientReturns.worst ? nameOf(details.clientReturns.worst.clientId) : undefined} />
        </div>
      </section>

      <section className="kp-section" aria-label="Concentración">
        <h3>Concentración</h3>
        <div className="kp-grid">
          <Card label="3 clientes más grandes" value={pct(kpis.top3Share)} sub="del patrimonio" />
          <Card label="5 clientes más grandes" value={pct(kpis.top5Share)} sub="del patrimonio" />
        </div>
        <ul className="kp-list">
          {kpis.top.map((client, index) => (
            <li key={client.clientId}><span>{index + 1}. {nameOf(client.clientId)}</span><span>{eur(client.balance)} · {pct(client.share)}</span></li>
          ))}
        </ul>
      </section>

      <section className="kp-section" aria-label="Liquidez prevista">
        <h3>Liquidez prevista</h3>
        <div className="kp-grid">
          <Card label="Retiradas fijas próximos 30 días" value={eur(kpis.upcomingTotal)} sub={kpis.aum > 0 ? `${pct(kpis.upcomingTotal / kpis.aum)} del patrimonio` : undefined} />
          <Card label="Retiradas fijas atrasadas" value={eur(kpis.overdueTotal)} sub={`${kpis.overdueWithdrawals} sin apuntar ni marcar`} tone={kpis.overdueWithdrawals > 0 ? 'down' : undefined} />
        </div>
        {kpis.upcomingWithdrawals.length > 0 ? (
          <ul className="kp-list">
            {kpis.upcomingWithdrawals.map((item) => (
              <li key={`${item.clientId}|${item.iso}`}><span>{dateLabel(item.iso)} · {nameOf(item.clientId)}</span><span>{eur(item.amount)}</span></li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="kp-section" aria-label="Comisiones">
        <h3>Comisiones</h3>
        <div className="kp-grid">
          <Card label={`Cobradas en ${yearLabel}`} value={eur(kpis.commissionsPaidThisYear)} />
          <Card label="Pendientes de cobrar" value={eur(kpis.commissionsPending)} />
          <Card label="Generadas desde el inicio" value={eur(kpis.commissionsGenerated)} />
          <Card label="Si todos retiraran hoy" value={eur(kpis.commissionsIfAllWithdraw)} sub="Beneficio por encima del capital pendiente de recuperar" />
          <Card label="Previsión próximos 30 días" value={eur(details.commissionForecast30)} sub="Por las retiradas fijas" />
        </div>
        {details.commissionsByYear.length > 0 ? (
          <div className="kp-table-wrap">
            <table className="kp-table">
              <thead>
                <tr><th>Mes</th><th className="is-num">Generada</th><th className="is-num">Cobrada</th></tr>
              </thead>
              <tbody>
                {details.commissionsByYear.map((item) => (
                  <React.Fragment key={item.year}>
                    <tr className="kp-year-row"><td>{item.year}</td><td className="is-num">{eur(item.generated)}</td><td className="is-num">{eur(item.paid)}</td></tr>
                    {details.commissionsByMonth.filter((month) => month.month.startsWith(`${item.year}-`)).map((month) => (
                      <tr key={month.month}><td className="kp-indent">{monthLabel(month.month)}</td><td className="is-num">{eur(month.generated)}</td><td className="is-num">{eur(month.paid)}</td></tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="kp-section" aria-label="Mes a mes">
        <div className="kp-head">
          <h3>Mes a mes</h3>
          <div className="kp-years" role="group" aria-label="Elegir año">
            {years.map((option) => (
              <button key={option} type="button" className={option === year ? 'is-active' : ''} aria-pressed={option === year} onClick={() => setYear(option)}>{option}</button>
            ))}
          </div>
        </div>
        <div className="kp-table-wrap">
          <table className="kp-table">
            <thead>
              <tr><th>Mes</th><th className="is-num">Ingresos</th><th className="is-num">Retiradas</th><th className="is-num">Retiradas / patrimonio</th><th className="is-num">Neto</th><th className="is-num">Beneficio</th><th className="is-num">Patrimonio fin de mes</th><th className="is-num">Rentabilidad</th></tr>
            </thead>
            <tbody>{yearMonths.map(monthRow)}</tbody>
            <tfoot>
              <tr>
                <td>Total {year}</td>
                <td className="is-num">{eur(yearTotals.contributions)}</td>
                <td className="is-num">{eur(yearTotals.withdrawals)}</td>
                <td />
                <td className="is-num">{eur(yearTotals.contributions - yearTotals.withdrawals)}</td>
                <td className="is-num">{eur(yearTotals.profit)}</td>
                <td />
                <td className="is-num">{year === yearLabel ? signedPct(kpis.ytdReturn) : signedPct(
                  yearMonths.filter((month) => month.returnPct !== undefined).reduce((factor, month) => factor * (1 + month.returnPct!), 1) - 1
                )}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="kp-section" aria-label="Récords">
        <h3>Récords</h3>
        <div className="kp-grid">
          <Card label="Patrimonio máximo" value={details.records.peakAum ? eur(details.records.peakAum.value) : '—'} sub={details.records.peakAum ? monthLabel(details.records.peakAum.month) : undefined} />
          <Card label="Mayor aportación" value={details.records.biggestContribution ? eur(details.records.biggestContribution.amount) : '—'} sub={details.records.biggestContribution ? `${nameOf(details.records.biggestContribution.clientId)} · ${dateLabel(details.records.biggestContribution.iso)}` : undefined} />
          <Card label="Mayor retirada" value={details.records.biggestWithdrawal ? eur(details.records.biggestWithdrawal.amount) : '—'} sub={details.records.biggestWithdrawal ? `${nameOf(details.records.biggestWithdrawal.clientId)} · ${dateLabel(details.records.biggestWithdrawal.iso)}` : undefined} />
          <Card label="Mejor mes de captación" value={details.records.bestInflowMonth ? eur(details.records.bestInflowMonth.net) : '—'} sub={details.records.bestInflowMonth ? monthLabel(details.records.bestInflowMonth.month) : undefined} />
        </div>
      </section>

      <div className="kp-divider">
        <h2>Visión de comprador</h2>
        <p className="kp-note">Lo que miraría alguien que quiere comprar el fondo: ingresos, crecimiento, si los clientes se quedan y compromisos.</p>
      </div>

      <section className="kp-section" aria-label="Ingresos del negocio">
        <h3>Ingresos del negocio</h3>
        <div className="kp-grid">
          <Card label="Comisiones últimos 12 meses" value={eur(buyer.revenue.last12)} />
          <Card label="Comisión efectiva" value={buyer.revenue.takeOnTotalProfit !== undefined ? pct(buyer.revenue.takeOnTotalProfit) : '—'} sub={`De todo el beneficio de los clientes${buyer.revenue.takeOnWithdrawnProfit !== undefined ? ` · ${pct(buyer.revenue.takeOnWithdrawnProfit)} del beneficio ya retirado` : ''}`} />
          <Card label="Comisión media por cliente" value={buyer.revenue.perClientLast12 !== undefined ? eur(buyer.revenue.perClientLast12) : '—'} sub="Últimos 12 meses" />
          <Card label="Comisión latente por cliente" value={buyer.revenue.latentPerClient !== undefined ? eur(buyer.revenue.latentPerClient) : '—'} sub="Si retiraran todo hoy" />
          <Card label="Previsión 12 meses" value={eur(buyer.revenue.fixedForecast12)} sub="Solo por las retiradas fijas" />
          <Card label="Estimación anual al ritmo actual" value={buyer.revenue.paceEstimate !== undefined ? eur(buyer.revenue.paceEstimate) : '—'} sub={buyer.annualWithdrawalRate !== undefined ? `Los clientes retiran el ${pct(buyer.annualWithdrawalRate)} al año de media` : 'Hace falta historial de retiradas'} />
        </div>
        {buyer.revenue.byYear.length > 0 ? (
          <ul className="kp-list">
            {buyer.revenue.byYear.map((item) => (
              <li key={item.year}><span>Comisiones {item.year}</span><span>{eur(item.generated)} · cobradas {eur(item.paid)}{item.change !== undefined ? ` · ${signedPct(item.change)} frente al año anterior` : ''}</span></li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="kp-section" aria-label="Crecimiento">
        <h3>De dónde sale el crecimiento</h3>
        <div className="kp-table-wrap">
          <table className="kp-table">
            <thead>
              <tr><th>Año</th><th className="is-num">Patrimonio al empezar</th><th className="is-num">Al acabar</th><th className="is-num">Ha crecido</th><th className="is-num">Por dinero nuevo</th><th className="is-num">Por rentabilidad</th><th className="is-num">Otros</th></tr>
            </thead>
            <tbody>
              {buyer.growthByYear.map((row) => (
                <tr key={row.year}>
                  <td>{row.year}</td>
                  <td className="is-num">{eur(row.start)}</td>
                  <td className="is-num">{eur(row.end)}</td>
                  <td className="is-num">{eur(row.growth)}</td>
                  <td className="is-num">{eur(row.fromInflows)}</td>
                  <td className="is-num">{eur(row.fromReturns)}</td>
                  <td className="is-num">{Math.abs(row.other) >= 1 ? eur(row.other) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="kp-note">«Otros» es dinero que no está apuntado como aportación (se explica en la pestaña Auditoría).</p>
        <div className="kp-grid">
          <Card label="Primera aportación media" value={buyer.averageFirstContribution !== undefined ? eur(buyer.averageFirstContribution) : '—'} sub="Al entrar un cliente nuevo" />
          <Card label="Vuelven a aportar" value={buyer.recontribution.share !== undefined ? pct(buyer.recontribution.share) : '—'} sub={`${buyer.recontribution.clients} clientes han hecho una segunda aportación`} />
          <Card label="Hasta la segunda aportación" value={buyer.recontribution.averageDaysToSecond !== undefined ? `${Math.round(buyer.recontribution.averageDaysToSecond)} días` : '—'} sub="De media" />
        </div>
        <h4>Clientes nuevos por mes (últimos 12)</h4>
        <div className="kp-months">
          {buyer.newClientsByMonth.map((item) => (
            <span key={item.month} className={item.count > 0 ? 'has-value' : ''}><b>{item.count}</b>{monthLabel(item.month).slice(0, 3)} {item.month.slice(2, 4)}</span>
          ))}
        </div>
      </section>

      <section className="kp-section" aria-label="Retención">
        <h3>¿Se quedan los clientes?</h3>
        <div className="kp-grid">
          <Card label="Ritmo de retiradas" value={buyer.annualWithdrawalRate !== undefined ? pct(buyer.annualWithdrawalRate) : '—'} sub="Del patrimonio, al año (últimos 12 meses)" />
        </div>
        <div className="kp-table-wrap">
          <table className="kp-table">
            <thead>
              <tr><th>Año</th><th className="is-num">Clientes al empezar</th><th className="is-num">Se han ido</th><th className="is-num">Abandono</th><th className="is-num">Retirado sobre el patrimonio inicial</th></tr>
            </thead>
            <tbody>
              {buyer.retentionByYear.map((row) => (
                <tr key={row.year}>
                  <td>{row.year}</td>
                  <td className="is-num">{row.clientsAtStart}</td>
                  <td className="is-num">{row.lost}</td>
                  <td className="is-num">{row.churn !== undefined ? pct(row.churn) : '—'}</td>
                  <td className="is-num">{row.withdrawnOverStart !== undefined ? pct(row.withdrawnOverStart) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="kp-note">La retención por año de entrada está más abajo, en «Por año de entrada».</p>
      </section>

      <section className="kp-section" aria-label="Condiciones especiales">
        <h3>Condiciones especiales</h3>
        {buyer.specialConditions.length === 0 ? <p className="kp-note">Ningún cliente con condiciones distintas.</p> : (
          <ul className="kp-list">
            {buyer.specialConditions.map((item) => (
              <li key={item.clientId}><span>{nameOf(item.clientId)}</span><span>{item.conditions.join(' · ')}</span></li>
            ))}
          </ul>
        )}
      </section>

      <section className="kp-section" aria-label="Rentabilidad frente a riesgo">
        <h3>Rentabilidad frente a riesgo</h3>
        <div className="kp-grid">
          <Card label="Ratio de Sharpe" value={buyer.sharpe !== undefined ? buyer.sharpe.toFixed(2).replace('.', ',') : '—'} sub="Rentabilidad por cada unidad de riesgo. Más de 1 es bueno" />
          <Card label="Ratio de Sortino" value={buyer.sortino !== undefined ? buyer.sortino.toFixed(2).replace('.', ',') : 'Sin meses negativos'} sub="Igual, pero solo cuenta los meses en negativo" />
        </div>
        <p className="kp-note">Con los cierres mensuales y sin tipo de interés sin riesgo.</p>
      </section>

      <section className="kp-section" aria-label="Lista de espera">
        <h3>Lista de espera</h3>
        <div className="kp-grid">
          <Card label="Dinero por entrar" value={eur(buyer.waitlistTotal)} sub={`${buyer.waitlist.length} ${buyer.waitlist.length === 1 ? 'cliente' : 'clientes'} con interés de ampliación`} />
        </div>
        {buyer.waitlist.length > 0 ? (
          <ul className="kp-list">
            {buyer.waitlist.map((item) => (
              <li key={item.clientId}><span>{nameOf(item.clientId)}{item.note ? ` · ${item.note}` : ''}</span><span>{eur(item.amount)}</span></li>
            ))}
          </ul>
        ) : <p className="kp-note">Se rellena con «Interés de ampliación» en la ficha de cada cliente.</p>}
      </section>

      <section className="kp-section" aria-label="Origen de los clientes">
        <h3>Origen de los clientes</h3>
        <div className="kp-table-wrap">
          <table className="kp-table">
            <thead><tr><th>Origen</th><th className="is-num">Clientes</th><th className="is-num">Patrimonio</th><th className="is-num">Del total</th></tr></thead>
            <tbody>
              {buyer.origins.map((item) => (
                <tr key={item.origin}>
                  <td>{item.origin}</td>
                  <td className="is-num">{item.count}</td>
                  <td className="is-num">{eur(item.aum)}</td>
                  <td className="is-num">{kpis.aum > 0 ? pct(item.aum / kpis.aum) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="kp-note">Se indica con «Origen del cliente» en la ficha de cada cliente.</p>
      </section>

      <section className="kp-section" aria-label="Por año de entrada">
        <h3>Por año de entrada</h3>
        <div className="kp-table-wrap">
          <table className="kp-table">
            <thead>
              <tr><th>Entraron en</th><th className="is-num">Clientes</th><th className="is-num">Aportaron</th><th className="is-num">Siguen</th><th className="is-num">Saldo hoy</th></tr>
            </thead>
            <tbody>
              {details.cohorts.map((item) => (
                <tr key={item.year}>
                  <td>{item.year}</td>
                  <td className="is-num">{item.clients}</td>
                  <td className="is-num">{eur(item.contributed)}</td>
                  <td className="is-num">{item.stillActive}</td>
                  <td className="is-num">{eur(item.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
