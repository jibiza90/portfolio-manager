/**
 * Calcula la rentabilidad tiempo-pesada (TWR - Time-Weighted Return)
 * Elimina el efecto de los flujos de efectivo (aportes/retiros)
 */

export interface TWRPeriod {
  iso: string;
  label: string;
  startValue: number;
  endValue: number;
  flow: number; // incremento - decremento
  periodReturn: number;
}

export interface TWRResult {
  twr: number; // Rentabilidad TWR total (decimal, ej: 0.05 = 5%)
  periods: TWRPeriod[];
  explanation: string;
}

/**
 * Calcula TWR a partir de filas con datos de balance y movimientos
 * @param rows Array de filas con: iso, label, baseBalance/initial, finalBalance/final, increment, decrement
 */
export function calculateTWR(
  rows: Array<{
    iso: string;
    label: string;
    baseBalance?: number;
    finalBalance?: number;
    initial?: number;
    final?: number;
    increment?: number;
    decrement?: number;
  }>
): TWRResult {
  const periods: TWRPeriod[] = [];
  let twrFactor = 1;

  // Filtrar filas con datos válidos
  const validRows = rows.filter(r => {
    const start = r.baseBalance ?? r.initial;
    const end = r.finalBalance ?? r.final;
    return start !== undefined && end !== undefined && start > 0;
  });

  if (validRows.length === 0) {
    return {
      twr: 0,
      periods: [],
      explanation: 'Sin datos suficientes para calcular TWR'
    };
  }

  validRows.forEach((r) => {
    const startValue = r.baseBalance ?? r.initial ?? 0;
    const endValue = r.finalBalance ?? r.final ?? 0;
    const flow = (r.increment ?? 0) - (r.decrement ?? 0);

    // El retorno del periodo se calcula sobre el valor inicial (que ya incluye el flujo del día)
    // Fórmula: (Valor_final - Valor_inicial) / Valor_inicial
    // Donde Valor_inicial = Valor_anterior + Flujo
    const periodReturn = startValue > 0 ? (endValue - startValue) / startValue : 0;

    periods.push({
      iso: r.iso,
      label: r.label,
      startValue,
      endValue,
      flow,
      periodReturn
    });

    // Multiplicar factores: TWR = (1+r1) * (1+r2) * ... - 1
    twrFactor *= (1 + periodReturn);
  });

  const twr = twrFactor - 1;

  const explanation = `La rentabilidad TWR (Time-Weighted Return) mide el rendimiento real de la inversión eliminando el efecto de aportes y retiros. Se calcula dividiendo el periodo en subperiodos entre cada flujo de efectivo, calculando el retorno de cada subperiodo, y multiplicando los factores (1+r) de cada uno. Esto permite comparar rendimientos de forma justa independientemente de cuándo se aportó o retiró dinero.`;

  return { twr, periods, explanation };
}

/**
 * Calcula TWR mensual
 */
export function calculateMonthlyTWR(
  rows: Array<{
    iso: string;
    label: string;
    baseBalance?: number;
    finalBalance?: number;
    initial?: number;
    final?: number;
    increment?: number;
    decrement?: number;
  }>,
  monthIso: string
): TWRResult {
  const monthRows = rows.filter(r => r.iso.startsWith(monthIso));
  return calculateTWR(monthRows);
}

/**
 * Calcula TWR por cada mes y devuelve array con resultados
 */
export function calculateAllMonthsTWR(
  rows: Array<{
    iso: string;
    label: string;
    baseBalance?: number;
    finalBalance?: number;
    initial?: number;
    final?: number;
    increment?: number;
    decrement?: number;
  }>
): Array<{ month: string; twr: number; periods: TWRPeriod[] }> {
  const byMonth = new Map<string, typeof rows>();

  rows.forEach(r => {
    const month = r.iso.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(r);
  });

  const months = Array.from(byMonth.keys()).sort();
  return months.map(month => {
    const result = calculateTWR(byMonth.get(month)!);
    return { month, twr: result.twr, periods: result.periods };
  });
}
