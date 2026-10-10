import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GeneralReferenceMonth } from '../services/cloudPortfolio';
import type { ReportData } from '../services/reportLinks';
import { formatCurrency } from '../utils/format';
import './NarrativeReportPage.css';

interface NarrativePendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

interface NarrativeReportPageProps {
  report: ReportData;
  generalReferenceMonthly?: GeneralReferenceMonth[];
  pendingCashMovements?: NarrativePendingMovement[];
  rootRef?: React.RefObject<HTMLDivElement>;
  onAnalyticsEvent?: (event: {
    type: string;
    label: string;
    durationMs?: number;
    metadata?: Record<string, string | number | boolean>;
  }) => void;
}

interface NarrativeMonth {
  key: string;
  label: string;
  shortLabel: string;
  profit: number;
  returnPct: number;
  balance: number;
}

type FactKey = 'balance' | 'profit' | 'twr' | 'capital';

const monthLookup: Record<string, number> = {
  ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2,
  abr: 3, abril: 3, may: 4, mayo: 4, jun: 5, junio: 5,
  jul: 6, julio: 6, ago: 7, agosto: 7, sep: 8, sept: 8,
  septiembre: 8, oct: 9, octubre: 9, nov: 10, noviembre: 10,
  dic: 11, diciembre: 11
};

const monthToKey = (value: string) => {
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  const parts = value.trim().toLowerCase().split(/\s+/);
  const month = monthLookup[parts[0]];
  const year = Number(parts[parts.length - 1]);
  if (month === undefined || !Number.isFinite(year)) return value;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
};

const monthName = (key: string, short = false) => {
  const [year, month] = key.split('-').map(Number);
  const value = new Date(year, Math.max(0, month - 1), 1).toLocaleDateString('es-ES', {
    month: short ? 'short' : 'long',
    year: short ? '2-digit' : 'numeric'
  }).replace('.', '').replace(' de ', ' ');
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
};

const formatDate = (iso: string) => {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${day}.${month}.${year}` : iso;
};

const signedMoney = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) < 0.005) return formatCurrency(0);
  return `${safe > 0 ? '+' : '-'}${formatCurrency(Math.abs(safe))}`;
};

const signedPercent = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) < 0.005) return '0,00 %';
  return `${safe > 0 ? '+' : '-'}${Math.abs(safe).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} %`;
};

const calculateTwrPct = (months: NarrativeMonth[]) => (
  (months.reduce((factor, month) => factor * (1 + month.returnPct / 100), 1) - 1) * 100
);

const chapterItems = [
  { id: 'pn5-opening', number: '00', label: 'Tu historia' },
  { id: 'pn5-capital', number: '01', label: 'El capital' },
  { id: 'pn5-growth', number: '02', label: 'El crecimiento' },
  { id: 'pn5-method', number: '03', label: 'Cómo lo medimos' },
  { id: 'pn5-today', number: '04', label: 'Dónde estás hoy' }
];

export const NarrativeReportPage: React.FC<NarrativeReportPageProps> = ({
  report,
  pendingCashMovements = [],
  rootRef,
  onAnalyticsEvent
}) => {
  const localRootRef = useRef<HTMLDivElement | null>(null);
  const [activeChapter, setActiveChapter] = useState(chapterItems[0].id);
  const [summaryMode, setSummaryMode] = useState(false);
  const [selectedFact, setSelectedFact] = useState<FactKey | null>(null);

  const months = useMemo<NarrativeMonth[]>(() => {
    const valid = report.monthlyStats
      .filter((item) => item.hasData && Number.isFinite(item.endBalance) && (
        item.endBalance !== 0 || item.profit !== 0 || item.profitPct !== 0
      ))
      .sort((left, right) => monthToKey(left.month).localeCompare(monthToKey(right.month)));
    const latestKey = valid.length ? monthToKey(valid[valid.length - 1].month) : '';
    return valid.map((item) => {
      const key = monthToKey(item.month);
      return {
        key,
        label: monthName(key),
        shortLabel: monthName(key, true),
        profit: Number.isFinite(item.profit) ? item.profit : 0,
        returnPct: key === latestKey && Number.isFinite(report.rentabilidadUltimoMes)
          ? report.rentabilidadUltimoMes
          : Number.isFinite(item.profitPct) ? item.profitPct : 0,
        balance: Number.isFinite(item.endBalance) ? item.endBalance : 0
      };
    });
  }, [report]);

  const pendingIncrements = pendingCashMovements
    .filter((movement) => movement.type === 'increment')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const pendingDecrements = pendingCashMovements
    .filter((movement) => movement.type === 'decrement')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const contributedCapital = report.incrementos + pendingIncrements;
  const withdrawnCapital = report.decrementos + pendingDecrements;
  const netCapital = contributedCapital - withdrawnCapital;
  const visibleBalance = report.saldo + pendingIncrements - pendingDecrements;
  const totalProfit = report.beneficioTotal;
  const twr = calculateTwrPct(months);
  const totalReturn = netCapital !== 0 ? (totalProfit / netCapital) * 100 : 0;
  const firstMonth = months[0];
  const latestMonth = months[months.length - 1];
  const bestMonth = [...months].sort((left, right) => right.profit - left.profit)[0];
  const positiveMonths = months.filter((month) => month.profit > 0).length;
  const maxMonthlyProfit = Math.max(1, ...months.map((month) => Math.abs(month.profit)));

  const allMovements = useMemo(() => [
    ...(report.movements ?? []).map((movement) => ({
      iso: movement.iso,
      type: movement.type === 'decrement' ? 'decrement' as const : 'increment' as const,
      amount: movement.amount,
      pending: false
    })),
    ...pendingCashMovements.map((movement) => ({ ...movement, pending: true }))
  ].sort((left, right) => left.iso.localeCompare(right.iso)), [pendingCashMovements, report.movements]);

  const sparklinePoints = useMemo(() => {
    if (!months.length) return '';
    const values = months.map((month) => month.balance);
    const min = Math.min(0, ...values);
    const max = Math.max(1, ...values);
    return values.map((value, index) => {
      const x = months.length === 1 ? 50 : (index / (months.length - 1)) * 100;
      const y = 38 - ((value - min) / Math.max(1, max - min)) * 34;
      return `${x},${y}`;
    }).join(' ');
  }, [months]);
  const sparklineLastPoint = sparklinePoints ? sparklinePoints.split(' ').slice(-1)[0] : '';
  const sparklineLastY = sparklineLastPoint.split(',')[1] ?? '4';

  const facts = useMemo<Record<FactKey, { eyebrow: string; value: string; title: string; body: string; foot: string }>>(() => ({
    balance: {
      eyebrow: 'Situación actual',
      value: formatCurrency(visibleBalance),
      title: 'El valor de la cartera hoy',
      body: `Es el resultado de mantener ${formatCurrency(netCapital)} de capital neto y acumular ${signedMoney(totalProfit)} de beneficio.`,
      foot: `Último cierre publicado: ${latestMonth?.label ?? 'sin cierre disponible'}.`
    },
    profit: {
      eyebrow: 'Resultado acumulado',
      value: signedMoney(totalProfit),
      title: 'Lo que ha generado la inversión',
      body: `Suma el resultado económico de todos los cierres publicados desde ${firstMonth?.label ?? 'el inicio del informe'}.`,
      foot: `Rentabilidad total sobre capital neto: ${signedPercent(totalReturn)}.`
    },
    twr: {
      eyebrow: 'Rentabilidad de la estrategia',
      value: signedPercent(twr),
      title: 'El avance aislando entradas y salidas',
      body: 'El TWR enlaza la rentabilidad de cada mes y evita que una nueva aportación o retirada distorsione la lectura de la estrategia.',
      foot: `${months.length} cierres mensuales incluidos en el cálculo.`
    },
    capital: {
      eyebrow: 'Capital neto',
      value: formatCurrency(netCapital),
      title: 'El dinero que permanece aportado',
      body: `Partimos de ${formatCurrency(contributedCapital)} aportados y descontamos ${formatCurrency(withdrawnCapital)} retirados.`,
      foot: `${allMovements.length} movimientos de capital registrados.`
    }
  }), [allMovements.length, contributedCapital, firstMonth?.label, latestMonth?.label, months.length, netCapital, totalProfit, totalReturn, twr, visibleBalance, withdrawnCapital]);

  useEffect(() => {
    const root = localRootRef.current;
    if (!root) return undefined;
    const sections = chapterItems
      .map((chapter) => root.querySelector<HTMLElement>(`#${chapter.id}`))
      .filter((section): section is HTMLElement => Boolean(section));
    const observer = new IntersectionObserver((entries) => {
      const mostVisible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (mostVisible?.target.id) setActiveChapter(mostVisible.target.id);
    }, { rootMargin: '-18% 0px -52% 0px', threshold: [0.05, 0.25, 0.5, 0.75] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [report.clientId]);

  useEffect(() => {
    if (!selectedFact) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedFact(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedFact]);

  const setRootNode = (node: HTMLDivElement | null) => {
    localRootRef.current = node;
    if (rootRef) {
      (rootRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }
  };

  const goToChapter = (id: string) => {
    localRootRef.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveChapter(id);
    onAnalyticsEvent?.({ type: 'narrative_chapter_open', label: id });
  };

  const openFact = (fact: FactKey) => {
    setSelectedFact(fact);
    onAnalyticsEvent?.({ type: 'narrative_fact_open', label: fact });
  };

  const activeIndex = Math.max(0, chapterItems.findIndex((chapter) => chapter.id === activeChapter));
  const selectedFactData = selectedFact ? facts[selectedFact] : null;

  return (
    <div className={`pn5-report${summaryMode ? ' is-summary' : ''}`} ref={setRootNode}>
      <header className="pn5-topbar">
        <div className="pn5-brand"><i />JIGSA <span>Carta patrimonial</span></div>
        <div className="pn5-topbar-meta">
          <span><small>Cuenta</small><strong>{report.clientCode}</strong></span>
          <span><small>Publicada</small><strong>{new Date(report.createdAt).toLocaleDateString('es-ES')}</strong></span>
          <button
            type="button"
            className={summaryMode ? 'is-active' : ''}
            aria-pressed={summaryMode}
            onClick={() => {
              setSummaryMode((current) => !current);
              onAnalyticsEvent?.({ type: 'narrative_mode_change', label: summaryMode ? 'Lectura completa' : 'Modo resumen' });
            }}
          >
            {summaryMode ? 'Lectura completa' : 'Modo resumen'}
          </button>
        </div>
      </header>

      <div className="pn5-mobile-progress" aria-label={`Capítulo ${activeIndex + 1} de ${chapterItems.length}`}>
        <span style={{ width: `${((activeIndex + 1) / chapterItems.length) * 100}%` }} />
      </div>

      <div className="pn5-shell">
        <nav className="pn5-rail" aria-label="Índice de la carta patrimonial">
          <div><span>Índice</span><strong>{String(activeIndex + 1).padStart(2, '0')} / {String(chapterItems.length).padStart(2, '0')}</strong></div>
          <ol>
            {chapterItems.map((chapter) => (
              <li key={chapter.id}>
                <button
                  type="button"
                  className={activeChapter === chapter.id ? 'is-active' : ''}
                  aria-current={activeChapter === chapter.id ? 'step' : undefined}
                  onClick={() => goToChapter(chapter.id)}
                >
                  <span>{chapter.number}</span>{chapter.label}
                </button>
              </li>
            ))}
          </ol>
          <div className="pn5-rail-progress"><i style={{ height: `${((activeIndex + 1) / chapterItems.length) * 100}%` }} /></div>
        </nav>

        <main className="pn5-story">
          <section className="pn5-opening" id="pn5-opening" data-chapter="opening">
            <span className="pn5-kicker">Carta patrimonial · {firstMonth?.label ?? 'Inicio'} — {latestMonth?.label ?? 'Actualidad'}</span>
            <h1>La historia de tu patrimonio, contada con claridad.</h1>
            <p className="pn5-deck pn5-long-copy">Esta carta convierte los movimientos y los cierres mensuales en una lectura sencilla: cuánto capital pusiste en marcha, qué resultado produjo y cómo llegaste hasta tu posición actual.</p>
            <div className="pn5-opening-facts">
              <button type="button" onClick={() => openFact('balance')}><span>Saldo actual</span><strong>{formatCurrency(visibleBalance)}</strong><small>Ver cómo se compone</small></button>
              <button type="button" onClick={() => openFact('profit')}><span>Beneficio acumulado</span><strong className={totalProfit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(totalProfit)}</strong><small>Desde {firstMonth?.shortLabel ?? 'el inicio'}</small></button>
              <button type="button" onClick={() => openFact('twr')}><span>TWR acumulado</span><strong className={twr >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(twr)}</strong><small>{months.length} cierres enlazados</small></button>
            </div>
            <div className="pn5-opening-line" aria-hidden="true"><span /><i /></div>
          </section>

          <section className="pn5-chapter" id="pn5-capital" data-chapter="capital">
            <header className="pn5-chapter-heading"><span>01</span><div><small>El punto de partida</small><h2>El capital que pusiste en movimiento.</h2></div></header>
            <p className="pn5-prose pn5-long-copy">A lo largo del periodo aportaste <button type="button" onClick={() => openFact('capital')}>{formatCurrency(contributedCapital)}</button>. Después de las retiradas, el capital neto que permanece como base de la inversión es:</p>
            <button type="button" className="pn5-monument" onClick={() => openFact('capital')}>
              <span>Capital neto aportado</span><strong>{formatCurrency(netCapital)}</strong><small>{formatCurrency(contributedCapital)} aportados − {formatCurrency(withdrawnCapital)} retirados</small>
            </button>
            <div className="pn5-movement-ledger">
              <header><span>Fecha</span><span>Decisión de capital</span><span>Importe</span></header>
              {allMovements.length ? allMovements.map((movement, index) => (
                <article key={`${movement.iso}-${movement.type}-${index}`}>
                  <time>{formatDate(movement.iso)}</time>
                  <span><i className={movement.type === 'increment' ? 'is-entry' : 'is-exit'} />{movement.type === 'increment' ? 'Aportación incorporada' : 'Capital retirado'}{movement.pending ? <em>Pendiente de cierre</em> : null}</span>
                  <strong className={movement.type === 'increment' ? 'is-positive' : 'is-negative'}>{movement.type === 'increment' ? '+' : '−'}{formatCurrency(movement.amount)}</strong>
                </article>
              )) : <p>No hay movimientos de capital registrados en este periodo.</p>}
            </div>
          </section>

          <section className="pn5-chapter" id="pn5-growth" data-chapter="growth">
            <header className="pn5-chapter-heading"><span>02</span><div><small>El resultado</small><h2>Lo que creció por el camino.</h2></div></header>
            <p className="pn5-prose pn5-long-copy">Los cierres mensuales fueron añadiendo resultado a la cartera. En total, la inversión ha generado <button type="button" onClick={() => openFact('profit')}>{signedMoney(totalProfit)}</button>, y {positiveMonths} de los {months.length} meses publicados terminaron con beneficio positivo.</p>
            <button type="button" className="pn5-monument is-profit" onClick={() => openFact('profit')}>
              <span>Beneficio acumulado</span><strong className={totalProfit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(totalProfit)}</strong><small>{signedPercent(totalReturn)} sobre el capital neto aportado</small>
            </button>
            {bestMonth ? (
              <aside className="pn5-highlight">
                <span>El capítulo más productivo</span>
                <strong>{bestMonth.label}</strong>
                <p>Ese cierre añadió {signedMoney(bestMonth.profit)} con una rentabilidad mensual del {signedPercent(bestMonth.returnPct)}.</p>
              </aside>
            ) : null}
            <div className="pn5-monthly-story" aria-label="Historia del beneficio mensual">
              {months.map((month) => (
                <article key={month.key}>
                  <span>{month.shortLabel}</span>
                  <i><b style={{ width: `${Math.max(2, Math.abs(month.profit) / maxMonthlyProfit * 100)}%` }} className={month.profit >= 0 ? 'is-positive' : 'is-negative'} /></i>
                  <strong className={month.profit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(month.profit)}</strong>
                  <small>{signedPercent(month.returnPct)}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="pn5-chapter" id="pn5-method" data-chapter="method">
            <header className="pn5-chapter-heading"><span>03</span><div><small>La forma de medir</small><h2>Cómo leemos el avance.</h2></div></header>
            <p className="pn5-prose pn5-long-copy">Para conocer cómo se comportó la inversión usamos el TWR. Esta medida enlaza la rentabilidad de cada periodo y separa el efecto de tus aportaciones y retiradas. Así, un ingreso aumenta el saldo, pero no se confunde con rentabilidad.</p>
            <button type="button" className="pn5-monument is-twr" onClick={() => openFact('twr')}>
              <span>TWR acumulado</span><strong className={twr >= 0 ? 'is-positive' : 'is-negative'}>{signedPercent(twr)}</strong><small>Desde {firstMonth?.label ?? 'el primer cierre'} hasta {latestMonth?.label ?? 'el último cierre'}</small>
            </button>
            <div className="pn5-method-example pn5-long-copy">
              <span>Una forma sencilla de entenderlo</span>
              <p>Si una cartera pasa de 10.000 € a 11.000 €, ha avanzado un 10 %. Si después se añaden 20.000 €, el saldo crece, pero ese ingreso no altera el 10 % ya conseguido por la estrategia.</p>
            </div>
          </section>

          <section className="pn5-chapter pn5-closing" id="pn5-today" data-chapter="today">
            <header className="pn5-chapter-heading"><span>04</span><div><small>La posición actual</small><h2>Dónde estás hoy.</h2></div></header>
            <p className="pn5-prose pn5-long-copy">Toda la historia termina en una ecuación transparente. El capital que permanece invertido, sumado al resultado acumulado, forma el valor actual de la cartera.</p>
            <div className="pn5-final-equation">
              <span><small>Capital neto</small><strong>{formatCurrency(netCapital)}</strong></span>
              <b>+</b>
              <span><small>Beneficio acumulado</small><strong className={totalProfit >= 0 ? 'is-positive' : 'is-negative'}>{signedMoney(totalProfit)}</strong></span>
              <b>=</b>
              <span className="is-total"><small>Saldo actual</small><strong>{formatCurrency(visibleBalance)}</strong></span>
            </div>
            <blockquote>“Una buena lectura patrimonial no consiste en mostrar más números, sino en explicar cómo se relacionan.”</blockquote>
            <div className="pn5-signature"><i /><span>El equipo de gestión<small>JIGSA Capital</small></span></div>
          </section>
        </main>

        <aside className="pn5-margin-notes" aria-label="Anotaciones de la carta">
          <section>
            <span>Trayectoria del saldo</span>
            <svg viewBox="0 0 100 42" role="img" aria-label="Evolución resumida del saldo">
              <polyline points={sparklinePoints} />
              {months.length ? <circle cx="100" cy={sparklineLastY} r="2.2" /> : null}
            </svg>
            <strong>{formatCurrency(visibleBalance)}</strong>
            <small>{firstMonth?.shortLabel ?? 'Inicio'} → {latestMonth?.shortLabel ?? 'Actualidad'}</small>
          </section>
          {bestMonth ? <section><span>Mes destacado</span><strong>{bestMonth.label}</strong><small>{signedMoney(bestMonth.profit)} · {signedPercent(bestMonth.returnPct)}</small></section> : null}
          <section className="pn5-reading-key"><span>Clave de lectura</span><p>Pulsa cualquier cifra principal para abrir su explicación exacta.</p></section>
        </aside>
      </div>

      <footer className="pn5-footer"><span>JIGSA</span><strong>Carta patrimonial · {report.clientCode}</strong><small>Lectura 05</small></footer>

      {selectedFactData ? createPortal(
        <div className="pn5-fact-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedFact(null);
        }}>
          <aside className="pn5-fact-sheet" role="dialog" aria-modal="true" aria-labelledby="pn5-fact-title">
            <button type="button" className="pn5-fact-close" aria-label="Cerrar explicación" onClick={() => setSelectedFact(null)}>×</button>
            <span>{selectedFactData.eyebrow}</span>
            <strong>{selectedFactData.value}</strong>
            <h2 id="pn5-fact-title">{selectedFactData.title}</h2>
            <p>{selectedFactData.body}</p>
            <small>{selectedFactData.foot}</small>
          </aside>
        </div>,
        document.body
      ) : null}
    </div>
  );
};
