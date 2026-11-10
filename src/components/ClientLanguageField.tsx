import React, { useEffect, useState } from 'react';
import type { Lang } from '../i18n';
import { saveClientLanguage, subscribeClientLanguage } from '../services/languagePreference';

// Ficha del cliente (admin): idioma del area de cliente. Lo elige el cliente al entrar;
// desde aqui se puede consultar y cambiar.
export const ClientLanguageField: React.FC<{ clientId: string }> = ({ clientId }) => {
  const [lang, setLang] = useState<Lang | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLoaded(false);
    return subscribeClientLanguage(clientId, (value) => {
      setLang(value);
      setLoaded(true);
    });
  }, [clientId]);

  const change = async (value: string) => {
    if (value !== 'es' && value !== 'ca') return;
    setBusy(true);
    try {
      await saveClientLanguage(clientId, value, { cacheInBrowser: false });
      window.dispatchEvent(new CustomEvent('show-toast', { detail: 'Guardado' }));
    } catch {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: 'No se pudo guardar el idioma.' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <label>
      <span>Idioma del cliente</span>
      <select
        id="contact-language"
        name="contact-language"
        value={lang ?? ''}
        disabled={!loaded || busy}
        onChange={(e) => { void change(e.target.value); }}
      >
        <option value="" disabled>Sin elegir</option>
        <option value="es">Castellano</option>
        <option value="ca">Català</option>
      </select>
    </label>
  );
};
