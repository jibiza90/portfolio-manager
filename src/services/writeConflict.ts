export class StaleWriteConflictError extends Error {
  readonly code = 'stale-write-conflict';

  constructor(message = 'Los datos remotos han cambiado desde otra pestaña o dispositivo.') {
    super(message);
    this.name = 'StaleWriteConflictError';
  }
}

export const isStaleWriteConflict = (error: unknown): error is StaleWriteConflictError =>
  error instanceof StaleWriteConflictError ||
  (typeof error === 'object' && error !== null && 'code' in error && error.code === 'stale-write-conflict');
