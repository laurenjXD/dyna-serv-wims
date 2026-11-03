/** Small, exact validators for values entered on billing and pricing forms. */

export function isDecimalInput(
  value: unknown,
  precision: number,
  scale: number,
  options: { allowZero?: boolean } = {},
): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(normalized);
  if (!match) return false;
  const integerDigits = match[1].length;
  const fractionalDigits = match[2]?.length ?? 0;
  if (integerDigits > precision - scale || fractionalDigits > scale) return false;
  if (options.allowZero === false && /^0(?:\.0+)?$/.test(normalized)) return false;
  return true;
}

export function normalizeDecimalInput(value: string): string {
  return value.trim();
}

export function isIsoCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isIsoDateOrTimestamp(value: unknown): value is string {
  if (isIsoCalendarDate(value)) return true;
  if (typeof value !== "string") return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(value);
  if (!match || !isIsoCalendarDate(match[1])) return false;
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

export function normalizeTextInput(value: string | undefined | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function escapeHtmlText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}
