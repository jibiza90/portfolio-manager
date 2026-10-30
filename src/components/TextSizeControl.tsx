import React, { useCallback, useEffect, useState } from 'react';
import './TextSizeControl.css';

// Tamaño de letra del area de cliente: el cliente elige Normal, Grande o Muy grande.
// Se guarda solo en su navegador (no en la base de datos). Se aplica con "zoom" al contenido de la pagina;
// las ventanas, globos de ayuda y visitas guiadas quedan fuera para que no se descoloquen.

export type TextSizeLevel = 'normal' | 'grande' | 'muy-grande';

const STORAGE_KEY = 'jigsa-text-size';

const LEVELS: Array<{ id: TextSizeLevel; label: string; desktop: number; phone: number; tinyPhone: number }> = [
  { id: 'normal', label: 'Normal', desktop: 1, phone: 1, tinyPhone: 1 },
  { id: 'grande', label: 'Grande', desktop: 1.15, phone: 1.08, tinyPhone: 1.04 },
  { id: 'muy-grande', label: 'Muy grande', desktop: 1.3, phone: 1.16, tinyPhone: 1.08 }
];

// En portatiles (13-15") la letra se veia pequeña: un poco mas grande por defecto.
const LAPTOP_MIN_WIDTH = 1024;
const LAPTOP_MAX_WIDTH = 1599;
const LAPTOP_BOOST = 1.08;
const PHONE_MAX_WIDTH = 640;
// Moviles muy pequeños (320-340 px): aumento mas contenido para que nada se salga.
const TINY_PHONE_MAX_WIDTH = 340;

const readLevel = (): TextSizeLevel => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return LEVELS.some((level) => level.id === stored) ? (stored as TextSizeLevel) : 'normal';
  } catch {
    return 'normal';
  }
};

export const getTextZoom = (level: TextSizeLevel, viewportWidth: number) => {
  const entry = LEVELS.find((item) => item.id === level) ?? LEVELS[0];
  if (viewportWidth <= TINY_PHONE_MAX_WIDTH) return entry.tinyPhone;
  if (viewportWidth <= PHONE_MAX_WIDTH) return entry.phone;
  const boost = viewportWidth >= LAPTOP_MIN_WIDTH && viewportWidth <= LAPTOP_MAX_WIDTH ? LAPTOP_BOOST : 1;
  return Math.round(entry.desktop * boost * 1000) / 1000;
};

export const useTextSize = () => {
  const [level, setLevelState] = useState<TextSizeLevel>(readLevel);
  const [width, setWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const setLevel = useCallback((next: TextSizeLevel) => {
    setLevelState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Sin almacenamiento: el tamaño se mantiene mientras la pagina este abierta.
    }
  }, []);

  const zoom = getTextZoom(level, width);
  return { level, setLevel, zoom, zoomStyle: (zoom === 1 ? undefined : { zoom }) as React.CSSProperties | undefined };
};

interface TextSizeControlProps {
  level: TextSizeLevel;
  onChange: (level: TextSizeLevel) => void;
}

export const TextSizeControl: React.FC<TextSizeControlProps> = ({ level, onChange }) => (
  <section className="tsc-bar" data-tour="letra" aria-label="Tamaño de letra">
    <div className="tsc-text">
      <span className="tsc-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5L21 21M8 10.5h5M10.5 8v5" />
        </svg>
      </span>
      <div>
        <strong>Tamaño de letra</strong>
        <span>¿Te cuesta leer? Pulsa un tamaño más grande.</span>
      </div>
    </div>
    <div className="tsc-options" role="radiogroup" aria-label="Elige el tamaño de letra">
      {LEVELS.map((item, index) => {
        const selected = item.id === level;
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`tsc-option${selected ? ' is-selected' : ''}`}
            onClick={() => onChange(item.id)}
          >
            <span className={`tsc-letter is-${index}`} aria-hidden="true">A</span>
            <span className="tsc-label">{item.label}</span>
            {selected ? <span className="tsc-check" aria-hidden="true">✓</span> : null}
          </button>
        );
      })}
    </div>
  </section>
);
