import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './FullscreenButton.css';

// Boton de pantalla completa (demo1 e /invitado). Al entrar, un aviso en el centro durante unos segundos
// explica como volver. No sale donde el navegador no lo permite (por ejemplo, el iPhone).

const HINT_MS = 2400;

const canFullscreen = () => typeof document !== 'undefined' && document.fullscreenEnabled === true;

export const FullscreenButton: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => {
  const [active, setActive] = useState(() => typeof document !== 'undefined' && Boolean(document.fullscreenElement));
  const [hint, setHint] = useState(false);
  const timer = useRef(0);
  const touch = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);

  useEffect(() => {
    const onChange = () => {
      const isActive = Boolean(document.fullscreenElement);
      setActive(isActive);
      window.clearTimeout(timer.current);
      if (isActive) {
        setHint(true);
        timer.current = window.setTimeout(() => setHint(false), HINT_MS);
      } else {
        setHint(false);
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.clearTimeout(timer.current);
    };
  }, []);

  if (!canFullscreen()) return null;

  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };

  return (
    <>
      <button type="button" className={`fsb-button ${className ?? ''}`.trim()} style={style} onClick={toggle} aria-pressed={active}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {active
            ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
            : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
        </svg>
        {active ? 'Salir de pantalla completa' : 'Pantalla completa'}
      </button>
      {hint && typeof document !== 'undefined'
        ? createPortal(
          <div className="fsb-hint" role="status">
            {touch
              ? <>Para volver, pulsa <b>Salir de pantalla completa</b></>
              : <>Pulsa <kbd>Esc</kbd> para volver a la pantalla normal</>}
          </div>,
          document.body
        )
        : null}
    </>
  );
};
