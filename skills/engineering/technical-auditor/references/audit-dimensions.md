# Technical audit dimensions

Use this only after the main `SKILL.md` loads and the audit scope is non-trivial.

## Severity calibration

- **Critical** — exploitable security issue, data loss/corruption, broken deploy/build for intended users, or correctness failure in a core path with no workaround.
- **High** — likely production incident, unsafe default, missing guardrail around important behavior, high-change-risk architecture hotspot, or major testing gap around core logic.
- **Medium** — maintainability/performance/DevEx issue that slows work or creates plausible defects but is not immediately dangerous.
- **Low** — polish, documentation drift, minor consistency issue, or optional cleanup.

## Audit checklist

### Architecture and design

Look for module boundaries, coupling/cohesion, circular dependencies, leaky abstractions, god objects/files, layer violations, scalability bottlenecks, unclear ownership, and cross-cutting behavior with no seam.

### Code quality

Look for duplication, dead code, complexity hotspots, long/branched functions, inconsistent patterns, swallowed errors, missing edge cases, type-safety holes, and comments/docs that contradict implementation.

### Security

Look for hardcoded secrets or credentials, injection risks, unsafe deserialization, weak input validation, authentication/authorization gaps, dependency CVEs, overly permissive configs, risky shell execution, and accidental secret logging. Redact secret values.

### Testing

Look for missing coverage around core business logic, tests that only assert execution, missing unit/integration/e2e layers, flakiness patterns, untestable code, absent fixtures for edge cases, and CI not running relevant tests.

### Performance

Look for N+1 queries/calls, unnecessary allocations/copies, blocking calls in async paths, missing caching/indexing where warranted, unbounded memory/file/queue growth, repeated expensive scans, and startup work that should be lazy.

### Dependencies

Look for outdated, unmaintained, duplicated, unnecessarily heavy, or license-risk dependencies; lockfile drift; undeclared runtime dependencies; and peer dependency mistakes.

### DevEx and operations

Look for setup/build friction, CI/CD gaps, missing lint/format enforcement, unclear release/deploy path, weak logging/observability, poor error reporting, and undocumented environment requirements.

### Documentation

Look for README accuracy, onboarding gaps, missing architecture or ADR context, obsolete docs that contradict code, undocumented critical behavior, and missing user-facing examples.

## Evidence tips

- Use `find`, `rg -n`, manifests, lockfiles, CI files, and targeted `read` calls before broad claims.
- Use line ranges for multi-line evidence.
- For longest/most branched functions, combine language-aware tools when available with simple fallbacks such as `rg -n "function |class |if |switch |catch |for |while"`.
- For dependency risk, prefer lockfiles and package manager audit output when available; if network/audit access is unavailable, mark CVE status `Unverified`.
- For maturity calibration, infer from README, release/package metadata, CI, tests, deployment docs, and issue/ADR history; ask the owner only if recommendations hinge on intended maturity.
