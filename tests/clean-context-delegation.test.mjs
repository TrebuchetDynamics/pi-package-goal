import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

// --- Task 1: shared contract exists with required structure ---
const contractRel = "skills/shared/CLEAN-CONTEXT-DELEGATION.md";
assert.ok(fs.existsSync(path.join(root, contractRel)), `missing ${contractRel}`);
const contract = read(contractRel);
const requiredHeadings = [
  "# Clean-Context Delegation",
  "## Roles",
  "## Clean-context briefing",
  "## Consuming the verdict",
  "## Capability degradation",
  "## Scope guardrails",
];
for (const heading of requiredHeadings) {
  assert.ok(contract.includes(heading), `contract missing heading: ${heading}`);
}
assert.ok(/[Aa]dvisor/.test(contract), "contract must define the advisor role");
assert.ok(/[Rr]eviewer/.test(contract), "contract must define the reviewer role");
assert.ok(
  contract.includes("COMMON-CONTRACT.md"),
  "contract must link back to the shared common contract",
);

// --- Task 2: goal operating-contract cross-links the contract ---
const goalContract = read("skills/planning/goal/references/operating-contract.md");
assert.ok(
  goalContract.includes("../../../shared/CLEAN-CONTEXT-DELEGATION.md"),
  "goal operating-contract must link the clean-context delegation contract",
);

// --- Task 3: autoreview cross-links the contract ---
const autoreview = read("skills/delivery/autoreview/SKILL.md");
assert.ok(
  autoreview.includes("../../shared/CLEAN-CONTEXT-DELEGATION.md"),
  "autoreview must link the clean-context delegation contract",
);

// --- Task 4: council-review cross-links the contract ---
const councilReview = read("skills/planning/grill-with-docs/references/council-review.md");
assert.ok(
  councilReview.includes("../../../shared/CLEAN-CONTEXT-DELEGATION.md"),
  "council-review must link the clean-context delegation contract",
);

// --- Task 5: lgtm cross-links the contract ---
const lgtm = read("skills/planning/lgtm/SKILL.md");
assert.ok(
  lgtm.includes("../../shared/CLEAN-CONTEXT-DELEGATION.md"),
  "lgtm must link the clean-context delegation contract",
);

console.log("clean-context-delegation ok");
