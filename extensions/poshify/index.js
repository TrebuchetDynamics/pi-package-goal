import registerPoshifyFollowups from "./followups.js";

export default async function registerPoshify(pi) {
  const [
    { Type },
    { default: registerPosher },
    { hasIssueOutput },
    { runPoshify },
  ] = await Promise.all([
    import("typebox"),
    import("../../node_modules/pi-posher/src/pi-posher.mjs"),
    import("../../node_modules/pi-posher/src/lib/output.mjs"),
    import("../../node_modules/pi-posher/src/poshify.mjs"),
  ]);
  await registerPosher(pi);
  registerPoshifyFollowups({ pi, Type, runPoshify, hasIssueOutput });
}
