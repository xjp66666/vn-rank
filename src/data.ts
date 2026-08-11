export async function loadStaticRankings<T>(signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/rankings.json`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(`Ranking data unavailable (${response.status})`);
  return response.json() as Promise<T>;
}
