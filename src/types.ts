export interface Movement {
  increment?: number;
  incrementReturnPct?: number;
  decrement?: number;
  manualProfit?: number;
  manualProfitPct?: number;
}

export interface MonthlyHistoryEntry {
  finalBalance?: number;
  returnPct?: number;
}

export interface ClientDescriptor {
  id: string;
  name: string;
}

export interface DailyRow {
  iso: string;
  label: string;
  weekday: string;
  isWeekend: boolean;
  increments?: number;
  decrements?: number;
  manualProfits?: number;
  initial?: number;
  final?: number;
  profit?: number;
  profitPct?: number;
  cumulativeProfit?: number;
}

export interface ClientDayRow {
  iso: string;
  label: string;
  weekday: string;
  isWeekend: boolean;
  increment?: number;
  incrementReturnPct?: number;
  decrement?: number;
  manualProfit?: number;
  manualProfitPct?: number;
  baseBalance?: number;
  profit?: number;
  profitPct?: number;
  cumulativeProfit?: number;
  finalBalance?: number;
  sharePct?: number;
  shareAmount?: number;
}

export interface PortfolioSnapshot {
  dailyRows: DailyRow[];
  dayIndex: Record<string, DailyRow>;
  clientRowsById: Record<string, ClientDayRow[]>;
  totals: {
    assets?: number;
    ytdProfit?: number;
    ytdReturnPct?: number;
  };
}

export interface PersistedState {
  finalByDay: Record<string, number | undefined>;
  movementsByClient: Record<string, Record<string, Movement>>;
  monthlyHistoryByClient: Record<string, Record<string, MonthlyHistoryEntry>>;
}
