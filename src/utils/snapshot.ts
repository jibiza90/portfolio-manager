import dayjs from 'dayjs';
import { CLIENTS, isDemoClient } from '../constants/clients';
import {
  Movement,
  MonthlyHistoryEntry,
  PortfolioSnapshot,
  DailyRow,
  ClientDayRow
} from '../types';
import { YEAR_DAYS } from './dates';
import { getDominantMonthlyReturn } from './monthlyHistory';

const monthEndIso = (month: string) => dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD');
const normalizeReturnPct = (value?: number) =>
  value === undefined || Number.isNaN(value) ? undefined : Math.abs(value) > 1 ? value / 100 : value;
const MONTHLY_HISTORY_TOLERANCE = 0.5;
const hasMeaningfulAmount = (value?: number) => value !== undefined && Math.abs(value) > MONTHLY_HISTORY_TOLERANCE;
const maxIso = (...dates: Array<string | undefined>) => {
  const validDates = dates.filter((value): value is string => Boolean(value));
  if (validDates.length === 0) return undefined;
  return validDates.sort((a, b) => (a > b ? 1 : -1))[validDates.length - 1];
};

const getIncrementReturnAdjustment = (
  records: Record<string, Record<string, Movement>>,
  clientId: string,
  monthKey: string,
  monthlyReturnPct: number
) =>
  Object.entries(records[clientId] ?? {}).reduce((adjustment, [iso, movement]) => {
    if (iso.slice(0, 7) !== monthKey || !movement.increment || movement.increment <= 0) {
      return adjustment;
    }

    const customReturnPct = normalizeReturnPct(movement.incrementReturnPct);
    if (customReturnPct === undefined) {
      return adjustment;
    }

    return adjustment + movement.increment * (customReturnPct - monthlyReturnPct);
  }, 0);

const hasIncrementReturnOverride = (
  records: Record<string, Record<string, Movement>>,
  clientId: string,
  monthKey: string
) =>
  Object.entries(records[clientId] ?? {}).some(([iso, movement]) => (
    iso.slice(0, 7) === monthKey &&
    (movement.increment ?? 0) > 0 &&
    normalizeReturnPct(movement.incrementReturnPct) !== undefined
  ));

const getPortfolioClients = () => CLIENTS.filter(({ id }) => !isDemoClient(id));

const sumMovements = (records: Record<string, Record<string, Movement>>, iso: string) => {
  let incrementTotal = 0;
  let decrementTotal = 0;
  let manualProfitTotal = 0;
  let hasIncrement = false;
  let hasDecrement = false;
  let hasManualProfit = false;

  getPortfolioClients().forEach(({ id }) => {
    const day = records[id]?.[iso];
    if (!day) return;
    if (day.increment !== undefined) {
      incrementTotal += day.increment;
      hasIncrement = true;
    }
    if (day.decrement !== undefined) {
      decrementTotal += day.decrement;
      hasDecrement = true;
    }
    if (day.manualProfit !== undefined) hasManualProfit = true;
  });

  return {
    increments: hasIncrement ? incrementTotal : undefined,
    decrements: hasDecrement ? decrementTotal : undefined,
    manualProfits: hasManualProfit ? manualProfitTotal : undefined,
    net: incrementTotal - decrementTotal
  };
};

export const buildSnapshot = (
  finalByDay: Record<string, number | undefined>,
  movementsByClient: Record<string, Record<string, Movement>>,
  monthlyHistoryByClient: Record<string, Record<string, MonthlyHistoryEntry>> = {}
): PortfolioSnapshot => {
  const historicalByClientAndDay: Record<string, Record<string, MonthlyHistoryEntry>> = {};
  const portfolioReturnByMonth: Record<string, number | undefined> = {};
  const historicalDays: string[] = [];
  const portfolioHistoricalDays: string[] = [];
  const clientTrackedDays: Record<string, string[]> = {};

  const months = new Set(Object.values(monthlyHistoryByClient).flatMap((entries) => Object.keys(entries)));
  months.forEach((month) => {
    portfolioReturnByMonth[month] = getDominantMonthlyReturn(
      getPortfolioClients().map(({ id }) => monthlyHistoryByClient[id]?.[month]?.returnPct)
    );
  });

  Object.entries(monthlyHistoryByClient).forEach(([clientId, months]) => {
    Object.entries(months).forEach(([month, entry]) => {
      const normalizedFinal = entry.finalBalance;
      const normalizedReturn = normalizeReturnPct(entry.returnPct);
      if (normalizedFinal === undefined && normalizedReturn === undefined) {
        return;
      }
      const iso = monthEndIso(month);
      historicalByClientAndDay[clientId] = historicalByClientAndDay[clientId] ?? {};
      historicalByClientAndDay[clientId][iso] = {
        finalBalance: normalizedFinal,
        returnPct: normalizedReturn
      };
      historicalDays.push(iso);
      clientTrackedDays[clientId] = clientTrackedDays[clientId] ?? [];
      clientTrackedDays[clientId].push(iso);
      if (!isDemoClient(clientId)) {
        portfolioHistoricalDays.push(iso);
      }
    });
  });

  const recordedFinalDays = Object.entries(finalByDay)
    .filter(([, value]) => value !== undefined && !Number.isNaN(value))
    .map(([iso]) => iso)
    .sort((a, b) => (a > b ? 1 : -1));
  const lastRecordedFinalDay = recordedFinalDays[recordedFinalDays.length - 1];
  const movementEntries = Object.entries(movementsByClient)
    .flatMap(([clientId, rows]) =>
      Object.entries(rows)
        .filter(([, movement]) =>
          (movement.increment !== undefined && !Number.isNaN(movement.increment)) ||
          (movement.decrement !== undefined && !Number.isNaN(movement.decrement)) ||
          (movement.manualProfit !== undefined && !Number.isNaN(movement.manualProfit)) ||
          (movement.manualProfitPct !== undefined && !Number.isNaN(movement.manualProfitPct))
        )
        .map(([iso]) => ({ clientId, iso }))
    );
  movementEntries.forEach(({ clientId, iso }) => {
    clientTrackedDays[clientId] = clientTrackedDays[clientId] ?? [];
    clientTrackedDays[clientId].push(iso);
  });
  const portfolioMovementDays = movementEntries
    .filter(({ clientId }) => !isDemoClient(clientId))
    .map(({ iso }) => iso)
    .sort((a, b) => (a > b ? 1 : -1));
  const lastPortfolioMovementDay = portfolioMovementDays[portfolioMovementDays.length - 1];
  const sortedPortfolioHistoricalDays = portfolioHistoricalDays.sort((a, b) => (a > b ? 1 : -1));
  const lastPortfolioHistoricalDay = sortedPortfolioHistoricalDays[sortedPortfolioHistoricalDays.length - 1];
  const trackedDays = [lastRecordedFinalDay, lastPortfolioMovementDay, lastPortfolioHistoricalDay]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => (a > b ? 1 : -1));
  const lastTrackedDay = trackedDays[trackedDays.length - 1];
  const lastTrackedDayByClient = Object.fromEntries(
    Object.entries(clientTrackedDays).map(([clientId, days]) => {
      const sortedDays = [...days].sort((a, b) => (a > b ? 1 : -1));
      return [clientId, sortedDays[sortedDays.length - 1]];
    })
  );

  const dailyRows: DailyRow[] = [];
  const dayIndex: Record<string, DailyRow> = {};
  const clientRowsById: Record<string, ClientDayRow[]> = {};
  // Manual client adjustments are visible in the client balance but never
  // participate in the real portfolio allocation.
  const clientState: Record<string, {
    balance: number;
    coreBalance: number;
    isolatedBalance: number;
    netInvested: number;
  }> = {};

  CLIENTS.forEach(({ id }) => {
    clientRowsById[id] = [];
    clientState[id] = { balance: 0, coreBalance: 0, isolatedBalance: 0, netInvested: 0 };
  });

  let previousFinal: number | undefined;
  let cumulativeProfit = 0;
  let firstInitial: number | undefined;

  YEAR_DAYS.forEach((day) => {
    const beyondLastRecorded = lastTrackedDay !== undefined && day.iso > lastTrackedDay;
    const { increments, decrements, manualProfits, net } = sumMovements(movementsByClient, day.iso);
    const clientDrafts = CLIENTS.map(({ id }) => {
      const demo = isDemoClient(id);
      const clientOwnLastTrackedDay = lastTrackedDayByClient[id];
      const clientLastTrackedDay = demo
        ? clientOwnLastTrackedDay
          ? maxIso(clientOwnLastTrackedDay, lastPortfolioHistoricalDay)
          : clientOwnLastTrackedDay
        : lastTrackedDay;
      const beyondClientLastRecorded = clientLastTrackedDay !== undefined && day.iso > clientLastTrackedDay;
      const movement = movementsByClient[id]?.[day.iso];
      const increment = movement?.increment;
      const incrementReturnPct = movement?.incrementReturnPct;
      const decrement = movement?.decrement;
      const manualProfitPct = movement?.manualProfitPct;
      const prevBalance = clientState[id].balance;
      const netFlow = (increment ?? 0) - (decrement ?? 0);
      let allocatableBase = beyondClientLastRecorded ? undefined : clientState[id].coreBalance + netFlow;
      let isolatedBalance = beyondClientLastRecorded ? undefined : clientState[id].isolatedBalance;
      if (allocatableBase !== undefined && isolatedBalance !== undefined && allocatableBase < 0) {
        isolatedBalance += allocatableBase;
        allocatableBase = 0;
      }
      const actualBase =
        allocatableBase !== undefined && isolatedBalance !== undefined
          ? allocatableBase + isolatedBalance
          : undefined;
      const manualProfit = movement?.manualProfit ?? (
        manualProfitPct !== undefined && actualBase !== undefined ? actualBase * manualProfitPct : undefined
      );
      const monthKey = day.iso.slice(0, 7);
      // Demo clients use the real monthly return curve, but never feed back into portfolio totals.
      const inheritedDemoReturn =
        demo && day.iso === monthEndIso(monthKey)
          ? portfolioReturnByMonth[monthKey]
          : undefined;
      const monthlyHistory =
        inheritedDemoReturn !== undefined
          ? { returnPct: inheritedDemoReturn }
          : historicalByClientAndDay[id]?.[day.iso];
      const hasCarryBalance = actualBase !== undefined && Math.abs(actualBase) > MONTHLY_HISTORY_TOLERANCE;
      const isBootstrapMonth = actualBase === undefined || !hasCarryBalance;

      let syntheticFlow = 0;
      let baseBalance = actualBase;
      let lockedCoreFinal: number | undefined;
      let lockedReturnPct: number | undefined;
      let isolatedReturnPct: number | undefined;
      let isolatedProfitAdjustment = 0;

      if (!beyondClientLastRecorded && monthlyHistory) {
        const normalizedReturn = normalizeReturnPct(monthlyHistory.returnPct);
        const monthKey = day.iso.slice(0, 7);
        const portfolioReturn = portfolioReturnByMonth[monthKey];
        const useClientReturnForCustomFlows =
          monthKey >= '2026-04' &&
          normalizedReturn !== undefined &&
          hasIncrementReturnOverride(movementsByClient, id, monthKey);
        const coreReturn = monthlyHistory.finalBalance === undefined
          ? useClientReturnForCustomFlows
            ? normalizedReturn
            : portfolioReturn ?? normalizedReturn
          : normalizedReturn;
        isolatedReturnPct = normalizedReturn;
        if (monthlyHistory.finalBalance !== undefined && normalizedReturn !== undefined && normalizedReturn > -1) {
          const derivedBase = monthlyHistory.finalBalance / (1 + normalizedReturn);
          const derivedDiff = derivedBase - (actualBase ?? 0);
          const derivedBaseMatchesCarry = Math.abs(derivedDiff) <= MONTHLY_HISTORY_TOLERANCE;
          if (isBootstrapMonth) {
            baseBalance = derivedBase;
            allocatableBase = derivedBase;
            isolatedBalance = 0;
            syntheticFlow = derivedDiff;
            lockedReturnPct = normalizedReturn;
          } else {
            baseBalance = actualBase;
            syntheticFlow = 0;
            if (derivedBaseMatchesCarry) {
              lockedReturnPct = normalizedReturn;
            }
          }
          lockedCoreFinal = monthlyHistory.finalBalance;
        } else if (monthlyHistory.finalBalance !== undefined) {
          if (isBootstrapMonth) {
            baseBalance = monthlyHistory.finalBalance;
            allocatableBase = monthlyHistory.finalBalance;
            isolatedBalance = 0;
            syntheticFlow = monthlyHistory.finalBalance - (actualBase ?? 0);
          } else {
            baseBalance = actualBase;
            syntheticFlow = 0;
          }
          lockedCoreFinal = monthlyHistory.finalBalance;
        } else if (normalizedReturn !== undefined) {
          baseBalance = actualBase;
          const incrementReturnAdjustment = getIncrementReturnAdjustment(
            movementsByClient,
            id,
            day.iso.slice(0, 7),
            coreReturn ?? normalizedReturn
          );
          lockedCoreFinal = (allocatableBase ?? 0) * (1 + (coreReturn ?? normalizedReturn)) + incrementReturnAdjustment;
          isolatedProfitAdjustment = (allocatableBase ?? 0) * (normalizedReturn - (coreReturn ?? normalizedReturn));
          lockedReturnPct = normalizedReturn;
        }
      }

      return {
        id,
        isDemo: demo,
        beyondClientLastRecorded,
        increment,
        incrementReturnPct,
        decrement,
        manualProfit,
        manualProfitPct,
        prevBalance,
        actualBase,
        baseBalance,
        allocatableBase,
        isolatedBalance,
        isolatedProfitAdjustment,
        syntheticFlow,
        lockedCoreFinal,
        lockedReturnPct,
        isolatedReturnPct
      };
    });

    const portfolioDrafts = clientDrafts.filter((draft) => !draft.isDemo);
    const syntheticFlowTotal = portfolioDrafts.reduce((sum, draft) => sum + draft.syntheticFlow, 0);
    const generalInitial =
      beyondLastRecorded
        ? undefined
        : (previousFinal ?? 0) + net + syntheticFlowTotal;
    const recordedFinal = beyondLastRecorded ? undefined : finalByDay[day.iso];
    const lockedCoreFinalTotal = portfolioDrafts.reduce((sum, draft) => sum + (draft.lockedCoreFinal ?? 0), 0);
    const lockedClientCount = portfolioDrafts.filter((draft) => draft.lockedCoreFinal !== undefined).length;
    const unlockedDrafts = portfolioDrafts.filter((draft) => draft.lockedCoreFinal === undefined);
    const unlockedBaseTotal = unlockedDrafts.reduce((sum, draft) => sum + Math.max(0, draft.allocatableBase ?? 0), 0);
    const activeUnlockedDrafts = unlockedDrafts.filter(
      (draft) =>
        hasMeaningfulAmount(draft.allocatableBase) ||
        hasMeaningfulAmount(draft.increment) ||
        hasMeaningfulAmount(draft.decrement) ||
        hasMeaningfulAmount(draft.manualProfit)
    );
    const allActiveClientsLocked = lockedClientCount > 0 && activeUnlockedDrafts.length === 0;

    const globalCoreFinalTarget =
      beyondLastRecorded
        ? undefined
        : allActiveClientsLocked
          ? lockedCoreFinalTotal
          : recordedFinal !== undefined
          ? recordedFinal
          : lockedClientCount > 0
            ? lockedCoreFinalTotal + unlockedDrafts.reduce((sum, draft) => sum + Math.max(0, draft.allocatableBase ?? 0), 0)
            : generalInitial;

    const unlockedCoreTargetTotal =
      globalCoreFinalTarget !== undefined
        ? Math.max(0, globalCoreFinalTarget - lockedCoreFinalTotal)
        : undefined;

    clientDrafts.forEach((draft) => {
      const increment = draft.increment;
      const incrementReturnPct = draft.incrementReturnPct;
      const decrement = draft.decrement;
      const manualProfit = draft.manualProfit;
      const manualProfitPct = draft.manualProfitPct;
      const baseBalance = draft.beyondClientLastRecorded ? undefined : draft.baseBalance;
      let coreFinal = draft.lockedCoreFinal;
      if (!draft.beyondClientLastRecorded && coreFinal === undefined) {
        if (draft.isDemo) {
          coreFinal = draft.allocatableBase;
        } else if (unlockedCoreTargetTotal !== undefined && unlockedBaseTotal > 0 && (draft.allocatableBase ?? 0) > 0) {
          const weight = (draft.allocatableBase ?? 0) / unlockedBaseTotal;
          coreFinal = unlockedCoreTargetTotal * weight;
        } else {
          coreFinal = draft.allocatableBase;
        }
      }

      let isolatedFinal = draft.isolatedBalance;
      if (isolatedFinal !== undefined) {
        if (draft.isolatedReturnPct !== undefined) {
          isolatedFinal *= 1 + draft.isolatedReturnPct;
        } else if (draft.allocatableBase !== undefined && draft.allocatableBase !== 0 && coreFinal !== undefined) {
          isolatedFinal *= coreFinal / draft.allocatableBase;
        }
      }

      const finalBalance =
        draft.beyondClientLastRecorded
          ? undefined
          : coreFinal !== undefined
            ? coreFinal + (isolatedFinal ?? 0) + draft.isolatedProfitAdjustment + (manualProfit ?? 0)
            : manualProfit !== undefined
              ? (draft.baseBalance ?? 0) + manualProfit
              : draft.baseBalance;

      if (!draft.beyondClientLastRecorded) {
        clientState[draft.id].netInvested += (increment ?? 0) - (decrement ?? 0) + draft.syntheticFlow;
      }

      const clientProfit =
        !draft.beyondClientLastRecorded && finalBalance !== undefined && baseBalance !== undefined
          ? finalBalance - baseBalance
          : undefined;
      const clientProfitPct =
        clientProfit !== undefined && baseBalance !== undefined && baseBalance !== 0
          ? clientProfit / baseBalance
          : draft.lockedReturnPct;
      const cumulativeClientProfit =
        !draft.beyondClientLastRecorded && finalBalance !== undefined
          ? finalBalance - clientState[draft.id].netInvested
          : undefined;
      const sharePct =
        !draft.isDemo && !draft.beyondClientLastRecorded && globalCoreFinalTarget !== undefined && globalCoreFinalTarget > 0 && coreFinal !== undefined
          ? coreFinal / globalCoreFinalTarget
          : undefined;

      clientRowsById[draft.id].push({
        ...day,
        increment,
        incrementReturnPct,
        decrement,
        manualProfit,
        manualProfitPct,
        baseBalance,
        profit: clientProfit,
        profitPct: clientProfitPct,
        cumulativeProfit: cumulativeClientProfit,
        finalBalance,
        sharePct,
        shareAmount: coreFinal
      });

      if (!draft.beyondClientLastRecorded && finalBalance !== undefined) {
        clientState[draft.id].balance = finalBalance;
        clientState[draft.id].coreBalance = coreFinal ?? 0;
        clientState[draft.id].isolatedBalance =
          (isolatedFinal ?? 0) + draft.isolatedProfitAdjustment + (manualProfit ?? 0);
      }
    });

    const portfolioDayRows = getPortfolioClients()
      .map(({ id }) => clientRowsById[id][clientRowsById[id].length - 1])
      .filter((row): row is ClientDayRow => Boolean(row) && row.finalBalance !== undefined);
    const hasPortfolioDayRows = portfolioDayRows.length > 0;
    const actualInitialTotal = hasPortfolioDayRows
      ? portfolioDayRows.reduce((sum, row) => sum + (row.baseBalance ?? 0), 0)
      : undefined;
    const actualFinalTotal = hasPortfolioDayRows
      ? portfolioDayRows.reduce((sum, row) => sum + (row.finalBalance ?? 0), 0)
      : undefined;
    const actualProfitTotal = hasPortfolioDayRows
      ? portfolioDayRows.reduce((sum, row) => sum + (row.profit ?? ((row.finalBalance ?? 0) - (row.baseBalance ?? 0))), 0)
      : undefined;

    if (actualFinalTotal !== undefined) {
      portfolioDayRows.forEach((row) => {
        row.sharePct = actualFinalTotal > 0 ? (row.finalBalance ?? 0) / actualFinalTotal : undefined;
        row.shareAmount = row.finalBalance;
      });
    }

    const effectiveFinal = beyondLastRecorded ? undefined : actualFinalTotal;
    const profit = beyondLastRecorded ? undefined : actualProfitTotal;
    const monthKey = day.iso.slice(0, 7);
    const monthEndReturn = day.iso === monthEndIso(monthKey) ? portfolioReturnByMonth[monthKey] : undefined;
    const calculatedProfitPct =
      profit !== undefined && actualInitialTotal !== undefined && actualInitialTotal !== 0
        ? profit / actualInitialTotal
        : undefined;
    const profitPct = monthEndReturn ?? calculatedProfitPct;
    if (firstInitial === undefined && actualInitialTotal !== undefined && actualInitialTotal !== 0) {
      firstInitial = actualInitialTotal;
    }
    if (profit !== undefined) {
      cumulativeProfit += profit;
    }

    const row = {
      ...day,
      increments: beyondLastRecorded ? undefined : increments,
      decrements: beyondLastRecorded ? undefined : decrements,
      manualProfits: beyondLastRecorded ? undefined : manualProfits,
      initial: beyondLastRecorded ? undefined : actualInitialTotal,
      final: beyondLastRecorded ? undefined : effectiveFinal,
      profit: beyondLastRecorded ? undefined : profit,
      profitPct: beyondLastRecorded ? undefined : profitPct,
      cumulativeProfit: beyondLastRecorded ? undefined : cumulativeProfit
    };

    dailyRows.push(row);
    dayIndex[day.iso] = row;

    if (!beyondLastRecorded && globalCoreFinalTarget !== undefined && !Number.isNaN(globalCoreFinalTarget)) {
      previousFinal = globalCoreFinalTarget;
    }
  });

  const lastActualRow = [...dailyRows].reverse().find((row) => row.final !== undefined);
  const assets = lastActualRow?.final ?? previousFinal;
  const ytdProfit = cumulativeProfit;
  const ytdReturnPct =
    ytdProfit !== undefined && firstInitial ? ytdProfit / firstInitial : undefined;

  return {
    dailyRows,
    dayIndex,
    clientRowsById,
    totals: {
      assets,
      ytdProfit,
      ytdReturnPct
    }
  };
};
