# Clean-Context Advisor + Reviewer Pattern Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bundled, capability-aware "clean-context advisor + reviewer" delegation pattern and cross-link it from the package's existing review/planning skills and README.

**Architecture:** One new shared contract (`skills/shared/CLEAN-CONTEXT-DELEGATION.md`) is the single source of truth for the advisor (plan-time) and reviewer (change-time) roles, the clean-context briefing rule, and capability degradation. Existing skills get short cross-links to it instead of restating it. A single new Node test (`tests/clean-context-delegation.test.mjs`) grows one assertion per task and is wired into `npm test`.

**Tech Stack:** Markdown skill/reference docs; Node `*.test.mjs` scripts using `node:assert/strict` (no test runner — top-level asserts, `console.log("<name> ok")` on success); `package.json` npm scripts.

---

## File Structure

- **Create:** `skills/shared/CLEAN-CONTEXT-DELEGATION.md` — the advisor/reviewer contract (single source of truth).
- **Create:** `tests/clean-context-delegation.test.mjs` — asserts the contract's required headings, the cross-links from each skill, and the README reference.
- **Modify:** `package.json` — add the new test to `test:package`.
- **Modify:** `skills/planning/goal/references/operating-contract.md` — advisor at plan checkpoint, reviewer before completion audit.
- **Modify:** `skills/delivery/autoreview/SKILL.md` — frame as reviewer role; note clean-context dispatch upgrade.
- **Modify:** `skills/planning/grill-with-docs/references/council-review.md` — cross-link advisor role; clean-context upgrade over in-session lenses.
- **Modify:** `skills/planning/lgtm/SKILL.md` — one-line cross-link on consuming a verdict.
- **Modify:** `README.md` — one row in "What you get".

**Relative link targets** (verified against existing `../../shared/COMMON-CONTRACT.md` usage):
- from `skills/planning/goal/references/operating-contract.md` → `../../../shared/CLEAN-CONTEXT-DELEGATION.md`
- from `skills/delivery/autoreview/SKILL.md` → `../../shared/CLEAN-CONTEXT-DELEGATION.md`
- from `skills/planning/grill-with-docs/references/council-review.md` → `../../../shared/CLEAN-CONTEXT-DELEGATION.md`
- from `skills/planning/lgtm/SKILL.md` → `../../shared/CLEAN-CONTEXT-DELEGATION.md`

---

## Task 1: Create the shared contract + its test

**Files:**
- Create: `skills/shared/CLEAN-CONTEXT-DELEGATION.md`
- Create: `tests/clean-context-delegation.test.mjs`
- Modify: `package.json` (test:package script)

- [ ] **Step 1: Write the failing test**

Create `tests/clean-context-delegation.test.mjs`:

```javascript
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

console.log("clean-context-delegation ok");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/clean-context-delegation.test.mjs`
Expected: FAIL — `missing skills/shared/CLEAN-CONTEXT-DELEGATION.md`

- [ ] **Step 3: Create the shared contract**

Create `skills/shared/CLEAN-CONTEXT-DELEGATION.md`:

```markdown
# Clean-Context Delegation

Use this contract whenever a skill wants a second opinion from an **advisor** or
**reviewer**. The value of these roles comes from *unbiased, clean context* — a delegate
that has not seen the main agent's reasoning and therefore will not rubber-stamp it.
Treat this as a baseline; a skill's own instructions win if they are stricter.

## Roles

- **Advisor** — strategic/architecture/product second opinion on a *plan or decision,
  before execution*. Use for high-leverage or cross-cutting decisions (architecture
  seams, ownership, product trade-offs). Skip for small reversible choices the repository
  evidence already settles.
- **Reviewer** — code quality / security / UX second opinion on *changes, after
  execution*. Use before completion or ship on non-trivial diffs.

## Clean-context briefing

When you delegate, brief the delegate with:

1. the objective,
2. the artifact under review (the plan, or the diff plus its intent),
3. the relevant constraints, and
4. the exact verdict you need back (for example "name the top risk and one alternative",
   or "list correctness, security, and UX findings").

Do **not** include your own justification chain or your preferred answer. That is exactly
what biases the delegate toward agreement and destroys the point of a clean context.

## Consuming the verdict

- The verdict is advisory. Never blind-apply it.
- Verify every codebase claim against live source before acting on it; when a finding
  depends on cross-module impact and `codebase-map-understand.md` exists, use it for
  caller/path leads and verify them in source.
- Reject speculative edge cases, broad rewrites, and over-complicating fixes with a
  concise reason.
- If the delegate and the main agent disagree, surface the trade-off. Ask the smallest
  owner-decision question only when repository evidence does not resolve it.

## Capability degradation

- **If the host exposes a clean-context dispatch tool** (a fork, subagent, or task tool):
  spawn one delegate with a clean context and the briefing above. This is the preferred
  path.
- **Otherwise:** run a single role-lens pass in the current context **and say so** —
  label it explicitly as an in-context lens that lacks context isolation, so the user
  knows it is the weaker fallback. (`grill-with-docs` council mode documents the
  local-lens form.)
- Never present an in-context lens as if it were a clean-context second opinion.

## Scope guardrails

- Delegation is opt-in and risk-justified, not mandatory on every action.
- The reviewer does not run nested reviewers or reviewer panels by default; panels remain
  opt-in (consistent with `autoreview`).

## Shared contract

Follow [the shared skill contract](./COMMON-CONTRACT.md) for repo study, dirty-worktree
hygiene, verification evidence, safe handoffs, and safety defaults.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/clean-context-delegation.test.mjs`
Expected: PASS — prints `clean-context-delegation ok`

- [ ] **Step 5: Wire the test into npm test**

In `package.json`, find the `test:package` script:

```json
"test:package": "node tests/validate-package.mjs && node tests/pi-bridge-lifecycle.test.mjs && node tests/pi-bridge-command-grammar.test.mjs && node tests/candidates-folder-refactor.test.mjs && node tests/skill-helper-scripts.test.mjs",
```

Append the new test at the end so it becomes:

```json
"test:package": "node tests/validate-package.mjs && node tests/pi-bridge-lifecycle.test.mjs && node tests/pi-bridge-command-grammar.test.mjs && node tests/candidates-folder-refactor.test.mjs && node tests/skill-helper-scripts.test.mjs && node tests/clean-context-delegation.test.mjs",
```

- [ ] **Step 6: Run the full package test to confirm nothing else broke**

Run: `npm run test:package`
Expected: PASS — all listed tests pass, ending with `clean-context-delegation ok`. (In particular, `validate-package.mjs` must still pass; adding a second `.md` under `skills/shared/` is allowed — `COMMON-CONTRACT.md` already lives there without a `SKILL.md`.)

- [ ] **Step 7: Commit**

```bash
git add skills/shared/CLEAN-CONTEXT-DELEGATION.md tests/clean-context-delegation.test.mjs package.json
git commit -m "Add clean-context delegation contract and test"
```

---

## Task 2: Cross-link the goal operating-contract

**Files:**
- Modify: `skills/planning/goal/references/operating-contract.md`
- Test: `tests/clean-context-delegation.test.mjs`

- [ ] **Step 1: Add the failing assertion**

In `tests/clean-context-delegation.test.mjs`, immediately before the final
`console.log(...)` line, add:

```javascript
// --- Task 2: goal operating-contract cross-links the contract ---
const goalContract = read("skills/planning/goal/references/operating-contract.md");
assert.ok(
  goalContract.includes("../../../shared/CLEAN-CONTEXT-DELEGATION.md"),
  "goal operating-contract must link the clean-context delegation contract",
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/clean-context-delegation.test.mjs`
Expected: FAIL — `goal operating-contract must link the clean-context delegation contract`

- [ ] **Step 3: Add the cross-links**

Read `skills/planning/goal/references/operating-contract.md`. It has a checkpoint/slice
section (around the slice-result lines near line 63) and a "Completion audit details"
section (around line 117). Add, in the slice/checkpoint area, a bullet:

```markdown
- For a high-leverage or cross-cutting plan, optionally get an **advisor** second opinion before executing — see [clean-context delegation](../../../shared/CLEAN-CONTEXT-DELEGATION.md). Keep it advisory; do not turn the slice loop into a mandatory gate.
```

And in the "Completion audit details" section, add a bullet:

```markdown
- For a non-trivial diff, optionally get a **reviewer** second opinion before the completion audit — see [clean-context delegation](../../../shared/CLEAN-CONTEXT-DELEGATION.md). Findings are advisory; verify them against source before acting.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/clean-context-delegation.test.mjs`
Expected: PASS — prints `clean-context-delegation ok`

- [ ] **Step 5: Commit**

```bash
git add skills/planning/goal/references/operating-contract.md tests/clean-context-delegation.test.mjs
git commit -m "Cross-link advisor/reviewer from goal operating-contract"
```

---

## Task 3: Frame autoreview as the reviewer role

**Files:**
- Modify: `skills/delivery/autoreview/SKILL.md`
- Test: `tests/clean-context-delegation.test.mjs`

- [ ] **Step 1: Add the failing assertion**

In `tests/clean-context-delegation.test.mjs`, immediately before the final
`console.log(...)` line, add:

```javascript
// --- Task 3: autoreview cross-links the contract ---
const autoreview = read("skills/delivery/autoreview/SKILL.md");
assert.ok(
  autoreview.includes("../../shared/CLEAN-CONTEXT-DELEGATION.md"),
  "autoreview must link the clean-context delegation contract",
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/clean-context-delegation.test.mjs`
Expected: FAIL — `autoreview must link the clean-context delegation contract`

- [ ] **Step 3: Add the cross-link**

In `skills/delivery/autoreview/SKILL.md`, just under the opening paragraph
("Run a structured closeout review helper... This is advisory code review, not approval
routing."), add:

```markdown
This skill is the **reviewer** role from [clean-context delegation](../../shared/CLEAN-CONTEXT-DELEGATION.md): a second opinion on changes. When the host exposes a fork/subagent tool, a clean-context delegate is the preferred dispatch; the helper script below is the concrete implementation when it is available.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/clean-context-delegation.test.mjs`
Expected: PASS — prints `clean-context-delegation ok`

- [ ] **Step 5: Commit**

```bash
git add skills/delivery/autoreview/SKILL.md tests/clean-context-delegation.test.mjs
git commit -m "Frame autoreview as the clean-context reviewer role"
```

---

## Task 4: Cross-link the council-review advisor role

**Files:**
- Modify: `skills/planning/grill-with-docs/references/council-review.md`
- Test: `tests/clean-context-delegation.test.mjs`

- [ ] **Step 1: Add the failing assertion**

In `tests/clean-context-delegation.test.mjs`, immediately before the final
`console.log(...)` line, add:

```javascript
// --- Task 4: council-review cross-links the contract ---
const councilReview = read("skills/planning/grill-with-docs/references/council-review.md");
assert.ok(
  councilReview.includes("../../../shared/CLEAN-CONTEXT-DELEGATION.md"),
  "council-review must link the clean-context delegation contract",
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/clean-context-delegation.test.mjs`
Expected: FAIL — `council-review must link the clean-context delegation contract`

- [ ] **Step 3: Add the cross-link**

In `skills/planning/grill-with-docs/references/council-review.md`, under the
"Local docs council" section heading, add this note before the numbered list:

```markdown
These local role lenses run inside the main context, so they lack context isolation. When the host exposes a fork/subagent tool, prefer a clean-context **advisor** delegate instead — see [clean-context delegation](../../../shared/CLEAN-CONTEXT-DELEGATION.md). Use the local lenses below as the labeled fallback, and say which one you used.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/clean-context-delegation.test.mjs`
Expected: PASS — prints `clean-context-delegation ok`

- [ ] **Step 5: Commit**

```bash
git add skills/planning/grill-with-docs/references/council-review.md tests/clean-context-delegation.test.mjs
git commit -m "Cross-link advisor role from council-review"
```

---

## Task 5: Cross-link lgtm verdict consumption

**Files:**
- Modify: `skills/planning/lgtm/SKILL.md`
- Test: `tests/clean-context-delegation.test.mjs`

- [ ] **Step 1: Add the failing assertion**

In `tests/clean-context-delegation.test.mjs`, immediately before the final
`console.log(...)` line, add:

```javascript
// --- Task 5: lgtm cross-links the contract ---
const lgtm = read("skills/planning/lgtm/SKILL.md");
assert.ok(
  lgtm.includes("../../shared/CLEAN-CONTEXT-DELEGATION.md"),
  "lgtm must link the clean-context delegation contract",
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/clean-context-delegation.test.mjs`
Expected: FAIL — `lgtm must link the clean-context delegation contract`

- [ ] **Step 3: Add the cross-link**

In `skills/planning/lgtm/SKILL.md`, after the "What To Do" numbered list, add:

```markdown
When the approval accepts an advisor or reviewer verdict, treat that verdict as advisory input rather than authority — see [clean-context delegation](../../shared/CLEAN-CONTEXT-DELEGATION.md). Verify any codebase claim against source before continuing.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/clean-context-delegation.test.mjs`
Expected: PASS — prints `clean-context-delegation ok`

- [ ] **Step 5: Commit**

```bash
git add skills/planning/lgtm/SKILL.md tests/clean-context-delegation.test.mjs
git commit -m "Cross-link verdict consumption from lgtm"
```

---

## Task 6: Add the README row

**Files:**
- Modify: `README.md`
- Test: `tests/clean-context-delegation.test.mjs`

- [ ] **Step 1: Add the failing assertion**

In `tests/clean-context-delegation.test.mjs`, immediately before the final
`console.log(...)` line, add:

```javascript
// --- Task 6: README references the pattern ---
const readme = read("README.md");
assert.ok(
  readme.includes("CLEAN-CONTEXT-DELEGATION.md") ||
    /clean-context (advisor|delegation)/i.test(readme),
  "README must reference the clean-context advisor/reviewer pattern",
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/clean-context-delegation.test.mjs`
Expected: FAIL — `README must reference the clean-context advisor/reviewer pattern`

- [ ] **Step 3: Add the README row**

In `README.md`, in the "## What you get" table, add a row after the
"Engineering loops" row:

```markdown
| Clean-context review | Get an unbiased advisor (plan-time) or reviewer (change-time) second opinion, dispatched to a clean context when a fork/subagent tool is available. | `autoreview`, `grill-with-docs` |
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/clean-context-delegation.test.mjs`
Expected: PASS — prints `clean-context-delegation ok`

- [ ] **Step 5: Commit**

```bash
git add README.md tests/clean-context-delegation.test.mjs
git commit -m "Document clean-context advisor/reviewer pattern in README"
```

---

## Task 7: Full validation

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: PASS — every suite (`test:package`, `test:extensions`, `test:assets`,
`test:goal`) passes, including `clean-context-delegation ok`.

- [ ] **Step 2: Confirm the worktree is clean**

Run: `git status --short`
Expected: empty output (all changes committed across Tasks 1–6).

- [ ] **Step 3: If anything failed, fix and re-run**

If `npm test` reports a failure (for example `validate-package.mjs` enforcing a structural
rule on `skills/shared/`), read the failing assertion's message, fix the offending file at
the right ownership boundary, re-run `npm test` until green, then commit the fix:

```bash
git add -A
git commit -m "Fix clean-context delegation validation"
```

---

## Self-Review Notes

- **Spec coverage:** Component 1 (shared contract) → Task 1. Component 2 cross-links →
  goal (Task 2), autoreview (Task 3), council-review (Task 4), lgtm (Task 5), README
  (Task 6). Testing section → Task 1 (test + package.json wiring) grown per task, Task 7
  (full `npm test`). Non-goals respected: no new extension, no command, no
  observational-memory.
- **Type/string consistency:** the test asserts the same six headings the contract
  defines (`# Clean-Context Delegation`, `## Roles`, `## Clean-context briefing`,
  `## Consuming the verdict`, `## Capability degradation`, `## Scope guardrails`) and the
  same relative link strings each cross-link task inserts.
