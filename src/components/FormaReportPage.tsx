import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import { FormaPatrimonyScene, type FormaLens, type FormaMonthNode } from './FormaPatrimonyScene';
import './FormaReportPage.css';

interface PendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface FormaReportPageProps {
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

interface FormaMonth extends FormaMonthNode {
  closeDate: string;
  opening: number;
  cumulativeProfit: number;
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
  movements: ReportData['movements'];
}

type FormaMode = 'story' | 'explore' | 'precision';
type SoundCue = 'enable' | 'step' | 'contribution' | 'withdrawal' | 'finish';

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

const normalizedPercent = (value: number | undefined) => {
  const numeric = Number(value || 0);
  return Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
};

const Icon: React.FC<{ name: 'play' | 'pause' | 'previous' | 'next' | 'sound' | 'mute' | 'expand' | 'close' | 'download' | 'reset' | 'precision' }> = ({ name }) => {
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
    reset: <><path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68" /><path d="M4 4v4.68h4.68" /></>,
    precision: <><path d="M4 7h16M4 12h16M4 17h16" /><path d="M8 5v14M16 5v14" /></>
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
};

const narrativeFor = (month: FormaMonth, index: number, count: number) => {
  if (month.isPending) return {
    act: 'Posición actual',
    title: 'El capital ya está incorporado',
    body: 'Estos movimientos forman parte del saldo visible. Su resultado se añadirá cuando se publique el próximo cierre.'
  };
  if (index === 0) return {
    act: 'Origen',
    title: 'Aquí comienza la posición',
    body: `El primer cierre disponible sitúa el patrimonio en ${formatCurrency(month.balance)}.`
  };
  if (month.increments > 0 && month.decrements > 0) return {
    act: 'Movimientos',
    title: 'Capital que entra y capital que sale',
    body: `El mes incorpora ${formatCurrency(month.increments)} y registra una retirada de ${formatCurrency(month.decrements)}. El resultado de inversión permanece separado.`
  };
  if (month.increments > 0) return {
    act: 'Aportación',
    title: 'La estructura gana nuevo capital',
    body: `Se incorporan ${formatCurrency(month.increments)}. La aportación se distingue del beneficio generado por la cartera.`
  };
  if (month.decrements > 0) return {
    act: 'Retirada',
    title: 'Una parte del capital deja la posición',
    body: `Se retiran ${formatCurrency(month.decrements)}. El movimiento se separa de la rentabilidad del periodo.`
  };
  if (index === count - 1) return {
    act: 'Último cierre',
    title: 'La posición publicada más reciente',
    body: `El patrimonio cierra en ${formatCurrency(month.balance)}, con un resultado mensual de ${signedMoney(month.profit)}.`
  };
  return {
    act: month.profit >= 0 ? 'Crecimiento' : 'Variación',
    title: month.profit >= 0 ? 'El resultado eleva el patrimonio' : 'El patrimonio absorbe una corrección',
    body: `${month.label} termina con ${signedMoney(month.profit)} y una rentabilidad de ${signedPercent(month.returnPct)}.`
  };
};

export const FormaReportPage: React.FC<FormaReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onDownload,
  onAnalyticsEvent
}) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const previousIndexRef = useRef(0);
  const timelineRef = useRef<HTMLDivElement>(null);
  const precisionSheetRef = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<FormaMode>('story');
  const [lens, setLens] = useState<FormaLens>('composition');
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [cinema, setCinema] = useState(false);
  const [introVisible, setIntroVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  const pending = useMemo(() => pendingCashMovements
    .filter((movement) => Number.isFinite(movement.amount) && movement.amount > 0)
    .sort((left, right) => left.iso.localeCompare(right.iso)), [pendingCashMovements]);
  const pendingIncrements = sumType(pending, 'increment');
  const pendingDecrements = sumType(pending, 'decrement');
  const pendingNet = pendingIncrements - pendingDecrements;

  const months = useMemo<FormaMonth[]>(() => {
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
      const movementsToDate = report.movements
        .filter((movement) => movement.iso.slice(0, 7) <= row.key);
      const netFromMovements = movementsToDate
        .reduce((sum, movement) => sum + (movement.type === 'increment' ? Number(movement.amount || 0) : movement.type === 'decrement' ? -Number(movement.amount || 0) : 0), 0);
      const fallbackCapital = Math.max(0, balance - runningProfit);
      const netCapital = movementsToDate.length > 0 ? netFromMovements : fallbackCapital;
      const profit = Number(row.profit || 0);
      const breakdown = breakdownByMonth.get(row.key);
      const isLatest = index === rows.length - 1;
      const reportedTotalProfit = Number(report.beneficioTotal);
      const reportedLatestReturn = Number(report.rentabilidadUltimoMes);
      return {
        key: row.key,
        label: monthLabel(row.key),
        shortLabel: monthLabel(row.key, true),
        closeDate: closeDateForMonth(row.key),
        opening: balance - increments + decrements - profit,
        balance,
        netCapital,
        profit,
        cumulativeProfit: isLatest && Number.isFinite(reportedTotalProfit) ? reportedTotalProfit : runningProfit,
        returnPct: isLatest && Number.isFinite(reportedLatestReturn) ? reportedLatestReturn : Number(row.profitPct || 0),
        increments,
        decrements,
        breakdown,
        movements
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
      cumulativeProfit: Number(report.beneficioTotal || 0),
      returnPct: 0,
      increments: pendingIncrements,
      decrements: pendingDecrements,
      movements: pending.map((movement) => ({
        iso: movement.iso,
        type: movement.type,
        amount: movement.amount,
        balance: 0
      })),
      isPending: true
    }];
  }, [pending, pendingDecrements, pendingIncrements, pendingNet, report]);

  const latestPublishedIndex = useMemo(() => months.reduce((latest, month, index) => month.isPending ? latest : index, -1), [months]);
  const active = months[activeIndex] ?? months[0];
  const visibleBalance = Number(report.saldo || 0) + pendingNet;
  const visibleContributed = Number(report.incrementos || 0) + pendingIncrements;
  const visibleWithdrawn = Number(report.decrementos || 0) + pendingDecrements;
  const visibleCapital = Number(report.incrementos || 0) - Number(report.decrementos || 0) + pendingNet;
  const totalTwr = Number(report.twrYtd || 0) * 100;
  const latestPublishedMonth = months[latestPublishedIndex] ?? active;
  const story = active ? narrativeFor(active, activeIndex, months.length) : null;
  const contributionRows = active?.breakdown?.contributions ?? [];
  const withdrawalRows = active?.breakdown?.withdrawals ?? [];
  const breakdownSubtotal = (active?.breakdown?.initialProfit ?? 0)
    + contributionRows.reduce((sum, row) => sum + Number(row.profit || 0), 0)
    + withdrawalRows.reduce((sum, row) => sum + Number(row.profit || 0), 0);
  const reconciliation = active?.breakdown ? Number(active.breakdown.totalProfit || 0) - breakdownSubtotal : 0;

  const playCue = useCallback((cue: SoundCue, force = false) => {
    if (!soundEnabled && !force) return;
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const context = audioContextRef.current ?? new AudioContextClass();
    audioContextRef.current = context;
    if (context.state === 'suspended') void context.resume();
    const profiles: Record<SoundCue, Array<[number, number, number, OscillatorType]>> = {
      enable: [[196, 0, 0.25, 'sine'], [293.66, 0.11, 0.3, 'sine']],
      step: [[220, 0, 0.17, 'sine'], [277.18, 0.06, 0.16, 'triangle']],
      contribution: [[174.61, 0, 0.24, 'sine'], [261.63, 0.1, 0.28, 'triangle'], [349.23, 0.2, 0.32, 'sine']],
      withdrawal: [[293.66, 0, 0.2, 'sine'], [207.65, 0.12, 0.3, 'triangle']],
      finish: [[196, 0, 0.25, 'sine'], [293.66, 0.12, 0.32, 'sine'], [392, 0.26, 0.42, 'triangle']]
    };
    const now = context.currentTime;
    profiles[cue].forEach(([frequency, offset, duration, type]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(cue === 'enable' ? 0.032 : 0.021, now + offset + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + duration + 0.04);
    });
  }, [soundEnabled]);

  const selectMonth = useCallback((index: number, source: string) => {
    const next = Math.max(0, Math.min(index, months.length - 1));
    setActiveIndex(next);
    if (source !== 'story') setPlaying(false);
    onAnalyticsEvent?.({
      type: 'report_forma_month_select',
      label: months[next]?.label ?? 'Mes',
      metadata: { source, index: next }
    });
  }, [months, onAnalyticsEvent]);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const reduced = Boolean(media?.matches);
    setReducedMotion(reduced);
    setActiveIndex(0);
    setMode('story');
    setPlaying(false);
    setIntroVisible(true);
    const introTimer = window.setTimeout(() => setIntroVisible(false), reduced ? 250 : 2400);
    const playTimer = reduced ? undefined : window.setTimeout(() => setPlaying(true), 2650);
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
          return current;
        }
        return current + 1;
      });
    }, activeIndex === 0 ? 3600 : 3900);
    return () => window.clearTimeout(timer);
  }, [activeIndex, mode, months.length, playCue, playing]);

  useEffect(() => {
    if (previousIndexRef.current === activeIndex) return;
    const month = months[activeIndex];
    if (month?.increments) playCue('contribution');
    else if (month?.decrements) playCue('withdrawal');
    else playCue('step');
    previousIndexRef.current = activeIndex;
  }, [activeIndex, months, playCue]);

  useEffect(() => {
    const button = timelineRef.current?.querySelector<HTMLButtonElement>(`button[data-index="${activeIndex}"]`);
    button?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
  }, [activeIndex, reducedMotion]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (mode === 'precision') setMode('explore');
        if (cinema) setCinema(false);
      }
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
  }, [activeIndex, cinema, mode, selectMonth]);

  useEffect(() => {
    if (!cinema) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [cinema]);

  useEffect(() => {
    const sheet = precisionSheetRef.current;
    if (!sheet) return;
    if (mode === 'precision') sheet.removeAttribute('inert');
    else sheet.setAttribute('inert', '');
  }, [mode]);

  useEffect(() => () => { void audioContextRef.current?.close(); }, []);

  const changeMode = (next: FormaMode) => {
    setMode(next);
    setPlaying(false);
    if (next === 'story') {
      setActiveIndex(0);
      setPlaying(!reducedMotion);
    }
    onAnalyticsEvent?.({ type: 'report_forma_mode', label: next });
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) window.setTimeout(() => playCue('enable', true), 0);
    onAnalyticsEvent?.({ type: 'report_forma_sound', label: next ? 'Activado' : 'Desactivado' });
  };

  if (!active || !story || !months.length) return <div className="forma-empty">No hay cierres publicados para construir la experiencia.</div>;

  return (
    <div
      ref={rootRef}
      className={`forma-root${cinema ? ' is-cinema' : ''}${introVisible ? ' is-intro' : ''}${mode === 'precision' ? ' has-precision' : ''}`}
      style={{ '--forma-month-count': months.length } as React.CSSProperties}
    >
      {introVisible ? (
        <div className="forma-intro" aria-label="Introducción AXIS">
          <button type="button" onClick={() => setIntroVisible(false)}>Omitir</button>
          <div className="forma-intro-signature"><i /><i /><i /><i /></div>
          <span>Tu patrimonio, a través del tiempo</span>
          <strong>AXIS</strong>
          <small>{months[0].label} — {months[latestPublishedIndex]?.label ?? active.label}</small>
        </div>
      ) : null}

      <header className="forma-header">
        <div className="forma-brand" aria-label="AXIS Patrimonio en movimiento">
          <span className="forma-brand-mark"><i /><i /><i /></span>
          <span><strong>AXIS</strong><small>Patrimonio en movimiento</small></span>
        </div>
        <nav className="forma-mode-nav" aria-label="Modo de visualización">
          <button type="button" className={mode === 'story' ? 'is-active' : ''} aria-pressed={mode === 'story'} onClick={() => changeMode('story')}><span>Recorrido</span><small>Historia guiada</small></button>
          <button type="button" className={mode === 'explore' ? 'is-active' : ''} aria-pressed={mode === 'explore'} onClick={() => changeMode('explore')}><span>Explorar</span><small>Control manual</small></button>
          <button type="button" className={mode === 'precision' ? 'is-active' : ''} aria-pressed={mode === 'precision'} onClick={() => changeMode('precision')}><span>Precisión</span><small>Cifras exactas</small></button>
        </nav>
        <div className="forma-header-actions">
          <button type="button" className={soundEnabled ? 'is-active' : ''} onClick={toggleSound} aria-label={soundEnabled ? 'Desactivar sonido' : 'Activar sonido'} aria-pressed={soundEnabled}><Icon name={soundEnabled ? 'sound' : 'mute'} /></button>
          <button type="button" onClick={() => void onDownload?.()} aria-label="Descargar informe"><Icon name="download" /></button>
          <button type="button" onClick={() => setCinema((current) => !current)} aria-label={cinema ? 'Salir de pantalla completa' : 'Abrir a pantalla completa'}><Icon name={cinema ? 'close' : 'expand'} /></button>
        </div>
      </header>

      <main className="forma-theatre">
        <section className="forma-position" aria-label="Posición patrimonial actual">
          <div className="forma-position-primary">
            <span>Posición actual</span>
            <strong>{formatCurrency(visibleBalance)}</strong>
            <small>{pending.length ? 'Incluye movimientos posteriores al último cierre publicado' : `Último cierre publicado · ${latestPublishedMonth.closeDate}`}</small>
          </div>
          <div className="forma-position-metrics">
            <article><span>Beneficio acumulado</span><strong className={report.beneficioTotal < 0 ? 'is-negative' : 'is-positive'}>{signedMoney(Number(report.beneficioTotal || 0))}</strong><small>Resultado de la inversión</small></article>
            <article><span>Capital neto</span><strong>{formatCurrency(visibleCapital)}</strong><small>Aportado menos retirado</small></article>
            <article><span>TWR acumulado</span><strong className={totalTwr < 0 ? 'is-negative' : 'is-positive'}>{signedPercent(totalTwr)}</strong><small>Desde {months[0].label}</small></article>
          </div>
        </section>

        <section className="forma-stage" aria-label="Trayectoria interactiva del patrimonio">
          <header className="forma-stage-heading">
            <div>
              <span>Lectura temporal</span>
              <h1>La historia completa, mes a mes</h1>
              <p>La línea superior muestra el patrimonio. La inferior, el capital neto. El espacio entre ambas es el resultado acumulado.</p>
            </div>
            <div className="forma-lenses" aria-label="Capa visual">
              <button type="button" className={lens === 'composition' ? 'is-active' : ''} aria-pressed={lens === 'composition'} onClick={() => setLens('composition')}>Composición</button>
              <button type="button" className={lens === 'trajectory' ? 'is-active' : ''} aria-pressed={lens === 'trajectory'} onClick={() => setLens('trajectory')}>Trayectoria</button>
              <button type="button" className={lens === 'movements' ? 'is-active' : ''} aria-pressed={lens === 'movements'} onClick={() => setLens('movements')}>Movimientos</button>
            </div>
          </header>

          <div className="forma-stage-grid">
            <div className="forma-visual-frame">
              <div className="forma-stage-meta">
                <span><i /> {active.isPending ? 'Posición visible' : `Cierre seleccionado · ${active.closeDate}`}</span>
                <small>{String(activeIndex + 1).padStart(2, '0')} / {String(months.length).padStart(2, '0')}</small>
              </div>
              <FormaPatrimonyScene
                months={months}
                activeIndex={activeIndex}
                lens={lens}
                reducedMotion={reducedMotion}
                onSelect={selectMonth}
              />
              <div className="forma-key" aria-label="Leyenda">
                <span><i className="is-wealth" /> Patrimonio</span>
                <span><i className="is-capital" /> Capital neto</span>
                <span><i className="is-result" /> Resultado acumulado</span>
                <span><i className="is-in" /> Aportación</span>
                <span><i className="is-out" /> Retirada</span>
              </div>
            </div>

            <aside className="forma-narrative" aria-label="Detalle del mes seleccionado">
              <div className="forma-month-selector">
                <label htmlFor="forma-month-select">Mes seleccionado</label>
                <select id="forma-month-select" value={activeIndex} onChange={(event) => selectMonth(Number(event.target.value), 'selector')}>
                  {months.map((month, index) => <option key={month.key} value={index}>{month.label}</option>)}
                </select>
              </div>
              <div className="forma-active-reading" aria-live="polite">
                <span>{story.act} · {active.label}</span>
                <strong>{formatCurrency(active.balance)}</strong>
                <small>{active.isPending ? 'Saldo visible' : 'Patrimonio al cierre'}</small>
              </div>
              <div className="forma-month-facts">
                <div><span>Resultado mensual</span><strong className={active.profit < 0 ? 'is-negative' : 'is-positive'}>{active.isPending ? 'Pendiente' : signedMoney(active.profit)}</strong></div>
                <div><span>Rentabilidad mensual</span><strong className={active.returnPct < 0 ? 'is-negative' : 'is-positive'}>{active.isPending ? '—' : signedPercent(active.returnPct)}</strong></div>
                <div><span>Capital neto</span><strong>{formatCurrency(active.netCapital)}</strong></div>
              </div>
              {(active.increments > 0 || active.decrements > 0) ? (
                <div className="forma-month-movements">
                  {active.increments > 0 ? <span className="is-in"><small>Aportado</small><strong>+{formatCurrency(active.increments)}</strong></span> : null}
                  {active.decrements > 0 ? <span className="is-out"><small>Retirado</small><strong>-{formatCurrency(active.decrements)}</strong></span> : null}
                </div>
              ) : null}
              <div className="forma-month-story"><span>{story.title}</span><p>{story.body}</p></div>
              <div className="forma-month-actions">
                <button type="button" aria-label="Mes anterior" disabled={activeIndex <= 0} onClick={() => selectMonth(activeIndex - 1, 'anterior')}><Icon name="previous" /><span>Anterior</span></button>
                <button type="button" className="is-precision" onClick={() => changeMode('precision')} aria-label="Abrir detalle exacto"><Icon name="precision" /><span>Ver cifras</span></button>
                <button type="button" aria-label="Mes siguiente" disabled={activeIndex >= months.length - 1} onClick={() => selectMonth(activeIndex + 1, 'siguiente')}><span>Siguiente</span><Icon name="next" /></button>
              </div>
            </aside>
          </div>

          <div className="forma-console" aria-label="Control del recorrido">
            <div className="forma-playback">
              <button
                type="button"
                className="is-main"
                aria-label={playing ? 'Pausar recorrido' : 'Reproducir recorrido'}
                aria-pressed={playing}
                onClick={() => {
                  setMode('story');
                  setPlaying((current) => !current);
                }}
              ><Icon name={playing ? 'pause' : 'play'} /><span>{playing ? 'Pausar recorrido' : 'Reproducir historia'}</span></button>
              <button type="button" aria-label="Reiniciar recorrido" onClick={() => { setMode('story'); setActiveIndex(0); setPlaying(!reducedMotion); }}><Icon name="reset" /><span>Reiniciar</span></button>
            </div>
            <div className="forma-timeline" ref={timelineRef} role="list" aria-label="Seleccionar un mes">
              {months.map((month, index) => (
                <button
                  key={month.key}
                  type="button"
                  role="listitem"
                  data-index={index}
                  className={`${index === activeIndex ? 'is-active' : ''}${month.increments ? ' has-in' : ''}${month.decrements ? ' has-out' : ''}${month.isPending ? ' is-pending' : ''}`}
                  aria-label={`${month.label}: ${formatCurrency(month.balance)}`}
                  onClick={() => selectMonth(index, 'timeline')}
                >
                  <span>{month.shortLabel}</span>
                  <strong>{Math.round(month.balance).toLocaleString('es-ES')} €</strong>
                  <small>{month.isPending ? 'Capital actualizado' : signedMoney(month.profit)}</small>
                  <i>{month.increments > 0 ? '+' : ''}{month.decrements > 0 ? '-' : ''}</i>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="forma-current-equation" aria-label="Composición patrimonial actual">
          <div><span>Capital neto</span><strong>{formatCurrency(visibleCapital)}</strong><small>Aportado {formatCurrency(visibleContributed)} · Retirado {formatCurrency(visibleWithdrawn)}</small></div>
          <i>+</i>
          <div><span>Beneficio acumulado</span><strong className={report.beneficioTotal < 0 ? 'is-negative' : 'is-positive'}>{formatCurrency(Number(report.beneficioTotal || 0))}</strong><small>TWR {signedPercent(totalTwr)} desde {months[0].label}</small></div>
          <i>=</i>
          <div className="is-total"><span>Saldo actual</span><strong>{formatCurrency(visibleBalance)}</strong><small>{latestPublishedMonth.label} · Rentabilidad mensual {signedPercent(latestPublishedMonth.returnPct)}{pending.length ? ' · Incluye movimientos posteriores al último cierre' : ''}</small></div>
        </section>

        <footer className="forma-footer">
          <span>Periodo disponible · {months[0].label} — {months[latestPublishedIndex]?.label ?? active.label}</span>
          <span>Actualizado · {new Date(report.createdAt).toLocaleDateString('es-ES')}</span>
          <span>Selecciona cualquier mes para consultar su composición exacta</span>
        </footer>
      </main>

      <div className={`forma-precision-backdrop${mode === 'precision' ? ' is-visible' : ''}`} onClick={() => changeMode('explore')} aria-hidden="true" />
      <aside
        ref={precisionSheetRef}
        className={`forma-precision-sheet${mode === 'precision' ? ' is-open' : ''}`}
        role="dialog"
        aria-modal={mode === 'precision'}
        aria-hidden={mode !== 'precision'}
        aria-label="Detalle exacto del periodo"
      >
        <header>
          <div><span>Precisión · {active.label}</span><h2>{active.isPending ? 'Movimientos posteriores al cierre' : `Cierre del ${active.closeDate}`}</h2></div>
          <button type="button" onClick={() => changeMode('explore')} aria-label="Cerrar detalle"><Icon name="close" /></button>
        </header>

        <section className="forma-precision-equation" aria-label="Conciliación del periodo">
          <div><span>Saldo inicial</span><strong>{formatCurrency(active.opening)}</strong></div>
          <i>+</i>
          <div><span>Aportaciones</span><strong>{formatCurrency(active.increments)}</strong></div>
          <i>−</i>
          <div><span>Retiradas</span><strong>{formatCurrency(active.decrements)}</strong></div>
          <i>+</i>
          <div><span>Resultado</span><strong className={active.profit < 0 ? 'is-negative' : 'is-positive'}>{active.isPending ? 'Pendiente' : signedMoney(active.profit)}</strong></div>
          <i>=</i>
          <div className="is-total"><span>Saldo final</span><strong>{formatCurrency(active.balance)}</strong></div>
        </section>

        <section className="forma-precision-facts">
          <article><span>Rentabilidad mensual</span><strong>{active.isPending ? '—' : signedPercent(active.returnPct)}</strong><small>Rendimiento del periodo aislando movimientos</small></article>
          <article><span>Beneficio acumulado</span><strong>{formatCurrency(active.cumulativeProfit)}</strong><small>Resultado acumulado hasta este punto</small></article>
          <article><span>Capital neto</span><strong>{formatCurrency(active.netCapital)}</strong><small>Capital aportado menos capital retirado</small></article>
          <article><span>TWR acumulado</span><strong>{signedPercent(totalTwr)}</strong><small>Desde el primer cierre disponible</small></article>
        </section>

        {active.breakdown ? (
          <section className="forma-tranches">
            <div className="forma-section-heading"><span>Composición del resultado</span><p>Cada tramo conserva únicamente el rendimiento aplicado mientras estuvo invertido.</p></div>
            <div className="forma-tranche-head"><span>Concepto</span><span>Capital</span><span>Rentabilidad</span><span>Resultado</span></div>
            <div><span>Posición inicial del mes</span><strong>{formatCurrency(active.breakdown.initialCapital)}</strong><strong>{signedPercent(normalizedPercent(active.breakdown.initialReturnPct))}</strong><strong>{signedMoney(active.breakdown.initialProfit)}</strong></div>
            {contributionRows.map((row) => <div key={`forma-in-${row.iso}`}><span>Aportación incorporada el {dateLabel(row.iso)}</span><strong>{formatCurrency(row.amount)}</strong><strong>{signedPercent(normalizedPercent(row.returnPct))}</strong><strong>{signedMoney(row.profit)}</strong></div>)}
            {withdrawalRows.map((row) => <div key={`forma-out-${row.iso}`}><span>Capital invertido hasta su retirada el {dateLabel(row.iso)}</span><strong>{formatCurrency(row.amount)}</strong><strong>{row.returnPct === undefined ? '—' : signedPercent(normalizedPercent(row.returnPct))}</strong><strong>{signedMoney(row.profit)}</strong></div>)}
            {Math.abs(reconciliation) >= 0.005 ? <div className="is-reconciliation"><span>Conciliación del cierre publicado</span><strong>—</strong><strong>—</strong><strong>{signedMoney(reconciliation)}</strong></div> : null}
            <div className="is-total"><span>Resultado mensual publicado</span><strong>—</strong><strong>{signedPercent(active.returnPct)}</strong><strong>{signedMoney(active.breakdown.totalProfit)}</strong></div>
          </section>
        ) : active.movements.length ? (
          <section className="forma-movement-ledger">
            <div className="forma-section-heading"><span>Movimientos del periodo</span><p>{active.isPending ? 'Registrados después del último cierre publicado.' : 'Aportaciones y retiradas registradas durante el mes.'}</p></div>
            {active.movements.map((movement, index) => (
              <div key={`${movement.iso}-${movement.type}-${index}`}><span>{dateLabel(movement.iso)}</span><strong>{movement.type === 'increment' ? 'Aportación' : 'Retirada'}</strong><b className={movement.type === 'increment' ? 'is-positive' : 'is-negative'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</b></div>
            ))}
          </section>
        ) : (
          <section className="forma-linear-period"><span>Periodo sin movimientos de capital</span><p>El cambio entre el saldo inicial y final corresponde al resultado de inversión publicado.</p></section>
        )}

        <section className="forma-method-note">
          <div><span>TWR</span><p>Mide la evolución de la cartera aislando aportaciones y retiradas.</p></div>
          <div><span>Rentabilidad total</span><p>Relaciona el beneficio acumulado con el capital neto aportado.</p></div>
        </section>
      </aside>
    </div>
  );
};
