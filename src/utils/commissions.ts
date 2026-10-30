import type { Movement } from '../types';
import { NUMBER_LOCALE, withGrouping } from '../utils/format';

// Porcentaje de comision elegido por cliente (decimal: 0.05 = 5%). null = sin comision.
export const COMMISSION_RATE_STORAGE_KEY = 'portfolio-comision-porcentaje';
export const COMMISSION_RATE_PRESETS = [0.05, 0.08];

// Clientes sin comision por acuerdo (Pere Sague).
const NO_COMMISSION_CLIENT_IDS = new Set(['client-012']);
// A partir de este cliente (Miquel Puigrefagut) la comision por defecto es del 8%.
const EIGHT_PERCENT_FROM_CLIENT_NUMBER = 22;

const clientNumber = (clientId: string) => {
  const match = clientId.match(/client-(\d+)/);
  return match ? Number.parseInt(match[1], 10) : undefined;
};

export const getDefaultCommissionRate = (clientId: string): number | null => {
  if (NO_COMMISSION_CLIENT_IDS.has(clientId)) return null;
  const number = clientNumber(clientId);
  return number !== undefined && number >= EIGHT_PERCENT_FROM_CLIENT_NUMBER ? 0.08 : 0.05;
};

export const loadCommissionRates = (): Record<string, number | null> => {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(COMMISSION_RATE_STORAGE_KEY) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([, value]) => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
      )
    ) as Record<string, number | null>;
  } catch {
    return {};
  }
};

export const saveCommissionRates = (rates: Record<string, number | null>) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(COMMISSION_RATE_STORAGE_KEY, JSON.stringify(rates));
};

export const getCommissionRate = (clientId: string, rates: Record<string, number | null>) =>
  clientId in rates ? rates[clientId] : getDefaultCommissionRate(clientId);

export interface WithdrawalCommission {
  iso: string;
  amount: number;
  // Capital aportado que quedaba por recuperar justo antes de esta retirada.
  capitalPendingBefore: number;
  // Parte de la retirada que ya es beneficio (supera el capital aportado).
  commissionableAmount: number;
  commission: number;
}

// La comision solo se cobra sobre lo que se retira una vez el cliente ha recuperado
// todo su capital (no por año). Si despues vuelve a aportar, ese dinero nuevo no paga
// comision hasta que lo haya recuperado entero.
export const getWithdrawalCommissions = (
  movements: Record<string, Movement> = {},
  rate: number | null
): WithdrawalCommission[] => {
  // Capital del cliente que sigue dentro, paso a paso: si una retirada se lo lleva todo se queda en 0
  // (el resto ya era beneficio y paga comision) y lo que aporte despues cuenta entero como capital nuevo.
  let capitalPending = 0;
  const result: WithdrawalCommission[] = [];

  Object.entries(movements)
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([iso, movement]) => {
      const increment = Math.max(0, movement.increment ?? 0);
      const decrement = Math.max(0, movement.decrement ?? 0);
      capitalPending += increment;
      if (decrement <= 0) return;

      const capitalPendingBefore = capitalPending;
      const commissionableAmount = Math.max(0, decrement - capitalPendingBefore);
      capitalPending = Math.max(0, capitalPending - decrement);
      result.push({
        iso,
        amount: decrement,
        capitalPendingBefore,
        commissionableAmount,
        commission: rate ? commissionableAmount * rate : 0
      });
    });

  return result;
};

// Mismo calculo paso a paso que getWithdrawalCommissions, hasta el ultimo movimiento.
export const getCapitalPendingToRecover = (movements: Record<string, Movement> = {}) =>
  Object.entries(movements)
    .sort(([left], [right]) => left.localeCompare(right))
    .reduce((pending, [, movement]) => (
      Math.max(0, pending + Math.max(0, movement.increment ?? 0) - Math.max(0, movement.decrement ?? 0))
    ), 0);

export const formatCommissionRate = (rate: number | null) =>
  rate === null
    ? 'Sin comisión'
    : `${(rate * 100).toLocaleString(NUMBER_LOCALE, withGrouping({ maximumFractionDigits: 2 }))}%`;
