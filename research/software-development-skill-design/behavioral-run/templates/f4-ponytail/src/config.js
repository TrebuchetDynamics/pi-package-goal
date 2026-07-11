export function normalizeConfig(config) {
  return {
    retries: config.retries ?? 3,
    timeout: config.timeout ?? 1000,
  };
}
