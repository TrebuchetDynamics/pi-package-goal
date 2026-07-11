export function parseRetryCount(value, fallback = 3) {
  const parsed = Number(value);
  return parsed || fallback;
}
