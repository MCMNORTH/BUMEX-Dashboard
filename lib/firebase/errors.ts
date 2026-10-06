export class DbQueryError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

// Mirrors plpgsql `raise exception '...'`, which surfaces with code P0001.
export function raiseException(message: string) {
  return new DbQueryError(message, "P0001");
}
