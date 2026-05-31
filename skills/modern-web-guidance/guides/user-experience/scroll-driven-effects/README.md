# Scroll-driven effect guides

Shared contract for guides in this folder:

- Prefer native CSS Scroll-Driven Animations over JavaScript scroll listeners when the browser supports the needed timeline and range primitives.
- Gate implementations with both timeline and range feature detection so browsers with partial support do not receive broken animations.
- Respect `prefers-reduced-motion`; decorative scroll effects should be disabled or reduced rather than forcing motion.
- Keep animation shorthand declarations before `animation-timeline` and `animation-range` so the shorthand does not reset the timeline binding.
- Do not recommend `scroll-timeline-polyfill`; use progressive enhancement for decorative effects or a focused JavaScript fallback only when the effect is core to the experience.
- Limit fallbacks to the same behavior class: scroll timelines generally map to throttled/root scroll progress, while view timelines generally map to `IntersectionObserver`-based visibility progress.

These contracts are intentionally local to scroll-driven visual-effect UX guides; unrelated scroll-state or snap-state guides should not import them unless they share these exact semantics.
