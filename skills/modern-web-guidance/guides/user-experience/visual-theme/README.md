# Visual theme guides

Shared contract for guides in this folder:

- Treat `color-scheme` as the source of truth for built-in browser UI theming; set it on `:root`/`html` for page-wide themes and only override it on components that establish their own visual surface.
- Keep adaptive design tokens as live custom-property values when descendants may need to re-resolve `light-dark()` under a different `color-scheme`.
- When customizing scrollbars, keep thumb and track colors separate and account for forced/high-contrast modes.
- Use explicit feature detection or documented fallbacks for Baseline Newly Available theme features.

These contracts are intentionally local to visual theming UX guides; unrelated UX guides should not import them unless they share these exact semantics.
