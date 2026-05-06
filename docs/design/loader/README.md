# Splash loader — design exploration

Mockups produced while scoping [#283](https://github.com/CortoMaltese3/riskwise-v2/issues/283) (refactor of `public/loader.html`).

Open [`index.html`](./index.html) in a browser to see both candidates rendered side-by-side at the proposed splash size (480x320). Status text in each mockup cycles every ~1.8s to simulate live boot phases — in the real implementation those strings are driven by `loader:status` IPC events from `public/electron.js`.

## Candidates

| File | Name | Notes |
| --- | --- | --- |
| [`design-1-minimal.html`](./design-1-minimal.html) | Minimal polish | **Selected.** Same dark teal palette as today, gear retained, adds wordmark + status line + version. Smallest visual jump from the current splash. |
| [`design-2-brand.html`](./design-2-brand.html) | Brand-forward | Documented alternative. Gradient backdrop, logo mark + indeterminate shimmer bar in place of the gear. Reads as more "premium" but loses the gear motif and the shimmer carries no real progress information. |

## Why Design 1

The user-stated goal was "make it prettier" without a brand reset. Design 1 delivers that with the smallest set of changes (background stays, gear stays, palette token already exists in `src/theme/theme.ts` as `palette.loader.main`) while still picking up the live-status behaviour the user explicitly liked from `LoadModal.jsx`.

## Why Design 2 is documented, not deleted

If the product later ships per-client distributions with distinct visual identities, a logo-mark-first splash (Design 2) is the more obvious starting point for clients that don't want the gear. The themable architecture defined in #283 (`public/loader-themes/<name>/`) makes that swap a matter of editing CSS variables and replacing `mark.svg` — no code changes — so keeping Design 2 reachable as a reference is cheap and useful.

## Triggers for revisiting

- A client brand requires a non-gear mark.
- We add motion / animation guidelines to the design system that conflict with the current static gear.
- Boot reliably exceeds ~5s, at which point a phased-checklist layout becomes worth exploring.
