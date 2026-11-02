import { useCallback, useEffect, useState } from 'react';
import { sanitizeRecurringState, toFirestoreRecurringState, type RecurringWithdrawalsState } from '../utils/recurringWithdrawals';
import { db } from './firebaseApp';

// Lista de retiradas fijas y ticks del admin. Va en la coleccion `portfolio`, que solo puede leer y escribir
// el admin. Es un documento aparte: no toca los datos de los clientes.
export const RECURRING_WITHDRAWALS_DOC_PATH = 'portfolio/recurring-withdrawals';

const EMPTY: RecurringWithdrawalsState = { rules: [], checks: {} };

// Aplica un cambio sobre la ultima version guardada (si hay otra pestaña abierta, no se pisan).
export const updateRecurringWithdrawals = async (
  change: (current: RecurringWithdrawalsState) => RecurringWithdrawalsState
) => {
  const ref = db.doc(RECURRING_WITHDRAWALS_DOC_PATH);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? sanitizeRecurringState(snapshot.data()) : EMPTY;
    const next = change(current);
    transaction.set(ref, { ...toFirestoreRecurringState(next), updatedAt: Date.now() });
  });
};

export const useRecurringWithdrawals = (enabled: boolean) => {
  const [state, setState] = useState<RecurringWithdrawalsState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    return db.doc(RECURRING_WITHDRAWALS_DOC_PATH).onSnapshot(
      (snapshot) => {
        setState(snapshot.exists ? sanitizeRecurringState(snapshot.data()) : EMPTY);
        setError(null);
      },
      () => setError('No se pudieron cargar las retiradas fijas.')
    );
  }, [enabled]);

  const update = useCallback(async (change: (current: RecurringWithdrawalsState) => RecurringWithdrawalsState) => {
    try {
      await updateRecurringWithdrawals(change);
      setError(null);
    } catch (cause) {
      console.error('No se pudieron guardar las retiradas fijas', cause);
      setError('No se pudo guardar. Inténtalo de nuevo.');
      throw cause;
    }
  }, []);

  return { state, error, update };
};
