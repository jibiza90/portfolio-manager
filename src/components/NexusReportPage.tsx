import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './NexusReportPage.css';

interface PendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface NexusReportPageProps {
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

interface NexusNode {
  key: string;
  label: string;
  shortLabel: string;
  opening: number;
  balance: number;
  profit: number;
  returnPct: number;
  increments: number;
  decrements: number;
  isPending?: boolean;
  breakdown?: NonNullable<ReportData['contributionBreakdowns']>[number];
}

type NexusMode = 'balance' | 'return' | 'profit';

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
  if (!year || !month) return key;
  const value = new Date(year, month - 1, 1).toLocaleDateString('es-ES', {
    month: short ? 'short' : 'long',
    year: short ? '2-digit' : 'numeric'
  }).replace('.', '').replace(' de ', ' ');
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
};

const signedMoney = (value: number) => {
  if (Math.abs(value) < 0.005) return formatCurrency(0);
  return `${value > 0 ? '+' : '−'}${formatCurrency(Math.abs(value))}`;
};

const signedPct = (value: number) => {
  if (Math.abs(value) < 0.005) return '0,00 %';
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
};

const compactMoney = (value: number) => {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 2 })} M €`;
  if (absolute >= 1_000) return `${(value / 1_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} k €`;
  return `${Math.round(value).toLocaleString('es-ES')} €`;
};

const sumType = (rows: Array<{ type: string; amount: number }>, type: 'increment' | 'decrement') =>
  rows.filter((row) => row.type === type).reduce((sum, row) => sum + row.amount, 0);

const tone = (value: number) => value > 0.005 ? 'is-positive' : value < -0.005 ? 'is-negative' : 'is-neutral';

export const NexusReportPage: React.FC<NexusReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onDownload,
  onAnalyticsEvent
}) => {
  const timelineRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [mode, setMode] = useState<NexusMode>('balance');
  const [immersive, setImmersive] = useState(false);

  const pending = useMemo(() => pendingCashMovements
    .filter((row) => Number.isFinite(row.amount) && row.amount > 0)
    .sort((left, right) => left.iso.localeCompare(right.iso)), [pendingCashMovements]);
  const pendingIncrements = sumType(pending, 'increment');
  const pendingDecrements = sumType(pending, 'decrement');
  const visibleBalance = report.saldo + pendingIncrements - pendingDecrements;
  const visibleContributed = report.incrementos + pendingIncrements;
  const visibleWithdrawn = report.decrementos + pendingDecrements;
  const twrPct = (report.twrYtd ?? 0) * 100;

  const nodes = useMemo<NexusNode[]>(() => {
    const balances = new Map(report.patrimonioEvolution
      .filter((row) => row.hasData && Number.isFinite(row.balance))
      .map((row) => [monthToKey(row.month), Number(row.balance)]));
    const breakdowns = new Map((report.contributionBreakdowns ?? []).map((row) => [monthToKey(row.month), row]));
    const valid = report.monthlyStats
      .filter((row) => row.hasData)
      .map((row) => ({ ...row, key: monthToKey(row.month) }))
      .sort((left, right) => left.key.localeCompare(right.key));
    const published = valid.map((row, index) => {
      const movements = report.movements.filter((movement) => movement.iso.slice(0, 7) === row.key);
      const increments = sumType(movements, 'increment');
      const decrements = sumType(movements, 'decrement');
      const balance = balances.get(row.key) ?? row.endBalance;
      const previous = index > 0 ? (balances.get(valid[index - 1].key) ?? valid[index - 1].endBalance) : undefined;
      return {
        key: row.key,
        label: monthLabel(row.key),
        shortLabel: monthLabel(row.key, true),
        opening: previous ?? balance - increments + decrements - row.profit,
        balance,
        profit: row.profit,
        returnPct: index === valid.length - 1 ? report.rentabilidadUltimoMes : row.profitPct,
        increments,
        decrements,
        breakdown: breakdowns.get(row.key)
      };
    });
    if (!pending.length) return published;
    const latest = published[published.length - 1];
    return [...published, {
      key: `now-${pending[pending.length - 1].iso}`,
      label: 'Posición actual',
      shortLabel: 'Ahora',
      opening: report.saldo,
      balance: visibleBalance,
      profit: 0,
      returnPct: 0,
      increments: pendingIncrements,
      decrements: pendingDecrements,
      isPending: true,
      breakdown: latest?.breakdown
    }];
  }, [pending, pendingDecrements, pendingIncrements, report, visibleBalance]);

  useEffect(() => {
    if (!playing || nodes.length < 2) return undefined;
    const timer = window.setInterval(() => setActiveIndex((index) => (index + 1) % nodes.length), 1750);
    return () => window.clearInterval(timer);
  }, [nodes.length, playing]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, nodes.length - 1)));
  }, [nodes.length]);

  useEffect(() => {
    const key = nodes[activeIndex]?.key;
    if (key) timelineRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeIndex, nodes]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && immersive) setImmersive(false);
      if (event.key === 'ArrowLeft') { setPlaying(false); setActiveIndex((index) => Math.max(0, index - 1)); }
      if (event.key === 'ArrowRight') { setPlaying(false); setActiveIndex((index) => Math.min(nodes.length - 1, index + 1)); }
      if (event.key === ' ' && immersive) { event.preventDefault(); setPlaying((value) => !value); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [immersive, nodes.length]);

  const active = nodes[activeIndex] ?? nodes[nodes.length - 1];
  const windowSize = Math.min(15, nodes.length);
  const windowStart = Math.min(Math.max(0, activeIndex - Math.floor(windowSize / 2)), Math.max(0, nodes.length - windowSize));
  const visibleNodes = nodes.slice(windowStart, windowStart + windowSize);
  const localActive = Math.max(0, activeIndex - windowStart);

  const scene = useMemo(() => {
    const width = 1400;
    const height = 690;
    const centerX = 700;
    const maxBalance = Math.max(1, ...visibleNodes.map((node) => Math.abs(node.balance)));
    const maxReturn = Math.max(1, ...visibleNodes.map((node) => Math.abs(node.returnPct)));
    const maxProfit = Math.max(1, ...visibleNodes.map((node) => Math.abs(node.profit)));
    const geometry = visibleNodes.map((node, index) => {
      const depth = (index + 1) / (visibleNodes.length + 1);
      const y = 92 + Math.pow(depth, 1.55) * 520;
      const perspective = .28 + depth * .98;
      const metric = mode === 'balance'
        ? Math.abs(node.balance) / maxBalance
        : mode === 'return'
          ? Math.abs(node.returnPct) / maxReturn
          : Math.abs(node.profit) / maxProfit;
      const halfWidth = perspective * (105 + metric * 280);
      const drift = (node.returnPct / maxReturn) * (34 + depth * 22);
      const center = centerX + drift;
      return {
        node,
        index,
        x: center,
        y,
        left: center - halfWidth,
        right: center + halfWidth,
        halfWidth,
        perspective,
        tone: tone(mode === 'balance' ? node.profit : mode === 'return' ? node.returnPct : node.profit)
      };
    });
    const path = geometry.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
    return { width, height, centerX, geometry, path, maxBalance, maxReturn, maxProfit };
  }, [mode, visibleNodes]);

  const activeGeometry = scene.geometry[localActive] ?? scene.geometry[scene.geometry.length - 1];
  const modeLabel = mode === 'balance' ? 'Volumen patrimonial' : mode === 'return' ? 'Intensidad de rentabilidad' : 'Resultado generado';
  const modeValue = active ? mode === 'balance' ? formatCurrency(active.balance) : mode === 'return' ? signedPct(active.returnPct) : signedMoney(active.profit) : '—';
  const completion = nodes.length > 1 ? activeIndex / (nodes.length - 1) * 100 : 100;

  const selectNode = (index: number, source: string) => {
    setPlaying(false);
    setActiveIndex(index);
    onAnalyticsEvent?.({ type: 'report_nexus_month', label: `NEXUS ${source} ${nodes[index]?.label ?? index}` });
  };

  const setVisualMode = (next: NexusMode) => {
    setMode(next);
    onAnalyticsEvent?.({ type: 'report_nexus_mode', label: `NEXUS ${next}` });
  };

  return (
    <article className={`nexus-root${immersive ? ' is-immersive' : ''}`} ref={rootRef}>
      <div className="nexus-atmosphere" aria-hidden="true"><i /><i /><i /></div>
      <header className="nexus-head">
        <div className="nexus-identity"><span className="nexus-mark"><i /><i /><i /></span><div><small>LIVE WEALTH SYSTEM</small><h1>NEXUS</h1><p>Visualización viva de su patrimonio · {report.clientCode}</p></div></div>
        <div className="nexus-head-actions">
          <button type="button" className="nexus-immersive-button" onClick={() => { setImmersive((value) => !value); onAnalyticsEvent?.({ type: 'report_expand_chart', label: 'NEXUS immersive' }); }}>{immersive ? 'Salir de pantalla completa' : 'Entrar en modo inmersivo'}</button>
          <button type="button" className="nexus-download" onClick={() => { onAnalyticsEvent?.({ type: 'report_download', label: 'NEXUS PDF' }); void onDownload?.(); }}>PDF</button>
        </div>
      </header>

      <section className="nexus-telemetry" aria-label="Resumen global de cartera">
        <div className="is-primary"><span>POSICIÓN ACTUAL</span><strong>{formatCurrency(visibleBalance)}</strong><small>{pending.length ? 'Incluye movimientos posteriores al cierre' : 'Último cierre publicado'}</small></div>
        <div><span>BENEFICIO ACUMULADO</span><strong className={tone(report.beneficioTotal)}>{signedMoney(report.beneficioTotal)}</strong><small>Sobre {formatCurrency(visibleContributed - visibleWithdrawn)} de capital neto</small></div>
        <div><span>TWR ACUMULADO</span><strong className={tone(twrPct)}>{signedPct(twrPct)}</strong><small>Rendimiento de la gestión</small></div>
        <div><span>RENTABILIDAD TOTAL</span><strong className={tone(report.rentabilidad)}>{report.rentabilidadDisponible === false ? 'No aplicable' : signedPct(report.rentabilidad)}</strong><small>Resultado sobre capital neto</small></div>
      </section>

      <section className="nexus-console" aria-label="Explorador cinematográfico del patrimonio">
        <div className="nexus-console-top">
          <div><small>SECUENCIA PATRIMONIAL</small><strong>{playing ? 'Reproducción automática' : 'Exploración manual'}</strong><span>{nodes.length} estados financieros conectados</span></div>
          <div className="nexus-modes" role="radiogroup" aria-label="Variable visualizada">
            <button type="button" role="radio" aria-checked={mode === 'balance'} className={mode === 'balance' ? 'is-active' : ''} onClick={() => setVisualMode('balance')}>Patrimonio</button>
            <button type="button" role="radio" aria-checked={mode === 'return'} className={mode === 'return' ? 'is-active' : ''} onClick={() => setVisualMode('return')}>Rentabilidad</button>
            <button type="button" role="radio" aria-checked={mode === 'profit'} className={mode === 'profit' ? 'is-active' : ''} onClick={() => setVisualMode('profit')}>Resultado</button>
          </div>
          <div className="nexus-live"><i className={playing ? 'is-live' : ''} /><span>{playing ? 'LIVE' : 'PAUSA'}</span><b>{String(activeIndex + 1).padStart(2, '0')} / {String(nodes.length).padStart(2, '0')}</b></div>
        </div>

        <div className="nexus-stage">
          <aside className="nexus-node-readout" aria-live="polite">
            <small>NODO TEMPORAL</small>
            <span>{active?.isPending ? 'CAPITAL EN TRÁNSITO' : active?.label.toUpperCase()}</span>
            <strong>{active ? formatCurrency(active.balance) : '—'}</strong>
            <div><p>Resultado</p><b className={tone(active?.profit ?? 0)}>{active ? signedMoney(active.profit) : '—'}</b></div>
            <div><p>Rentabilidad</p><b className={tone(active?.returnPct ?? 0)}>{active?.isPending ? 'Pendiente de cierre' : active ? signedPct(active.returnPct) : '—'}</b></div>
            <em>{modeLabel}<b>{modeValue}</b></em>
          </aside>

          <div className="nexus-scene-wrap">
            <svg className="nexus-scene" viewBox="0 0 1400 690" role="img" aria-label="Campo tridimensional del patrimonio a lo largo del tiempo">
              <defs>
                <linearGradient id="nexus-ribbon-positive" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#64f7d1" stopOpacity=".08" /><stop offset=".55" stopColor="#22d9cc" stopOpacity=".42" /><stop offset="1" stopColor="#4d8cff" stopOpacity=".18" /></linearGradient>
                <linearGradient id="nexus-ribbon-negative" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff6b7a" stopOpacity=".12" /><stop offset=".6" stopColor="#ff7b72" stopOpacity=".46" /><stop offset="1" stopColor="#8d4dff" stopOpacity=".14" /></linearGradient>
                <linearGradient id="nexus-ribbon-neutral" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6e829e" stopOpacity=".08" /><stop offset="1" stopColor="#7ba3c7" stopOpacity=".25" /></linearGradient>
                <filter id="nexus-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="8" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              </defs>
              <g className="nexus-floor" aria-hidden="true">
                {[-600, -400, -200, 0, 200, 400, 600].map((offset) => <line key={offset} x1="700" y1="74" x2={700 + offset} y2="660" />)}
                {[.15, .3, .47, .65, .82, 1].map((depth) => { const y = 92 + Math.pow(depth, 1.55) * 520; const half = 80 + depth * 560; return <line key={depth} x1={700 - half} x2={700 + half} y1={y} y2={y} />; })}
              </g>
              <path d={scene.path} className="nexus-spine-shadow" />
              {scene.geometry.slice(0, -1).map((point, index) => {
                const next = scene.geometry[index + 1];
                const activeSegment = index === localActive || index + 1 === localActive;
                return <polygon key={`${point.node.key}-${next.node.key}`} points={`${point.left},${point.y} ${point.right},${point.y} ${next.right},${next.y} ${next.left},${next.y}`} className={`nexus-ribbon ${next.tone}${activeSegment ? ' is-active' : ''}`} />;
              })}
              <path d={scene.path} className="nexus-spine" />
              {scene.geometry.map((point, index) => {
                const globalIndex = windowStart + index;
                const selected = globalIndex === activeIndex;
                const flowIn = point.node.increments > 0;
                const flowOut = point.node.decrements > 0;
                return <g key={point.node.key} className={`nexus-gate ${point.tone}${selected ? ' is-selected' : ''}`} role="button" tabIndex={0} aria-label={`${point.node.label}: ${formatCurrency(point.node.balance)}`} onClick={() => selectNode(globalIndex, 'scene')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') selectNode(globalIndex, 'scene'); }}>
                  {selected ? <ellipse cx={point.x} cy={point.y} rx={point.halfWidth + 34} ry={18 + point.perspective * 10} className="nexus-gate-aura" filter="url(#nexus-glow)" /> : null}
                  <line x1={point.left} x2={point.right} y1={point.y} y2={point.y} className="nexus-gate-line" filter={selected ? 'url(#nexus-glow)' : undefined} />
                  <circle cx={point.left} cy={point.y} r={selected ? 7 : 3.5} className="nexus-gate-node" />
                  <circle cx={point.right} cy={point.y} r={selected ? 7 : 3.5} className="nexus-gate-node" />
                  {flowIn ? <g className="nexus-flow is-in"><line x1={point.left - 54} x2={point.left - 8} y1={point.y} y2={point.y} /><circle cx={point.left - 58} cy={point.y} r={selected ? 8 : 5} /><title>Aportación {formatCurrency(point.node.increments)}</title></g> : null}
                  {flowOut ? <g className="nexus-flow is-out"><line x1={point.right + 8} x2={point.right + 54} y1={point.y} y2={point.y} /><circle cx={point.right + 58} cy={point.y} r={selected ? 8 : 5} /><title>Retirada {formatCurrency(point.node.decrements)}</title></g> : null}
                  <text x={point.right + 14} y={point.y + 4} className="nexus-gate-label">{point.node.shortLabel}</text>
                  {selected ? <g className="nexus-active-value"><rect x={point.x - 82} y={point.y - 49} width="164" height="30" rx="15" /><text x={point.x} y={point.y - 29} textAnchor="middle">{mode === 'balance' ? compactMoney(point.node.balance) : mode === 'return' ? signedPct(point.node.returnPct) : signedMoney(point.node.profit)}</text></g> : null}
                </g>;
              })}
              {activeGeometry ? <g className="nexus-particles" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <circle key={index} cx={activeGeometry.left + (activeGeometry.halfWidth * 2 / 7) * (index % 8)} cy={activeGeometry.y} r={1.5 + (index % 3)} style={{ animationDelay: `${index * 120}ms` }} />)}</g> : null}
            </svg>
          </div>

          <aside className="nexus-anatomy">
            <small>ANATOMÍA DEL MES</small>
            <ol>
              <li><i>01</i><span>Posición inicial<b>{active ? formatCurrency(active.opening) : '—'}</b></span></li>
              <li><i>02</i><span>Capital incorporado<b>{active?.increments ? `+${formatCurrency(active.increments)}` : 'Sin aportaciones'}</b></span></li>
              <li><i>03</i><span>Capital retirado<b>{active?.decrements ? `−${formatCurrency(active.decrements)}` : 'Sin retiradas'}</b></span></li>
              <li><i>04</i><span>Resultado generado<b className={tone(active?.profit ?? 0)}>{active?.isPending ? 'Pendiente de cierre' : active ? signedMoney(active.profit) : '—'}</b></span></li>
            </ol>
            <div className="nexus-reconciliation"><span>CIERRE</span><strong>{active ? formatCurrency(active.balance) : '—'}</strong><small>{active?.isPending ? 'Posición provisional confirmada' : 'Cierre mensual publicado'}</small></div>
          </aside>
        </div>

        <div className="nexus-narrative" aria-live="polite"><span>{String(activeIndex + 1).padStart(2, '0')}</span><p>{active?.isPending
          ? `Después del último cierre se incorporaron ${formatCurrency(active.increments)} y se retiraron ${formatCurrency(active.decrements)}. La posición visible es ${formatCurrency(active.balance)}; el resultado de inversión se añadirá en el próximo cierre.`
          : `En ${active?.label ?? 'este periodo'}, la cartera comenzó con ${formatCurrency(active?.opening ?? 0)}${active?.increments ? `, recibió ${formatCurrency(active.increments)}` : ''}${active?.decrements ? `, registró una retirada de ${formatCurrency(active.decrements)}` : ''} y generó ${signedMoney(active?.profit ?? 0)}. Cerró en ${formatCurrency(active?.balance ?? 0)}.`}</p></div>

        <div className="nexus-player">
          <div className="nexus-player-actions">
            <button type="button" aria-label="Reiniciar secuencia" onClick={() => { setActiveIndex(0); setPlaying(true); }}>↺</button>
            <button type="button" className="is-play" aria-label={playing ? 'Pausar secuencia' : 'Reproducir secuencia'} onClick={() => setPlaying((value) => !value)}>{playing ? 'Ⅱ' : '▶'}</button>
            <button type="button" onClick={() => { setPlaying(false); setActiveIndex(nodes.length - 1); }}>Ir al presente</button>
          </div>
          <div className="nexus-progress"><i style={{ width: `${completion}%` }} /><span style={{ left: `${completion}%` }} /></div>
          <div className="nexus-timeline" role="list" aria-label="Línea temporal de cierres">{nodes.map((node, index) => <button key={node.key} ref={(element) => { timelineRefs.current[node.key] = element; }} type="button" role="listitem" className={`${index === activeIndex ? 'is-active' : ''}${node.increments ? ' has-inflow' : ''}${node.decrements ? ' has-outflow' : ''}${node.isPending ? ' is-pending' : ''}`} onClick={() => selectNode(index, 'timeline')}><i /><span>{node.shortLabel}</span><small>{compactMoney(node.balance)}</small></button>)}</div>
        </div>
      </section>

      <section className="nexus-detail" aria-labelledby="nexus-detail-title">
        <div><small>CAPITAL EN PROFUNDIDAD</small><h2 id="nexus-detail-title">El origen de cada euro generado</h2><p>La vista cambia con el nodo temporal seleccionado. Cada tramo utiliza exclusivamente la rentabilidad publicada para ese capital.</p></div>
        <div className="nexus-tranches">
          {active?.breakdown && !active.isPending ? <>
            <article><span>POSICIÓN INICIAL</span><strong>{formatCurrency(active.breakdown.openingCapital ?? active.breakdown.initialCapital)}</strong><b>{signedPct(active.breakdown.initialReturnPct * 100)}</b><em>{signedMoney(active.breakdown.initialProfit)}</em></article>
            {active.breakdown.contributions.map((item) => <article key={`in-${item.iso}`} className="is-inflow"><span>APORTACIÓN · {item.iso.split('-').reverse().join('/')}</span><strong>{formatCurrency(item.amount)}</strong><b>{signedPct(item.returnPct * 100)}</b><em>{signedMoney(item.profit)}</em></article>)}
            {(active.breakdown.withdrawals ?? []).map((item) => <article key={`out-${item.iso}`} className="is-outflow"><span>RETIRADA · {item.iso.split('-').reverse().join('/')}</span><strong>{formatCurrency(item.amount)}</strong><b>{item.returnPct === undefined ? '—' : signedPct(item.returnPct * 100)}</b><em>{signedMoney(item.profit)}</em></article>)}
            <article className="is-total"><span>RESULTADO EXPLICADO</span><strong>{signedMoney(active.breakdown.totalProfit)}</strong><b>100 % conciliado</b><em>{Math.abs(active.breakdown.totalProfit - active.profit) < .01 ? 'Cuadra con el cierre' : 'Revisar diferencia'}</em></article>
          </> : <article className="is-empty"><span>{active?.isPending ? 'PRÓXIMO CIERRE' : 'SIN MOVIMIENTOS INTRAMES PUBLICADOS'}</span><strong>{active?.isPending ? 'La rentabilidad aún no se ha aplicado' : active?.label ?? '—'}</strong><p>{active?.isPending ? 'El capital ya forma parte de la posición visible. Su rendimiento aparecerá cuando se publique el cierre mensual.' : 'El resultado del mes corresponde íntegramente a la posición mantenida durante el periodo.'}</p></article>}
        </div>
      </section>

      <footer className="nexus-footer"><div><span className="nexus-mark"><i /><i /><i /></span><p><strong>NEXUS</strong><small>Wealth Intelligence Interface · {report.clientCode}</small></p></div><p>Datos actualizados el {new Date(report.createdAt).toLocaleDateString('es-ES')} · Concepto CODEX</p></footer>
    </article>
  );
};
