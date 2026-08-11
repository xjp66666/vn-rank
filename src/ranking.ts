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
  overallScore: number;
  sources: Record<SourceKey, SourceScore>;
};

export const sourceWeights: Record<SourceKey, number> = {
  vndb: 0.6,
  bangumi: 0.4,
};

export function scoreFor(item: RankingItem) {
  return Number.isFinite(item.overallScore) ? item.overallScore : 0;
}

export type PopularityRecord = {
  vndbScore?: number | null;
  vndbVotes?: number | null;
  bangumiScore?: number | null;
  bangumiVotes?: number | null;
};

export type SourceMaximums = Record<SourceKey, number>;

export function sourceProduct(title: PopularityRecord, source: SourceKey) {
  const score = source === "vndb" ? title.vndbScore : title.bangumiScore;
  const votes = source === "vndb" ? title.vndbVotes : title.bangumiVotes;
  return Number.isFinite(score) && Number.isFinite(votes) && (votes ?? 0) > 0
    ? (score ?? 0) * (votes ?? 0)
    : 0;
}

export function sourceMaximums(titles: PopularityRecord[]): SourceMaximums {
  return {
    vndb: Math.max(0, ...titles.map((title) => sourceProduct(title, "vndb"))),
    bangumi: Math.max(0, ...titles.map((title) => sourceProduct(title, "bangumi"))),
  };
}

export function popularityScore(
  title: PopularityRecord,
  maximums: SourceMaximums,
) {
  return (Object.keys(sourceWeights) as SourceKey[]).reduce((total, source) => {
    const normalized = maximums[source]
      ? sourceProduct(title, source) / maximums[source] * 100
      : 0;
    return total + normalized * sourceWeights[source];
  }, 0);
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
