import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './NewsTour.css';

// Visita guiada de novedades del area de cliente (de momento solo demo1).
// Solo lee la pagina: lleva al cliente a cada apartado y lo ilumina. No guarda nada en la base de datos.

export interface TourStep {
  id: string;
  target: string;
  // Que pulsar con "Probar" (si no hay, no sale el boton).
  tryTarget?: string;
  color: string;
  icon: React.ReactNode;
  title: string;
  text: string;
}

// Cambiar la version cuando haya novedades nuevas para que la visita vuelva a salir.
const TOUR_VERSION = '2026-10';
const STORAGE_KEY = 'jigsa-news-tour-seen';

export const tourIcon = (path: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
);

const STEPS: TourStep[] = [
  {
    id: 'patrimonio',
    target: '[data-tour="patrimonio"]',
    tryTarget: '[data-tour="patrimonio"] .report-pro-expand-chart-button',
    color: '#087b83',
    icon: tourIcon(<path d="M4 19h16M5 15l4-4 4 3 6-7" />),
    title: 'Nuevo gráfico de tu patrimonio',
    text: 'Mira cómo ha evolucionado tu patrimonio mes a mes, con el saldo, el beneficio y la rentabilidad de cada mes.'
  },
  {
    id: 'retiradas',
    target: '[data-tour="retiradas"]',
    color: '#ea580c',
    icon: tourIcon(<path d="M12 21V11M12 11L6 4M12 11l6-7M6 4v4M6 4h4M18 4v4M18 4h-4" />),
    title: 'Rentabilidad de cada retirada',
    text: 'Elige una aportación y verás sus retiradas, cuánto ha rendido cada una y de qué aportación sale el dinero.'
  },
  {
    id: 'justificantes',
    target: '[data-tour="justificante"]',
    tryTarget: '[data-tour="justificante"]',
    color: '#16a34a',
    icon: tourIcon(<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3" />),
    title: 'Justificante de cada movimiento',
    text: 'Pulsa Descargar en cualquier aportación o retirada y elige el justificante extendido o el resumido.'
  },
  {
    id: 'fiscal',
    target: '[data-tour="fiscal"]',
    tryTarget: '[data-tour="fiscal"]',
    color: '#7c3aed',
    icon: tourIcon(<path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4" />),
    title: 'Información fiscal',
    text: 'Descarga el informe de rendimientos del año que quieras para tu declaración de la renta.'
  }
];

export const hasSeenNewsTour = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === TOUR_VERSION;
  } catch {
    return false;
  }
};

const markNewsTourSeen = () => {
  try {
    window.localStorage.setItem(STORAGE_KEY, TOUR_VERSION);
  } catch {
    // Sin almacenamiento (modo privado): la visita volvera a salir, sin mas.
  }
};

const isModalOpen = () => Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
const isMobile = () => window.innerWidth < 640;

interface Rect { top: number; left: number; width: number; height: number }

const sameRect = (a: Rect | null, b: Rect | null) => (
  a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height)
);

// Si el apartado esta dentro de una tabla que se desliza de lado (movil), la mueve hasta el.
const revealHorizontally = (element: Element) => {
  let parent = element.parentElement;
  while (parent && parent !== document.body) {
    if (parent.scrollWidth > parent.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(parent).overflowX)) {
      const box = element.getBoundingClientRect();
      const frame = parent.getBoundingClientRect();
      if (box.left < frame.left || box.right > frame.right) {
        parent.scrollLeft += box.left - frame.left - (frame.width - box.width) / 2;
      }
    }
    parent = parent.parentElement;
  }
};

const scrollToTarget = (element: Element) => {
  revealHorizontally(element);
  if (isMobile()) {
    const top = element.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  } else {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
};

interface TourEvents {
  onClose: () => void;
  onEvent?: (event: { type: string; label: string }) => void;
}

interface GuidedTourProps extends TourEvents {
  steps: TourStep[];
  // Etiqueta naranja encima del titulo ("Nuevo"); sin ella no sale.
  badge?: string;
  ariaLabel: string;
  eventType: string;
  // Al terminar o saltar la visita (no al cerrar la pagina a medias).
  onFinish?: () => void;
}

// Visita generica: va paso a paso por los apartados que existan en la pagina.
export const GuidedTour: React.FC<GuidedTourProps> = ({ steps: allSteps, badge, ariaLabel, eventType, onFinish, onClose, onEvent }) => {
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [paused, setPaused] = useState(false);
  const [bubbleHeight, setBubbleHeight] = useState(220);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const bubbleRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  // Espera a que el informe este pintado y se queda con los pasos que existen en la pagina.
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const check = () => {
      if (cancelled) return;
      tries += 1;
      const ready = allSteps.some((step) => document.querySelector(step.target));
      if (ready && !isModalOpen()) {
        window.setTimeout(() => {
          if (cancelled) return;
          const available = allSteps.filter((step) => document.querySelector(step.target));
          if (available.length === 0) onClose();
          else setSteps(available);
        }, 500);
        return;
      }
      if (tries > 60) {
        onClose();
        return;
      }
      window.setTimeout(check, 400);
    };
    check();
    return () => { cancelled = true; };
  }, [allSteps, onClose]);

  const step = steps?.[index] ?? null;

  // Sigue al apartado mientras se mueve la pagina; se esconde si hay una ventana abierta.
  useEffect(() => {
    if (!step) return undefined;
    let frame = 0;
    const loop = () => {
      const modal = isModalOpen();
      setPaused((value) => (value === modal ? value : modal));
      const element = document.querySelector(step.target);
      if (element) {
        const box = element.getBoundingClientRect();
        const next = { top: Math.round(box.top), left: Math.round(box.left), width: Math.round(box.width), height: Math.round(box.height) };
        setRect((current) => (sameRect(current, next) ? current : next));
      }
      setViewport((current) => (
        current.width === window.innerWidth && current.height === window.innerHeight ? current : { width: window.innerWidth, height: window.innerHeight }
      ));
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [step]);

  useEffect(() => {
    if (!step) return;
    const element = document.querySelector(step.target);
    if (element) scrollToTarget(element);
    nextRef.current?.focus({ preventScroll: true });
  }, [step]);

  useLayoutEffect(() => {
    if (bubbleRef.current) setBubbleHeight(bubbleRef.current.offsetHeight);
  });

  const finish = useCallback((reason: 'done' | 'skip') => {
    onFinish?.();
    onEvent?.({ type: eventType, label: reason === 'done' ? 'Terminada' : `Saltada en ${steps?.[index]?.id ?? ''}` });
    onClose();
  }, [eventType, index, onClose, onEvent, onFinish, steps]);

  useEffect(() => {
    if (!step || paused) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish('skip');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish, paused, step]);

  if (!steps || !step || paused) return null;

  const isLast = index === steps.length - 1;
  const mobile = viewport.width < 640;
  const width = Math.min(380, viewport.width - 32);
  const gap = 16;
  const pad = 6;

  let bubbleStyle: React.CSSProperties;
  let arrow: { side: 'top' | 'bottom'; x: number } | null = null;
  // Si el apartado no se ve (el cliente ha movido la pagina), el globo se queda en una esquina: nunca fuera de la pantalla.
  const targetVisible = !!rect && rect.top + rect.height > 0 && rect.top < viewport.height;
  if (mobile || !rect) {
    bubbleStyle = { left: 12, right: 12, bottom: 12 };
  } else if (!targetVisible) {
    bubbleStyle = { right: 24, bottom: 24, width };
  } else {
    const left = Math.min(Math.max(rect.left, 16), viewport.width - width - 16);
    const below = rect.top + rect.height + pad + gap;
    const above = rect.top - pad - gap - bubbleHeight;
    const arrowX = Math.min(Math.max(rect.left + rect.width / 2 - left, 28), width - 28);
    if (below + bubbleHeight <= viewport.height - 12) {
      bubbleStyle = { left, top: below, width };
      arrow = { side: 'top', x: arrowX };
    } else if (above >= 12) {
      bubbleStyle = { left, top: above, width };
      arrow = { side: 'bottom', x: arrowX };
    } else {
      bubbleStyle = { right: 24, bottom: 24, width };
    }
  }

  const tryIt = () => {
    if (!step.tryTarget) return;
    const element = document.querySelector<HTMLElement>(step.tryTarget);
    onEvent?.({ type: eventType, label: `Probar ${step.id}` });
    element?.click();
  };

  return (
    <div className="nt-root" style={{ '--nt-color': step.color } as React.CSSProperties}>
      {rect ? (
        <div
          className="nt-spot"
          aria-hidden="true"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        />
      ) : <div className="nt-shade" aria-hidden="true" />}
      <div
        ref={bubbleRef}
        key={step.id}
        className={`nt-bubble${mobile ? ' is-sheet' : ''}`}
        role="dialog"
        aria-modal="false"
        aria-label={ariaLabel}
        style={bubbleStyle}
      >
        {arrow ? <span className={`nt-arrow is-${arrow.side}`} style={{ left: arrow.x }} aria-hidden="true" /> : null}
        <div className="nt-body">
          <div className="nt-icon" aria-hidden="true">{step.icon}</div>
          <div className="nt-copy">
            <div className="nt-top">
              <span className="nt-badges">
                {badge ? <span className="nt-new">{badge}</span> : null}
                <span className="nt-count">{index + 1} de {steps.length}</span>
              </span>
              <button type="button" className="nt-skip" onClick={() => finish('skip')}>Saltar ✕</button>
            </div>
            <p className="nt-title" aria-live="polite">{step.title}</p>
            <p className="nt-text">{step.text}</p>
          </div>
        </div>
        <div className="nt-bar" aria-hidden="true"><i style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div>
        <div className="nt-actions">
          {step.tryTarget ? <button type="button" className="nt-try" onClick={tryIt}>Probar</button> : <span />}
          <div>
            {index > 0 ? <button type="button" className="nt-ghost" onClick={() => setIndex(index - 1)}>Anterior</button> : null}
            <button
              ref={nextRef}
              type="button"
              className="nt-next"
              onClick={() => (isLast ? finish('done') : setIndex(index + 1))}
            >
              {isLast ? '¡Entendido!' : 'Siguiente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Visita de novedades del area de cliente (de momento solo demo1).
export const NewsTour: React.FC<TourEvents> = ({ onClose, onEvent }) => (
  <GuidedTour
    steps={STEPS}
    badge="Nuevo"
    ariaLabel="Novedades de la web"
    eventType="news_tour"
    onFinish={markNewsTourSeen}
    onClose={onClose}
    onEvent={onEvent}
  />
);
