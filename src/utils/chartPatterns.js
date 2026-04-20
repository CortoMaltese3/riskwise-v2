// Custom Chart.js-compatible canvas pattern fills. Patterns act as a
// non-color secondary differentiator (WCAG 1.4.1): bar/dataset identity is
// encoded by both color AND texture so users with color-vision deficiencies
// or monochrome print-outs can still tell series apart. Returns a
// CanvasPattern when a canvas is available, otherwise falls back to the
// plain color so server-side / jsdom rendering stays safe.

const TILE = 10;

const createTile = () => {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = TILE;
  return canvas;
};

const paintDiagonal = (ctx, stroke) => {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-2, TILE + 2);
  ctx.lineTo(TILE + 2, -2);
  ctx.moveTo(-2, TILE / 2);
  ctx.lineTo(TILE / 2, -2);
  ctx.moveTo(TILE / 2, TILE + 2);
  ctx.lineTo(TILE + 2, TILE / 2);
  ctx.stroke();
};

const paintReverseDiagonal = (ctx, stroke) => {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-2, -2);
  ctx.lineTo(TILE + 2, TILE + 2);
  ctx.moveTo(-2, TILE / 2);
  ctx.lineTo(TILE / 2, TILE + 2);
  ctx.moveTo(TILE / 2, -2);
  ctx.lineTo(TILE + 2, TILE / 2);
  ctx.stroke();
};

const paintCrossHatch = (ctx, stroke) => {
  paintDiagonal(ctx, stroke);
  paintReverseDiagonal(ctx, stroke);
};

const paintDots = (ctx, stroke) => {
  ctx.fillStyle = stroke;
  ctx.beginPath();
  ctx.arc(TILE / 2, TILE / 2, 1.5, 0, Math.PI * 2);
  ctx.fill();
};

const paintHorizontal = (ctx, stroke) => {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, TILE / 2);
  ctx.lineTo(TILE, TILE / 2);
  ctx.stroke();
};

const PAINTERS = {
  diagonal: paintDiagonal,
  reverse: paintReverseDiagonal,
  cross: paintCrossHatch,
  dots: paintDots,
  horizontal: paintHorizontal,
};

export const PATTERN_CYCLE = ["diagonal", "reverse", "cross", "dots", "horizontal"];

// Build a CanvasPattern whose tile is tinted with `color` and overlaid with
// the named texture in a darker contrasting stroke. Falls back to `color`
// when there's no DOM (tests, SSR) — callers can pass the result straight to
// Chart.js `backgroundColor`.
export const createPatternFill = (color, patternName = "diagonal") => {
  const tile = createTile();
  if (!tile) return color;
  const ctx = tile.getContext("2d");
  if (!ctx) return color;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, TILE, TILE);
  const painter = PAINTERS[patternName] ?? paintDiagonal;
  painter(ctx, "rgba(0, 0, 0, 0.55)");
  const pattern = ctx.createPattern(tile, "repeat");
  return pattern ?? color;
};

export const patternForIndex = (color, index) =>
  createPatternFill(color, PATTERN_CYCLE[index % PATTERN_CYCLE.length]);
