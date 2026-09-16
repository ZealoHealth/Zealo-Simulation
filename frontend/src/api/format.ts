/**
 * Display formatting for values that arrive verbatim from a source.
 *
 * The indent's drug names carry the full compositional text -- "Theophylline and
 * Etophylline Tablet Each Tablet Contains: Theophylline 23 mg + Etophylline 77 mg
 * 1x1". That is the real record and is kept as-is in the data; it is only
 * shortened for display, and the full string stays available on hover.
 */

/** Trim a medicine name to its identifying part. */
export function shortMedicineName(name: string, maxLength = 46): string {
  // Cut the compositional prose the indent appends.
  let short = name.split(/\bEach\b/i)[0].trim();
  // Drop the trailing pack size ("1x1", "1x10 ml bottle").
  short = short.replace(/\b\d+\s*x\s*[\d.]*\s*\w*(\s+\w+)?$/i, "").trim();
  short = short.replace(/[,;]$/, "");
  if (short.length > maxLength) short = `${short.slice(0, maxLength - 1).trimEnd()}…`;
  return short || name;
}
