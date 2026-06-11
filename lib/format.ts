/** Formats a number with the Swiss thousands separator: 1240 -> "1'240". */
export function formatSwissNumber(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}
