// Dates read the way loveleedaystudios.com writes them: "Sep 23, 2026".
export function formatDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
