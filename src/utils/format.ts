// Punto de miles siempre, tambien en numeros de 4 cifras (3.077,62). La norma es-ES no lo pone por
// debajo de 10.000 y en la web quedaban mezclados "3077,62" y "10.532,42". Si el navegador no admite
// useGrouping 'always', se usa el formato aleman, que es igual (punto de miles y coma decimal).
const supportsAlwaysGrouping = (() => {
  try {
    return new Intl.NumberFormat('es-ES', { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(1000) === '1.000';
  } catch {
    return false;
  }
})();

export const NUMBER_LOCALE = supportsAlwaysGrouping ? 'es-ES' : 'de-DE';

export const withGrouping = (options: Intl.NumberFormatOptions = {}): Intl.NumberFormatOptions =>
  (supportsAlwaysGrouping ? { ...options, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions : { ...options, useGrouping: true });

export const esNumberFormat = (options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(NUMBER_LOCALE, withGrouping(options));

const currencyFormatter = esNumberFormat({
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2
});

const percentFormatter = esNumberFormat({
  style: 'percent',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2
});

const numberFormatter = esNumberFormat({
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export const asDisplayValue = (value?: number | null, suffix?: string): string => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '-';
  }
  if (value === 0) {
    return suffix ? `0${suffix}` : '0';
  }
  if (suffix) {
    return `${currencyFormatter.format(value)}${suffix}`;
  }
  return currencyFormatter.format(value);
};

export const formatCurrency = (value?: number | null): string => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '-';
  }
  if (value === 0) {
    return '0 €';
  }
  return currencyFormatter.format(value);
};

export const formatPercent = (value?: number | null): string => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '-';
  }
  if (value === 0) {
    return '0%';
  }
  return percentFormatter.format(value);
};

export const formatNumberEs = (value?: number | null): string => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '';
  }
  return numberFormatter.format(value);
};

export const parseNumberEs = (raw: string): number | undefined => {
  const cleaned = raw.replace(/\./g, '').replace(',', '.').trim();
  if (!cleaned) {
    return undefined;
  }
  const numeric = Number(cleaned);
  if (Number.isNaN(numeric)) {
    return undefined;
  }
  return numeric;
};
