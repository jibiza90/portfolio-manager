import React, { useCallback, useEffect, useState } from 'react';
import { ReportView } from '../components/ReportView';
import { GuidedTour, tourIcon, type TourStep } from '../components/NewsTour';
import { GuestIntro } from './GuestIntro';
import { TextSizeControl, useTextSize } from '../components/TextSizeControl';
import { FullscreenButton } from '../components/FullscreenButton';
import {
  GUEST_CODE,
  GUEST_HOLDER_NAME,
  guestCommissions,
  guestMessages,
  guestPayload,
  guestPendingMovements,
  guestReport
} from './guestData';
import './GuestApp.css';

// Demostracion /invitado: area de cliente con datos ficticios. No usa la base de datos ni guarda nada en ella.

const AnnualReturnsPanel = React.lazy(() => import('../components/AnnualReturns').then((module) => ({ default: module.AnnualReturnsPanel })));

const palette = {
  bg: '#f2f0ea',
  text: '#1f1d1b',
  muted: '#5f5a52',
  card: '#ffffff',
  cardAlt: '#f7f4ee',
  border: '#d7d2c8',
  accent: '#0f6d7a'
};

const INTRO_SEEN_KEY = 'jigsa-guest-intro-seen';

const readIntroSeen = () => {
  try {
    return window.localStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
};

const markIntroSeen = () => {
  try {
    window.localStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    // Sin almacenamiento: la presentacion volvera a salir la proxima vez.
  }
};

const GUEST_STEPS: TourStep[] = [
  {
    id: 'letra',
    target: '[data-tour="letra"]',
    color: '#087b83',
    icon: tourIcon(<path d="M4 19l5-14h2l5 14M6.5 13h7M17 8h4M19 6v4" />),
    title: 'Tamaño de letra',
    text: 'Si te cuesta leer, pulsa Grande o Muy grande y toda la página se verá más grande. Se queda guardado en este dispositivo.'
  },
  {
    id: 'resumen',
    target: '[data-tour="resumen"]',
    color: '#087b83',
    icon: tourIcon(<path d="M4 19h16M7 16V9M12 16V5M17 16v-4" />),
    title: 'Tu resumen',
    text: 'Arriba del todo ves tu saldo actual y la rentabilidad y el beneficio del último mes cerrado.'
  },
  {
    id: 'en-curso',
    target: '[data-tour="en-curso"]',
    color: '#d97706',
    icon: tourIcon(<path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />),
    title: 'Movimientos en curso',
    text: 'Si aportas o retiras después del último cierre, aparece aquí y tu saldo ya lo incluye. La rentabilidad se actualiza en el siguiente cierre.'
  },
  {
    id: 'capital',
    target: '[data-tour="capital"]',
    color: '#16a34a',
    icon: tourIcon(<path d="M12 3v18M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6" />),
    title: 'Tu capital y tu beneficio',
    text: 'Capital aportado, capital retirado, rentabilidad acumulada y beneficio total. Toca el capital aportado o el retirado para ver cada movimiento.'
  },
  {
    id: 'patrimonio',
    target: '[data-tour="patrimonio"]',
    tryTarget: '[data-tour="patrimonio"] .report-pro-expand-chart-button',
    color: '#087b83',
    icon: tourIcon(<path d="M4 19h16M5 15l4-4 4 3 6-7" />),
    title: 'Evolución de tu patrimonio',
    text: 'Mira cómo ha evolucionado tu patrimonio mes a mes, con el saldo, el beneficio y la rentabilidad de cada mes.'
  },
  {
    id: 'historial',
    target: '[data-tour="historial"]',
    color: '#2563eb',
    icon: tourIcon(<path d="M4 5h16v15H4zM4 10h16M9 3v4M15 3v4" />),
    title: 'Mes a mes',
    text: 'Cada cierre mensual con su saldo, sus aportaciones y retiradas, el beneficio y la rentabilidad. Puedes abrir cada mes para ver el detalle.'
  },
  {
    id: 'justificantes',
    target: '[data-tour="justificante"]',
    tryTarget: '[data-tour="justificante"]',
    color: '#16a34a',
    icon: tourIcon(<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3" />),
    title: 'Justificante de cada movimiento',
    text: 'Pulsa Descargar en cualquier aportación o retirada y elige el justificante extendido o el resumido. En las retiradas verás la comisión y el total entregado.'
  },
  {
    id: 'retiradas',
    target: '[data-tour="retiradas"]',
    color: '#ea580c',
    icon: tourIcon(<path d="M12 21V11M12 11L6 4M12 11l6-6M6 4v4M6 4h4M18 4v4M18 4h-4" />),
    title: 'Qué ocurrió con cada aportación',
    text: 'Elige una aportación y verás sus retiradas, cuánto ha rendido cada una y de qué aportación sale el dinero.'
  },
  {
    id: 'pdf',
    target: '[data-tour="pdf"]',
    tryTarget: '[data-tour="pdf"]',
    color: '#0f6d7a',
    icon: tourIcon(<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />),
    title: 'Tu informe en PDF',
    text: 'Descarga tu informe completo en PDF cuando quieras, para guardarlo o imprimirlo.'
  },
  {
    id: 'fiscal',
    target: '[data-tour="fiscal"]',
    tryTarget: '[data-tour="fiscal"]',
    color: '#7c3aed',
    icon: tourIcon(<path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4" />),
    title: 'Información fiscal',
    text: 'Descarga el informe de rendimientos del año que quieras para tu declaración de la renta.'
  },
  {
    id: 'mensajes',
    target: '[data-tour="mensajes"]',
    tryTarget: '[data-tour="mensajes"]',
    color: '#db2777',
    icon: tourIcon(<path d="M4 5h16v11H8l-4 4zM8 9h8M8 12h5" />),
    title: 'Mensajes con administración',
    text: 'Escribe tus dudas desde la web y recibe la respuesta en el mismo hilo.'
  }
];

const actionStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 10,
  border: `1px solid ${palette.border}`,
  background: '#ffffff',
  color: palette.text,
  fontWeight: 600,
  cursor: 'pointer'
};

const formatMessageDate = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const GuestApp: React.FC = () => {
  const [introOpen, setIntroOpen] = useState(() => !readIntroSeen());
  const [tourOpen, setTourOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [fiscalOpen, setFiscalOpen] = useState(false);
  const [downloadSignal, setDownloadSignal] = useState(0);
  const textSize = useTextSize();

  useEffect(() => {
    document.title = 'Demostración · Área Cliente';
  }, []);

  const closeIntro = useCallback(() => {
    markIntroSeen();
    setIntroOpen(false);
  }, []);

  const startTour = useCallback(() => {
    markIntroSeen();
    setIntroOpen(false);
    window.scrollTo({ top: 0 });
    setTourOpen(true);
  }, []);

  const closeTour = useCallback(() => setTourOpen(false), []);

  return (
    <main
      className="client-portal-page gx-page"
      style={{
        minHeight: '100vh',
        padding: '24px 16px',
        maxWidth: 980,
        margin: '0 auto',
        background: `radial-gradient(circle at top right, rgba(15,109,122,0.12), transparent 40%), ${palette.bg}`,
        color: palette.text
      }}
    >
      <div className="gx-banner">
        <div>
          <strong>Demostración</strong>
          <span>Así ve un cliente su área personal. Cliente y movimientos ficticios.</span>
        </div>
        <div className="gx-banner-actions">
          <button type="button" onClick={() => setIntroOpen(true)}>Cómo funciona</button>
          <button type="button" className="is-main" onClick={() => { window.scrollTo({ top: 0 }); setTourOpen(true); }}>Visita guiada</button>
        </div>
      </div>

      <header
        className="client-portal-toolbar"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
          border: `1px solid ${palette.border}`,
          background: palette.card,
          borderRadius: 14,
          padding: '12px 14px',
          ...textSize.zoomStyle
        }}
      >
        <div className="client-portal-toolbar-title">
          <h1 style={{ margin: 0, color: palette.text }}>Área Cliente</h1>
        </div>
        <div className="client-portal-toolbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="client-portal-user" style={{ fontSize: 13, color: palette.muted }}>{GUEST_HOLDER_NAME}</span>
          <button type="button" className="client-portal-action" data-tour="mensajes" onClick={() => setMessagesOpen((value) => !value)} style={actionStyle}>
            Mensajes
          </button>
          <button type="button" className="client-portal-action" data-tour="pdf" onClick={() => setDownloadSignal((value) => value + 1)} style={actionStyle}>
            Descargar PDF
          </button>
          <button type="button" className="client-portal-action" data-tour="fiscal" onClick={() => setFiscalOpen(true)} style={actionStyle}>
            Información fiscal
          </button>
          <FullscreenButton className="client-portal-action" style={actionStyle} />
        </div>
      </header>

      <TextSizeControl level={textSize.level} onChange={textSize.setLevel} />

      {messagesOpen ? (
        <section className="client-portal-support gx-messages" aria-label="Mensajes con administración" style={textSize.zoomStyle}>
          <div className="gx-messages-head">
            <strong>Mensajes con administración</strong>
            <span>Respuesta en el mismo hilo.</span>
          </div>
          <div className="gx-messages-list">
            {guestMessages.map((message) => (
              <div key={message.at} className={`gx-message is-${message.from}`}>
                <small>{message.from === 'client' ? 'Tú' : 'Administración'} • {formatMessageDate(message.at)}</small>
                <p>{message.text}</p>
              </div>
            ))}
          </div>
          <div className="gx-messages-compose">
            <textarea rows={2} disabled placeholder="En la demostración no se pueden enviar mensajes." />
          </div>
        </section>
      ) : null}

      {fiscalOpen ? (
        <div role="dialog" aria-modal="true" aria-label="Información fiscal" style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(10,20,35,.45)', overflowY: 'auto', padding: '24px 16px' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', background: '#f6f8f9', borderRadius: 18, padding: 20, display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div><strong style={{ fontSize: 20 }}>Información fiscal</strong><div style={{ fontSize: 13, color: palette.muted }}>Informe anual de rendimientos</div></div>
              <button type="button" onClick={() => setFiscalOpen(false)} style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: '8px 14px', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>Cerrar</button>
            </div>
            <React.Suspense fallback={<p style={{ color: palette.muted }}>Preparando el informe...</p>}>
              <AnnualReturnsPanel
                source={guestPayload}
                commissions={guestCommissions}
                holderName={GUEST_HOLDER_NAME}
                clientCode={GUEST_CODE}
                clientId={guestPayload.clientId}
              />
            </React.Suspense>
          </div>
        </div>
      ) : null}

      <div className="client-portal-text-zoom" style={textSize.zoomStyle}>
        <ReportView
          reportData={guestReport}
          downloadSignal={downloadSignal}
          pendingCashMovements={guestPendingMovements}
          knownCommissions={guestCommissions}
        />
      </div>

      <footer className="gx-disclaimer" style={textSize.zoomStyle}>
        El cliente y los importes son ficticios. Las rentabilidades son las reales de la cartera.
        Rentabilidades pasadas no garantizan rentabilidades futuras.
      </footer>

      {introOpen ? <GuestIntro onStartTour={startTour} onClose={closeIntro} /> : null}
      {tourOpen ? (
        <GuidedTour
          steps={GUEST_STEPS}
          ariaLabel="Visita guiada"
          eventType="guest_tour"
          onClose={closeTour}
        />
      ) : null}
    </main>
  );
};
