import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const catalogPath = resolve(root, "data/catalog.json");
const cachePath = resolve(root, ".cache/bangumi-search.json");
const targetCount = Number(process.env.TARGET_COUNT || 200);
const minimumVotes = Number(process.env.VNDB_MIN_VOTES || 300);
const SITE_AGENT = "VN-Rank/1.0 (curated visual novel ranking)";

async function loadLocalToken() {
  if (process.env.BANGUMI_ACCESS_TOKEN) return process.env.BANGUMI_ACCESS_TOKEN;
  try {
    const text = await readFile(resolve(root, ".dev.vars"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*["']?(.*?)["']?\s*$/);
      if (match?.[1] === "BANGUMI_ACCESS_TOKEN") return match[2];
    }
  } catch {
    // Public Bangumi search remains available without a token.
  }
  return "";
}

async function loadCache() {
  try {
    return JSON.parse(await readFile(cachePath, "utf8"));
  } catch {
    return {};
  }
}

async function fetchWithRetry(url, init, label) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) return response.json();
    if (response.status === 401) {
      const error = new Error(`${label} returned 401`);
      error.status = 401;
      throw error;
    }
    if (response.status !== 429 && response.status < 500) {
      throw new Error(`${label} returned ${response.status}`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 800));
  }
  throw new Error(`${label} failed after retries`);
}

async function fetchVndbCandidates() {
  const candidates = [];
  const pages = Math.ceil(targetCount / 100);
  for (let page = 1; page <= pages; page += 1) {
    const payload = await fetchWithRetry(
      "https://api.vndb.org/kana/vn",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": SITE_AGENT },
        body: JSON.stringify({
          filters: ["votecount", ">=", minimumVotes],
          fields: "title,alttitle,titles{lang,title,latin,official,main},description,rating,votecount,released",
          sort: "rating",
          reverse: true,
          results: 100,
          page,
        }),
      },
      "VNDB",
    );
    candidates.push(...payload.results);
    if (!payload.more) break;
  }
  return candidates.slice(0, targetCount);
}

function cleanDescription(value) {
  return String(value ?? "")
    .replace(/\[url=[^\]]+\]([\s\S]*?)\[\/url\]/gi, "$1")
    .replace(/\[(?:\/?(?:b|i|u|s|spoiler)|raw|\/raw)\]/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1600);
}

function firstText(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() ?? "";
}

function vndbTitleFor(vndb, language) {
  return vndb?.titles?.find((item) => item.lang === language)?.title ?? "";
}

function localizedMetadata(existing, vndb, bangumi) {
  const previous = existing?.metadata ?? {};
  const previousTitles = previous.titles ?? {};
  const previousDescriptions = previous.descriptions ?? {};
  const japaneseTitle = firstText(
    vndbTitleFor(vndb, "ja"),
    vndb?.titles?.find((item) => item.main)?.title,
    vndb.alttitle,
    bangumi?.name,
    previousTitles.ja,
    previous.altTitle,
    vndb.title,
  );
  const englishTitle = firstText(
    vndbTitleFor(vndb, "en"),
    vndb.title,
    previousTitles.en,
    japaneseTitle,
  );
  const chineseTitle = firstText(
    bangumi?.name_cn,
    vndb?.titles?.find((item) => item.lang?.startsWith("zh"))?.title,
    previousTitles.zh,
    japaneseTitle,
  );
  const englishDescription = firstText(
    cleanDescription(vndb.description),
    cleanDescription(previousDescriptions.en),
  );
  const chineseDescription = firstText(
    cleanDescription(bangumi?.summary),
    cleanDescription(previousDescriptions.zh),
    cleanDescription(previous.synopsis),
  );
  const released = vndb.released || bangumi?.date || previous.released;

  return {
    titles: {
      en: englishTitle || japaneseTitle,
      zh: chineseTitle || japaneseTitle,
      ja: japaneseTitle || englishTitle || chineseTitle,
    },
    descriptions: {
      en: englishDescription || chineseDescription
        || "This title is part of the curated visual novel ranking.",
      zh: chineseDescription || englishDescription
        || "本作收录于本站的视觉小说排名。",
    },
    released,
    year: Number(released?.slice(0, 4)) || previous.year || 0,
    image: previous.image || bangumi?.images?.common || bangumi?.images?.large || "",
    lengthMinutes: previous.lengthMinutes ?? null,
    genres: previous.genres ?? ["Visual novel"],
    platforms: previous.platforms ?? ["PC"],
  };
}

function normalized(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function bigrams(value) {
  if (value.length < 2) return new Set([value]);
  return new Set(Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2)));
}

function diceSimilarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  let overlap = 0;
  for (const pair of leftPairs) if (rightPairs.has(pair)) overlap += 1;
  return (2 * overlap) / (leftPairs.size + rightPairs.size);
}

function titleSimilarity(vndb, bangumi) {
  const sourceNames = [vndb.title, vndb.alttitle].map(normalized).filter(Boolean);
  const candidateNames = [bangumi.name, bangumi.name_cn].map(normalized).filter(Boolean);
  let best = 0;
  for (const source of sourceNames) {
    for (const candidate of candidateNames) {
      if (source === candidate) return 1;
      const shorter = source.length < candidate.length ? source : candidate;
      const longer = source.length < candidate.length ? candidate : source;
      const containment = shorter.length >= 6 && longer.includes(shorter)
        ? shorter.length / longer.length
        : 0;
      best = Math.max(best, diceSimilarity(source, candidate), containment);
    }
  }
  return best;
}

function hasExactTitle(vndb, bangumi) {
  const sourceNames = [vndb.title, vndb.alttitle].map(normalized).filter(Boolean);
  const candidateNames = [bangumi.name, bangumi.name_cn].map(normalized).filter(Boolean);
  return sourceNames.some((source) => candidateNames.includes(source));
}

function matchScore(vndb, bangumi) {
  const similarity = titleSimilarity(vndb, bangumi);
  const vndbYear = Number(vndb.released?.slice(0, 4));
  const bangumiYear = Number(bangumi.date?.slice(0, 4));
  const yearDistance = vndbYear && bangumiYear ? Math.abs(vndbYear - bangumiYear) : null;
  const yearScore = yearDistance === 0 ? 8 : yearDistance <= 2 ? 3 : yearDistance >= 6 ? -8 : 0;
  const votes = bangumi.rating?.total ?? 0;
  const evidenceScore = votes >= 100 ? 2 : votes >= 10 ? 1 : -3;
  return { similarity, score: similarity * 100 + yearScore + evidenceScore, yearDistance };
}

let accessToken = await loadLocalToken();
let warnedAboutToken = false;
const cache = await loadCache();

async function searchBangumi(keyword) {
  const cacheKey = `v2:${normalized(keyword)}`;
  if (cache[cacheKey]) return cache[cacheKey];

  const request = async (withToken) => {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": SITE_AGENT,
    };
    if (withToken && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return fetchWithRetry(
      "https://api.bgm.tv/v0/search/subjects?limit=50&offset=0",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          keyword,
          sort: "match",
          filter: { type: [4] },
        }),
      },
      "Bangumi search",
    );
  };

  let payload;
  try {
    payload = await request(true);
  } catch (error) {
    if (error.status !== 401 || !accessToken) throw error;
    accessToken = "";
    if (!warnedAboutToken) {
      console.warn("Bangumi token was rejected; continuing with public search results.");
      warnedAboutToken = true;
    }
    payload = await request(false);
  }
  cache[cacheKey] = payload.data ?? [];
  return cache[cacheKey];
}

async function findBangumiMatch(vndb) {
  const queries = Array.from(new Set([vndb.alttitle, vndb.title].filter(Boolean)));
  const candidates = new Map();
  for (const query of queries) {
    const results = await searchBangumi(query);
    for (const item of results) candidates.set(item.id, item);
    const exact = results.some((item) => titleSimilarity(vndb, item) === 1);
    if (exact) break;
  }
  const ranked = [...candidates.values()]
    .map((item) => ({ item, exact: hasExactTitle(vndb, item), ...matchScore(vndb, item) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked.find(
    (candidate) =>
      candidate.exact &&
      (candidate.yearDistance === null || candidate.yearDistance <= 5),
  );
  if (!best) return null;
  return best;
}

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.titles)) {
  throw new Error("data/catalog.json is not a version 1 catalog");
}
const existingByVndbId = new Map(catalog.titles.map((title) => [title.vndbId, title]));
const usedBangumiIds = new Set();
const vndbCandidates = await fetchVndbCandidates();
const skipped = [];
const nextTitles = [];

for (const [index, vndb] of vndbCandidates.entries()) {
  const existing = existingByVndbId.get(vndb.id);
  let match = null;
  let bangumiId = existing?.bangumiId;
  if (bangumiId && usedBangumiIds.has(String(bangumiId))) bangumiId = undefined;

  try {
    if (!bangumiId) {
      match = await findBangumiMatch(vndb);
      if (match && !usedBangumiIds.has(String(match.item.id))) {
        bangumiId = String(match.item.id);
      } else {
        skipped.push({
          vndbId: vndb.id,
          title: vndb.title,
          reason: match ? "duplicate Bangumi ID" : "no confident Bangumi match",
        });
      }
    }
  } catch (error) {
    skipped.push({ vndbId: vndb.id, title: vndb.title, reason: error.message });
  }

  if (bangumiId) usedBangumiIds.add(String(bangumiId));
  const matchedBangumi = match?.item;
  const metadata = localizedMetadata(existing, vndb, matchedBangumi);
  nextTitles.push({
    name: metadata.titles.ja || vndb.title,
    vndbId: vndb.id,
    ...(bangumiId ? { bangumiId: String(bangumiId) } : {}),
    ...(existing?.egsId ? { egsId: existing.egsId } : {}),
    metadata,
    vndbScore: vndb.rating ?? null,
    vndbVotes: vndb.votecount ?? null,
    bangumiScore: existing && existing.bangumiId === bangumiId
      ? existing.bangumiScore ?? null
      : matchedBangumi?.rating?.score ? matchedBangumi.rating.score * 10 : null,
    bangumiVotes: existing && existing.bangumiId === bangumiId
      ? existing.bangumiVotes ?? null
      : matchedBangumi?.rating?.total ?? null,
    ...(existing?.egsId ? {
      egsScore: existing.egsScore ?? null,
      egsVotes: existing.egsVotes ?? null,
      egsMedian: existing.egsMedian ?? null,
    } : {}),
    scoresUpdatedAt: new Date().toISOString(),
    lastError: null,
  });
  console.log(
    `${String(index + 1).padStart(3)}. ${vndb.id} ${vndb.title} -> ${bangumiId ? `Bangumi ${bangumiId}` : "Bangumi unmapped"}`,
  );
  if ((index + 1) % 20 === 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, 400));
}

catalog.titles = nextTitles;
await mkdir(resolve(root, ".cache"), { recursive: true });
await writeFile(cachePath, `${JSON.stringify(cache)}\n`);
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

console.log(
  `Catalog now contains the exact top ${catalog.titles.length}; ${catalog.titles.filter((title) => title.bangumiId).length} have Bangumi mappings.`,
);
if (skipped.length) {
  console.log("First skipped candidates:");
  for (const item of skipped.slice(0, 20)) console.log(`- ${item.vndbId} ${item.title}: ${item.reason}`);
}
if (catalog.titles.length < targetCount) process.exitCode = 2;
