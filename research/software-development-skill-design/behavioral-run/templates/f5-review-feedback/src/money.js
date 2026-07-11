export function addCents(left, right) {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) throw new TypeError("integer cents required");
  return left + right;
}

export function formatCents(cents) {
  if (!Number.isSafeInteger(cents)) throw new TypeError("integer cents required");
  return "$" + (cents / 100).toFixed(2);
}
