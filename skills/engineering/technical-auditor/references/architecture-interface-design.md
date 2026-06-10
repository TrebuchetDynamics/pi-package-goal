# Interface Design

When the user wants to explore alternative interfaces for a chosen deepening candidate, use this parallel sub-agent pattern. Based on "Design It Twice" (Ousterhout) — your first idea is unlikely to be the best.

Uses the vocabulary in [architecture-language.md](architecture-language.md) — **module**, **interface**, **seam**, **adapter**, **leverage**.

## Process

### 1. Frame the problem space

Before spawning sub-agents, write a user-facing explanation of the problem space for the chosen candidate:

- The constraints any new interface would need to satisfy
- The dependencies it would rely on, and which category they fall into (see [architecture-deepening-dependencies.md](architecture-deepening-dependencies.md))
- A rough illustrative code sketch to ground the constraints — not a proposal, just a way to make the constraints concrete

Show this to the user, then immediately proceed to Step 2. The user reads and thinks while the sub-agents work in parallel.

### 2. Generate alternative designs

Produce 3+ **radically different** interfaces for the deepened module. If parallel sub-agents are available, run them with separate briefs. If not, do three independent design passes yourself and do not let the first pass anchor the others.

Use the same technical brief for every pass: file paths, caller paths, coupling details, dependency category from [architecture-deepening-dependencies.md](architecture-deepening-dependencies.md), validation path, and what sits behind the seam. Give each pass a different design constraint:

- Pass 1: "Minimize the interface — aim for 1–3 entry points max. Maximise leverage per entry point."
- Pass 2: "Maximise flexibility — support many use cases and extension."
- Pass 3: "Optimise for the most common caller — make the default case trivial."
- Pass 4 (if applicable): "Design around ports & adapters for cross-seam dependencies."

Include both [architecture-language.md](architecture-language.md) vocabulary and CONTEXT.md vocabulary in the brief so each design names things consistently with the architecture language and the project's domain language.

Each design outputs:

1. Interface (types, methods, params — plus invariants, ordering, error modes)
2. Usage example showing how callers use it
3. What the implementation hides behind the seam
4. Dependency strategy and adapters (see [architecture-deepening-dependencies.md](architecture-deepening-dependencies.md))
5. Trade-offs — where leverage is high, where it's thin

### 3. Present and compare

Present designs sequentially so the user can absorb each one, then compare them in prose. Contrast by **depth** (leverage at the interface), **locality** (where change concentrates), and **seam placement**.

After comparing, give your own recommendation: which design you think is strongest and why. If elements from different designs would combine well, propose a hybrid. Be opinionated — the user wants a strong read, not a menu.
