import React, { useEffect, useMemo, useState } from 'react';
import { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';

type JourneyPeriod = '1m' | '3m' | '6m' | '12m' | 'all';
type JourneyPlayback = 'idle' | 'playing' | 'paused' | 'completed';
type JourneyEventType = 'initial' | 'deposit' | 'withdrawal' | 'profit' | 'loss' | 'current';

interface JourneyEvent {
  id: string;
  type: JourneyEventType;
  iso: string;
  title: string;
  description: string;
  amount: number;
  valueBefore: number;
  valueAfter: number;
  pctChange: number;
}

interface JourneyPoint extends JourneyEvent {
  x: number;
  y: number;
}

interface InvestmentJourneySectionProps {
  report: ReportData;
}

const pctFormatter = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const shortDateFormatter = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: 'short',
  year: '2-digit'
});

const monthDateFormatter = new Intl.DateTimeFormat('es-ES', {
  month: 'long',
  year: 'numeric'
});

const signedCurrency = (value: number) => {
  if (Math.abs(value) < 0.005) return formatCurrency(0);
  return `${value > 0 ? '+' : '-'}${formatCurrency(Math.abs(value))}`;
};

const signedPct = (value: number) => {
  if (Math.abs(value) < 0.005) return '0,00 %';
  return `${value > 0 ? '+' : '-'}${pctFormatter.format(Math.abs(value))} %`;
};

const parseMonthKey = (month: string) => {
  const parts = month.trim().split(/\s+/);
  if (/^\d{4}-\d{2}$/.test(month)) return month;
  if (parts.length < 2) return '';
  const months: Record<string, number> = {
    ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4,
    may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8,
    sep: 9, sept: 9, septiembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11,
    dic: 12, diciembre: 12
  };
  const monthIndex = months[parts[0].toLowerCase().replace('.', '')];
  const year = Number(parts[parts.length - 1]);
  if (!monthIndex || !Number.isFinite(year)) return '';
  return `${year}-${String(monthIndex).padStart(2, '0')}`;
};

const monthEndIso = (month: string) => {
  const key = parseMonthKey(month);
  if (!key) return month;
  const [year, monthPart] = key.split('-').map(Number);
  const end = new Date(year, monthPart, 0);
  return end.toISOString().slice(0, 10);
};

const formatDate = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : shortDateFormatter.format(date).replace('.', '');
};

const formatMonth = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : monthDateFormatter.format(date);
};

const getPeriodStartKey = (period: JourneyPeriod, report: ReportData) => {
  if (period === 'all') return '';
  const months = report.monthlyStats.filter((month) => month.hasData).map((month) => parseMonthKey(month.month)).filter(Boolean).sort();
  if (!months.length) return '';
  const count = period === '1m' ? 1 : period === '3m' ? 3 : period === '6m' ? 6 : 12;
  return months[Math.max(0, months.length - count)];
};

const buildJourneyEvents = (report: ReportData, period: JourneyPeriod): JourneyEvent[] => {
  const periodStart = getPeriodStartKey(period, report);
  const inPeriod = (iso: string) => !periodStart || iso.slice(0, 7) >= periodStart;
  const events: JourneyEvent[] = [];

  const sortedMovements = [...(report.movements ?? [])].sort((a, b) => a.iso.localeCompare(b.iso));
  const firstMovement = sortedMovements[0];
  if (firstMovement && inPeriod(firstMovement.iso)) {
    const initialAfter = firstMovement.type === 'increment' ? firstMovement.amount : Math.max(0, firstMovement.balance);
    events.push({
      id: `initial-${firstMovement.iso}`,
      type: 'initial',
      iso: firstMovement.iso,
      title: 'Punto de partida',
      description: `La cartera empieza con una primera posicion de ${formatCurrency(initialAfter)}.`,
      amount: initialAfter,
      valueBefore: 0,
      valueAfter: initialAfter,
      pctChange: 0
    });
  }

  sortedMovements.forEach((movement, index) => {
    if (!inPeriod(movement.iso)) return;
    if (index === 0 && movement.type === 'increment') return;
    const amount = movement.type === 'increment' ? movement.amount : -movement.amount;
    const valueAfter = movement.balance || 0;
    const valueBefore = movement.type === 'increment' ? valueAfter - movement.amount : valueAfter + movement.amount;
    const pctChange = valueBefore ? (amount / valueBefore) * 100 : 0;
    const isDeposit = movement.type === 'increment';
    events.push({
      id: `movement-${movement.iso}-${index}`,
      type: isDeposit ? 'deposit' : 'withdrawal',
      iso: movement.iso,
      title: isDeposit ? 'Aportacion incorporada' : 'Retirada registrada',
      description: isDeposit
        ? `Se incorpora capital nuevo a la cartera sin confundirlo con beneficio.`
        : `Sale capital de la cartera y se separa del resultado de inversion.`,
      amount,
      valueBefore,
      valueAfter,
      pctChange
    });
  });

  report.monthlyStats
    .filter((month) => month.hasData && inPeriod(parseMonthKey(month.month)))
    .forEach((month) => {
      const profit = month.profit ?? 0;
      if (Math.abs(profit) < 0.01) return;
      const valueAfter = month.endBalance ?? 0;
      const valueBefore = valueAfter - profit;
      events.push({
        id: `month-${month.month}`,
        type: profit >= 0 ? 'profit' : 'loss',
        iso: monthEndIso(month.month),
        title: profit >= 0 ? 'Beneficio mensual' : 'Perdida mensual',
        description: `Resultado generado durante ${formatMonth(monthEndIso(month.month))}.`,
        amount: profit,
        valueBefore,
        valueAfter,
        pctChange: month.profitPct ?? 0
      });
    });

  const dataMonths = report.monthlyStats.filter((month) => month.hasData);
  const latest = dataMonths[dataMonths.length - 1];
  if (latest && inPeriod(parseMonthKey(latest.month))) {
    events.push({
      id: 'current-value',
      type: 'current',
      iso: monthEndIso(latest.month),
      title: 'Valor actual de cartera',
      description: 'Resumen final del recorrido seleccionado.',
      amount: report.saldo,
      valueBefore: report.saldo - report.beneficioUltimoMes,
      valueAfter: report.saldo,
      pctChange: report.rentabilidadUltimoMes
    });
  }

  return events
    .sort((a, b) => a.iso.localeCompare(b.iso) || a.id.localeCompare(b.id))
    .filter((event, index, list) => index === 0 || event.id !== list[index - 1].id)
    .slice(-24);
};

const buildPoints = (events: JourneyEvent[]): JourneyPoint[] => {
  if (!events.length) return [];
  const values = events.map((event) => event.valueAfter);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = Math.max(1, max - min);
  return events.map((event, index) => ({
    ...event,
    x: events.length <= 1 ? 50 : 6 + (index / (events.length - 1)) * 88,
    y: 82 - ((event.valueAfter - min) / span) * 64
  }));
};

const eventTone = (type: JourneyEventType) => {
  if (type === 'deposit' || type === 'initial') return 'is-blue';
  if (type === 'profit') return 'is-green';
  if (type === 'loss' || type === 'withdrawal') return 'is-red';
  return 'is-current';
};

export const InvestmentJourneySection: React.FC<InvestmentJourneySectionProps> = ({ report }) => {
  const [period, setPeriod] = useState<JourneyPeriod>('12m');
  const [playback, setPlayback] = useState<JourneyPlayback>('playing');
  const [activeIndex, setActiveIndex] = useState(0);

  const events = useMemo(() => buildJourneyEvents(report, period), [report, period]);
  const points = useMemo(() => buildPoints(events), [events]);
  const activeEvent = events[Math.min(activeIndex, Math.max(0, events.length - 1))];
  const progress = events.length <= 1 ? 100 : (Math.min(activeIndex, events.length - 1) / (events.length - 1)) * 100;
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const activeTone = eventTone(activeEvent?.type ?? 'current');
  const valueScaleMax = Math.max(...events.map((event) => Math.max(event.valueBefore, event.valueAfter, 0)), 1);
  const beforeHeight = activeEvent ? `${Math.max(8, Math.min(100, (Math.max(activeEvent.valueBefore, 0) / valueScaleMax) * 100))}%` : '8%';
  const afterHeight = activeEvent ? `${Math.max(8, Math.min(100, (Math.max(activeEvent.valueAfter, 0) / valueScaleMax) * 100))}%` : '8%';
  const storySentence = activeEvent
    ? activeEvent.type === 'deposit'
      ? `En esta fecha entra capital nuevo: no es beneficio, es una aportacion que aumenta la posicion.`
      : activeEvent.type === 'withdrawal'
        ? `Aqui sale capital de la cartera. La retirada se separa del rendimiento de la inversion.`
        : activeEvent.type === 'profit'
          ? `La cartera genera resultado positivo y el valor sube por rendimiento.`
          : activeEvent.type === 'loss'
            ? `Este tramo recoge una bajada de valor: se distingue de una retirada de dinero.`
            : activeEvent.type === 'initial'
              ? `Este es el punto de partida del recorrido financiero.`
              : `Este es el valor actual despues de movimientos y resultados acumulados.`
    : '';

  useEffect(() => {
    setActiveIndex(0);
    setPlayback('playing');
  }, [period, events.length]);

  useEffect(() => {
    if (playback !== 'playing' || events.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => {
        if (current >= events.length - 1) {
          window.clearInterval(timer);
          setPlayback('completed');
          return current;
        }
        return current + 1;
      });
    }, 3200);
    return () => window.clearInterval(timer);
  }, [playback, events.length]);

  if (!events.length || !activeEvent) {
    return (
      <section className="investment-journey-section">
        <div className="investment-journey-empty">Todavia no hay suficiente actividad para mostrar tu evolucion.</div>
      </section>
    );
  }

  const goTo = (nextIndex: number) => {
    setPlayback('paused');
    setActiveIndex(Math.max(0, Math.min(events.length - 1, nextIndex)));
  };

  const togglePlayback = () => {
    if (playback === 'playing') {
      setPlayback('paused');
      return;
    }
    if (playback === 'completed') setActiveIndex(0);
    setPlayback('playing');
  };

  return (
    <section className="investment-journey-section" aria-label="Tu inversion paso a paso">
      <div className="investment-journey-header">
        <div>
          <span className="investment-journey-eyebrow">Evolucion financiera</span>
          <h4>Tu inversion, paso a paso</h4>
          <p>Recorre cada aportacion, retirada y resultado mensual para entender como se ha construido el valor actual.</p>
        </div>
        <div className="investment-journey-actions">
          <label>
            Periodo
            <select value={period} onChange={(event) => setPeriod(event.target.value as JourneyPeriod)}>
              <option value="1m">1 mes</option>
              <option value="3m">3 meses</option>
              <option value="6m">6 meses</option>
              <option value="12m">1 ano</option>
              <option value="all">Todo</option>
            </select>
          </label>
          <button type="button" onClick={togglePlayback}>{playback === 'playing' ? 'Pausar' : 'Reproducir'}</button>
        </div>
      </div>

      <div className="investment-journey-kpis">
        <div><span>Valor actual</span><strong>{formatCurrency(report.saldo)}</strong></div>
        <div><span>Capital aportado</span><strong>{formatCurrency(report.incrementos)}</strong></div>
        <div><span>Total retirado</span><strong>{formatCurrency(report.decrementos)}</strong></div>
        <div><span>Beneficio neto</span><strong className={report.beneficioTotal >= 0 ? 'positive' : 'negative'}>{signedCurrency(report.beneficioTotal)}</strong></div>
      </div>

      <div className={`investment-journey-cinema ${activeTone}`}>
        <div className="investment-journey-cinema-head">
          <span>Historia automatica</span>
          <strong>{playback === 'playing' ? 'Reproduciendo la evolucion' : playback === 'completed' ? 'Recorrido completado' : 'Recorrido en pausa'}</strong>
          <em>{Math.round(progress)}%</em>
        </div>

        <div className="investment-journey-stage">
          <div className="investment-journey-graph" role="img" aria-label="Recorrido temporal del valor de cartera">
            <div className="investment-journey-spotlight" style={{ left: `${points[activeIndex]?.x ?? 50}%`, top: `${points[activeIndex]?.y ?? 50}%` }} />
            <div className="investment-journey-money-flow" key={`${activeEvent.id}-flow`}>
              <span />
              <span />
              <span />
            </div>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="journeyPathGradient" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#315cf5" />
                  <stop offset="58%" stopColor="#22c55e" />
                  <stop offset="100%" stopColor="#0ea5e9" />
                </linearGradient>
              </defs>
              <path className="investment-journey-grid-line" d="M 5 82 L 95 82" />
              <path className="investment-journey-path-base" d={path} />
              <path className="investment-journey-path-active" d={path} style={{ strokeDasharray: '100 100', strokeDashoffset: 100 - progress }} />
            </svg>
            {points.map((point, index) => (
              <button
                key={point.id}
                type="button"
                className={`investment-journey-node ${eventTone(point.type)} ${index === activeIndex ? 'is-active' : ''}`}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                onClick={() => goTo(index)}
                aria-label={`${point.title}, ${formatDate(point.iso)}`}
              >
                <span />
              </button>
            ))}
            <div className="investment-journey-big-caption" key={`${activeEvent.id}-caption`}>
              <span>{formatDate(activeEvent.iso)}</span>
              <strong>{activeEvent.title}</strong>
              <em className={activeEvent.amount >= 0 ? 'positive' : 'negative'}>{signedCurrency(activeEvent.amount)}</em>
            </div>
            <div className="investment-journey-progress" style={{ '--journey-progress': `${progress}%` } as React.CSSProperties} />
          </div>

          <aside className={`investment-journey-panel ${activeTone}`} aria-live="polite" key={activeEvent.id}>
            <span>Evento {activeIndex + 1} de {events.length}</span>
            <h5>{activeEvent.title}</h5>
            <time>{formatDate(activeEvent.iso)}</time>
            <strong className={activeEvent.amount >= 0 ? 'positive' : 'negative'}>{signedCurrency(activeEvent.amount)}</strong>
            <p>{storySentence}</p>
            <div className="investment-journey-before-after">
              <div>
                <small>Antes</small>
                <b>{formatCurrency(activeEvent.valueBefore)}</b>
                <i style={{ height: beforeHeight }} />
              </div>
              <div>
                <small>Despues</small>
                <b>{formatCurrency(activeEvent.valueAfter)}</b>
                <i style={{ height: afterHeight }} />
              </div>
            </div>
            <dl>
              <div><dt>Valor anterior</dt><dd>{formatCurrency(activeEvent.valueBefore)}</dd></div>
              <div><dt>Valor posterior</dt><dd>{formatCurrency(activeEvent.valueAfter)}</dd></div>
              <div><dt>Variacion</dt><dd>{signedPct(activeEvent.pctChange)}</dd></div>
            </dl>
          </aside>
        </div>
      </div>

      <div className="investment-journey-controls">
        <button type="button" onClick={() => goTo(activeIndex - 1)} disabled={activeIndex === 0}>Anterior</button>
        <input
          type="range"
          min="0"
          max={events.length - 1}
          value={activeIndex}
          onChange={(event) => goTo(Number(event.target.value))}
          aria-label="Seleccionar evento del recorrido"
        />
        <button type="button" onClick={() => goTo(activeIndex + 1)} disabled={activeIndex >= events.length - 1}>Siguiente</button>
        <button type="button" onClick={() => { setActiveIndex(0); setPlayback('idle'); }}>Reiniciar</button>
      </div>

      <div className="investment-journey-analytics">
        <div className="investment-journey-legend">
          <span><i className="is-blue" /> Aportaciones</span>
          <span><i className="is-green" /> Beneficios</span>
          <span><i className="is-red" /> Retiradas/perdidas</span>
          <span><i className="is-current" /> Valor actual</span>
        </div>
        <div className="investment-journey-mini-table" role="region" aria-label="Eventos financieros del recorrido">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Evento</th><th>Importe</th><th>Valor posterior</th></tr>
            </thead>
            <tbody>
              {events.map((event, index) => (
                <tr key={event.id} className={index === activeIndex ? 'is-active' : ''}>
                  <td>{formatDate(event.iso)}</td>
                  <td>{event.title}</td>
                  <td className={event.amount >= 0 ? 'positive' : 'negative'}>{signedCurrency(event.amount)}</td>
                  <td>{formatCurrency(event.valueAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
