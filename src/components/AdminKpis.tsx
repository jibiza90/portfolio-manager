import React, { useMemo, useState } from 'react';
import type { MonthlyHistoryEntry, Movement, PortfolioSnapshot } from '../types';
import { loadCommissionRates } from '../utils/commissions';
import { formatCurrency, formatPercentValue } from '../utils/format';
import { buildFundKpis, type FundMonth } from '../utils/fundKpis';
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
  todayIso?: string;
}

const Card: React.FC<{ label: string; value: string; sub?: React.ReactNode; tone?: 'up' | 'down' }> = ({ label, value, sub, tone }) => (
  <div className="kp-card">
    <span className="kp-label">{label}</span>
    <strong className={`kp-value${tone ? ` is-${tone}` : ''}`}>{value}</strong>
    {sub ? <span className="kp-sub">{sub}</span> : null}
  </div>
);

export const AdminKpisView: React.FC<Props> = ({ clients, snapshot, movementsByClient, monthlyHistoryByClient, recurring, excluded, todayIso = toIso(new Date()) }) => {
  const kpis = useMemo(() => buildFundKpis({
    clientIds: clients.map((client) => client.id),
    excluded,
    snapshot,
    movementsByClient,
    monthlyHistoryByClient,
    commissionRates: loadCommissionRates(),
    paidWithdrawals: readPaidWithdrawals(),
    recurring,
    todayIso
  }), [clients, excluded, monthlyHistoryByClient, movementsByClient, recurring, snapshot, todayIso]);
  const nameOf = (clientId: string) => clients.find((client) => client.id === clientId)?.label ?? clientId;
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
    `Meses positivos: ${kpis.positiveMonths} de ${kpis.closedMonths}`,
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

      <section className="kp-section" aria-label="Ahora">
        <h3>Ahora</h3>
        <div className="kp-grid">
          <Card label="Patrimonio gestionado" value={eur(kpis.aum)} />
          <Card label="Clientes activos" value={String(kpis.activeClients)} sub={`Saldo medio ${eur(kpis.averageBalance)}`} />
          <Card label="Capital neto aportado" value={eur(kpis.netContributed)} sub={`Aportado ${eur(kpis.totalContributed)} · retirado ${eur(kpis.totalWithdrawn)}`} />
          <Card label="Beneficio generado para clientes" value={eur(kpis.totalProfit)} tone={kpis.totalProfit >= 0 ? 'up' : 'down'} />
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
        </div>
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
              <tr><th>Mes</th><th className="is-num">Ingresos</th><th className="is-num">Retiradas</th><th className="is-num">Neto</th><th className="is-num">Beneficio</th><th className="is-num">Patrimonio fin de mes</th><th className="is-num">Rentabilidad</th></tr>
            </thead>
            <tbody>{yearMonths.map(monthRow)}</tbody>
            <tfoot>
              <tr>
                <td>Total {year}</td>
                <td className="is-num">{eur(yearTotals.contributions)}</td>
                <td className="is-num">{eur(yearTotals.withdrawals)}</td>
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
    </div>
  );
};
