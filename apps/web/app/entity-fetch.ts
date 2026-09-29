"use server";

/**
 * Shared envelope for entity detail reads (#44, #48, and later entity
 * surfaces): one apiUrl/timeout/404-vs-5xx/catch pipeline so a fix to one
 * (timeout, retryable status) reaches every entity view.
 */

export type EntityFetchError = {
  kind: "not_found" | "unavailable";
  message: string;
};

export type EntityFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: EntityFetchError };

export async function fetchEntityDetail<T>(path: string): Promise<EntityFetchResult<T>> {
  const base = process.env.LIFE_OS_API_URL ?? null;
  if (!base) {
    return {
      ok: false,
      error: {
        kind: "unavailable",
        message: "The connection to the local Life OS service is not configured.",
      },
    };
  }
  try {
    const response = await fetch(`${base}${path}`, {
      cache: "no-store",
      // Entity reads chain several Notion round trips (page, parent page,
      // paginated relations); they get the same 30s budget as the other
      // multi-source reads.
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 404) {
      return {
        ok: false,
        error: { kind: "not_found", message: "This page could not be found." },
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        error: { kind: "unavailable", message: "The page could not be loaded. Please try again." },
      };
    }
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return {
      ok: false,
      error: {
        kind: "unavailable",
        message:
          "The Life OS service could not be reached. Check that it is running, then try again.",
      },
    };
  }
}
