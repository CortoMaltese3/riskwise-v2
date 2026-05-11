/**
 * Returns true when the OS-level `prefers-reduced-motion: reduce` media query
 * matches. Centralised so chart components — and any future motion code —
 * share the same SSR / jsdom-safe fallback.
 *
 * Returns `false` when `window` or `matchMedia` is unavailable (SSR, older
 * jsdom builds without the API). This is the conservative default: features
 * that gate animation on this flag will animate, matching the previous
 * unconditional behaviour.
 */
export function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  const mql = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  return Boolean(mql && mql.matches);
}

export default prefersReducedMotion;
