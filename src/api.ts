import type { Season } from "./types";

// Relative URL so it resolves under the nginx prefix (/f1-champ/api/...) and
// at a bare root alike.
export async function fetchSeason(year: number): Promise<Season> {
  const res = await fetch(`api/season/${year}`);
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return body as unknown as Season;
}
