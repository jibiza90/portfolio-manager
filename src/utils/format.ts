const currencyFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2
});

const percentFormatter = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2
});

const numberFormatter = new Intl.NumberFormat('es-ES', {
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
