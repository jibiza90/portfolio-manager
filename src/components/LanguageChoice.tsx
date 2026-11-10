import React, { useCallback, useEffect, useState } from 'react';
import { translate, useLang, type Lang } from '../i18n';
import {
  fetchClientLanguage,
  readCachedLanguage,
  readSessionLanguage,
  saveClientLanguage,
  writeSessionLanguage
} from '../services/languagePreference';
import './LanguageChoice.css';

// Banderas dibujadas (los emojis de banderas no se ven en Windows).
export const FlagEs: React.FC = () => (
  <svg className="lc-flag" viewBox="0 0 30 20" aria-hidden="true">
    <rect width="30" height="20" fill="#c60b1e" />
    <rect y="5" width="30" height="10" fill="#ffc400" />
  </svg>
);

export const FlagCa: React.FC = () => (
  <svg className="lc-flag" viewBox="0 0 27 18" aria-hidden="true">
    <rect width="27" height="18" fill="#fcdd09" />
    {[2, 6, 10, 14].map((y) => <rect key={y} y={y} width="27" height="2" fill="#da121a" />)}
  </svg>
);

const NAMES: Record<Lang, string> = { es: 'Castellano', ca: 'Català' };
const SHORT: Record<Lang, string> = { es: 'ES', ca: 'CA' };
const Flag: React.FC<{ lang: Lang }> = ({ lang }) => (lang === 'ca' ? <FlagCa /> : <FlagEs />);

// Idioma del cliente: el guardado (Firebase), salvo que haya elegido otro "solo esta vez".
export const useClientLanguage = (clientId: string, enabled: boolean) => {
  const [saved, setSaved] = useState<Lang | null>(() => (enabled ? readCachedLanguage(clientId) : null));
  const [session, setSession] = useState<Lang | null>(() => (enabled ? readSessionLanguage(clientId) : null));
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    fetchClientLanguage(clientId)
      .then((value) => {
        if (!cancelled) setSaved(value);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => { cancelled = true; };
  }, [clientId, enabled]);

  const save = useCallback((lang: Lang) => {
    setSaved(lang);
    setSession(null);
    writeSessionLanguage(clientId, null);
    void saveClientLanguage(clientId, lang).catch((error) => console.error('No se pudo guardar el idioma', error));
  }, [clientId]);

  const useOnce = useCallback((lang: Lang) => {
    setSession(lang);
    writeSessionLanguage(clientId, lang);
  }, [clientId]);

  const lang: Lang = enabled ? session ?? saved ?? 'es' : 'es';
  return { lang, needsChoice: enabled && checked && !saved && !session, save, useOnce };
};

// Primera vez: el cliente elige su idioma y queda guardado.
export const LanguageGate: React.FC<{ onChoose: (lang: Lang) => void }> = ({ onChoose }) => (
  <div className="lc-overlay">
    <div className="lc-dialog" role="dialog" aria-modal="true" aria-labelledby="lc-gate-title">
      <h2 id="lc-gate-title">
        <span lang="es">¿En qué idioma quieres ver tu área?</span>
        <span lang="ca">En quin idioma vols veure la teva àrea?</span>
      </h2>
      <div className="lc-options">
        {(['es', 'ca'] as Lang[]).map((lang) => (
          <button key={lang} type="button" className="lc-option" lang={lang} onClick={() => onChoose(lang)}>
            <Flag lang={lang} />
            <span>{NAMES[lang]}</span>
          </button>
        ))}
      </div>
      <p className="lc-note">
        <span lang="es">Podrás cambiarlo cuando quieras con el botón de arriba.</span>
        <span lang="ca">Podràs canviar-lo quan vulguis amb el botó de dalt.</span>
      </p>
    </div>
  </div>
);

// Boton de arriba: al pulsar el otro idioma pregunta si es solo esta vez o para siempre.
export const LanguageSwitch: React.FC<{ onSave: (lang: Lang) => void; onUseOnce: (lang: Lang) => void }> = ({ onSave, onUseOnce }) => {
  const { lang, t } = useLang();
  const [asking, setAsking] = useState<Lang | null>(null);
  // La pregunta sale en el idioma que se acaba de pulsar.
  const ask = (text: string) => translate(asking ?? lang, text);

  useEffect(() => {
    if (!asking) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAsking(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [asking]);

  return (
    <>
      <div className="lc-switch" role="group" aria-label={t('Idioma')}>
        {(['es', 'ca'] as Lang[]).map((option) => (
          <button
            key={option}
            type="button"
            className={option === lang ? 'is-active' : ''}
            aria-pressed={option === lang}
            aria-label={NAMES[option]}
            onClick={() => { if (option !== lang) setAsking(option); }}
          >
            <Flag lang={option} />
            <span>{SHORT[option]}</span>
          </button>
        ))}
      </div>
      {asking ? (
        <div className="lc-overlay" onClick={() => setAsking(null)}>
          <div className="lc-dialog" role="dialog" aria-modal="true" aria-labelledby="lc-ask-title" lang={asking} onClick={(event) => event.stopPropagation()}>
            <h2 id="lc-ask-title">{asking === 'ca' ? ask('¿Ver tu área en catalán?') : ask('¿Ver tu área en castellano?')}</h2>
            <div className="lc-actions">
              <button type="button" className="lc-primary" onClick={() => { onSave(asking); setAsking(null); }}>
                {ask('Sí, y guardarlo para las próximas veces')}
              </button>
              <button type="button" className="lc-secondary" onClick={() => { onUseOnce(asking); setAsking(null); }}>
                {ask('Solo esta vez')}
              </button>
              <button type="button" className="lc-ghost" onClick={() => setAsking(null)}>
                {ask('Cancelar')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
