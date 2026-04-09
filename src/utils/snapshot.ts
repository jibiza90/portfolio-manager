import { CLIENTS } from '../constants/clients';
import {
  Movement,
  PortfolioSnapshot,
  DailyRow,
  ClientDayRow
} from '../types';
import { YEAR_DAYS } from './dates';

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
  movementsByClient: Record<string, Record<string, Movement>>
): PortfolioSnapshot => {
  const recordedFinalDays = Object.entries(finalByDay)
    .filter(([, value]) => value !== undefined && !Number.isNaN(value))
    .map(([iso]) => iso)
    .sort((a, b) => (a > b ? 1 : -1));
  const lastRecordedFinalDay = recordedFinalDays[recordedFinalDays.length - 1];
  const manualProfitDays = Object.values(movementsByClient)
    .flatMap((rows) =>
      Object.entries(rows)
        .filter(([, movement]) => movement.manualProfit !== undefined && !Number.isNaN(movement.manualProfit))
        .map(([iso]) => iso)
    )
    .sort((a, b) => (a > b ? 1 : -1));
  const lastManualProfitDay = manualProfitDays[manualProfitDays.length - 1];
  const lastTrackedDay =
    lastRecordedFinalDay && lastManualProfitDay
      ? (lastRecordedFinalDay > lastManualProfitDay ? lastRecordedFinalDay : lastManualProfitDay)
      : lastRecordedFinalDay ?? lastManualProfitDay;

  const dailyRows: DailyRow[] = [];
  const dayIndex: Record<string, DailyRow> = {};
  const clientRowsById: Record<string, ClientDayRow[]> = {};
  const clientBalances: Record<string, { balance: number; cumulativeProfit: number }> = {};

  CLIENTS.forEach(({ id }) => {
    clientRowsById[id] = [];
    clientBalances[id] = { balance: 0, cumulativeProfit: 0 };
  });

  let previousFinal: number | undefined;
  let cumulativeProfit = 0;
  let firstInitial: number | undefined;

  YEAR_DAYS.forEach((day) => {
    const { increments, decrements, manualProfits, net } = sumMovements(movementsByClient, day.iso);
    const netMovements = net;
    const initial = (previousFinal ?? 0) + netMovements;
    if (firstInitial === undefined && initial !== 0) {
      firstInitial = initial;
    }
    const recordedFinal = finalByDay[day.iso];
    const coreFinal =
      recordedFinal ??
      (manualProfits !== undefined && manualProfits !== 0 ? (previousFinal ?? 0) + netMovements : previousFinal);
    const effectiveFinal =
      coreFinal !== undefined
        ? coreFinal + (manualProfits ?? 0)
        : manualProfits !== undefined
          ? (manualProfits ?? 0)
          : undefined;
    const final = recordedFinal;
    const profit =
      effectiveFinal !== undefined && !Number.isNaN(effectiveFinal)
        ? effectiveFinal - initial
        : undefined;
    const profitPct =
      profit !== undefined && initial !== 0 ? profit / initial : undefined;
    if (profit !== undefined) {
      cumulativeProfit += profit;
    }

    const beyondLastRecorded = lastTrackedDay !== undefined && day.iso > lastTrackedDay;

    const row = {
      ...day,
      increments: beyondLastRecorded ? undefined : increments,
      decrements: beyondLastRecorded ? undefined : decrements,
      manualProfits: beyondLastRecorded ? undefined : manualProfits,
      initial: beyondLastRecorded ? undefined : initial,
      final:
        beyondLastRecorded
          ? undefined
          : recordedFinal !== undefined || manualProfits !== undefined
            ? effectiveFinal
            : final,
      profit: beyondLastRecorded ? undefined : profit,
      profitPct: beyondLastRecorded ? undefined : profitPct,
      cumulativeProfit: beyondLastRecorded ? undefined : cumulativeProfit
    };

    dailyRows.push(row);
    dayIndex[day.iso] = row;

    // Client level calculations
    const clientBases: Record<string, number> = {};
    let totalBase = 0;
    CLIENTS.forEach(({ id }) => {
      const clientMovements = movementsByClient[id]?.[day.iso];
      const incrementAmount = clientMovements?.increment ?? 0;
      const decrementAmount = clientMovements?.decrement ?? 0;
      const previousBalance = clientBalances[id].balance;
      const baseBalance = beyondLastRecorded ? 0 : previousBalance + incrementAmount - decrementAmount;
      clientBases[id] = baseBalance;
      totalBase += baseBalance > 0 ? baseBalance : 0;
    });

    CLIENTS.forEach(({ id }) => {
      const incrementRaw = movementsByClient[id]?.[day.iso]?.increment;
      const decrementRaw = movementsByClient[id]?.[day.iso]?.decrement;
      const manualProfitRaw = movementsByClient[id]?.[day.iso]?.manualProfit;
      const increment = incrementRaw ?? undefined;
      const decrement = decrementRaw ?? undefined;
      const manualProfit = manualProfitRaw ?? undefined;
      const baseBalance = clientBases[id];
      let clientProfit: number | undefined;
      let clientProfitPct: number | undefined;
      let finalBalance = beyondLastRecorded ? undefined : baseBalance;
      let sharePct: number | undefined;
      let shareAmount: number | undefined;

      if (!beyondLastRecorded && coreFinal !== undefined && !Number.isNaN(coreFinal) && totalBase > 0) {
        const weight = baseBalance > 0 ? baseBalance / totalBase : 0;
        sharePct = weight;
        shareAmount = coreFinal * weight;
        if (shareAmount !== undefined) {
          clientProfit = shareAmount - baseBalance + (manualProfit ?? 0);
          clientBalances[id].cumulativeProfit += clientProfit;
          finalBalance = shareAmount + (manualProfit ?? 0);
          if (baseBalance !== 0) {
            clientProfitPct = clientProfit / baseBalance;
          }
        }
      } else if (!beyondLastRecorded && manualProfit !== undefined) {
        clientProfit = manualProfit;
        clientBalances[id].cumulativeProfit += clientProfit;
        finalBalance = baseBalance + manualProfit;
        if (baseBalance !== 0) {
          clientProfitPct = clientProfit / baseBalance;
        }
      }

      clientRowsById[id].push({
        ...day,
        increment,
        decrement,
        manualProfit,
        baseBalance: beyondLastRecorded ? undefined : baseBalance,
        profit: beyondLastRecorded ? undefined : clientProfit,
        profitPct: beyondLastRecorded ? undefined : clientProfitPct,
        cumulativeProfit: beyondLastRecorded ? undefined : clientBalances[id].cumulativeProfit,
        finalBalance,
        sharePct: beyondLastRecorded ? undefined : sharePct,
        shareAmount: beyondLastRecorded ? undefined : shareAmount
      });

      clientBalances[id].balance = beyondLastRecorded ? clientBalances[id].balance : (finalBalance ?? clientBalances[id].balance);
    });

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
