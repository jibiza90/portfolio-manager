import type { ReportData } from '../services/reportLinks';

// Modelo de aportaciones y retiradas (lotes): se usa en "Qué ocurrió con cada aportación".

export interface FlowPendingMovement {
  iso: string;
  type: 'increment' | 'decrement';
  amount: number;
}

export interface FlowMonth {
  key: string;
  label: string;
  returnPct: number;
  profit: number;
  balance: number;
  hasClose: boolean;
}

export interface SourceLot {
  id: string;
  iso: string;
  entryKey: string;
  label: string;
  amount: number;
  pending: boolean;
  specificEntryReturnPct?: number;
}

export interface CapitalLot extends SourceLot {
  remainingCapital: number;
  allocatedWithdrawal: number;
  withdrawalAllocations: Array<{
    withdrawalId: string;
    iso: string;
    amount: number;
    pending: boolean;
    returnPct?: number;
    // Rentabilidad de ese dinero desde el dia de la aportacion hasta el dia de la retirada (en %).
    returnSinceEntryPct?: number;
  }>;
  performanceFactor: number;
  attributedProfit: number;
  currentValue: number;
  sharePct: number;
  activeMonths: number;
  accumulatedReturnPct: number;
}

export interface WithdrawalFlow {
  id: string;
  iso: string;
  monthKey: string;
  amount: number;
  pending: boolean;
  returnPct?: number;
}

const formatDate = (iso: string) => {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${day}.${month}.${year}` : iso;
};

export const buildCapitalModel = (
  report: ReportData,
  months: FlowMonth[],
  pendingCashMovements: FlowPendingMovement[]
) => {
  const publishedIncrements = (report.movements ?? [])
    .filter((movement) => movement.type === 'increment')
    .sort((left, right) => left.iso.localeCompare(right.iso));
  const publishedWithdrawals = (report.movements ?? [])
    .filter((movement) => movement.type === 'decrement')
    .sort((left, right) => left.iso.localeCompare(right.iso));
  const pendingIncrements = pendingCashMovements
    .filter((movement) => movement.type === 'increment')
    .sort((left, right) => left.iso.localeCompare(right.iso));
  const pendingWithdrawals = pendingCashMovements
    .filter((movement) => movement.type === 'decrement')
    .sort((left, right) => left.iso.localeCompare(right.iso));

  const firstMonthKey = months[0]?.key ?? new Date().toISOString().slice(0, 7);
  const firstIso = `${firstMonthKey}-01`;
  const derivedOpeningCapital = Math.max(
    0,
    report.saldo + report.decrementos - report.incrementos - report.beneficioTotal
  );
  const publishedIncrementTotal = publishedIncrements.reduce((sum, movement) => sum + movement.amount, 0);
  const undocumentedIncrement = Math.max(0, report.incrementos - publishedIncrementTotal);

  const contributionReturnByIso = new Map<string, number>();
  (report.contributionBreakdowns ?? []).forEach((breakdown) => {
    breakdown.contributions.forEach((contribution) => {
      contributionReturnByIso.set(contribution.iso, contribution.returnPct * 100);
    });
  });

  const sourceLots: SourceLot[] = [];
  if (derivedOpeningCapital > 0.005) {
    sourceLots.push({
      id: 'opening-capital',
      iso: firstIso,
      entryKey: firstMonthKey,
      label: 'Posición de origen',
      amount: derivedOpeningCapital,
      pending: false
    });
  }
  if (undocumentedIncrement > 0.005) {
    sourceLots.push({
      id: 'documented-capital',
      iso: firstIso,
      entryKey: firstMonthKey,
      label: 'Capital inicial documentado',
      amount: undocumentedIncrement,
      pending: false
    });
  }
  publishedIncrements.forEach((movement, index) => {
    sourceLots.push({
      id: `increment-${movement.iso}-${index}`,
      iso: movement.iso,
      entryKey: movement.iso.slice(0, 7),
      label: `Aportación ${formatDate(movement.iso)}`,
      amount: movement.amount,
      pending: false,
      specificEntryReturnPct: contributionReturnByIso.get(movement.iso)
        ?? (movement.returnPct !== undefined ? movement.returnPct * 100 : undefined)
    });
  });
  pendingIncrements.forEach((movement, index) => {
    sourceLots.push({
      id: `pending-increment-${movement.iso}-${index}`,
      iso: movement.iso,
      entryKey: movement.iso.slice(0, 7),
      label: `Aportación ${formatDate(movement.iso)}`,
      amount: movement.amount,
      pending: true
    });
  });

  if (!sourceLots.length && report.saldo > 0) {
    sourceLots.push({
      id: 'fallback-capital',
      iso: firstIso,
      entryKey: firstMonthKey,
      label: 'Capital de origen',
      amount: Math.max(0, report.saldo - report.beneficioTotal),
      pending: false
    });
  }

  const publishedWithdrawalTotal = publishedWithdrawals.reduce((sum, movement) => sum + movement.amount, 0);
  const undocumentedWithdrawal = Math.max(0, report.decrementos - publishedWithdrawalTotal);
  const withdrawals: WithdrawalFlow[] = [
    ...publishedWithdrawals.map((movement, index) => ({
      id: `withdrawal-${movement.iso}-${index}`,
      iso: movement.iso,
      monthKey: movement.iso.slice(0, 7),
      amount: movement.amount,
      pending: false,
      returnPct: movement.returnPct !== undefined ? movement.returnPct * 100 : undefined
    })),
    ...(undocumentedWithdrawal > 0.005 ? [{
      id: 'documented-withdrawal',
      iso: `${months[months.length - 1]?.key ?? firstMonthKey}-28`,
      monthKey: months[months.length - 1]?.key ?? firstMonthKey,
      amount: undocumentedWithdrawal,
      pending: false
    }] : []),
    ...pendingWithdrawals.map((movement, index) => ({
      id: `pending-withdrawal-${movement.iso}-${index}`,
      iso: movement.iso,
      monthKey: movement.iso.slice(0, 7),
      amount: movement.amount,
      pending: true
    }))
  ].sort((left, right) => left.iso.localeCompare(right.iso));

  const mutableLots = sourceLots.map((lot) => ({
    ...lot,
    remainingCapital: lot.amount,
    allocatedWithdrawal: 0,
    withdrawalAllocations: [] as CapitalLot['withdrawalAllocations']
  }));
  withdrawals.forEach((withdrawal) => {
    const eligible = mutableLots.filter((lot) => lot.iso <= withdrawal.iso && lot.remainingCapital > 0.005);
    let unallocated = withdrawal.amount;
    for (const lot of eligible) {
      if (unallocated <= 0.005) break;
      const appliedAmount = Math.min(lot.remainingCapital, unallocated);
      lot.remainingCapital -= appliedAmount;
      lot.allocatedWithdrawal += appliedAmount;
      lot.withdrawalAllocations.push({
        withdrawalId: withdrawal.id,
        iso: withdrawal.iso,
        amount: appliedAmount,
        pending: withdrawal.pending,
        returnPct: withdrawal.returnPct
      });
      unallocated -= appliedAmount;
    }
  });

  const closedMonths = months.filter((month) => month.hasClose);
  const latestClosedKey = closedMonths[closedMonths.length - 1]?.key ?? '';

  // Rentabilidad del mes de entrada de una aportacion (factor 1 + r).
  // - Si la aportacion tiene su rentabilidad propia, se usa esa.
  // - Si no, se deduce de los saldos del mes (asi salen bien los meses introducidos a mano
  //   antes de usar la web, donde el saldo final ya incluye los dias desde la aportacion).
  const SANE_FACTOR_MIN = 0.8;
  const SANE_FACTOR_MAX = 1.3;
  const isSaneFactor = (factor: number) => Number.isFinite(factor) && factor >= SANE_FACTOR_MIN && factor <= SANE_FACTOR_MAX;
  const getEntryMonthFactor = (lot: SourceLot) => {
    if (lot.specificEntryReturnPct !== undefined) return 1 + lot.specificEntryReturnPct / 100;
    const monthIndex = closedMonths.findIndex((month) => month.key === lot.entryKey);
    const month = closedMonths[monthIndex];
    if (!month) return 1;
    const fullMonthFactor = 1 + month.returnPct / 100;
    const previous = closedMonths[monthIndex - 1];
    if (!previous) {
      // Primer mes sin rentabilidad apuntada (p.ej. entrada el 26/06/2025 y primer cierre en julio):
      // lo ganado esos dias esta en el saldo inicial del mes siguiente, introducido a mano.
      const next = closedMonths[monthIndex + 1];
      const nextHasFlows = next && (report.movements ?? []).some((movement) => movement.iso.slice(0, 7) === next.key);
      if (Math.abs(month.returnPct) < 1e-9 && next && !nextHasFlows && month.balance > 0) {
        const gapFactor = next.balance / (1 + next.returnPct / 100) / month.balance;
        if (isSaneFactor(gapFactor)) return gapFactor;
      }
      return fullMonthFactor;
    }
    const monthIncrements = publishedIncrements.filter((movement) => movement.iso.slice(0, 7) === lot.entryKey);
    const monthWithdrawals = publishedWithdrawals.filter((movement) => movement.iso.slice(0, 7) === lot.entryKey);
    const unknownIncrements = monthIncrements.filter((movement) => movement.returnPct === undefined);
    const unknownTotal = unknownIncrements.reduce((sum, movement) => sum + movement.amount, 0);
    if (unknownTotal <= 0.005) return fullMonthFactor;
    const withdrawnTotal = monthWithdrawals.reduce((sum, movement) => sum + movement.amount, 0);
    const expectedWithoutUnknown =
      (previous.balance - withdrawnTotal) * fullMonthFactor
      + monthWithdrawals.reduce((sum, movement) => sum + movement.amount * (movement.returnPct ?? 0), 0)
      + monthIncrements
        .filter((movement) => movement.returnPct !== undefined)
        .reduce((sum, movement) => sum + movement.amount * (1 + (movement.returnPct ?? 0)), 0);
    const residualFactor = (month.balance - expectedWithoutUnknown) / unknownTotal;
    return isSaneFactor(residualFactor) ? residualFactor : fullMonthFactor;
  };
  // Dias entre la primera aportacion y el primer cierre registrado (p.ej. 26-30 jun 2025):
  // el saldo inicial del primer cierre ya incluye ese rendimiento.
  const firstClosed = closedMonths[0];
  const preHistoryFactor = (() => {
    if (!firstClosed) return 1;
    const before = publishedIncrements.filter((movement) => movement.iso.slice(0, 7) < firstClosed.key);
    const beforeTotal = before.reduce((sum, movement) => sum + movement.amount, 0);
    const firstMonthHasFlows = (report.movements ?? []).some((movement) => movement.iso.slice(0, 7) === firstClosed.key);
    if (beforeTotal <= 0.005 || firstMonthHasFlows) return 1;
    const startBalance = firstClosed.balance / (1 + firstClosed.returnPct / 100);
    const factor = startBalance / beforeTotal;
    return isSaneFactor(factor) ? factor : 1;
  })();
  const getReturnSinceEntryPct = (lot: SourceLot, withdrawal: WithdrawalFlow) => {
    if (lot.pending || withdrawal.pending) return undefined;
    const exitKey = withdrawal.monthKey;
    const exitFactor = 1 + (withdrawal.returnPct ?? 0) / 100;
    if (lot.entryKey >= exitKey) return (exitFactor - 1) * 100;
    const isBeforeHistory = Boolean(firstClosed && lot.entryKey < firstClosed.key);
    let factor = isBeforeHistory ? preHistoryFactor : getEntryMonthFactor(lot);
    closedMonths
      .filter((month) => month.key < exitKey && (isBeforeHistory ? true : month.key > lot.entryKey))
      .forEach((month) => {
        factor *= 1 + month.returnPct / 100;
      });
    return (factor * exitFactor - 1) * 100;
  };
  mutableLots.forEach((lot) => {
    lot.withdrawalAllocations.forEach((allocation) => {
      const withdrawal = withdrawals.find((item) => item.id === allocation.withdrawalId);
      if (withdrawal) allocation.returnSinceEntryPct = getReturnSinceEntryPct(lot, withdrawal);
    });
  });
  const lotsWithPerformance = mutableLots.map((lot) => {
    const activeMonths = months.filter((month) => month.hasClose && month.key >= lot.entryKey);
    const performanceFactor = activeMonths.reduce((factor, month, index) => {
      const monthlyReturn = index === 0 && month.key === lot.entryKey && lot.specificEntryReturnPct !== undefined
        ? lot.specificEntryReturnPct
        : month.returnPct;
      return factor * (1 + monthlyReturn / 100);
    }, 1);
    return {
      ...lot,
      performanceFactor,
      activeMonths: activeMonths.length,
      rawGain: lot.remainingCapital * (performanceFactor - 1),
      isAfterLatestClose: Boolean(latestClosedKey && lot.entryKey > latestClosedKey)
    };
  });

  const rawGainTotal = lotsWithPerformance.reduce((sum, lot) => sum + lot.rawGain, 0);
  const exposureTotal = lotsWithPerformance.reduce(
    (sum, lot) => sum + (lot.isAfterLatestClose ? 0 : lot.remainingCapital * Math.max(1, lot.activeMonths)),
    0
  );
  const visibleBalance = report.saldo
    + pendingIncrements.reduce((sum, movement) => sum + movement.amount, 0)
    - pendingWithdrawals.reduce((sum, movement) => sum + movement.amount, 0);

  const lots: CapitalLot[] = lotsWithPerformance.map((lot) => {
    let attributedProfit = 0;
    if (!lot.isAfterLatestClose && Math.abs(report.beneficioTotal) > 0.005) {
      if (Math.abs(rawGainTotal) > 0.005 && Math.sign(rawGainTotal) === Math.sign(report.beneficioTotal)) {
        attributedProfit = report.beneficioTotal * (lot.rawGain / rawGainTotal);
      } else if (exposureTotal > 0) {
        attributedProfit = report.beneficioTotal
          * ((lot.remainingCapital * Math.max(1, lot.activeMonths)) / exposureTotal);
      }
    }
    const currentValue = lot.remainingCapital + attributedProfit;
    return {
      id: lot.id,
      iso: lot.iso,
      entryKey: lot.entryKey,
      label: lot.label,
      amount: lot.amount,
      pending: lot.pending,
      specificEntryReturnPct: lot.specificEntryReturnPct,
      remainingCapital: lot.remainingCapital,
      allocatedWithdrawal: lot.allocatedWithdrawal,
      withdrawalAllocations: lot.withdrawalAllocations,
      performanceFactor: lot.performanceFactor,
      attributedProfit,
      currentValue,
      sharePct: visibleBalance !== 0 ? (currentValue / visibleBalance) * 100 : 0,
      activeMonths: lot.activeMonths,
      accumulatedReturnPct: lot.remainingCapital > 0 ? (attributedProfit / lot.remainingCapital) * 100 : 0
    };
  });

  return {
    lots,
    withdrawals,
    visibleBalance,
    grossCapital: sourceLots.reduce((sum, lot) => sum + lot.amount, 0),
    netCapital: sourceLots.reduce((sum, lot) => sum + lot.amount, 0)
      - withdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0)
  };
};
