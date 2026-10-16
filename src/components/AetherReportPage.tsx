import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import { AetherCapitalScene } from './AetherCapitalScene';
import type { AetherSceneNode } from './AetherCapitalScene';
import './AetherReportPage.css';

interface PendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface AetherReportPageProps {
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

interface AetherMonth extends AetherSceneNode {
  shortLabel: string;
  opening: number;
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
}

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
  if (key.startsWith('pending-')) return short ? 'Ahora' : 'Capital posterior al cierre';
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  const label = new Date(year, month - 1, 1).toLocaleDateString('es-ES', {
    month: short ? 'short' : 'long',
    year: short ? '2-digit' : 'numeric'
  }).replace('.', '').replace(' de ', ' ');
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
};

const dateLabel = (iso: string) => {
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
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} %`;
};

const compactMoney = (value: number) => {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 2 })} M €`;
  if (absolute >= 1_000) return `${(value / 1_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} k €`;
  return formatCurrency(value);
};

const tone = (value: number) => value > 0.005 ? 'is-positive' : value < -0.005 ? 'is-negative' : 'is-neutral';

const sumType = (rows: Array<{ type: string; amount: number }>, type: 'increment' | 'decrement') =>
  rows.filter((row) => row.type === type).reduce((sum, row) => sum + Number(row.amount || 0), 0);

export const AetherReportPage: React.FC<AetherReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onDownload,
  onAnalyticsEvent
}) => {
  const startedAt = useRef(Date.now());
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [mode, setMode] = useState<'story' | 'explore'>('story');
  const [cinema, setCinema] = useState(false);
  const [dossierOpen, setDossierOpen] = useState(false);

  const pending = useMemo(() => pendingCashMovements
    .filter((movement) => movement.amount > 0 && Number.isFinite(movement.amount))
    .sort((left, right) => left.iso.localeCompare(right.iso)), [pendingCashMovements]);
  const pendingIncrements = sumType(pending, 'increment');
  const pendingDecrements = sumType(pending, 'decrement');
  const pendingNet = pendingIncrements - pendingDecrements;
  const visibleBalance = Number(report.saldo || 0) + pendingNet;
  const visibleCapital = Number(report.incrementos || 0) + pendingIncrements - Number(report.decrementos || 0) - pendingDecrements;

  const months = useMemo<AetherMonth[]>(() => {
    const balanceByMonth = new Map(report.patrimonioEvolution
      .filter((row) => row.hasData && Number.isFinite(row.balance))
      .map((row) => [monthToKey(row.month), Number(row.balance)]));
    const breakdownByMonth = new Map((report.contributionBreakdowns ?? [])
      .map((row) => [monthToKey(row.month), row]));
    const rows = report.monthlyStats
      .filter((row) => row.hasData)
      .map((row) => ({ ...row, key: monthToKey(row.month) }))
      .sort((left, right) => left.key.localeCompare(right.key));

    const published = rows.map((row, index) => {
      const movements = report.movements.filter((movement) => movement.iso.slice(0, 7) === row.key);
      const increments = sumType(movements, 'increment');
      const decrements = sumType(movements, 'decrement');
      const balance = balanceByMonth.get(row.key) ?? Number(row.endBalance || 0);
      const previousBalance = index > 0
        ? balanceByMonth.get(rows[index - 1].key) ?? Number(rows[index - 1].endBalance || 0)
        : undefined;
      const breakdown = breakdownByMonth.get(row.key);
      return {
        key: row.key,
        label: monthLabel(row.key),
        shortLabel: monthLabel(row.key, true),
        opening: breakdown?.openingCapital ?? breakdown?.initialCapital ?? previousBalance ?? balance - increments + decrements - Number(row.profit || 0),
        balance,
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
      label: 'Capital posterior al cierre',
      shortLabel: 'Ahora',
      opening: Number(report.saldo || 0),
      balance: visibleBalance,
      profit: 0,
      returnPct: 0,
      increments: pendingIncrements,
      decrements: pendingDecrements,
      isPending: true
    }];
  }, [pending, pendingDecrements, pendingIncrements, report, visibleBalance]);

  const active = months[activeIndex] ?? months[months.length - 1];
  const latestPublished = [...months].reverse().find((month) => !month.isPending);
  const totalTwr = Number(report.twrYtd ?? 0) * 100;
  const progress = months.length > 1 ? activeIndex / (months.length - 1) * 100 : 100;

  useEffect(() => {
    setActiveIndex(0);
    setPlaying(months.length > 1);
    setMode('story');
    setDossierOpen(false);
    startedAt.current = Date.now();
  }, [months.length, report.clientId, report.createdAt]);

  useEffect(() => {
    if (!playing || mode !== 'story' || months.length < 2) return undefined;
    const timer = window.setTimeout(() => {
      setActiveIndex((current) => {
        if (current >= months.length - 1) {
          setPlaying(false);
          onAnalyticsEvent?.({
            type: 'report_aether_story_complete',
            label: 'AETHER recorrido completo',
            durationMs: Date.now() - startedAt.current
          });
          return current;
        }
        return current + 1;
      });
    }, activeIndex === 0 ? 2600 : 3600);
    return () => window.clearTimeout(timer);
  }, [activeIndex, mode, months.length, onAnalyticsEvent, playing]);

  useEffect(() => {
    const rail = timelineRef.current;
    const button = active ? nodeRefs.current[active.key] : null;
    if (!rail || !button) return;
    const left = button.offsetLeft + button.offsetWidth / 2 - rail.clientWidth / 2;
    rail.scrollTo({ left: Math.max(0, Math.min(left, rail.scrollWidth - rail.clientWidth)), behavior: 'smooth' });
  }, [active, activeIndex]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (dossierOpen) setDossierOpen(false);
        else if (cinema) setCinema(false);
        return;
      }
      if (event.key === 'ArrowLeft') selectMonth(Math.max(0, activeIndex - 1), 'teclado');
      if (event.key === 'ArrowRight') selectMonth(Math.min(months.length - 1, activeIndex + 1), 'teclado');
      if (event.key === ' ') {
        event.preventDefault();
        setMode('story');
        setPlaying((value) => !value);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  const selectMonth = (index: number, source: string) => {
    const safeIndex = Math.max(0, Math.min(months.length - 1, index));
    setActiveIndex(safeIndex);
    setPlaying(false);
    setMode('explore');
    onAnalyticsEvent?.({ type: 'report_aether_month', label: `AETHER ${source} ${months[safeIndex]?.label ?? safeIndex}` });
  };

  const replay = () => {
    startedAt.current = Date.now();
    setMode('story');
    setActiveIndex(0);
    setPlaying(true);
    onAnalyticsEvent?.({ type: 'report_aether_replay', label: 'AETHER reiniciar relato' });
  };

  const narrative = useMemo(() => {
    if (!active) return 'El recorrido comenzará cuando exista un cierre publicado.';
    if (active.isPending) {
      const parts = [
        active.increments > 0 ? `${formatCurrency(active.increments)} incorporados` : '',
        active.decrements > 0 ? `${formatCurrency(active.decrements)} retirados` : ''
      ].filter(Boolean).join(' y ');
      return `${parts || 'Nuevos movimientos'} después del último cierre. El capital ya es visible; su resultado se integrará cuando se publique el próximo cierre.`;
    }
    if (active.breakdown) {
      const contributionCount = active.breakdown.contributions.length;
      const withdrawalCount = active.breakdown.withdrawals?.length ?? 0;
      if (contributionCount && withdrawalCount) return `El mes combina la posición inicial, ${contributionCount} aportación y ${withdrawalCount} retirada. Cada tramo conserva solo el rendimiento del tiempo que estuvo invertido.`;
      if (contributionCount) return `La posición inicial y ${contributionCount === 1 ? 'una aportación posterior' : `${contributionCount} aportaciones posteriores`} avanzan con rentabilidades separadas hasta reconciliar el resultado del mes.`;
      if (withdrawalCount) return `El capital retirado conserva el rendimiento generado hasta su fecha de salida; el resto de la posición continúa hasta el cierre.`;
    }
    const movementText = active.increments > 0 || active.decrements > 0
      ? ` Los movimientos netos del periodo fueron ${signedMoney(active.increments - active.decrements)}.`
      : '';
    return `${active.label} cerró en ${formatCurrency(active.balance)} tras generar ${signedMoney(active.profit)} (${signedPercent(active.returnPct)}).${movementText}`;
  }, [active]);

  const currentDate = new Date(report.createdAt || Date.now()).toLocaleDateString('es-ES', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  return (
    <article className={`aether-root${cinema ? ' is-cinema' : ''}${dossierOpen ? ' has-dossier' : ''}`} ref={rootRef}>
      <div className="aether-noise" aria-hidden="true" />
      <header className="aether-header">
        <div className="aether-brand" aria-label="Aether Capital Cinema">
          <span className="aether-brand-mark"><i /><i /><i /></span>
          <span><strong>AETHER</strong><small>CAPITAL CINEMA / 27</small></span>
        </div>
        <div className="aether-sync"><i /><span>INFORME VIVO</span><b>{report.clientCode}</b><small>{currentDate}</small></div>
        <nav className="aether-actions" aria-label="Acciones del informe">
          <button type="button" onClick={() => { onAnalyticsEvent?.({ type: 'report_download', label: 'AETHER PDF oficial' }); void onDownload?.(); }}>PDF</button>
          <button type="button" onClick={() => setDossierOpen(true)}>Precisión</button>
          <button type="button" className="is-emphasis" onClick={() => { setCinema((value) => !value); onAnalyticsEvent?.({ type: 'report_aether_cinema', label: 'AETHER modo cine' }); }}>{cinema ? 'Salir' : 'Pantalla total'}</button>
        </nav>
      </header>

      <main className="aether-stage">
        <AetherCapitalScene nodes={months} activeIndex={activeIndex} mode={mode} onSelect={(index) => selectMonth(index, 'escena 3D')} />

        <section className="aether-chapter" key={active?.key} aria-live="polite">
          <div className="aether-chapter-index"><span>{String(activeIndex + 1).padStart(2, '0')}</span><i /><small>{String(months.length).padStart(2, '0')}</small></div>
          <p className="aether-overline">{active?.isPending ? 'CAPITAL EN TRÁNSITO' : 'CIERRE MENSUAL'} · {active?.label ?? 'Sin periodo'}</p>
          <h1>{active?.isPending ? 'La posición ya ha cambiado.' : formatCurrency(active?.balance ?? 0)}</h1>
          <p className="aether-narrative">{narrative}</p>
          <div className="aether-chapter-values">
            <span><small>Resultado</small><strong className={tone(active?.profit ?? 0)}>{active?.isPending ? 'Próximo cierre' : signedMoney(active?.profit ?? 0)}</strong></span>
            <span><small>Rentabilidad</small><strong className={tone(active?.returnPct ?? 0)}>{active?.isPending ? 'Pendiente' : signedPercent(active?.returnPct ?? 0)}</strong></span>
            <span><small>Flujo neto</small><strong>{active && active.increments - active.decrements !== 0 ? signedMoney(active.increments - active.decrements) : 'Sin movimientos'}</strong></span>
          </div>
        </section>

        <aside className="aether-now" aria-label="Posición actual">
          <span>AHORA</span>
          <strong>{formatCurrency(visibleBalance)}</strong>
          <small>{pending.length ? `Incluye ${signedMoney(pendingNet)} después del último cierre` : `Último cierre · ${latestPublished?.label ?? 'sin datos'}`}</small>
        </aside>

        <section className="aether-cockpit" aria-label="Control del recorrido">
          <div className="aether-playback">
            <button type="button" className="aether-round-control" aria-label="Mes anterior" disabled={activeIndex === 0} onClick={() => selectMonth(activeIndex - 1, 'anterior')}>←</button>
            <button
              type="button"
              className="aether-play-control"
              aria-label={playing ? 'Pausar recorrido' : 'Reproducir recorrido'}
              onClick={() => {
                setMode('story');
                if (!playing && activeIndex === months.length - 1) replay();
                else setPlaying((value) => !value);
              }}
            ><i className={playing ? 'is-pause' : 'is-play'} />{playing ? 'PAUSAR RELATO' : activeIndex === months.length - 1 ? 'REPETIR RELATO' : 'CONTINUAR RELATO'}</button>
            <button type="button" className="aether-round-control" aria-label="Mes siguiente" disabled={activeIndex === months.length - 1} onClick={() => selectMonth(activeIndex + 1, 'siguiente')}>→</button>
            <button type="button" className={`aether-explore${mode === 'explore' ? ' is-active' : ''}`} onClick={() => { setMode('explore'); setPlaying(false); }}>EXPLORAR EN 3D</button>
          </div>

          <div className="aether-timeline-shell">
            <div className="aether-timeline-progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
            <div className="aether-timeline" ref={timelineRef} role="list" aria-label="Línea temporal del patrimonio">
              {months.map((month, index) => <button
                type="button"
                role="listitem"
                key={month.key}
                ref={(element) => { nodeRefs.current[month.key] = element; }}
                className={`aether-time-node${index === activeIndex ? ' is-active' : ''}${month.increments ? ' has-inflow' : ''}${month.decrements ? ' has-outflow' : ''}${month.isPending ? ' is-pending' : ''}`}
                onClick={() => selectMonth(index, 'línea temporal')}
                aria-label={`${month.label}: ${formatCurrency(month.balance)}`}
              >
                <i /><span>{month.shortLabel}</span><small>{month.isPending ? 'EN CURSO' : signedPercent(month.returnPct)}</small>
              </button>)}
            </div>
          </div>
          <div className="aether-gesture-hint"><span>ARRASTRA</span><i /> <span>RUEDA PARA ACERCAR</span></div>
        </section>

        <div className="aether-total-line" aria-label="Resumen completo">
          <span><small>Capital neto</small><strong>{formatCurrency(visibleCapital)}</strong></span>
          <i />
          <span><small>Beneficio acumulado</small><strong className={tone(report.beneficioTotal)}>{signedMoney(report.beneficioTotal)}</strong></span>
          <i />
          <span><small>TWR acumulado</small><strong className={tone(totalTwr)}>{signedPercent(totalTwr)}</strong></span>
        </div>
      </main>

      <div className={`aether-dossier-backdrop${dossierOpen ? ' is-visible' : ''}`} onClick={() => setDossierOpen(false)} aria-hidden="true" />
      <aside className={`aether-dossier${dossierOpen ? ' is-open' : ''}`} aria-hidden={!dossierOpen} aria-label="Dossier de precisión">
        <header>
          <div><span>DOSSIER / DATOS EXACTOS</span><h2>{active?.label}</h2></div>
          <button type="button" onClick={() => setDossierOpen(false)} aria-label="Cerrar dossier">×</button>
        </header>

        <section className="aether-dossier-hero">
          <span>Posición al cierre</span>
          <strong>{formatCurrency(active?.balance ?? 0)}</strong>
          <div><b className={tone(active?.profit ?? 0)}>{active?.isPending ? 'Resultado pendiente' : signedMoney(active?.profit ?? 0)}</b><b className={tone(active?.returnPct ?? 0)}>{active?.isPending ? 'Rentabilidad pendiente' : signedPercent(active?.returnPct ?? 0)}</b></div>
        </section>

        {active?.breakdown ? <section className="aether-tranches">
          <div className="aether-dossier-heading"><span>RECONCILIACIÓN INTRAMES</span><p>El resultado se reconstruye por el tiempo real de cada tramo de capital.</p></div>
          <article>
            <div><span>Posición inicial del mes</span><small>Activa durante todo el periodo</small></div>
            <strong>{formatCurrency(active.breakdown.openingCapital ?? active.breakdown.initialCapital)}</strong>
            <b>{signedPercent(active.breakdown.initialReturnPct * 100)}</b>
            <em>{signedMoney(active.breakdown.initialProfit)}</em>
          </article>
          {active.breakdown.contributions.map((item) => <article className="is-inflow" key={`aether-in-${item.iso}`}>
            <div><span>Aportación incorporada</span><small>{dateLabel(item.iso)} · hasta el cierre</small></div>
            <strong>{formatCurrency(item.amount)}</strong><b>{signedPercent(item.returnPct * 100)}</b><em>{signedMoney(item.profit)}</em>
          </article>)}
          {(active.breakdown.withdrawals ?? []).map((item) => <article className="is-outflow" key={`aether-out-${item.iso}`}>
            <div><span>Posición retirada</span><small>Invertida hasta el {dateLabel(item.iso)}</small></div>
            <strong>{formatCurrency(item.amount)}</strong><b>{item.returnPct === undefined ? '—' : signedPercent(item.returnPct * 100)}</b><em>{signedMoney(item.profit)}</em>
          </article>)}
          <article className="is-total"><div><span>Resultado conciliado</span><small>Suma exacta de todos los tramos</small></div><strong>—</strong><b>—</b><em>{signedMoney(active.breakdown.totalProfit)}</em></article>
        </section> : <section className="aether-linear-period"><span>{active?.isPending ? 'PRÓXIMO CIERRE' : 'PERIODO LINEAL'}</span><p>{active?.isPending ? 'El capital se muestra en tiempo real. La rentabilidad aparecerá al publicar el cierre.' : 'La posición permaneció sin tramos especiales durante este periodo.'}</p></section>}

        <section className="aether-ledger">
          <div className="aether-dossier-heading"><span>ARCHIVO MENSUAL</span><p>Selecciona cualquier periodo para llevar la escena hasta ese punto.</p></div>
          <div className="aether-ledger-scroll">
            <table>
              <thead><tr><th>Periodo</th><th>Resultado</th><th>Rentabilidad</th><th>Cierre</th></tr></thead>
              <tbody>{months.map((month, index) => <tr key={`aether-ledger-${month.key}`} className={index === activeIndex ? 'is-active' : ''} onClick={() => selectMonth(index, 'dossier')}>
                <th>{month.shortLabel}</th><td className={tone(month.profit)}>{month.isPending ? 'Pendiente' : signedMoney(month.profit)}</td><td>{month.isPending ? '—' : signedPercent(month.returnPct)}</td><td>{compactMoney(month.balance)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>
      </aside>

      <div className="aether-screen-reader" aria-live="polite">Periodo seleccionado: {active?.label}. Posición {formatCurrency(active?.balance ?? 0)}.</div>
    </article>
  );
};

export default AetherReportPage;
