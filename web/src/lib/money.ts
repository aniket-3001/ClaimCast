/**
 * Rupees, in paise.
 *
 * Every amount in this app is an integer number of paise. A proportionate
 * deduction is a ratio applied to a bill line, and a float would leave the
 * insurer's share and the patient's share failing to add up to the bill by a
 * few paise — which is exactly the kind of discrepancy the product exists to
 * remove.
 */
export type Paise = number;

export const rupees = (r: number): Paise => Math.round(r * 100);

/** Indian digit grouping: 1,26,900 rather than 126,900. */
function group(n: number): string {
  const s = String(n);
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}

export function fmt(p: Paise): string {
  const neg = p < 0;
  const abs = Math.abs(p);
  const whole = Math.round(abs / 100);
  return (neg ? "-\u20b9" : "\u20b9") + group(whole);
}

/** Short form for headline figures: 3.54 L, 1.2 Cr. */
export function fmtShort(p: Paise): string {
  const r = Math.round(Math.abs(p) / 100);
  const sign = p < 0 ? "-" : "";
  if (r >= 1e7) return `${sign}\u20b9${(r / 1e7).toFixed(2).replace(/\.00$/, "")} Cr`;
  if (r >= 1e5) return `${sign}\u20b9${(r / 1e5).toFixed(2).replace(/\.00$/, "")} L`;
  return fmt(p);
}

export const pct = (n: number): string => `${(n * 100).toFixed(n * 100 % 1 === 0 ? 0 : 2)}%`;

/**
 * Split a whole amount by a ratio without losing a paisa. The larger share
 * absorbs the rounding remainder so `keep + drop === total` always holds.
 */
export function ratioSplit(total: Paise, keepRatio: number): { keep: Paise; drop: Paise } {
  const keep = Math.round(total * keepRatio);
  return { keep, drop: total - keep };
}
