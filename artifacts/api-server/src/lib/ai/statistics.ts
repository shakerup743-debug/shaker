// Pure-TypeScript statistical helpers used by the AI engines.
// No external dependencies. Deterministic. Side-effect free.

/** Exponential Moving Average. alpha closer to 1 reacts faster to recent values. */
export function ema(values: number[], alpha = 0.3): number {
  if (values.length === 0) return 0;
  let v = values[0]!;
  for (let i = 1; i < values.length; i++) v = alpha * values[i]! + (1 - alpha) * v;
  return v;
}

/** Simple arithmetic mean. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Standard deviation (population). */
export function stdev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Median value of a numeric array. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

/** Quartile (0.25, 0.5, 0.75). */
export function quartile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base]! + rest * (sorted[base + 1]! - sorted[base]!)
    : sorted[base]!;
}

/** Z-score of v relative to a series. Returns 0 when stdev is 0. */
export function zScore(v: number, series: number[]): number {
  const s = stdev(series);
  if (s === 0) return 0;
  return (v - mean(series)) / s;
}

export interface RegressionResult {
  slope: number;
  intercept: number;
  /** Coefficient of determination, 0..1 — higher means series is more linear */
  r2: number;
}

/** Ordinary least-squares linear regression. y = slope*x + intercept */
export function linearRegression(points: { x: number; y: number }[]): RegressionResult {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: n === 1 ? points[0]!.y : 0, r2: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const p of points) {
    sumX += p.x; sumY += p.y;
    sumXY += p.x * p.y; sumXX += p.x * p.x;
  }
  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const yMean = sumY / n;
  let ssRes = 0, ssTot = 0;
  for (const p of points) {
    const yPred = slope * p.x + intercept;
    ssRes += (p.y - yPred) ** 2;
    ssTot += (p.y - yMean) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, intercept, r2 };
}

/** Cosine similarity between two equal-length vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!, y = b[i]!;
    dot += x * y; na += x * x; nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Clamp a number between min and max. */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
