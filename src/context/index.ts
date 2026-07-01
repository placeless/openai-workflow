export interface CliContextInput {
  query?: string | null;
  selection?: string | null;
  clipboard?: string | null;
  frontmostApp?: string | null;
  extra?: string | null;
}

export interface NormalizedContext {
  query: string | null;
  selection: string | null;
  clipboard: string | null;
  frontmost_app: string | null;
  extra: string | null;
}

export function normalizeCliContext(input: CliContextInput): NormalizedContext {
  return {
    query: input.query ?? null,
    selection: input.selection ?? null,
    clipboard: input.clipboard ?? null,
    frontmost_app: input.frontmostApp ?? null,
    extra: input.extra ?? null,
  };
}
