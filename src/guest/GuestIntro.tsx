import React, { useEffect, useRef, useState } from 'react';
import { tourIcon } from '../components/NewsTour';

// Presentacion corta de "Como funciona" al entrar en la demostracion.

interface Slide {
  color: string;
  icon: React.ReactNode;
  title: string;
  text: string;
}

const SLIDES: Slide[] = [
  {
    color: '#087b83',
    icon: tourIcon(<path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6" />),
    title: 'Bienvenido a tu área de cliente',
    text: 'Aquí verás en todo momento cómo va tu inversión: tu saldo, tus beneficios y cada movimiento, desde el móvil o el ordenador.'
  },
  {
    color: '#16a34a',
    icon: tourIcon(<path d="M12 5v14M5 12h14" />),
    title: 'Aportas tu capital',
    text: 'Empiezas con una aportación inicial y puedes hacer aportaciones adicionales cuando quieras. Cada una queda registrada con su justificante.'
  },
  {
    color: '#2563eb',
    icon: tourIcon(<path d="M4 5h16v15H4zM4 10h16M9 3v4M15 3v4" />),
    title: 'Cada mes se cierra tu resultado',
    text: 'Al final de cada mes se calcula la rentabilidad y se actualiza tu saldo. Puedes consultar el detalle mes a mes.'
  },
  {
    color: '#ea580c',
    icon: tourIcon(<path d="M12 19V5M6 11l6-6 6 6" />),
    title: 'Retiras cuando quieras',
    text: 'La comisión de éxito, del 8 %, solo se aplica a la parte retirada que supera lo que has aportado. Mientras recuperas tu capital, no hay comisión.'
  },
  {
    color: '#7c3aed',
    icon: tourIcon(<path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4" />),
    title: 'Todo documentado',
    text: 'Justificante de cada movimiento, informe en PDF e información fiscal para tu declaración. Y si tienes dudas, escribes a administración desde la web.'
  }
];

interface GuestIntroProps {
  onStartTour: () => void;
  onClose: () => void;
}

export const GuestIntro: React.FC<GuestIntroProps> = ({ onStartTour, onClose }) => {
  const [index, setIndex] = useState(0);
  const nextRef = useRef<HTMLButtonElement>(null);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, [index]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight' && !isLast) setIndex((value) => value + 1);
      if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isLast, onClose]);

  return (
    <div className="gx-intro" role="dialog" aria-modal="true" aria-label="Cómo funciona" style={{ '--gx-color': slide.color } as React.CSSProperties}>
      <div className="gx-intro-card" key={index}>
        <div className="gx-intro-top">
          <span>Cómo funciona · {index + 1} de {SLIDES.length}</span>
          <button type="button" className="gx-intro-skip" onClick={onClose}>Saltar ✕</button>
        </div>
        <div className="gx-intro-icon" aria-hidden="true">{slide.icon}</div>
        <h2>{slide.title}</h2>
        <p>{slide.text}</p>
        <div className="gx-intro-dots" aria-hidden="true">
          {SLIDES.map((item, dot) => <i key={item.title} className={dot === index ? 'is-on' : ''} />)}
        </div>
        <div className="gx-intro-actions">
          {index > 0 ? <button type="button" className="gx-intro-ghost" onClick={() => setIndex(index - 1)}>Anterior</button> : <span />}
          <button
            ref={nextRef}
            type="button"
            className="gx-intro-next"
            onClick={() => (isLast ? onStartTour() : setIndex(index + 1))}
          >
            {isLast ? 'Ver la web por dentro' : 'Siguiente'}
          </button>
        </div>
        <small>Demostración con datos ficticios</small>
      </div>
    </div>
  );
};
