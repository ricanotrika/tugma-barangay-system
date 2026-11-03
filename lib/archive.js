export const ARCHIVE_AFTER_MONTHS = 3;

// Returns the date before which an unmatched report counts as stale (UTC, month-end safe).
export function archiveCutoff(now = new Date(), months = ARCHIVE_AFTER_MONTHS) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() - months;
  const first = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(now.getUTCDate(), lastDay);
  return new Date(Date.UTC(
    first.getUTCFullYear(), first.getUTCMonth(), day,
    now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds()
  ));
}
