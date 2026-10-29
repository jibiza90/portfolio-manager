// Genera los datos fijos de la demostracion /invitado con el mismo calculo que la web.
// Uso: node scripts/generate-guest-demo.mjs
// No lee ni escribe la base de datos: solo usa las cifras de este archivo y guarda src/guest/guestReport.json.
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';

// Rentabilidad general real de cada mes (la de la mayoria de clientes). Anadir aqui cada mes nuevo.
const MONTHLY_RETURNS = {
  '2025-07': 4.83,
  '2025-08': 3.53,
  '2025-09': 5.31,
  '2025-10': 6.12,
  '2025-11': 5.32,
  '2025-12': 2.74,
  '2026-01': 4.71,
  '2026-02': 4.91,
  '2026-03': 4.55,
  '2026-04': 5.14,
  '2026-05': 4.12,
  '2026-06': 5.32,
  '2026-07': 5.08,
  '2026-08': 2.81,
  '2026-09': 5.84
};

// Movimientos ficticios. "rest" = parte del mes que le toca al dinero: lo que queda de mes al aportar
// y lo que ya habia pasado del mes al retirar.
const MOVEMENTS = [
  { iso: '2025-07-01', type: 'increment', amount: 40000 },
  { iso: '2025-09-03', type: 'increment', amount: 10000 },
  { iso: '2025-11-15', type: 'decrement', amount: 15000 },
  { iso: '2026-03-20', type: 'decrement', amount: 38000 },
  { iso: '2026-06-15', type: 'increment', amount: 20000 }
];

export const PENDING_MOVEMENTS = [{ iso: '2026-10-12', type: 'increment', amount: 5000 }];

const daysInMonth = (iso) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0).getDate();
const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const { buildSnapshot } = await server.ssrLoadModule('/src/utils/snapshot.ts');
  const { buildClientReportData, toClientReportPayload } = await server.ssrLoadModule('/src/utils/clientReport.ts');
  const { DEMO_CLIENT_ID } = await server.ssrLoadModule('/src/constants/clients.ts');

  // Se calcula con el hueco del cliente demo (aislado de la cartera) y luego se cambia el id.
  const clientId = DEMO_CLIENT_ID;
  const monthlyHistory = Object.fromEntries(
    Object.entries(MONTHLY_RETURNS).map(([month, pct]) => [month, { returnPct: pct / 100 }])
  );
  const movements = {};
  MOVEMENTS.forEach(({ iso, type, amount }) => {
    const month = iso.slice(0, 7);
    const days = daysInMonth(iso);
    const day = Number(iso.slice(8, 10));
    const monthPct = MONTHLY_RETURNS[month] / 100;
    if (type === 'increment') {
      const share = day === 1 ? 1 : (days - day + 1) / days;
      movements[iso] = day === 1 && month === MOVEMENTS[0].iso.slice(0, 7)
        ? { increment: amount }
        : { increment: amount, incrementReturnPct: round(monthPct * share, 6) };
    } else {
      movements[iso] = { decrement: amount, decrementReturnPct: round(monthPct * ((day - 1) / days), 6) };
    }
  });

  const snapshot = buildSnapshot({}, { [clientId]: movements }, { [clientId]: monthlyHistory });
  const data = buildClientReportData(clientId, 'all', {}, snapshot, { [clientId]: monthlyHistory }, 'Laura Martín Vidal');
  if (!data) throw new Error('No se pudo calcular el informe de ejemplo');
  const payload = {
    ...toClientReportPayload(data),
    clientId: 'invitado',
    clientName: 'Laura Martín Vidal',
    clientCode: 'invitado',
    showContributionJourney: true
  };

  const output = {
    note: 'Datos ficticios de la demostracion /invitado. Generado con scripts/generate-guest-demo.mjs; no editar a mano.',
    generatedFrom: { monthlyReturnsPct: MONTHLY_RETURNS, movements: MOVEMENTS },
    pendingCashMovements: PENDING_MOVEMENTS,
    commissions: { rate: 0.08, paidWithdrawalIsos: MOVEMENTS.filter((m) => m.type === 'decrement').map((m) => m.iso) },
    report: payload
  };
  writeFileSync('src/guest/guestReport.json', `${JSON.stringify(output, null, 2)}\n`);
  const last = payload.monthlyStats?.[payload.monthlyStats.length - 1];
  console.log('meses', payload.monthlyStats?.length, 'saldo final', payload.saldo, 'ultimo', JSON.stringify(last));
  console.log((payload.monthlyStats ?? []).map((m) => `${m.month}: ${m.endBalance?.toFixed?.(2)} (${(m.profitPct ?? 0).toFixed?.(2)}%)`).join('\n'));
} finally {
  await server.close();
}
