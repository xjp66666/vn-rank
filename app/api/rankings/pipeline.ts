import { seedRankings, sourceWeights, type RankingItem, type SourceKey } from "../../data";

const SITE_AGENT =
  "VN-Rank/0.3 (+https://vn-rank-index.hellostevenleong.chatgpt.site)";
const EGS_BASE = "https://erogamescape.org/~ap2/ero/toukei_kaiseki/";

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
  vndbId: string | null;
  egsId: string | null;
};

type EgsEntry = RawSourceEntry & { source: "erogamescape" };

type Candidate = {
  canonicalKey: string;
  vndb?: VndbEntry;
  bangumi?: BangumiEntry;
  erogamescape?: EgsEntry;
};

export type PipelineResult = {
  rankings: RankingItem[];
  rawEntries: RawSourceEntry[];
  sourceCounts: Record<SourceKey, number>;
  matchedCount: number;
};

const seedByVndb = new Map(seedRankings.map((item) => [item.id, item]));

const knownLinks: Record<string, { bangumi: string; erogamescape: string }> = {
  v7771: { bangumi: "54898", erogamescape: "18010" },
  v2002: { bangumi: "3154", erogamescape: "12797" },
  v92: { bangumi: "4828", erogamescape: "4286" },
  v2153: { bangumi: "56363", erogamescape: "15861" },
  v18717: { bangumi: "157916", erogamescape: "22900" },
  v68: { bangumi: "80705", erogamescape: "7985" },
  v12402: { bangumi: "73806", erogamescape: "18111" },
  v24: { bangumi: "1020", erogamescape: "11938" },
};

function normalizeTitle(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\((?:ps[2-5]|switch|xb360|xbox|vita|pc)[^)]*\)/gi, "")
    .replace(/(?:extended|premium|complete|全年齢)\s*(?:edition|版)?/gi, "")
    .replace(/[\p{P}\p{S}\s]/gu, "");
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

async function fetchVndb(): Promise<VndbEntry[]> {
  const response = await fetch("https://api.vndb.org/kana/vn", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": SITE_AGENT },
    body: JSON.stringify({
      fields:
        "title,alttitle,rating,votecount,released,image.url,length_minutes,platforms",
      sort: "rating",
      reverse: true,
      results: 100,
      filters: ["votecount", ">=", 500],
    }),
  });
  if (!response.ok) throw new Error(`VNDB returned ${response.status}`);
  const payload = (await response.json()) as {
    results: Array<{
      id: string;
      title: string;
      alttitle: string | null;
      rating: number;
      votecount: number;
      released: string;
      image: { url: string } | null;
      length_minutes: number | null;
      platforms: string[];
    }>;
  };

  return payload.results.map((item, index) => ({
    source: "vndb",
    sourceRank: index + 1,
    externalId: item.id,
    title: item.title,
    altTitle: item.alttitle ?? item.title,
    released: item.released,
    image: item.image?.url ?? "",
    lengthMinutes: item.length_minutes,
    platforms: item.platforms ?? [],
    score: item.rating,
    votes: item.votecount,
    href: `https://vndb.org/${item.id}`,
  }));
}

async function fetchBangumi(): Promise<BangumiEntry[]> {
  type BangumiPayload = {
    data: Array<{
      id: number;
      name: string;
      name_cn?: string;
      date?: string;
      summary?: string;
      images?: { common?: string; large?: string };
      tags?: Array<{ name: string }>;
      infobox?: unknown;
      rating?: { score?: number; total?: number; rank?: number };
    }>;
  };
  const body = JSON.stringify({
    keyword: "",
    sort: "rank",
    filter: {
      type: [4],
      meta_tags: ["Galgame"],
      rank: [">0"],
      rating_count: [">=100"],
    },
  });
  const pages = await Promise.all(
    [0, 20, 40, 60, 80].map(async (offset) => {
      const response = await fetch(
        `https://api.bgm.tv/v0/search/subjects?limit=20&offset=${offset}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": SITE_AGENT,
          },
          body,
        },
      );
      if (!response.ok) throw new Error(`Bangumi returned ${response.status}`);
      return (await response.json()) as BangumiPayload;
    }),
  );
  const payload = { data: pages.flatMap((page) => page.data).slice(0, 100) };

  return payload.data.map((item, index) => ({
    source: "bangumi",
    sourceRank: index + 1,
    externalId: String(item.id),
    title: item.name,
    nameCn: item.name_cn ?? "",
    released: item.date ?? "",
    image: item.images?.common ?? item.images?.large ?? "",
    summary: item.summary ?? "",
    tags: (item.tags ?? []).slice(0, 12).map((tag) => tag.name),
    vndbId: extractExternalId(item.infobox, /vndb\.org\/(v\d+)/i),
    egsId: extractExternalId(item.infobox, /erogamescape[^"\\]*game(?:\.php)?\?game=(\d+)/i),
    score: (item.rating?.score ?? 0) * 10,
    votes: item.rating?.total ?? 0,
    href: `https://bgm.tv/subject/${item.id}`,
  }));
}

async function fetchErogameScape(): Promise<EgsEntry[]> {
  const pages = await Promise.all(
    [0, 100, 200, 300].map(async (offset) => {
      const suffix = offset ? `?offset=${offset}&year=1900&count=5` : "";
      const response = await fetch(`${EGS_BASE}toukei_median.php${suffix}`, {
        headers: { Accept: "text/html", "User-Agent": SITE_AGENT },
      });
      if (!response.ok) throw new Error(`ErogameScape returned ${response.status}`);
      return response.text();
    }),
  );
  const entries: EgsEntry[] = [];

  for (const html of pages) {
    const rows = Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
    for (const row of rows) {
      const body = row[1];
      const game = body.match(
        /game\.php\?game=(\d+)[^>]*>([\s\S]*?)<\/a>/i,
      );
      if (!game) continue;
      const cells = Array.from(body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map(
        (cell) => stripHtml(cell[1]),
      );
      if (cells.length < 6) continue;
      const score = Number(cells[2]);
      const votes = Number(cells[5]);
      if (!Number.isFinite(score) || !Number.isFinite(votes) || votes < 100) continue;

      entries.push({
        source: "erogamescape",
        sourceRank: entries.length + 1,
        externalId: game[1],
        title: stripHtml(game[2]),
        score,
        votes,
        href: `${EGS_BASE}game.php?game=${game[1]}`,
      });
      if (entries.length === 100) break;
    }
    if (entries.length === 100) break;
  }

  if (entries.length < 50) {
    throw new Error(`ErogameScape returned only ${entries.length} eligible rows`);
  }
  return entries;
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
  const [vndb, bangumi, erogamescape] = await Promise.all([
    fetchVndb(),
    fetchBangumi(),
    fetchErogameScape(),
  ]);

  const candidates = new Map<string, Candidate>();
  const bangumiByVndb = new Map<string, BangumiEntry>();
  const bangumiByEgs = new Map<string, BangumiEntry>();

  for (const item of bangumi) {
    if (item.vndbId) bangumiByVndb.set(item.vndbId, item);
    if (item.egsId) bangumiByEgs.set(item.egsId, item);
  }
  for (const [vndbId, links] of Object.entries(knownLinks)) {
    const item = bangumi.find((entry) => entry.externalId === links.bangumi);
    if (item) {
      bangumiByVndb.set(vndbId, item);
      bangumiByEgs.set(links.erogamescape, item);
    }
  }

  for (const item of vndb) {
    const key = `vndb:${item.externalId}`;
    candidates.set(key, { canonicalKey: key, vndb: item });
  }

  const titleIndex = new Map<string, string>();
  for (const [key, candidate] of candidates) {
    if (candidate.vndb) {
      titleIndex.set(normalizeTitle(candidate.vndb.title), key);
      titleIndex.set(normalizeTitle(candidate.vndb.altTitle), key);
    }
  }

  for (const item of bangumi) {
    const knownVndb = item.vndbId ??
      Object.entries(knownLinks).find(([, links]) => links.bangumi === item.externalId)?.[0];
    const matchedTitle =
      titleIndex.get(normalizeTitle(item.title)) ??
      titleIndex.get(normalizeTitle(item.nameCn));
    const key = knownVndb
      ? `vndb:${knownVndb}`
      : matchedTitle ?? (item.egsId ? `egs:${item.egsId}` : `bangumi:${item.externalId}`);
    const candidate = candidates.get(key) ?? { canonicalKey: key };
    candidate.bangumi = item;
    candidates.set(key, candidate);
    titleIndex.set(normalizeTitle(item.title), key);
    if (item.nameCn) titleIndex.set(normalizeTitle(item.nameCn), key);
  }

  for (const item of erogamescape) {
    const bridge = bangumiByEgs.get(item.externalId);
    const knownVndb = bridge?.vndbId ??
      Object.entries(knownLinks).find(([, links]) => links.erogamescape === item.externalId)?.[0];
    const matchedTitle = titleIndex.get(normalizeTitle(item.title));
    const key = knownVndb
      ? `vndb:${knownVndb}`
      : bridge
        ? bridge.vndbId
          ? `vndb:${bridge.vndbId}`
          : `bangumi:${bridge.externalId}`
        : matchedTitle ?? `egs:${item.externalId}`;
    const candidate = candidates.get(key) ?? { canonicalKey: key };
    candidate.erogamescape = item;
    candidates.set(key, candidate);
  }

  const ranked = Array.from(candidates.values())
    .map((candidate) => ({ candidate, ...calculateScore(candidate) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

  const rankings = ranked.map(({ candidate }) => {
    const seed = candidate.vndb ? seedByVndb.get(candidate.vndb.externalId) : undefined;
    const primary = candidate.vndb ?? candidate.bangumi ?? candidate.erogamescape;
    const year = Number(
      (candidate.vndb?.released ?? candidate.bangumi?.released ?? "").slice(0, 4),
    );
    const tags = candidate.bangumi ? findUsefulTags(candidate.bangumi.tags) : [];

    return {
      id: candidate.vndb?.externalId ?? candidate.canonicalKey,
      title:
        seed?.title ??
        candidate.vndb?.title ??
        candidate.bangumi?.nameCn ??
        candidate.bangumi?.title ??
        candidate.erogamescape?.title ??
        "Untitled",
      altTitle:
        seed?.altTitle ??
        candidate.vndb?.altTitle ??
        candidate.bangumi?.title ??
        candidate.erogamescape?.title ??
        "",
      year: year || seed?.year || 0,
      released:
        candidate.vndb?.released ?? candidate.bangumi?.released ?? seed?.released ?? "Unknown",
      image:
        candidate.vndb?.image ?? candidate.bangumi?.image ?? seed?.image ?? "",
      lengthMinutes: candidate.vndb?.lengthMinutes ?? seed?.lengthMinutes ?? null,
      genres: seed?.genres ?? (tags.length ? tags : ["Visual novel"]),
      platforms:
        seed?.platforms ??
        (candidate.vndb?.platforms.length ? candidate.vndb.platforms : ["PC"]),
      synopsis:
        seed?.synopsis ??
        (candidate.bangumi?.summary
          ? stripHtml(candidate.bangumi.summary).slice(0, 420)
          : "A highly rated visual novel included in today's cross-community ranking."),
      sources: {
        vndb: {
          score: candidate.vndb?.score ?? null,
          votes: candidate.vndb?.votes ?? null,
          href: candidate.vndb?.href ?? null,
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
