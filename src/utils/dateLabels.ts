// Fechas del area de cliente, siempre con el mismo criterio:
// - dia concreto: 10/04/2026
// - mes en tablas, listas y selectores: Marzo 2026
// - mes dentro de una frase: marzo de 2026
// Los ejes de los graficos (Rentabilidad mensual y Evolucion patrimonio) mantienen su formato corto ("Mar 2026").

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

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

// Marzo 2026
export const formatMonth = (value: string) => {
  const parsed = parseMonth(value);
  if (!parsed) return value;
  const name = MONTH_NAMES[parsed.month];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${parsed.year}`;
};

// marzo de 2026
export const formatMonthInSentence = (value: string) => {
  const parsed = parseMonth(value);
  if (!parsed) return value;
  return `${MONTH_NAMES[parsed.month]} de ${parsed.year}`;
};

// Octubre 2025 – Febrero 2026
export const formatMonthRange = (from: string, to: string) => `${formatMonth(from)} – ${formatMonth(to)}`;
