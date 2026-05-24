---
name: grill-me
description: Stress-test a plan or design with self-answer-first interrogation, asking the user only for hard owner-decision or pivot questions. Use when user wants to stress-test a plan, get grilled on their design, fill requirement gaps, reduce unnecessary questions, or mentions "grill me".
---

Interview the plan until the remaining uncertainty is explicit, but use self-answer-first mode:

1. List the important requirement gaps or design branches internally.
2. Immediately answer easy questions yourself from context, code, docs, git state, tests, or reasonable defaults.
3. Explore the codebase instead of asking whenever repository evidence can answer the question.
4. Only ask the user when the remaining question is hard: an owner decision, product tradeoff, irreversible direction, risk acceptance, or pivot.
5. When asking, ask one question at a time and include your recommended answer plus the consequence of accepting it.
6. If no hard question remains, proceed without asking the user and state the assumptions you used.
7. If the right move is to pivot, name the pivot clearly and ask only for that pivot decision.

Do not ask checklist-style easy questions. Do not ask questions just to confirm facts that can be inspected.
