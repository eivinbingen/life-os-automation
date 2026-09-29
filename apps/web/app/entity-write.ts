/**
 * Shared write envelope for entity actions (#45, #49, and later entity
 * writes): one apiUrl/env-check/errorFrom/timeout pipeline so a fix to one
 * reaches every entity action. Not a "use server" module — the action
 * files import from here.
 */

export type EntityWriteError = { ok: false; error: string };

export function writeApiUrl(): string | null {
  return process.env.LIFE_OS_API_URL ?? null;
}

export async function errorFrom(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (typeof payload.detail === "string") return payload.detail;
    // Pydantic wraps validator errors in a structured list; surface the
    // first message instead of the fallback.
    if (Array.isArray(payload.detail)) {
      const first = payload.detail[0] as { msg?: unknown } | undefined;
      if (first && typeof first.msg === "string") return first.msg;
    }
  } catch {
    // Keep the safe fallback when the local API did not return JSON.
  }
  return fallback;
}

export async function writeJson(
  path: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
): Promise<{ ok: true; data: unknown } | EntityWriteError> {
  const base = writeApiUrl();
  if (!base) {
    return { ok: false, error: "LIFE_OS_API_URL is not configured" };
  }
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Writes chain Notion round trips (page write, goal-side relation
      // read-modify-write); they get the same 30s budget as the reads.
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      return { ok: false, error: await errorFrom(response, "The write failed") };
    }
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false, error: "The Life OS service could not be reached" };
  }
}
