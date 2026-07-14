import React, { useEffect, useMemo, useState } from 'react';
import { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';

type StoryPeriod = '3m' | '6m' | '12m' | 'all';
type StoryType = 'start' | 'deposit' | 'withdrawal' | 'profit' | 'loss' | 'current';
type Playback = 'playing' | 'paused' | 'finished';

interface StoryChapter {
  id: string;
  type: StoryType;
  iso: string;
  eyebrow: string;
  title: string;
  explanation: string;
  amount: number;
  beforeValue: number;
  afterValue: number;
  pct?: number;
}

interface PortfolioStoryExperienceProps {
  report: ReportData;
}

const pctFormatter = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const shortDate = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: 'short',
  year: '2-digit'
});

const monthLong = new Intl.DateTimeFormat('es-ES', {
  month: 'long',
  year: 'numeric'
});

const signedCurrency = (value: number) => {
  if (Math.abs(value) < 0.005) return formatCurrency(0);
  return `${value > 0 ? '+' : '-'}${formatCurrency(Math.abs(value))}`;
};

const signedPct = (value?: number) => {
  if (value === undefined || !Number.isFinite(value) || Math.abs(value) < 0.005) return '0,00 %';
  return `${value > 0 ? '+' : '-'}${pctFormatter.format(Math.abs(value))} %`;
};

const monthIndexes: Record<string, number> = {
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

const toMonthKey = (month: string) => {
  if (/^\d{4}-\d{2}$/.test(month)) return month;
  const parts = month.trim().split(/\s+/);
  if (parts.length < 2) return '';
  const index = monthIndexes[parts[0].toLowerCase().replace('.', '')];
  const year = Number(parts[parts.length - 1]);
  if (!index || !Number.isFinite(year)) return '';
  return `${year}-${String(index).padStart(2, '0')}`;
};

const monthEndIso = (month: string) => {
  const key = toMonthKey(month);
  if (!key) return month;
  const [year, monthNumber] = key.split('-').map(Number);
  return new Date(year, monthNumber, 0).toISOString().slice(0, 10);
};

const formatDate = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : shortDate.format(date).replace('.', '');
};

const formatMonth = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : monthLong.format(date);
};

const getPeriodStart = (period: StoryPeriod, report: ReportData) => {
  if (period === 'all') return '';
  const keys = report.monthlyStats
    .filter((month) => month.hasData)
    .map((month) => toMonthKey(month.month))
    .filter(Boolean)
    .sort();
  if (!keys.length) return '';
  const count = period === '3m' ? 3 : period === '6m' ? 6 : 12;
  return keys[Math.max(0, keys.length - count)];
};

const inPeriod = (periodStart: string, isoOrMonthKey: string) => !periodStart || isoOrMonthKey.slice(0, 7) >= periodStart;

const createChapters = (report: ReportData, period: StoryPeriod): StoryChapter[] => {
  const periodStart = getPeriodStart(period, report);
  const chapters: StoryChapter[] = [];
  const movements = [...(report.movements ?? [])].sort((a, b) => a.iso.localeCompare(b.iso));
  const firstMovement = movements[0];

  if (firstMovement && inPeriod(periodStart, firstMovement.iso)) {
    const firstValue = firstMovement.type === 'increment' ? firstMovement.amount : Math.max(0, firstMovement.balance ?? 0);
    chapters.push({
      id: `start-${firstMovement.iso}`,
      type: 'start',
      iso: firstMovement.iso,
      eyebrow: 'Punto de partida',
      title: 'La cartera empieza aqui',
      explanation: `El primer capital registrado crea la base de la inversion. A partir de aqui se separan claramente aportaciones, retiradas y rendimiento.`,
      amount: firstValue,
      beforeValue: 0,
      afterValue: firstValue
    });
  }

  movements.forEach((movement, index) => {
    if (!inPeriod(periodStart, movement.iso)) return;
    if (index === 0 && movement.type === 'increment') return;
    const isDeposit = movement.type === 'increment';
    const afterValue = movement.balance ?? 0;
    const beforeValue = isDeposit ? afterValue - movement.amount : afterValue + movement.amount;
    chapters.push({
      id: `movement-${movement.iso}-${index}`,
      type: isDeposit ? 'deposit' : 'withdrawal',
      iso: movement.iso,
      eyebrow: isDeposit ? 'Aportacion' : 'Retirada',
      title: isDeposit ? 'Entra capital nuevo' : 'Sale capital de la cartera',
      explanation: isDeposit
        ? 'Este movimiento aumenta el dinero invertido, pero no se presenta como beneficio. Es capital nuevo incorporado a la cartera.'
        : 'Esta salida reduce el capital invertido. No es una perdida de mercado: es dinero retirado de la cartera.',
      amount: isDeposit ? movement.amount : -movement.amount,
      beforeValue,
      afterValue,
      pct: beforeValue ? ((isDeposit ? movement.amount : -movement.amount) / beforeValue) * 100 : 0
    });
  });

  report.monthlyStats
    .filter((month) => month.hasData)
    .forEach((month) => {
      const key = toMonthKey(month.month);
      if (!key || !inPeriod(periodStart, key)) return;
      const profit = month.profit ?? 0;
      if (Math.abs(profit) < 0.01) return;
      const afterValue = month.endBalance ?? 0;
      chapters.push({
        id: `month-${month.month}`,
        type: profit >= 0 ? 'profit' : 'loss',
        iso: monthEndIso(month.month),
        eyebrow: profit >= 0 ? 'Resultado mensual' : 'Mes negativo',
        title: profit >= 0 ? 'La inversion genera beneficio' : 'La cartera baja de valor',
        explanation: profit >= 0
          ? `Durante ${formatMonth(monthEndIso(month.month))}, la cartera genera resultado positivo. Este importe si es rendimiento de la inversion.`
          : `Durante ${formatMonth(monthEndIso(month.month))}, el valor baja. Se muestra separado de las retiradas para entender que es rendimiento de mercado.`,
        amount: profit,
        beforeValue: afterValue - profit,
        afterValue,
        pct: month.profitPct ?? 0
      });
    });

  const monthsWithData = report.monthlyStats.filter((month) => month.hasData);
  const latest = monthsWithData[monthsWithData.length - 1];
  if (latest && inPeriod(periodStart, toMonthKey(latest.month))) {
    chapters.push({
      id: 'current-value',
      type: 'current',
      iso: monthEndIso(latest.month),
      eyebrow: 'Valor actual',
      title: 'Asi queda la cartera hoy',
      explanation: 'Despues de sumar aportaciones, restar retiradas y aplicar el resultado acumulado, este es el valor actual de la cartera.',
      amount: report.saldo,
      beforeValue: Math.max(0, report.saldo - report.beneficioUltimoMes),
      afterValue: report.saldo,
      pct: report.rentabilidadUltimoMes
    });
  }

  return chapters
    .sort((a, b) => a.iso.localeCompare(b.iso) || a.id.localeCompare(b.id))
    .slice(-14);
};


const eventLabel = (type: StoryType) => {
  if (type === 'start') return 'Inicio';
  if (type === 'deposit') return 'Aportacion';
  if (type === 'withdrawal') return 'Retirada';
  if (type === 'profit') return 'Beneficio';
  if (type === 'loss') return 'Perdida';
  return 'Valor actual';
};

const toneClass = (type: StoryType) => {
  if (type === 'profit') return 'is-positive';
  if (type === 'loss' || type === 'withdrawal') return 'is-negative';
  if (type === 'current') return 'is-current';
  return 'is-capital';
};

export const PortfolioStoryExperience: React.FC<PortfolioStoryExperienceProps> = ({ report }) => {
  const [period, setPeriod] = useState<StoryPeriod>('12m');
  const [activeIndex, setActiveIndex] = useState(0);
  const [playback, setPlayback] = useState<Playback>('playing');

  const chapters = useMemo(() => createChapters(report, period), [period, report]);
  const activeChapter = chapters[Math.min(activeIndex, Math.max(0, chapters.length - 1))];
  const progress = chapters.length <= 1 ? 100 : (Math.min(activeIndex, chapters.length - 1) / (chapters.length - 1)) * 100;
  const maxValue = Math.max(1, ...chapters.map((chapter) => Math.max(chapter.beforeValue, chapter.afterValue, Math.abs(chapter.amount))));
  const beforeBar = activeChapter ? `${Math.max(8, Math.min(100, (Math.max(0, activeChapter.beforeValue) / maxValue) * 100))}%` : '8%';
  const afterBar = activeChapter ? `${Math.max(8, Math.min(100, (Math.max(0, activeChapter.afterValue) / maxValue) * 100))}%` : '8%';
  const movementBar = activeChapter ? `${Math.max(8, Math.min(100, (Math.abs(activeChapter.amount) / maxValue) * 100))}%` : '8%';

  useEffect(() => {
    setActiveIndex(0);
    setPlayback('playing');
  }, [chapters.length, period]);

  useEffect(() => {
    if (playback !== 'playing' || chapters.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => {
        if (current >= chapters.length - 1) {
          window.clearInterval(timer);
          setPlayback('finished');
          return current;
        }
        return current + 1;
      });
    }, 5200);
    return () => window.clearInterval(timer);
  }, [chapters.length, playback]);

  if (!activeChapter) {
    return (
      <section className="portfolio-story">
        <div className="portfolio-story-empty">Todavia no hay suficiente actividad para mostrar esta historia.</div>
      </section>
    );
  }

  const goTo = (index: number) => {
    setPlayback('paused');
    setActiveIndex(Math.max(0, Math.min(chapters.length - 1, index)));
  };

  const togglePlayback = () => {
    if (playback === 'playing') {
      setPlayback('paused');
      return;
    }
    if (playback === 'finished') setActiveIndex(0);
    setPlayback('playing');
  };

  return (
    <section className={`portfolio-story ${toneClass(activeChapter.type)}`} aria-label="Tu inversion paso a paso">
      <div className="portfolio-story-header">
        <div>
          <span>Modo explicacion</span>
          <h4>Tu inversion, paso a paso</h4>
          <p>Una lectura automatica de la cartera para entender que entro, que salio, que genero beneficio y como se llega al saldo actual.</p>
        </div>
        <div className="portfolio-story-toolbar">
          <label>
            Periodo
            <select value={period} onChange={(event) => setPeriod(event.target.value as StoryPeriod)}>
              <option value="3m">3 meses</option>
              <option value="6m">6 meses</option>
              <option value="12m">1 ano</option>
              <option value="all">Todo</option>
            </select>
          </label>
          <button type="button" onClick={togglePlayback}>{playback === 'playing' ? 'Pausar' : 'Reproducir'}</button>
        </div>
      </div>

      <div className="portfolio-story-film" key={activeChapter.id}>
        <div className="portfolio-story-stage">
          <div className="portfolio-story-progress"><span style={{ width: `${progress}%` }} /></div>
          <div className="portfolio-story-chapter-meta">
            <span>{activeChapter.eyebrow}</span>
            <b>Capitulo {activeIndex + 1} de {chapters.length}</b>
          </div>
          <div className="portfolio-story-main-copy">
            <time>{formatDate(activeChapter.iso)} · {formatMonth(activeChapter.iso)}</time>
            <h5>{activeChapter.title}</h5>
            <strong className={activeChapter.amount >= 0 ? 'positive' : 'negative'}>{signedCurrency(activeChapter.amount)}</strong>
            <p>{activeChapter.explanation}</p>
          </div>
          <div className="portfolio-story-flow" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>

        <div className="portfolio-story-impact">
          <div className="portfolio-story-impact-card before">
            <small>Antes</small>
            <strong>{formatCurrency(activeChapter.beforeValue)}</strong>
            <i style={{ height: beforeBar }} />
          </div>
          <div className="portfolio-story-impact-card movement">
            <small>Movimiento</small>
            <strong className={activeChapter.amount >= 0 ? 'positive' : 'negative'}>{signedCurrency(activeChapter.amount)}</strong>
            <em>{activeChapter.pct !== undefined ? signedPct(activeChapter.pct) : 'Impacto inicial'}</em>
            <i style={{ height: movementBar }} />
          </div>
          <div className="portfolio-story-impact-card after">
            <small>Despues</small>
            <strong>{formatCurrency(activeChapter.afterValue)}</strong>
            <i style={{ height: afterBar }} />
          </div>
        </div>
      </div>

      <div className="portfolio-story-controls">
        <button type="button" onClick={() => goTo(activeIndex - 1)} disabled={activeIndex === 0}>Anterior</button>
        <input
          type="range"
          min="0"
          max={chapters.length - 1}
          value={activeIndex}
          onChange={(event) => goTo(Number(event.target.value))}
          aria-label="Recorrer la historia de la cartera"
        />
        <button type="button" onClick={() => goTo(activeIndex + 1)} disabled={activeIndex >= chapters.length - 1}>Siguiente</button>
        <button type="button" onClick={() => { setActiveIndex(0); setPlayback('playing'); }}>Reiniciar</button>
      </div>

      <div className="portfolio-story-timeline">
        {chapters.map((chapter, index) => (
          <button
            key={chapter.id}
            type="button"
            className={`${toneClass(chapter.type)} ${index === activeIndex ? 'active' : ''}`}
            onClick={() => goTo(index)}
          >
            <span>{eventLabel(chapter.type)}</span>
            <b>{formatDate(chapter.iso)}</b>
          </button>
        ))}
      </div>
    </section>
  );
};
