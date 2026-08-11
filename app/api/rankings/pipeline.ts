import { seedRankings, sourceWeights, type RankingItem, type SourceKey } from "../../data";

const SITE_AGENT =
  "VN-Rank/0.4 (+https://vn-rank-index.hellostevenleong.chatgpt.site)";
const EGS_BASE = "https://erogamescape.org/~ap2/ero/toukei_kaiseki/";

export const VNDB_MIN_VOTES = 500;

type RawSourceEntry = {
  source: SourceKey;
  sourceRank: number;
  externalId: string;
  title: string;
  score: number;
  votes: number;
  href: string;
};

type VndbEntry = RawSourceEntry & {
  source: "vndb";
  altTitle: string;
  searchTitles: string[];
  released: string;
  image: string;
  lengthMinutes: number | null;
  platforms: string[];
};

type BangumiEntry = RawSourceEntry & {
  source: "bangumi";
  nameCn: string;
  released: string;
  image: string;
  summary: string;
  tags: string[];
};

type EgsEntry = RawSourceEntry & {
  source: "erogamescape";
  released: string;
};

type Candidate = {
  canonicalKey: string;
  vndb: VndbEntry;
  bangumi?: BangumiEntry;
  erogamescape?: EgsEntry;
};

type BangumiSubject = {
  id: number;
  name: string;
  name_cn?: string;
  date?: string;
  summary?: string;
  images?: { common?: string; large?: string };
  tags?: Array<{ name: string }>;
  meta_tags?: string[];
  infobox?: unknown;
  rating?: { score?: number; total?: number; rank?: number };
};

export type PipelineResult = {
  rankings: RankingItem[];
  rawEntries: RawSourceEntry[];
  sourceCounts: Record<SourceKey, number>;
  matchedCount: number;
};

const seedByVndb = new Map(seedRankings.map((item) => [item.id, item]));

function normalizeTitle(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\((?:ps[2-5]|switch|xb360|xbox|vita|pc|android|ios|ns)[^)]*\)/gi, "")
    .replace(/\b(?:extended|premium|complete|full voice|hd edition)\b/gi, "")
    .replace(/[\p{P}\p{S}\s]/gu, "");
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    const cleaned = value?.trim();
    if (!cleaned) return false;
    const key = normalizeTitle(cleaned);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
  };
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function stripHtml(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function extractExternalId(infobox: unknown, pattern: RegExp) {
  return JSON.stringify(infobox).match(pattern)?.[1] ?? null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R | null>,
) {
  const output: Array<R | null> = new Array(items.length).fill(null);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        try {
          output[index] = await worker(items[index]);
        } catch {
          output[index] = null;
        }
      }
    }),
  );
  return output.filter((item): item is R => item !== null);
}

async function fetchVndb(): Promise<VndbEntry[]> {
  const response = await fetch("https://api.vndb.org/kana/vn", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": SITE_AGENT },
    body: JSON.stringify({
      fields:
        "title,alttitle,titles{lang,title,latin,official,main},rating,votecount,released,image.url,length_minutes,platforms",
      sort: "rating",
      reverse: true,
      results: 100,
      filters: ["votecount", ">=", VNDB_MIN_VOTES],
    }),
  });
  if (!response.ok) throw new Error(`VNDB returned ${response.status}`);
  const payload = (await response.json()) as {
    results: Array<{
      id: string;
      title: string;
      alttitle: string | null;
      titles: Array<{
        lang: string;
        title: string;
        latin: string | null;
        official: boolean;
        main: boolean;
      }>;
      rating: number;
      votecount: number;
      released: string;
      image: { url: string } | null;
      length_minutes: number | null;
      platforms: string[];
    }>;
  };

  if (payload.results.length !== 100) {
    throw new Error(`VNDB returned ${payload.results.length} eligible entries`);
  }

  return payload.results.map((item, index) => {
    const japaneseTitles = item.titles
      .filter((title) => title.lang === "ja")
      .flatMap((title) => [title.title, title.latin]);
    const englishTitles = item.titles
      .filter((title) => title.lang === "en")
      .flatMap((title) => [title.title, title.latin]);
    const mainTitles = item.titles
      .filter((title) => title.main)
      .flatMap((title) => [title.title, title.latin]);

    return {
      source: "vndb",
      sourceRank: index + 1,
      externalId: item.id,
      title: item.title,
      altTitle: item.alttitle ?? item.title,
      searchTitles: uniqueStrings([
        ...japaneseTitles,
        ...englishTitles,
        ...mainTitles,
        item.alttitle,
        item.title,
      ]),
      released: item.released,
      image: item.image?.url ?? "",
      lengthMinutes: item.length_minutes,
      platforms: item.platforms ?? [],
      score: item.rating,
      votes: item.votecount,
      href: `https://vndb.org/${item.id}`,
    } satisfies VndbEntry;
  });
}

function selectBangumiMatch(vn: VndbEntry, subjects: BangumiSubject[]) {
  const validTitles = new Set(vn.searchTitles.map(normalizeTitle));
  const vnYear = Number(vn.released.slice(0, 4));
  const scored = subjects
    .map((subject) => {
      const linkedVndb = extractExternalId(subject.infobox, /vndb\.org\/(v\d+)/i);
      const exactTitle = [subject.name, subject.name_cn ?? ""].some((title) =>
        validTitles.has(normalizeTitle(title)),
      );
      if (linkedVndb !== vn.externalId && !exactTitle) return null;

      const subjectYear = Number((subject.date ?? "").slice(0, 4));
      const yearDistance =
        vnYear && subjectYear ? Math.abs(vnYear - subjectYear) : Number.POSITIVE_INFINITY;
      const linkScore = linkedVndb === vn.externalId ? 1_000 : 0;
      const titleScore = exactTitle ? 100 : 0;
      const yearScore = yearDistance === 0 ? 30 : yearDistance === 1 ? 10 : 0;
      const galgameScore = subject.meta_tags?.includes("Galgame") ? 10 : 0;
      return {
        subject,
        score: linkScore + titleScore + yearScore + galgameScore + Math.log10((subject.rating?.total ?? 0) + 1),
      };
    })
    .filter((item): item is { subject: BangumiSubject; score: number } => item !== null)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.subject ?? null;
}

async function searchBangumi(vn: VndbEntry): Promise<BangumiEntry | null> {
  const query = vn.searchTitles[0];
  if (!query) return null;
  const response = await fetch(
    "https://api.bgm.tv/v0/search/subjects?limit=5&offset=0",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": SITE_AGENT,
      },
      body: JSON.stringify({
        keyword: query,
        sort: "match",
        filter: { type: [4] },
      }),
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as { data: BangumiSubject[] };
  const item = selectBangumiMatch(vn, payload.data ?? []);
  if (!item || !item.rating?.score || !item.rating.total) return null;

  return {
    source: "bangumi",
    sourceRank: vn.sourceRank,
    externalId: String(item.id),
    title: item.name,
    nameCn: item.name_cn ?? "",
    released: item.date ?? "",
    image: item.images?.common ?? item.images?.large ?? "",
    summary: item.summary ?? "",
    tags: (item.tags ?? []).slice(0, 12).map((tag) => tag.name),
    score: item.rating.score * 10,
    votes: item.rating.total,
    href: `https://bgm.tv/subject/${item.id}`,
  };
}

function escapeSqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

async function fetchErogameScape(vndb: VndbEntry[]): Promise<EgsEntry[]> {
  const searchableTitles = uniqueStrings(
    vndb.flatMap((item) => item.searchTitles.slice(0, 2)),
  );
  const sql = `SELECT id, gamename, sellday, median, count2
    FROM gamelist
    WHERE gamename IN (${searchableTitles.map(escapeSqlLiteral).join(",")})
      AND median IS NOT NULL
      AND count2 > 0
    ORDER BY count2 DESC, id`;
  const response = await fetch(`${EGS_BASE}sql_for_erogamer_form.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html",
      "User-Agent": SITE_AGENT,
    },
    body: new URLSearchParams({ sql }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`ErogameScape returned ${response.status}`);

  const titleIndex = new Map<string, VndbEntry[]>();
  for (const item of vndb) {
    for (const title of item.searchTitles.slice(0, 2)) {
      const key = normalizeTitle(title);
      titleIndex.set(key, [...(titleIndex.get(key) ?? []), item]);
    }
  }

  const bestByRank = new Map<
    number,
    { entry: EgsEntry; matchScore: number }
  >();
  const html = await response.text();
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = Array.from(row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map(
      (cell) => stripHtml(cell[1]),
    );
    if (cells.length < 5) continue;
    const [externalId, title, released, scoreText, votesText] = cells;
    const score = Number(scoreText);
    const votes = Number(votesText);
    if (!/^\d+$/.test(externalId) || !Number.isFinite(score) || !Number.isFinite(votes)) {
      continue;
    }

    const owners = titleIndex.get(normalizeTitle(title)) ?? [];
    for (const vn of owners) {
      const vnYear = Number(vn.released.slice(0, 4));
      const releaseYear = Number(released.slice(0, 4));
      const yearDistance =
        vnYear && releaseYear ? Math.abs(vnYear - releaseYear) : Number.POSITIVE_INFINITY;
      const matchScore =
        (yearDistance === 0 ? 100 : yearDistance === 1 ? 30 : 0) +
        Math.log10(votes + 1);
      if ((bestByRank.get(vn.sourceRank)?.matchScore ?? -1) >= matchScore) continue;
      bestByRank.set(vn.sourceRank, {
        matchScore,
        entry: {
          source: "erogamescape",
          sourceRank: vn.sourceRank,
          externalId,
          title,
          released,
          score,
          votes,
          href: `${EGS_BASE}game.php?game=${externalId}`,
        },
      });
    }
  }

  return Array.from(bestByRank.values()).map(({ entry }) => entry);
}

function findUsefulTags(tags: string[]) {
  const ignored = /^(pc|ps[2-5]|psp|psv|ns|switch|xbox|windows|galgame|game|游戏)$/i;
  return tags.filter((tag) => !ignored.test(tag)).slice(0, 2);
}

function calculateScore(candidate: Candidate) {
  const available = (Object.keys(sourceWeights) as SourceKey[]).filter(
    (source) => candidate[source]?.score !== undefined,
  );
  const weightTotal = available.reduce(
    (total, source) => total + sourceWeights[source],
    0,
  );
  const weighted = available.reduce(
    (total, source) =>
      total + ((candidate[source]?.score ?? 0) * sourceWeights[source]) / weightTotal,
    0,
  );
  const coverageFactor = available.length === 3 ? 1 : available.length === 2 ? 0.97 : 0.88;
  return { score: weighted * coverageFactor, sourceCount: available.length };
}

export async function runDailyPipeline(): Promise<PipelineResult> {
  const vndb = await fetchVndb();
  const [bangumi, erogamescape] = await Promise.all([
    mapWithConcurrency(vndb, 8, searchBangumi),
    fetchErogameScape(vndb),
  ]);

  if (bangumi.length < 20) {
    throw new Error(`Bangumi matched only ${bangumi.length} VNDB entries`);
  }
  if (erogamescape.length < 20) {
    throw new Error(`ErogameScape matched only ${erogamescape.length} VNDB entries`);
  }

  const bangumiByRank = new Map(bangumi.map((item) => [item.sourceRank, item]));
  const egsByRank = new Map(erogamescape.map((item) => [item.sourceRank, item]));
  const candidates: Candidate[] = vndb.map((item) => ({
    canonicalKey: `vndb:${item.externalId}`,
    vndb: item,
    bangumi: bangumiByRank.get(item.sourceRank),
    erogamescape: egsByRank.get(item.sourceRank),
  }));

  const ranked = candidates
    .map((candidate) => ({ candidate, ...calculateScore(candidate) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

  const rankings = ranked.map(({ candidate }) => {
    const seed = seedByVndb.get(candidate.vndb.externalId);
    const year = Number(candidate.vndb.released.slice(0, 4));
    const tags = candidate.bangumi ? findUsefulTags(candidate.bangumi.tags) : [];

    return {
      id: candidate.vndb.externalId,
      title: seed?.title ?? candidate.vndb.title,
      altTitle: seed?.altTitle ?? candidate.vndb.altTitle,
      year: year || seed?.year || 0,
      released: candidate.vndb.released ?? seed?.released ?? "Unknown",
      image: candidate.vndb.image || candidate.bangumi?.image || seed?.image || "",
      lengthMinutes: candidate.vndb.lengthMinutes ?? seed?.lengthMinutes ?? null,
      genres: seed?.genres ?? (tags.length ? tags : ["Visual novel"]),
      platforms:
        seed?.platforms ??
        (candidate.vndb.platforms.length ? candidate.vndb.platforms : ["PC"]),
      synopsis:
        seed?.synopsis ??
        (candidate.bangumi?.summary
          ? stripHtml(candidate.bangumi.summary).slice(0, 420)
          : "A highly rated visual novel included in today's cross-community ranking."),
      sources: {
        vndb: {
          score: candidate.vndb.score,
          votes: candidate.vndb.votes,
          href: candidate.vndb.href,
        },
        bangumi: {
          score: candidate.bangumi?.score ?? null,
          votes: candidate.bangumi?.votes ?? null,
          href: candidate.bangumi?.href ?? null,
        },
        erogamescape: {
          score: candidate.erogamescape?.score ?? null,
          votes: candidate.erogamescape?.votes ?? null,
          href: candidate.erogamescape?.href ?? null,
        },
      },
    } satisfies RankingItem;
  });

  return {
    rankings,
    rawEntries: [...vndb, ...bangumi, ...erogamescape],
    sourceCounts: {
      vndb: vndb.length,
      bangumi: bangumi.length,
      erogamescape: erogamescape.length,
    },
    matchedCount: ranked.filter((item) => item.sourceCount >= 2).length,
  };
}
