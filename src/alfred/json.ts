export function toStructuredJson(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}
