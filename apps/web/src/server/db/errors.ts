/** Postgres error code 23505 = unique_violation. postgres.js attaches the
 * raw Postgres error code as `.code` on thrown errors. */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505'
  );
}
