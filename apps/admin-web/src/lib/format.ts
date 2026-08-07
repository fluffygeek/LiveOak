/** Turns a snake_case enum value into Title Case for display (e.g. "app_admin" -> "App Admin"). */
export function humanize(value: string): string {
  return value
    .split('_')
    .map((word) => (word ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(' ');
}
