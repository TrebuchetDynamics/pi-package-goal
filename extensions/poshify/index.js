import { Type } from "typebox";
import registerPosher from "../../node_modules/pi-posher/src/pi-posher.mjs";
import { hasIssueOutput } from "../../node_modules/pi-posher/src/lib/output.mjs";
import { runPoshify } from "../../node_modules/pi-posher/src/poshify.mjs";
import registerPoshifyFollowups from "./followups.js";

export default async function registerPoshify(pi) {
  await registerPosher(pi);
  registerPoshifyFollowups({ pi, Type, runPoshify, hasIssueOutput });
}
