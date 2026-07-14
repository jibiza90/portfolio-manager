import React, { useEffect, useMemo, useState } from 'react';
import { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';

type JourneyPeriod = '1m' | '3m' | '6m' | '12m' | 'all';
type PlaybackState = 'playing' | 'paused' | 'completed';
type JourneyEventType = 'initial' | 'deposit' | 'withdrawal' | 'profit' | 'loss' | 'current';

interface JourneyEvent {
  id: string;
  type: JourneyEventType;
  iso: string;
  title: string;
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

const longMonthFormatter = new Intl.DateTimeFormat('es-ES', {
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

const monthMap: Record<string, number> = {
  ene: 1, enero: 1,
  feb: 2, febrero: 2,
  mar: 3, marzo: 3,
  abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6,
  jul: 7, julio: 7,
  ago: 8, agosto: 8,
  sep: 9, sept: 9, septiembre: 9,
  oct: 10, octubre: 10,
  nov: 11, noviembre: 11,
  dic: 12, diciembre: 12
};

const monthKey = (month: string) => {
  if (/^\d{4}-\d{2}$/.test(month)) return month;
  const parts = month.trim().split(/\s+/);
  if (parts.length < 2) return '';
  const index = monthMap[parts[0].toLowerCase().replace('.', '')];
  const year = Number(parts[parts.length - 1]);
  if (!index || !Number.isFinite(year)) return '';
  return `${year}-${String(index).padStart(2, '0')}`;
};

const monthEndIso = (month: string) => {
  const key = monthKey(month);
  if (!key) return month;
  const [year, monthValue] = key.split('-').map(Number);
  return new Date(year, monthValue, 0).toISOString().slice(0, 10);
};

const formatDate = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : shortDateFormatter.format(date).replace('.', '');
};

const formatLongMonth = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : longMonthFormatter.format(date);
};

const eventLabel = (type: JourneyEventType) => {
  if (type === 'initial') return 'Inicio';
  if (type === 'deposit') return 'Aportacion';
  if (type === 'withdrawal') return 'Retirada';
  if (type === 'profit') return 'Beneficio';
  if (type === 'loss') return 'Perdida';
  return 'Valor actual';
};

const eventTone = (type: JourneyEventType) => {
  if (type === 'profit') return 'positive';
  if (type === 'loss' || type === 'withdrawal') return 'negative';
  if (type === 'current') return 'current';
  return 'capital';
};

const getPeriodStart = (period: JourneyPeriod, report: ReportData) => {
  if (period === 'all') return '';
  const months = report.monthlyStats
    .filter((month) => month.hasData)
    .map((month) => monthKey(month.month))
    .filter(Boolean)
    .sort();
  if (!months.length) return '';
  const size = period === '1m' ? 1 : period === '3m' ? 3 : period === '6m' ? 6 : 12;
  return months[Math.max(0, months.length - size)];
};

const buildJourneyEvents = (report: ReportData, period: JourneyPeriod): JourneyEvent[] => {
  const start = getPeriodStart(period, report);
  const inPeriod = (isoOrMonth: string) => !start || isoOrMonth.slice(0, 7) >= start;
  const events: JourneyEvent[] = [];
  const movements = [...(report.movements ?? [])].sort((a, b) => a.iso.localeCompare(b.iso));
  const firstMovement = movements[0];

  if (firstMovement && inPeriod(firstMovement.iso)) {
    const firstAmount = firstMovement.type === 'increment' ? firstMovement.amount : Math.max(0, firstMovement.balance);
    events.push({
      id: `initial-${firstMovement.iso}`,
      type: 'initial',
      iso: firstMovement.iso,
      title: 'Punto de partida',
      amount: firstAmount,
      valueBefore: 0,
      valueAfter: firstAmount,
      pctChange: 0
    });
  }

  movements.forEach((movement, index) => {
    if (!inPeriod(movement.iso)) return;
    if (index === 0 && movement.type === 'increment') return;
    const isDeposit = movement.type === 'increment';
    const valueAfter = movement.balance || 0;
    const valueBefore = isDeposit ? valueAfter - movement.amount : valueAfter + movement.amount;
    const amount = isDeposit ? movement.amount : -movement.amount;
    events.push({
      id: `movement-${movement.iso}-${index}`,
      type: isDeposit ? 'deposit' : 'withdrawal',
      iso: movement.iso,
      title: isDeposit ? 'Nueva aportacion' : 'Retirada de capital',
      amount,
      valueBefore,
      valueAfter,
      pctChange: valueBefore ? (amount / valueBefore) * 100 : 0
    });
  });

  report.monthlyStats
    .filter((month) => month.hasData)
    .forEach((month) => {
      const key = monthKey(month.month);
      if (!key || !inPeriod(key)) return;
      const profit = month.profit ?? 0;
      if (Math.abs(profit) < 0.01) return;
      const valueAfter = month.endBalance ?? 0;
      events.push({
        id: `month-${month.month}`,
        type: profit >= 0 ? 'profit' : 'loss',
        iso: monthEndIso(month.month),
        title: profit >= 0 ? 'Resultado positivo del mes' : 'Resultado negativo del mes',
        amount: profit,
        valueBefore: valueAfter - profit,
        valueAfter,
        pctChange: month.profitPct ?? 0
      });
    });

  const monthsWithData = report.monthlyStats.filter((month) => month.hasData);
  const latest = monthsWithData[monthsWithData.length - 1];
  if (latest && inPeriod(monthKey(latest.month))) {
    events.push({
      id: 'current-value',
      type: 'current',
      iso: monthEndIso(latest.month),
      title: 'Valor actual de la cartera',
      amount: report.saldo,
      valueBefore: Math.max(0, report.saldo - report.beneficioUltimoMes),
      valueAfter: report.saldo,
      pctChange: report.rentabilidadUltimoMes
    });
  }

  return events
    .sort((a, b) => a.iso.localeCompare(b.iso) || a.id.localeCompare(b.id))
    .slice(-22);
};

const buildPoints = (events: JourneyEvent[]): JourneyPoint[] => {
  if (!events.length) return [];
  const values = events.map((event) => event.valueAfter);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const span = Math.max(1, max - min);

  return events.map((event, index) => ({
    ...event,
    x: events.length <= 1 ? 50 : 7 + (index / (events.length - 1)) * 86,
    y: 78 - ((event.valueAfter - min) / span) * 58
  }));
};

const smoothPath = (points: JourneyPoint[]) => {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, '');
};

const areaPath = (points: JourneyPoint[]) => {
  if (!points.length) return '';
  const line = smoothPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x} 86 L ${first.x} 86 Z`;
};

const narrativeText = (event: JourneyEvent) => {
  if (event.type === 'initial') return 'Aqui empieza la historia: este fue el primer capital que entro en la cartera.';
  if (event.type === 'deposit') return 'Este dinero no es beneficio: es capital nuevo que se incorpora para aumentar la posicion.';
  if (event.type === 'withdrawal') return 'Esta salida reduce el capital invertido, pero se separa del rendimiento de la cartera.';
  if (event.type === 'profit') return 'Este tramo muestra beneficio real generado por la inversion durante el periodo.';
  if (event.type === 'loss') return 'Este tramo muestra una bajada de valor de mercado, distinta de una retirada.';
  return 'Despues de movimientos y resultados, este es el valor actual de la cartera.';
};

export const InvestmentJourneySection: React.FC<InvestmentJourneySectionProps> = ({ report }) => {
  const [period, setPeriod] = useState<JourneyPeriod>('12m');
  const [playback, setPlayback] = useState<PlaybackState>('playing');
  const [activeIndex, setActiveIndex] = useState(0);

  const events = useMemo(() => buildJourneyEvents(report, period), [report, period]);
  const points = useMemo(() => buildPoints(events), [events]);
  const activeEvent = events[Math.min(activeIndex, Math.max(0, events.length - 1))];
  const activePoint = points[Math.min(activeIndex, Math.max(0, points.length - 1))];
  const path = useMemo(() => smoothPath(points), [points]);
  const area = useMemo(() => areaPath(points), [points]);
  const progress = events.length <= 1 ? 100 : (Math.min(activeIndex, events.length - 1) / (events.length - 1)) * 100;
  const maxValue = Math.max(...events.map((event) => Math.max(event.valueBefore, event.valueAfter, 0)), 1);
  const beforeHeight = activeEvent ? `${Math.max(8, Math.min(100, (Math.max(activeEvent.valueBefore, 0) / maxValue) * 100))}%` : '8%';
  const afterHeight = activeEvent ? `${Math.max(8, Math.min(100, (Math.max(activeEvent.valueAfter, 0) / maxValue) * 100))}%` : '8%';
  const tone = activeEvent ? eventTone(activeEvent.type) : 'current';

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
    }, 3600);
    return () => window.clearInterval(timer);
  }, [events.length, playback]);

  if (!activeEvent || !activePoint) {
    return (
      <section className="investment-story">
        <div className="investment-story-empty">Todavia no hay suficiente actividad para mostrar tu evolucion.</div>
      </section>
    );
  }

  const goTo = (index: number) => {
    setPlayback('paused');
    setActiveIndex(Math.max(0, Math.min(events.length - 1, index)));
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
    <section className={`investment-story ${tone}`} aria-label="Tu inversion paso a paso">
      <div className="investment-story-topbar">
        <div>
          <span>Experiencia guiada</span>
          <h4>Tu inversion, paso a paso</h4>
          <p>Una explicacion automatica de como los movimientos y resultados han construido el valor actual.</p>
        </div>
        <div className="investment-story-actions">
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

      <div className="investment-story-layout">
        <div className="investment-story-scene">
          <div className="investment-story-status">
            <span>{playback === 'playing' ? 'Reproduciendo' : playback === 'completed' ? 'Completado' : 'En pausa'}</span>
            <strong>{Math.round(progress)}%</strong>
          </div>

          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="storyLineGradient" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#315cf5" />
                <stop offset="58%" stopColor="#22c55e" />
                <stop offset="100%" stopColor="#0ea5e9" />
              </linearGradient>
              <linearGradient id="storyAreaGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(49, 92, 245, 0.22)" />
                <stop offset="100%" stopColor="rgba(49, 92, 245, 0.02)" />
              </linearGradient>
              <clipPath id="storyProgressClip">
                <rect x="0" y="0" width={progress} height="100" />
              </clipPath>
            </defs>
            <path className="investment-story-grid-line" d="M 6 84 L 94 84" />
            <path className="investment-story-area" d={area} />
            <path className="investment-story-path muted" d={path} pathLength={100} />
            <path className="investment-story-path active" d={path} pathLength={100} clipPath="url(#storyProgressClip)" />
          </svg>

          <div className="investment-story-focus" style={{ left: `${activePoint.x}%`, top: `${activePoint.y}%` }} />
          <div className="investment-story-marker" style={{ left: `${activePoint.x}%`, top: `${activePoint.y}%` }}>
            <span>{eventLabel(activeEvent.type)}</span>
          </div>

          {points.map((point, index) => (
            <button
              key={point.id}
              type="button"
              className={`investment-story-node ${eventTone(point.type)} ${index === activeIndex ? 'active' : ''}`}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              onClick={() => goTo(index)}
              aria-label={`${eventLabel(point.type)} ${formatDate(point.iso)}`}
            />
          ))}

          <div className="investment-story-caption" key={activeEvent.id}>
            <small>{formatDate(activeEvent.iso)} ? {formatLongMonth(activeEvent.iso)}</small>
            <strong>{activeEvent.title}</strong>
            <b className={activeEvent.amount >= 0 ? 'positive' : 'negative'}>{signedCurrency(activeEvent.amount)}</b>
          </div>
        </div>

        <aside className="investment-story-card" key={`${activeEvent.id}-card`} aria-live="polite">
          <span>Capitulo {activeIndex + 1} de {events.length}</span>
          <h5>{activeEvent.title}</h5>
          <p>{narrativeText(activeEvent)}</p>
          <div className="investment-story-amount"><b className={activeEvent.amount >= 0 ? 'positive' : 'negative'}>{signedCurrency(activeEvent.amount)}</b></div>
          <div className="investment-story-before-after">
            <div>
              <small>Antes</small>
              <strong>{formatCurrency(activeEvent.valueBefore)}</strong>
              <i style={{ height: beforeHeight }} />
            </div>
            <div>
              <small>Despues</small>
              <strong>{formatCurrency(activeEvent.valueAfter)}</strong>
              <i style={{ height: afterHeight }} />
            </div>
          </div>
          <dl>
            <div><dt>Variacion</dt><dd>{signedPct(activeEvent.pctChange)}</dd></div>
            <div><dt>Tipo</dt><dd>{eventLabel(activeEvent.type)}</dd></div>
          </dl>
        </aside>
      </div>

      <div className="investment-story-controls">
        <button type="button" onClick={() => goTo(activeIndex - 1)} disabled={activeIndex === 0}>Anterior</button>
        <input
          type="range"
          min="0"
          max={events.length - 1}
          value={activeIndex}
          onChange={(event) => goTo(Number(event.target.value))}
          aria-label="Recorrer la historia de inversion"
        />
        <button type="button" onClick={() => goTo(activeIndex + 1)} disabled={activeIndex >= events.length - 1}>Siguiente</button>
        <button type="button" onClick={() => { setActiveIndex(0); setPlayback('playing'); }}>Reiniciar</button>
      </div>

      <div className="investment-story-summary">
        <div><span>Valor actual</span><strong>{formatCurrency(report.saldo)}</strong></div>
        <div><span>Capital aportado</span><strong>{formatCurrency(report.incrementos)}</strong></div>
        <div><span>Capital retirado</span><strong>{formatCurrency(report.decrementos)}</strong></div>
        <div><span>Beneficio neto</span><strong className={report.beneficioTotal >= 0 ? 'positive' : 'negative'}>{signedCurrency(report.beneficioTotal)}</strong></div>
      </div>
    </section>
  );
};
