export type SourceKey = "vndb" | "bangumi";

export type SourceScore = {
  score: number | null;
  votes: number | null;
  href: string | null;
};

export type RankingItem = {
  id: string;
  title: string;
  altTitle: string;
  year: number;
  released: string;
  image: string;
  lengthMinutes: number | null;
  genres: string[];
  platforms: string[];
  synopsis: string;
  sources: Record<SourceKey, SourceScore>;
};

export const sourceWeights: Record<SourceKey, number> = {
  vndb: 0.6,
  bangumi: 0.4,
};

export function scoreFor(
  item: RankingItem,
  source: SourceKey | "consensus" = "consensus",
) {
  if (source !== "consensus") return item.sources[source].score ?? 0;
  const available = (Object.keys(sourceWeights) as SourceKey[]).filter(
    (key) => item.sources[key].score !== null,
  );
  const weightTotal = available.reduce(
    (total, key) => total + sourceWeights[key],
    0,
  );
  if (!weightTotal) return 0;
  return available.reduce(
    (total, key) =>
      total + ((item.sources[key].score ?? 0) * sourceWeights[key]) / weightTotal,
    0,
  );
}

export type CatalogTitle = {
  name: string;
  vndbId: string;
  bangumiId: string;
  vndbScore: number | null;
  vndbVotes: number | null;
  bangumiScore: number | null;
  bangumiVotes: number | null;
  overallScore: number;
  scoresUpdatedAt: string | null;
  lastError: string | null;
};

export type CatalogRecord = Omit<CatalogTitle, "overallScore"> & {
  metadata: {
    altTitle?: string;
    released?: string;
    year?: number;
    image?: string;
    lengthMinutes?: number | null;
    genres?: string[];
    platforms?: string[];
    synopsis?: string;
  };
};

export type CatalogFile = {
  schemaVersion: 1;
  titles: CatalogRecord[];
};
