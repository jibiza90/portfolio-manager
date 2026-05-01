import dayjs from 'dayjs';
import { CLIENTS } from '../constants/clients';
import {
  Movement,
  MonthlyHistoryEntry,
  PortfolioSnapshot,
  DailyRow,
  ClientDayRow
} from '../types';
import { YEAR_DAYS } from './dates';

const monthEndIso = (month: string) => dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD');
const normalizeReturnPct = (value?: number) =>
  value === undefined || Number.isNaN(value) ? undefined : Math.abs(value) > 1 ? value / 100 : value;
const MONTHLY_HISTORY_TOLERANCE = 0.5;
const hasMeaningfulAmount = (value?: number) => value !== undefined && Math.abs(value) > MONTHLY_HISTORY_TOLERANCE;

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

const sumMovements = (records: Record<string, Record<string, Movement>>, iso: string) => {
  let incrementTotal = 0;
  let decrementTotal = 0;
  let manualProfitTotal = 0;
  let hasIncrement = false;
  let hasDecrement = false;
  let hasManualProfit = false;

  CLIENTS.forEach(({ id }) => {
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
    if (day.manualProfit !== undefined) {
      manualProfitTotal += day.manualProfit;
      hasManualProfit = true;
    }
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
  const historicalDays: string[] = [];

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
    });
  });

  const recordedFinalDays = Object.entries(finalByDay)
    .filter(([, value]) => value !== undefined && !Number.isNaN(value))
    .map(([iso]) => iso)
    .sort((a, b) => (a > b ? 1 : -1));
  const lastRecordedFinalDay = recordedFinalDays[recordedFinalDays.length - 1];
  const movementDays = Object.values(movementsByClient)
    .flatMap((rows) =>
      Object.entries(rows)
        .filter(([, movement]) =>
          (movement.increment !== undefined && !Number.isNaN(movement.increment)) ||
          (movement.decrement !== undefined && !Number.isNaN(movement.decrement)) ||
          (movement.manualProfit !== undefined && !Number.isNaN(movement.manualProfit))
        )
        .map(([iso]) => iso)
    )
    .sort((a, b) => (a > b ? 1 : -1));
  const lastMovementDay = movementDays[movementDays.length - 1];
  const sortedHistoricalDays = historicalDays.sort((a, b) => (a > b ? 1 : -1));
  const lastHistoricalDay = sortedHistoricalDays[sortedHistoricalDays.length - 1];
  const trackedDays = [lastRecordedFinalDay, lastMovementDay, lastHistoricalDay]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => (a > b ? 1 : -1));
  const lastTrackedDay = trackedDays[trackedDays.length - 1];

  const dailyRows: DailyRow[] = [];
  const dayIndex: Record<string, DailyRow> = {};
  const clientRowsById: Record<string, ClientDayRow[]> = {};
  const clientState: Record<string, { balance: number; netInvested: number }> = {};

  CLIENTS.forEach(({ id }) => {
    clientRowsById[id] = [];
    clientState[id] = { balance: 0, netInvested: 0 };
  });

  let previousFinal: number | undefined;
  let cumulativeProfit = 0;
  let firstInitial: number | undefined;

  YEAR_DAYS.forEach((day) => {
    const beyondLastRecorded = lastTrackedDay !== undefined && day.iso > lastTrackedDay;
    const { increments, decrements, manualProfits, net } = sumMovements(movementsByClient, day.iso);
    const clientDrafts = CLIENTS.map(({ id }) => {
      const movement = movementsByClient[id]?.[day.iso];
      const increment = movement?.increment;
      const incrementReturnPct = movement?.incrementReturnPct;
      const decrement = movement?.decrement;
      const manualProfit = movement?.manualProfit;
      const prevBalance = clientState[id].balance;
      const actualBase = beyondLastRecorded ? undefined : prevBalance + (increment ?? 0) - (decrement ?? 0);
      const monthlyHistory = historicalByClientAndDay[id]?.[day.iso];
      const hasCarryBalance = actualBase !== undefined && Math.abs(actualBase) > MONTHLY_HISTORY_TOLERANCE;
      const isBootstrapMonth = actualBase === undefined || !hasCarryBalance;

      let syntheticFlow = 0;
      let baseBalance = actualBase;
      let lockedCoreFinal: number | undefined;
      let lockedReturnPct: number | undefined;

      if (!beyondLastRecorded && monthlyHistory) {
        const normalizedReturn = normalizeReturnPct(monthlyHistory.returnPct);
        if (monthlyHistory.finalBalance !== undefined && normalizedReturn !== undefined && normalizedReturn > -1) {
          const derivedBase = monthlyHistory.finalBalance / (1 + normalizedReturn);
          const derivedDiff = derivedBase - (actualBase ?? 0);
          const derivedBaseMatchesCarry = Math.abs(derivedDiff) <= MONTHLY_HISTORY_TOLERANCE;
          if (isBootstrapMonth) {
            baseBalance = derivedBase;
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
            normalizedReturn
          );
          lockedCoreFinal = (actualBase ?? 0) * (1 + normalizedReturn) + incrementReturnAdjustment;
          lockedReturnPct = normalizedReturn;
        }
      }

      return {
        id,
        increment,
        incrementReturnPct,
        decrement,
        manualProfit,
        prevBalance,
        actualBase,
        baseBalance,
        syntheticFlow,
        lockedCoreFinal,
        lockedReturnPct
      };
    });

    const syntheticFlowTotal = clientDrafts.reduce((sum, draft) => sum + draft.syntheticFlow, 0);
    const generalInitial =
      beyondLastRecorded
        ? undefined
        : (previousFinal ?? 0) + net + syntheticFlowTotal;
    if (firstInitial === undefined && generalInitial !== undefined && generalInitial !== 0) {
      firstInitial = generalInitial;
    }

    const recordedFinal = beyondLastRecorded ? undefined : finalByDay[day.iso];
    const lockedCoreFinalTotal = clientDrafts.reduce((sum, draft) => sum + (draft.lockedCoreFinal ?? 0), 0);
    const lockedClientCount = clientDrafts.filter((draft) => draft.lockedCoreFinal !== undefined).length;
    const unlockedDrafts = clientDrafts.filter((draft) => draft.lockedCoreFinal === undefined);
    const unlockedBaseTotal = unlockedDrafts.reduce((sum, draft) => sum + Math.max(0, draft.baseBalance ?? 0), 0);
    const activeUnlockedDrafts = unlockedDrafts.filter(
      (draft) =>
        hasMeaningfulAmount(draft.baseBalance) ||
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
            ? lockedCoreFinalTotal + unlockedDrafts.reduce((sum, draft) => sum + Math.max(0, draft.baseBalance ?? 0), 0)
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
      const baseBalance = beyondLastRecorded ? undefined : draft.baseBalance;
      let coreFinal = draft.lockedCoreFinal;
      if (!beyondLastRecorded && coreFinal === undefined) {
        if (unlockedCoreTargetTotal !== undefined && unlockedBaseTotal > 0 && (draft.baseBalance ?? 0) > 0) {
          const weight = (draft.baseBalance ?? 0) / unlockedBaseTotal;
          coreFinal = unlockedCoreTargetTotal * weight;
        } else {
          coreFinal = draft.baseBalance;
        }
      }

      const finalBalance =
        beyondLastRecorded
          ? undefined
          : coreFinal !== undefined
            ? coreFinal + (manualProfit ?? 0)
            : manualProfit !== undefined
              ? (draft.baseBalance ?? 0) + manualProfit
              : draft.baseBalance;

      if (!beyondLastRecorded) {
        clientState[draft.id].netInvested += (increment ?? 0) - (decrement ?? 0) + draft.syntheticFlow;
      }

      const clientProfit =
        !beyondLastRecorded && finalBalance !== undefined && baseBalance !== undefined
          ? finalBalance - baseBalance
          : undefined;
      const clientProfitPct =
        clientProfit !== undefined && baseBalance !== undefined && baseBalance !== 0
          ? clientProfit / baseBalance
          : draft.lockedReturnPct;
      const cumulativeClientProfit =
        !beyondLastRecorded && finalBalance !== undefined
          ? finalBalance - clientState[draft.id].netInvested
          : undefined;
      const sharePct =
        !beyondLastRecorded && globalCoreFinalTarget !== undefined && globalCoreFinalTarget > 0 && coreFinal !== undefined
          ? coreFinal / globalCoreFinalTarget
          : undefined;

      clientRowsById[draft.id].push({
        ...day,
        increment,
        incrementReturnPct,
        decrement,
        manualProfit,
        baseBalance,
        profit: clientProfit,
        profitPct: clientProfitPct,
        cumulativeProfit: cumulativeClientProfit,
        finalBalance,
        sharePct,
        shareAmount: coreFinal
      });

      if (!beyondLastRecorded && finalBalance !== undefined) {
        clientState[draft.id].balance = finalBalance;
      }
    });

    const effectiveFinal =
      beyondLastRecorded
        ? undefined
        : globalCoreFinalTarget !== undefined
          ? globalCoreFinalTarget + (manualProfits ?? 0)
          : undefined;
    const profit =
      effectiveFinal !== undefined && generalInitial !== undefined && !Number.isNaN(effectiveFinal)
        ? effectiveFinal - generalInitial
        : undefined;
    const profitPct =
      profit !== undefined && generalInitial !== undefined && generalInitial !== 0 ? profit / generalInitial : undefined;
    if (profit !== undefined) {
      cumulativeProfit += profit;
    }

    const row = {
      ...day,
      increments: beyondLastRecorded ? undefined : increments,
      decrements: beyondLastRecorded ? undefined : decrements,
      manualProfits: beyondLastRecorded ? undefined : manualProfits,
      initial: beyondLastRecorded ? undefined : generalInitial,
      final: beyondLastRecorded ? undefined : effectiveFinal,
      profit: beyondLastRecorded ? undefined : profit,
      profitPct: beyondLastRecorded ? undefined : profitPct,
      cumulativeProfit: beyondLastRecorded ? undefined : cumulativeProfit
    };

    dailyRows.push(row);
    dayIndex[day.iso] = row;

    if (!beyondLastRecorded && effectiveFinal !== undefined && !Number.isNaN(effectiveFinal)) {
      previousFinal = effectiveFinal;
    }
  });

  const assets = previousFinal;
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
