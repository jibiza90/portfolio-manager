import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { CA } from './ca';

// Idiomas del area de cliente. El castellano es el texto original; el catalan sale de ca.ts,
// donde cada texto en castellano tiene su traduccion. Variables entre llaves: {importe}.
export type Lang = 'es' | 'ca';
export const LANGS: Lang[] = ['es', 'ca'];

export type Vars = Record<string, string | number>;

export const translate = (lang: Lang, text: string, vars?: Vars) => {
  const base = lang === 'ca' ? (CA[text] ?? text) : text;
  if (!vars) return base;
  return base.replace(/(\b[Dd]e )?\{(\w+)\}/g, (match, de: string | undefined, key: string) => {
    if (!(key in vars)) return match;
    const value = String(vars[key]);
    // En catalan "de" se apostrofa delante de vocal o de hache muda: "d'abril", "d'Abr 2026".
    if (de && lang === 'ca' && /^h?[aeiouàèéíïòóúü]/i.test(value)) return `${de[0]}'${value}`;
    return `${de ?? ''}${value}`;
  });
};

// Texto catalan -> original en castellano (para que la actividad del cliente se guarde siempre en castellano).
const SPANISH_OF: Record<string, string> = Object.fromEntries(Object.entries(CA).map(([es, ca]) => [ca, es]));
export const toSpanish = (text: string) => SPANISH_OF[text] ?? text;

export type T = (text: string, vars?: Vars) => string;

interface LangState {
  lang: Lang;
  t: T;
}

const LangContext = createContext<LangState>({ lang: 'es', t: (text, vars) => translate('es', text, vars) });

export const LangProvider: React.FC<{ lang: Lang; children: React.ReactNode }> = ({ lang, children }) => {
  const t = useCallback<T>((text, vars) => translate(lang, text, vars), [lang]);
  const value = useMemo(() => ({ lang, t }), [lang, t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
};

export const useLang = () => useContext(LangContext);

// Codigo de idioma para fechas y numeros del navegador.
export const localeOf = (lang: Lang) => (lang === 'ca' ? 'ca-ES' : 'es-ES');
