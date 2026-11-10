// Fechas del area de cliente, siempre con el mismo criterio:
// - dia concreto: 10/04/2026
// - mes en tablas, listas y selectores: Marzo 2026 (catalan: Març 2026)
// - mes dentro de una frase: marzo de 2026 (catalan: de març de 2026, d'abril de 2026)
// Los ejes de los graficos (Rentabilidad mensual y Evolucion patrimonio) mantienen su formato corto
// ("Mar 2026"; en catalan "Març 2026").

export type DateLang = 'es' | 'ca';

const MONTH_NAMES: Record<DateLang, string[]> = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  ca: ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre']
};

// Abreviaturas de los graficos. En castellano son las mismas que ya se veian.
const SHORT_NAMES: Record<DateLang, string[]> = {
  es: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
  ca: ['Gen', 'Febr', 'Març', 'Abr', 'Maig', 'Juny', 'Jul', 'Ag', 'Set', 'Oct', 'Nov', 'Des']
};

const MONTH_INDEX: Record<string, number> = {
  ene: 0, enero: 0, jan: 0, january: 0,
  feb: 1, febrero: 1, february: 1,
  mar: 2, marzo: 2, march: 2,
  abr: 3, abril: 3, apr: 3, april: 3,
  may: 4, mayo: 4,
  jun: 5, junio: 5, june: 5,
  jul: 6, julio: 6, july: 6,
  ago: 7, agosto: 7, aug: 7, august: 7,
  sep: 8, sept: 8, set: 8, septiembre: 8, september: 8,
  oct: 9, octubre: 9, october: 9,
  nov: 10, noviembre: 10, november: 10,
  dic: 11, diciembre: 11, dec: 11, december: 11
};

const capitalize = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
// En catalan "de" se apostrofa delante de vocal: d'abril, d'agost, d'octubre.
const ofMonth = (name: string, lang: DateLang) => (lang === 'ca' && /^[aeiou]/.test(name) ? `d'${name}` : `de ${name}`);

// Acepta "2026-03", "2026-03-31", "Mar 2026" o "marzo 2026".
export const parseMonth = (value: string): { year: number; month: number } | null => {
  const text = value.trim();
  if (/^\d{4}-\d{2}/.test(text)) return { year: Number(text.slice(0, 4)), month: Number(text.slice(5, 7)) - 1 };
  const parts = text.toLowerCase().split(/\s+/);
  if (parts.length < 2) return null;
  const month = MONTH_INDEX[parts[0].replace('.', '')];
  const year = Number(parts[parts.length - 1]);
  if (month === undefined || !Number.isFinite(year)) return null;
  return { year, month };
};

// 10/04/2026
export const formatDay = (iso: string) => {
  const [year, month, day] = iso.slice(0, 10).split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
};

// Marzo 2026 · Març 2026
export const formatMonth = (value: string, lang: DateLang = 'es') => {
  const parsed = parseMonth(value);
  if (!parsed) return value;
  return `${capitalize(MONTH_NAMES[lang][parsed.month])} ${parsed.year}`;
};

// marzo de 2026 · març de 2026
export const formatMonthInSentence = (value: string, lang: DateLang = 'es') => {
  const parsed = parseMonth(value);
  if (!parsed) return value;
  return `${MONTH_NAMES[lang][parsed.month]} de ${parsed.year}`;
};

// Octubre 2025 – Febrero 2026
export const formatMonthRange = (from: string, to: string, lang: DateLang = 'es') => `${formatMonth(from, lang)} – ${formatMonth(to, lang)}`;

// Etiquetas cortas de los graficos: en castellano se deja tal cual ("Mar 2026"); en catalan "Març 2026".
export const formatChartMonth = (value: string, lang: DateLang = 'es') => {
  if (lang === 'es') return value;
  const parsed = parseMonth(value);
  if (!parsed) return value;
  return `${SHORT_NAMES.ca[parsed.month]} ${parsed.year}`;
};

// 10 de noviembre de 2026 · 10 de novembre de 2026 · 10 d'abril de 2026
export const formatLongDate = (date: Date, lang: DateLang = 'es') =>
  `${date.getDate()} ${ofMonth(MONTH_NAMES[lang][date.getMonth()], lang)} de ${date.getFullYear()}`;

// Fecha de un dia en frase: 31 de marzo de 2026 · 31 de març de 2026 · 30 d'abril de 2026
export const formatLongDay = (iso: string, lang: DateLang = 'es') => {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return iso;
  return formatLongDate(new Date(year, month - 1, day), lang);
};

// "de marzo de 2026" / "d'abril de 2026" (para frases como "Rentabilidad de marzo de 2026").
export const formatOfMonth = (value: string, lang: DateLang = 'es') => {
  const parsed = parseMonth(value);
  if (!parsed) return value;
  return `${ofMonth(MONTH_NAMES[lang][parsed.month], lang)} de ${parsed.year}`;
};
