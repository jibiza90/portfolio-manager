import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import {
  AionCapitalJourneyScene,
  type AionJourneyMode,
  type AionJourneyNode,
  type AionJourneyView
} from './AionCapitalJourneyScene';
import './AionJourneyReportPage.css';

interface PendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface AionJourneyReportPageProps {
  report: ReportData;
  pendingCashMovements?: PendingMovement[];
  rootRef?: React.RefObject<HTMLDivElement>;
  onDownload?: () => void | Promise<void>;
  onAnalyticsEvent?: (event: {
    type: string;
    label: string;
    durationMs?: number;
    metadata?: Record<string, string | number | boolean>;
  }) => void;
}

interface AionMonth extends AionJourneyNode {
  closeDate: string;
  opening: number;
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
}

type SoundCue = 'enable' | 'step' | 'gain' | 'contribution' | 'withdrawal' | 'finish';

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
  if (key.startsWith('pending-')) return short ? 'Ahora' : 'Actualización de capital';
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  const label = new Date(year, month - 1, 1).toLocaleDateString('es-ES', {
    month: short ? 'short' : 'long',
    year: short ? '2-digit' : 'numeric'
  }).replace('.', '').replace(' de ', ' ');
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
};

const closeDateForMonth = (key: string) => {
  if (key.startsWith('pending-')) return 'Posterior al último cierre publicado';
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  return new Date(year, month, 0).toLocaleDateString('es-ES');
};

const dateLabel = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString('es-ES');
};

const sumType = (rows: Array<{ type: string; amount: number }>, type: 'increment' | 'decrement') =>
  rows.filter((row) => row.type === type).reduce((sum, row) => sum + Number(row.amount || 0), 0);

const signedMoney = (value: number) => {
  if (Math.abs(value) < 0.005) return formatCurrency(0);
  return `${value > 0 ? '+' : '−'}${formatCurrency(Math.abs(value))}`;
};

const signedPercent = (value: number) => {
  if (Math.abs(value) < 0.005) return '0,00 %';
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} %`;
};

const percentageFromBreakdown = (value: number | undefined) => {
  const normalized = Number(value || 0);
  return Math.abs(normalized) <= 1 ? normalized * 100 : normalized;
};

const Icon: React.FC<{ name: 'play' | 'pause' | 'previous' | 'next' | 'sound' | 'mute' | 'expand' | 'close' | 'download' | 'reset' }> = ({ name }) => {
  const paths: Record<string, React.ReactNode> = {
    play: <path d="M8 5v14l11-7z" />,
    pause: <><path d="M7 5h4v14H7z" /><path d="M14 5h4v14h-4z" /></>,
    previous: <><path d="M7 5v14" /><path d="m17 5-7 7 7 7" /></>,
    next: <><path d="M17 5v14" /><path d="m7 5 7 7-7 7" /></>,
    sound: <><path d="M5 10v4h4l5 4V6l-5 4z" /><path d="M17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" /></>,
    mute: <><path d="M5 10v4h4l5 4V6l-5 4z" /><path d="m17 9 5 6M22 9l-5 6" /></>,
    expand: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /><path d="M3 8l6-6M21 8l-6-6M3 16l6 6M21 16l-6 6" /></>,
    close: <path d="m5 5 14 14M19 5 5 19" />,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5M5 21h14" /></>,
    reset: <><path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68" /><path d="M4 4v4.68h4.68" /></>
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
};

const storyText = (month: AionMonth) => {
  if (month.isPending) {
    return 'Estos movimientos ya forman parte de tu posición, pero su rentabilidad se incorporará cuando se publique el próximo cierre.';
  }
  if (month.increments > 0 && month.decrements > 0) {
    return `Durante el mes se incorporaron ${formatCurrency(month.increments)} y se retiraron ${formatCurrency(month.decrements)}. El cierre separa ambos movimientos del resultado de inversión.`;
  }
  if (month.increments > 0) {
    return `Se incorporaron ${formatCurrency(month.increments)} durante el mes. La aportación empieza a generar resultado desde su fecha de entrada.`;
  }
  if (month.decrements > 0) {
    return `Se retiraron ${formatCurrency(month.decrements)} durante el mes. Ese capital permaneció invertido y generó resultado hasta su fecha de salida.`;
  }
  if (month.profit > 0) {
    return `La cartera avanzó ${formatCurrency(month.profit)} durante el mes, sin que las aportaciones o retiradas alteren la lectura de su rentabilidad.`;
  }
  if (month.profit < 0) {
    return `La cartera cerró el mes con una variación de ${signedMoney(month.profit)}. La trayectoria completa permite situar este periodo dentro del histórico.`;
  }
  return 'La posición se mantuvo estable durante este periodo.';
};

export const AionJourneyReportPage: React.FC<AionJourneyReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onDownload,
  onAnalyticsEvent
}) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const previousIndexRef = useRef(0);
  const storyStartedAtRef = useRef(Date.now());
  const [mode, setMode] = useState<AionJourneyMode>('story');
  const [view, setView] = useState<AionJourneyView>('wealth');
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [cinema, setCinema] = useState(false);
  const [introVisible, setIntroVisible] = useState(true);

  const pending = useMemo(() => pendingCashMovements
    .filter((movement) => Number.isFinite(movement.amount) && movement.amount > 0)
    .sort((left, right) => left.iso.localeCompare(right.iso)), [pendingCashMovements]);
  const pendingIncrements = sumType(pending, 'increment');
  const pendingDecrements = sumType(pending, 'decrement');
  const pendingNet = pendingIncrements - pendingDecrements;

  const months = useMemo<AionMonth[]>(() => {
    const balanceByMonth = new Map(report.patrimonioEvolution
      .filter((row) => row.hasData && Number.isFinite(row.balance))
      .map((row) => [monthToKey(row.month), Number(row.balance)]));
    const breakdownByMonth = new Map((report.contributionBreakdowns ?? [])
      .map((row) => [monthToKey(row.month), row]));
    const rows = report.monthlyStats
      .filter((row) => row.hasData)
      .map((row) => ({ ...row, key: monthToKey(row.month) }))
      .sort((left, right) => left.key.localeCompare(right.key));
    let runningProfit = 0;

    const published = rows.map((row, index) => {
      runningProfit += Number(row.profit || 0);
      const movements = report.movements.filter((movement) => movement.iso.slice(0, 7) === row.key);
      const increments = sumType(movements, 'increment');
      const decrements = sumType(movements, 'decrement');
      const balance = balanceByMonth.get(row.key) ?? Number(row.endBalance || 0);
      const previousBalance = index > 0
        ? balanceByMonth.get(rows[index - 1].key) ?? Number(rows[index - 1].endBalance || 0)
        : undefined;
      const netCapitalFromMovements = report.movements
        .filter((movement) => movement.iso.slice(0, 7) <= row.key)
        .reduce((sum, movement) => sum + (movement.type === 'increment' ? Number(movement.amount || 0) : movement.type === 'decrement' ? -Number(movement.amount || 0) : 0), 0);
      const breakdown = breakdownByMonth.get(row.key);
      const fallbackCapital = Math.max(0, balance - runningProfit);
      return {
        key: row.key,
        label: monthLabel(row.key),
        shortLabel: monthLabel(row.key, true),
        closeDate: closeDateForMonth(row.key),
        opening: breakdown?.openingCapital ?? breakdown?.initialCapital ?? previousBalance ?? balance - increments + decrements - Number(row.profit || 0),
        balance,
        netCapital: netCapitalFromMovements > 0 ? netCapitalFromMovements : fallbackCapital,
        profit: Number(row.profit || 0),
        returnPct: index === rows.length - 1 ? Number(report.rentabilidadUltimoMes || 0) : Number(row.profitPct || 0),
        increments,
        decrements,
        breakdown
      };
    });

    if (!pending.length) return published;
    return [...published, {
      key: `pending-${pending[pending.length - 1].iso}`,
      label: 'Actualización de capital',
      shortLabel: 'Ahora',
      closeDate: 'Posterior al último cierre publicado',
      opening: Number(report.saldo || 0),
      balance: Number(report.saldo || 0) + pendingNet,
      netCapital: Number(report.incrementos || 0) - Number(report.decrementos || 0) + pendingNet,
      profit: 0,
      returnPct: 0,
      increments: pendingIncrements,
      decrements: pendingDecrements,
      isPending: true
    }];
  }, [pending, pendingDecrements, pendingIncrements, pendingNet, report]);

  const latestPublishedIndex = useMemo(() => {
    const index = months.reduce((latest, month, monthIndex) => month.isPending ? latest : monthIndex, -1);
    return index >= 0 ? index : Math.max(0, months.length - 1);
  }, [months]);
  const active = months[activeIndex] ?? months[0];
  const visibleBalance = Number(report.saldo || 0) + pendingNet;
  const totalTwr = Number(report.twrYtd || 0) * 100;
  const periodStart = months[0]?.label ?? 'Inicio';
  const periodEnd = months[latestPublishedIndex]?.label ?? 'Actual';
  const storyProgress = months.length > 1 ? activeIndex / (months.length - 1) : 1;

  const playCue = useCallback((cue: SoundCue, force = false) => {
    if (!soundEnabled && !force) return;
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const context = audioContextRef.current ?? new AudioContextClass();
    audioContextRef.current = context;
    if (context.state === 'suspended') void context.resume();
    const now = context.currentTime;
    const profiles: Record<SoundCue, Array<[number, number, number]>> = {
      enable: [[440, 0, 0.12], [660, 0.1, 0.18]],
      step: [[330, 0, 0.1], [440, 0.07, 0.12]],
      gain: [[392, 0, 0.13], [523.25, 0.09, 0.18]],
      contribution: [[293.66, 0, 0.13], [440, 0.08, 0.16], [587.33, 0.16, 0.2]],
      withdrawal: [[523.25, 0, 0.12], [349.23, 0.1, 0.2]],
      finish: [[392, 0, 0.15], [523.25, 0.11, 0.18], [659.25, 0.22, 0.28]]
    };
    profiles[cue].forEach(([frequency, offset, duration], index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index % 2 ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(cue === 'enable' ? 0.035 : 0.025, now + offset + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + duration + 0.03);
    });
  }, [soundEnabled]);

  const selectMonth = useCallback((index: number, source: string) => {
    const nextIndex = Math.max(0, Math.min(index, months.length - 1));
    setActiveIndex(nextIndex);
    if (source !== 'story') setPlaying(false);
    onAnalyticsEvent?.({
      type: 'report_aion_month_select',
      label: months[nextIndex]?.label ?? 'Mes',
      metadata: { source, index: nextIndex }
    });
  }, [months, onAnalyticsEvent]);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setMode('story');
    setActiveIndex(0);
    setPlaying(false);
    setIntroVisible(true);
    storyStartedAtRef.current = Date.now();
    const introTimer = window.setTimeout(() => setIntroVisible(false), reduceMotion ? 300 : 1650);
    const playTimer = reduceMotion ? undefined : window.setTimeout(() => setPlaying(true), 1800);
    return () => {
      window.clearTimeout(introTimer);
      if (playTimer) window.clearTimeout(playTimer);
    };
  }, [report.clientId, report.createdAt]);

  useEffect(() => {
    if (!playing || mode !== 'story' || months.length < 2) return undefined;
    const timer = window.setTimeout(() => {
      setActiveIndex((current) => {
        if (current >= months.length - 1) {
          setPlaying(false);
          playCue('finish');
          onAnalyticsEvent?.({
            type: 'report_aion_story_complete',
            label: 'AION historia completa',
            durationMs: Date.now() - storyStartedAtRef.current
          });
          return current;
        }
        return current + 1;
      });
    }, activeIndex === 0 ? 3900 : 4300);
    return () => window.clearTimeout(timer);
  }, [activeIndex, mode, months.length, onAnalyticsEvent, playCue, playing]);

  useEffect(() => {
    if (previousIndexRef.current === activeIndex) return;
    const month = months[activeIndex];
    if (month) {
      if (month.increments > 0) playCue('contribution');
      else if (month.decrements > 0) playCue('withdrawal');
      else if (month.profit > 0) playCue('gain');
      else playCue('step');
    }
    previousIndexRef.current = activeIndex;
  }, [activeIndex, months, playCue]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && cinema) setCinema(false);
      if (!cinema) return;
      if (event.key === 'ArrowLeft') selectMonth(activeIndex - 1, 'teclado');
      if (event.key === 'ArrowRight') selectMonth(activeIndex + 1, 'teclado');
      if (event.key === ' ') {
        event.preventDefault();
        setPlaying((current) => !current);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeIndex, cinema, selectMonth]);

  useEffect(() => {
    if (!cinema) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [cinema]);

  useEffect(() => () => {
    void audioContextRef.current?.close();
  }, []);

  const changeMode = (nextMode: AionJourneyMode) => {
    setMode(nextMode);
    setPlaying(false);
    if (nextMode === 'overview') setActiveIndex(months.length - 1);
    if (nextMode === 'story') {
      setActiveIndex(0);
      setPlaying(true);
      storyStartedAtRef.current = Date.now();
    }
    onAnalyticsEvent?.({ type: 'report_aion_mode_change', label: nextMode });
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) window.setTimeout(() => playCue('enable', true), 0);
    onAnalyticsEvent?.({ type: 'report_aion_sound', label: next ? 'Activado' : 'Desactivado' });
  };

  const toggleCinema = () => {
    setCinema((current) => !current);
    onAnalyticsEvent?.({ type: 'report_aion_cinema', label: cinema ? 'Cerrar' : 'Abrir' });
  };

  if (!active || months.length === 0) {
    return <div className="aion-empty">No hay cierres publicados para construir el recorrido.</div>;
  }

  const contributionRows = active.breakdown?.contributions ?? [];
  const withdrawalRows = active.breakdown?.withdrawals ?? [];
  const hasDetailedBreakdown = Boolean(active.breakdown && (contributionRows.length || withdrawalRows.length));

  return (
    <div
      ref={rootRef}
      className={`aion-root${cinema ? ' is-cinema' : ''}${introVisible ? ' is-intro' : ''}`}
      style={{ '--aion-month-count': months.length } as React.CSSProperties}
    >
      <header className="aion-header">
        <div className="aion-brand" aria-label="AION Capital Journey">
          <span className="aion-brand-mark"><i /><i /><i /></span>
          <span><strong>AION</strong><small>Capital Journey</small></span>
        </div>
        <div className="aion-period-signature">
          <span>Experiencia patrimonial</span>
          <strong>{periodStart} — {periodEnd}</strong>
        </div>
        <div className="aion-header-actions">
          <button type="button" className={soundEnabled ? 'is-active' : ''} onClick={toggleSound} aria-label={soundEnabled ? 'Desactivar sonido' : 'Activar sonido'} aria-pressed={soundEnabled}>
            <Icon name={soundEnabled ? 'sound' : 'mute'} /><span>{soundEnabled ? 'Sonido' : 'Sin sonido'}</span>
          </button>
          <button type="button" onClick={() => void onDownload?.()} aria-label="Descargar informe"><Icon name="download" /><span>PDF</span></button>
          <button type="button" onClick={toggleCinema} aria-label={cinema ? 'Salir de pantalla completa' : 'Abrir a pantalla completa'}><Icon name={cinema ? 'close' : 'expand'} /><span>{cinema ? 'Salir' : 'Ampliar'}</span></button>
        </div>
      </header>

      <nav className="aion-mode-switch" aria-label="Modo de visualización">
        {([
          ['overview', 'Panorámica', 'Toda la trayectoria'],
          ['story', 'Historia', 'Recorrido guiado'],
          ['explore', 'Explorar', 'Control libre']
        ] as Array<[AionJourneyMode, string, string]>).map(([value, label, subtitle]) => (
          <button key={value} type="button" className={mode === value ? 'is-active' : ''} aria-pressed={mode === value} onClick={() => changeMode(value)}>
            <span>{label}</span><small>{subtitle}</small>
          </button>
        ))}
      </nav>

      <main className="aion-experience">
        <section className="aion-stage" aria-label="Historia interactiva de la inversión">
          <div className="aion-stage-aura" aria-hidden="true"><i /><i /><i /></div>
          <div className="aion-stage-heading">
            <div>
              <span>Posición {String(activeIndex + 1).padStart(2, '0')} / {String(months.length).padStart(2, '0')}</span>
              <strong>{active.isPending ? active.label : active.closeDate}</strong>
            </div>
            <div className="aion-view-switch" aria-label="Capa visual">
              {([
                ['wealth', 'Patrimonio'],
                ['capital', 'Capital'],
                ['flows', 'Movimientos']
              ] as Array<[AionJourneyView, string]>).map(([value, label]) => (
                <button key={value} type="button" className={view === value ? 'is-active' : ''} aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>
              ))}
            </div>
          </div>

          <div className="aion-scene-frame">
            <AionCapitalJourneyScene
              nodes={months}
              activeIndex={activeIndex}
              mode={mode}
              view={view}
              onSelect={(index) => selectMonth(index, 'escena')}
            />
            <div className="aion-current-value" aria-live="polite">
              <span>{active.isPending ? 'Posición visible' : 'Valor de cartera'}</span>
              <strong>{formatCurrency(active.balance)}</strong>
              <small>{active.label}</small>
            </div>
            <aside className="aion-narrator" aria-live="polite">
              <span className="aion-narrator-kicker">{active.isPending ? 'Capital actualizado' : 'Lectura del periodo'}</span>
              <h1>{active.label}</h1>
              <p>{storyText(active)}</p>
              <div className="aion-narrator-metrics">
                <div><span>Beneficio</span><strong className={active.profit < 0 ? 'is-negative' : active.profit > 0 ? 'is-positive' : ''}>{signedMoney(active.profit)}</strong></div>
                <div><span>Rentabilidad</span><strong className={active.returnPct < 0 ? 'is-negative' : active.returnPct > 0 ? 'is-positive' : ''}>{active.isPending ? 'Pendiente de cierre' : signedPercent(active.returnPct)}</strong></div>
              </div>
              {(active.increments > 0 || active.decrements > 0) ? (
                <div className="aion-narrator-flows">
                  {active.increments > 0 ? <span><i className="is-in" />Aportación {formatCurrency(active.increments)}</span> : null}
                  {active.decrements > 0 ? <span><i className="is-out" />Retirada {formatCurrency(active.decrements)}</span> : null}
                </div>
              ) : null}
            </aside>
            <div className="aion-visual-key" aria-label="Leyenda visual">
              <span><i className="is-wealth" />Valor de cartera</span>
              <span><i className="is-capital" />Capital neto</span>
              <span><i className="is-flow" />Movimientos</span>
            </div>
          </div>

          <div className="aion-story-dock">
            <div className="aion-story-controls">
              <button type="button" onClick={() => selectMonth(activeIndex - 1, 'control')} disabled={activeIndex <= 0} aria-label="Periodo anterior"><Icon name="previous" /></button>
              <button
                type="button"
                className="is-primary"
                onClick={() => {
                  if (activeIndex >= months.length - 1) setActiveIndex(0);
                  setMode('story');
                  setPlaying((current) => !current || activeIndex >= months.length - 1);
                }}
                aria-label={playing ? 'Pausar historia' : 'Reproducir historia'}
              >
                <Icon name={playing ? 'pause' : 'play'} />
              </button>
              <button type="button" onClick={() => selectMonth(activeIndex + 1, 'control')} disabled={activeIndex >= months.length - 1} aria-label="Periodo siguiente"><Icon name="next" /></button>
              <button type="button" onClick={() => { setActiveIndex(0); setMode('story'); setPlaying(true); }} aria-label="Reiniciar historia"><Icon name="reset" /></button>
            </div>
            <div className="aion-scrubber">
              <div className="aion-scrubber-progress"><i style={{ width: `${storyProgress * 100}%` }} /></div>
              <input
                type="range"
                min="0"
                max={Math.max(0, months.length - 1)}
                step="1"
                value={activeIndex}
                onChange={(event) => selectMonth(Number(event.target.value), 'selector temporal')}
                aria-label="Viajar por la línea temporal"
              />
              <div className="aion-scrubber-labels">
                {months.map((month, index) => (
                  <button key={month.key} type="button" className={index === activeIndex ? 'is-active' : ''} onClick={() => selectMonth(index, 'mes')}>
                    <i />
                    <span>{month.shortLabel}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="aion-story-state">
              <span>{playing ? 'Historia en curso' : mode === 'explore' ? 'Exploración manual' : 'Historia en pausa'}</span>
              <strong>{Math.round(storyProgress * 100)}%</strong>
            </div>
          </div>
        </section>

        <section className="aion-truth-layer" aria-label="Detalle verificable del periodo">
          <header>
            <div><span>Detalle verificable</span><h2>Qué ocurrió en {active.label.toLowerCase()}</h2></div>
            <p>Cada importe procede del mismo cierre publicado que utiliza el informe del cliente.</p>
          </header>
          <div className="aion-truth-grid">
            <article className="aion-ledger-primary">
              <span>Posición al inicio del mes</span>
              <strong>{formatCurrency(active.opening)}</strong>
              <small>{active.isPending ? 'Último saldo publicado' : `Antes del resultado de ${active.label.toLowerCase()}`}</small>
            </article>
            <article>
              <span>Capital neto acumulado</span>
              <strong>{formatCurrency(active.netCapital)}</strong>
              <small>Aportaciones menos retiradas hasta este punto</small>
            </article>
            <article>
              <span>Valor al cierre</span>
              <strong>{formatCurrency(active.balance)}</strong>
              <small>{active.closeDate}</small>
            </article>
            <article>
              <span>Resultado del mes</span>
              <strong className={active.profit < 0 ? 'is-negative' : active.profit > 0 ? 'is-positive' : ''}>{signedMoney(active.profit)}</strong>
              <small>{active.isPending ? 'Se calculará en el próximo cierre' : signedPercent(active.returnPct)}</small>
            </article>
          </div>

          {hasDetailedBreakdown ? (
            <div className="aion-breakdown">
              <div className="aion-breakdown-intro">
                <span>Composición del resultado</span>
                <strong>{signedMoney(active.breakdown?.totalProfit ?? active.profit)}</strong>
              </div>
              <div className="aion-breakdown-rows">
                <div>
                  <span><i className="is-opening" />Posición inicial del mes</span>
                  <b>{formatCurrency(active.breakdown?.initialCapital ?? active.opening)}</b>
                  <b>{signedPercent(percentageFromBreakdown(active.breakdown?.initialReturnPct))}</b>
                  <strong>{signedMoney(active.breakdown?.initialProfit ?? 0)}</strong>
                </div>
                {contributionRows.map((row) => (
                  <div key={`contribution-${row.iso}-${row.amount}`}>
                    <span><i className="is-in" />Aportación incorporada el {dateLabel(row.iso)}</span>
                    <b>{formatCurrency(row.amount)}</b>
                    <b>{signedPercent(percentageFromBreakdown(row.returnPct))}</b>
                    <strong>{signedMoney(row.profit)}</strong>
                  </div>
                ))}
                {withdrawalRows.map((row) => (
                  <div key={`withdrawal-${row.iso}-${row.amount}`}>
                    <span><i className="is-out" />Capital invertido hasta su retirada el {dateLabel(row.iso)}</span>
                    <b>{formatCurrency(row.amount)}</b>
                    <b>{row.returnPct === undefined ? '—' : signedPercent(percentageFromBreakdown(row.returnPct))}</b>
                    <strong>{signedMoney(row.profit)}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="aion-breakdown aion-breakdown-simple">
              <div><span>Capital al inicio</span><strong>{formatCurrency(active.opening)}</strong></div>
              <i />
              <div><span>Resultado generado</span><strong>{signedMoney(active.profit)}</strong></div>
              <i />
              <div><span>Valor al cierre</span><strong>{formatCurrency(active.balance)}</strong></div>
            </div>
          )}
        </section>

        <section className="aion-period-ledger" aria-label="Resumen completo de la trayectoria">
          <div className="aion-period-title">
            <span>Tu posición, en una lectura</span>
            <h2>Desde el capital aportado hasta el valor actual.</h2>
          </div>
          <div className="aion-period-equation">
            <div><span>Capital aportado</span><strong>{formatCurrency(Number(report.incrementos || 0) + pendingIncrements)}</strong></div>
            <i>−</i>
            <div><span>Capital retirado</span><strong>{formatCurrency(Number(report.decrementos || 0) + pendingDecrements)}</strong></div>
            <i>+</i>
            <div><span>Beneficio acumulado</span><strong className={report.beneficioTotal >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(Number(report.beneficioTotal || 0))}</strong></div>
            <i>=</i>
            <div className="is-result"><span>Valor actual</span><strong>{formatCurrency(visibleBalance)}</strong></div>
          </div>
          <div className="aion-period-method">
            <div><span>TWR acumulado</span><strong>{signedPercent(totalTwr)}</strong><small>{periodStart} — {periodEnd}</small></div>
            <div><span>Rentabilidad total</span><strong>{signedPercent(Number(report.rentabilidad || 0))}</strong><small>Sobre capital neto aportado</small></div>
          </div>
        </section>
      </main>

      <footer className="aion-footer">
        <span>AION · Experiencia patrimonial interactiva</span>
        <strong>{report.clientCode}</strong>
        <span>Datos del último cierre publicado</span>
      </footer>

      {introVisible ? (
        <div className="aion-intro-curtain" aria-hidden="true">
          <div className="aion-intro-orbit"><i /><i /><i /></div>
          <span>Reconstruyendo tu trayectoria</span>
          <strong>{formatCurrency(visibleBalance)}</strong>
        </div>
      ) : null}
    </div>
  );
};
