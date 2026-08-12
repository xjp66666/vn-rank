export type SourceKey = "vndb" | "bangumi" | "egs";
export const EGS_VOTE_WEIGHT = 2;

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

export function scoreFor(item: RankingItem) {
  return Number.isFinite(item.overallScore) ? item.overallScore : 0;
}

export type PopularityRecord = {
  vndbScore?: number | null;
  vndbVotes?: number | null;
  bangumiScore?: number | null;
  bangumiVotes?: number | null;
  egsScore?: number | null;
  egsVotes?: number | null;
};

export function voteWeightedScore(title: PopularityRecord) {
  const vndbScore = title.vndbScore ?? 0;
  const vndbVotes = title.vndbVotes ?? 0;
  const bangumiScore = title.bangumiScore ?? 0;
  const bangumiVotes = title.bangumiVotes ?? 0;
  const egsScore = title.egsScore ?? 0;
  const egsVotes = title.egsVotes ?? 0;
  const weightedEgsVotes = egsVotes * EGS_VOTE_WEIGHT;
  const totalVotes = vndbVotes + bangumiVotes + weightedEgsVotes;

  if (totalVotes === 0) return 0;
  return (
    vndbScore * (vndbVotes / totalVotes) +
    bangumiScore * (bangumiVotes / totalVotes) +
    egsScore * (weightedEgsVotes / totalVotes)
  );
}

export type CatalogTitle = {
  name: string;
  vndbId: string;
  bangumiId?: string;
  vndbScore: number | null;
  vndbVotes: number | null;
  bangumiScore: number | null;
  bangumiVotes: number | null;
  egsId?: string;
  egsScore?: number | null;
  egsVotes?: number | null;
  egsMedian?: number | null;
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
