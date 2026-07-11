export function mergeDefaults(defaults, overrides) {
  const result = defaults;
  Object.assign(result, overrides);
  return result;
}
