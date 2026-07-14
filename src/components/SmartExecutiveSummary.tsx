import React, { useMemo } from 'react';
import { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';

interface SmartExecutiveSummaryProps {
  report: ReportData;
}

const signedCurrency = (value: number) => {
  if (Math.abs(value) < 0.005) return formatCurrency(0);
  return `${value > 0 ? '+' : '-'}${formatCurrency(Math.abs(value))}`;
};

const signedPct = (value: number) => {
  if (Math.abs(value) < 0.005) return '0.00%';
  return `${value > 0 ? '+' : '-'}${Math.abs(value).toFixed(2)}%`;
};

const monthKeyToDate = (month: string) => {
  if (/^\d{4}-\d{2}$/.test(month)) {
    const [year, monthNumber] = month.split('-').map(Number);
    return new Date(year, monthNumber - 1, 1);
  }

  const parts = month.trim().split(/\s+/);
  const months: Record<string, number> = {
    ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2, abr: 3, abril: 3,
    may: 4, mayo: 4, jun: 5, junio: 5, jul: 6, julio: 6, ago: 7, agosto: 7,
    sep: 8, sept: 8, septiembre: 8, oct: 9, octubre: 9, nov: 10, noviembre: 10,
    dic: 11, diciembre: 11
  };
  const index = months[parts[0]?.toLowerCase().replace('.', '')];
  const year = Number(parts[parts.length - 1]);
  if (index === undefined || !Number.isFinite(year)) return null;
  return new Date(year, index, 1);
};

const getLongMonth = (month: string) => {
  const date = monthKeyToDate(month);
  if (!date) return month;
  return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
};

export const SmartExecutiveSummary: React.FC<SmartExecutiveSummaryProps> = ({ report }) => {
  const latestMonth = useMemo(() => {
    const monthsWithData = report.monthlyStats.filter((month) => month.hasData);
    return monthsWithData[monthsWithData.length - 1];
  }, [report.monthlyStats]);
  const latestMonthLabel = latestMonth ? getLongMonth(latestMonth.month) : 'el ultimo mes';
  const netCapital = report.incrementos - report.decrementos;
  const latestMonthDate = latestMonth ? monthKeyToDate(latestMonth.month) : null;
  const latestMonthKey = latestMonthDate
    ? `${latestMonthDate.getFullYear()}-${String(latestMonthDate.getMonth() + 1).padStart(2, '0')}`
    : '';
  const latestMonthMovements = report.movements.filter((movement) => movement.iso.slice(0, 7) === latestMonthKey);
  const latestMonthIncrements = latestMonthMovements
    .filter((movement) => movement.type === 'increment')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const latestMonthDecrements = latestMonthMovements
    .filter((movement) => movement.type === 'decrement')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const monthHadFlows = latestMonthIncrements > 0 || latestMonthDecrements > 0;

  const interpretation = monthHadFlows
    ? `En ${latestMonthLabel} hubo movimientos de capital. Por eso conviene separar el dinero que entro o salio del beneficio real generado por la cartera.`
    : `En ${latestMonthLabel} no hubo movimientos de capital relevantes, por lo que el cambio del saldo viene principalmente del rendimiento de la cartera.`;

  return (
    <section className="smart-summary-panel" aria-label="Resumen ejecutivo inteligente">
      <div className="smart-summary-head">
        <span>Lectura ejecutiva</span>
        <h4>Resumen inteligente de la cartera</h4>
        <p>Una lectura sencilla de los datos principales para entender el estado de la inversion sin interpretar tablas.</p>
      </div>

      <div className="smart-summary-grid">
        <article className="smart-summary-main-card">
          <span>Situacion actual</span>
          <strong>{formatCurrency(report.saldo)}</strong>
          <p>
            Tu cartera tiene actualmente un valor de <b>{formatCurrency(report.saldo)}</b>.
            El capital neto aportado es <b>{formatCurrency(netCapital)}</b> y el beneficio acumulado es{' '}
            <b className={report.beneficioTotal >= 0 ? 'positive' : 'negative'}>{signedCurrency(report.beneficioTotal)}</b>.
          </p>
        </article>

        <article className="smart-summary-card">
          <span>Capital</span>
          <strong>{formatCurrency(report.incrementos)}</strong>
          <p>Capital total aportado desde el inicio.</p>
          <small>Retirado: {formatCurrency(report.decrementos)}</small>
        </article>

        <article className="smart-summary-card">
          <span>Resultado acumulado</span>
          <strong className={report.beneficioTotal >= 0 ? 'positive' : 'negative'}>{signedCurrency(report.beneficioTotal)}</strong>
          <p>Beneficio generado por encima del capital neto aportado.</p>
          <small>Rentabilidad total: {signedPct(report.rentabilidad)}</small>
        </article>

        <article className="smart-summary-card">
          <span>{latestMonthLabel}</span>
          <strong className={report.beneficioUltimoMes >= 0 ? 'positive' : 'negative'}>{signedCurrency(report.beneficioUltimoMes)}</strong>
          <p>Resultado generado en el ultimo mes cerrado.</p>
          <small>Rentabilidad: {signedPct(report.rentabilidadUltimoMes)}</small>
        </article>
      </div>

      <div className="smart-summary-reading">
        <div>
          <span>Como leerlo</span>
          <p>{interpretation}</p>
        </div>
        <div>
          <span>Movimientos del ultimo mes</span>
          <p>
            Aportaciones: <b>{formatCurrency(latestMonthIncrements)}</b> · Retiradas: <b>{formatCurrency(latestMonthDecrements)}</b>
          </p>
        </div>
      </div>
    </section>
  );
};
