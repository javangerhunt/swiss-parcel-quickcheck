/**
 * Small, shared number-formatting helper used across the app (e.g. to show
 * parcel areas like "1'240 m²"). Keeping it in one place means every part of
 * the UI displays numbers the same, Swiss-localised way.
 */

/**
 * Formats a number with the Swiss thousands separator: 1240 -> "1'240".
 *
 * @param value the number to format (may have decimals)
 * @returns the rounded value as a string, with an apostrophe between every
 *   group of three digits (the convention used in Switzerland)
 */
export function formatSwissNumber(value: number): string {
  return Math.round(value) // areas etc. are whole numbers, so round first
    .toString()
    // Insert an apostrophe at every position that is between digits (\B = not a
    // word boundary) and is followed by groups of exactly three digits that
    // run to the end of the number. This places separators from the right:
    // "1234567" -> "1'234'567".
    .replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}
