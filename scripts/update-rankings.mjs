import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const catalogPath = resolve(root, "data/catalog.json");
const rankingsPath = resolve(root, "public/data/rankings.json");
const SITE_AGENT = "VN-Rank/1.0 (static curated visual novel ranking)";
const EGS_VOTE_WEIGHT = 1.5;
const EGS_SQL_ENDPOINT =
  "https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/sql_for_erogamer_form.php";
const runAt = new Date().toISOString();

async function loadLocalSecrets() {
  if (process.env.CI) return;
  try {
    const text = await readFile(resolve(root, ".dev.vars"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*["']?(.*?)["']?\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    // The Bangumi token is optional for public subjects during local refreshes.
  }
}

function vndbId(value) {
  return String(value ?? "").match(/(?:vndb\.org\/)?(v\d+)/i)?.[1].toLowerCase();
}

function bangumiId(value) {
  return String(value ?? "").match(/(?:(?:bgm\.tv|bangumi\.tv)\/subject\/)?(\d+)/i)?.[1];
}

function egsId(value) {
  const text = String(value ?? "").trim();
  return text.match(/[?&]game=(\d+)/i)?.[1] ?? text.match(/^\d+$/)?.[0];
}

function stripHtml(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function cleanDescription(value) {
  return stripHtml(String(value ?? "")
    .replace(/\[url=[^\]]+\]([\s\S]*?)\[\/url\]/gi, "$1")
    .replace(/\[(?:\/?(?:b|i|u|s|spoiler)|raw|\/raw)\]/gi, "")
    .replace(/\r?\n+/g, " "))
    .slice(0, 1600);
}

function firstText(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() ?? "";
}

function vndbTitleFor(vndb, language) {
  return vndb?.titles?.find((item) => item.lang === language)?.title ?? "";
}

function localizedCopy(existing, vndb, bangumi) {
  const existingTitles = existing.titles ?? {};
  const existingDescriptions = existing.descriptions ?? {};
  const originalTitle = firstText(
    vndbTitleFor(vndb, "ja"),
    vndb?.titles?.find((item) => item.main)?.title,
    vndb?.alttitle,
    bangumi?.name,
    existingTitles.ja,
    existing.altTitle,
    vndb?.title,
  );
  const englishTitle = firstText(
    vndbTitleFor(vndb, "en"),
    vndb?.title,
    existingTitles.en,
    originalTitle,
  );
  const chineseTitle = firstText(
    bangumi?.name_cn,
    vndb?.titles?.find((item) => item.lang?.startsWith("zh"))?.title,
    existingTitles.zh,
    originalTitle,
  );
  const englishDescription = firstText(
    cleanDescription(vndb?.description),
    cleanDescription(existingDescriptions.en),
  );
  const chineseDescription = firstText(
    cleanDescription(bangumi?.summary),
    cleanDescription(existingDescriptions.zh),
    cleanDescription(existing.synopsis),
  );

  return {
    titles: {
      en: englishTitle || originalTitle,
      zh: chineseTitle || originalTitle,
      ja: originalTitle || englishTitle || chineseTitle,
    },
    descriptions: {
      en: englishDescription || chineseDescription
        || "This title is part of the curated visual novel ranking.",
      zh: chineseDescription || englishDescription
        || "本作收录于本站的视觉小说排名。",
    },
  };
}

function usefulTags(tags) {
  const ignored = /^(pc|ps[2-5]|psp|psv|ns|switch|xbox|windows|galgame|game|游戏)$/iu;
  return tags.filter((tag) => !ignored.test(tag)).slice(0, 3);
}

function chunks(items, size) {
  return Array.from(
    { length: Math.ceil(items.length / size) },
    (_unused, index) => items.slice(index * size, (index + 1) * size),
  );
}

async function fetchVndbCatalog(ids) {
  const records = new Map();
  const errors = new Map();
  const uniqueIds = [...new Set(ids.map(vndbId).filter(Boolean))];

  for (const batch of chunks(uniqueIds, 100)) {
    try {
      const response = await fetch("https://api.vndb.org/kana/vn", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": SITE_AGENT },
        body: JSON.stringify({
          fields: "title,alttitle,titles{lang,title,latin,official,main},description,rating,votecount,released,image.url,length_minutes,platforms",
          filters: ["or", ...batch.map((id) => ["id", "=", id])],
          results: batch.length,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`VNDB returned ${response.status}`);

      for (const record of (await response.json()).results ?? []) {
        records.set(record.id, record);
      }
      for (const id of batch) {
        if (!records.has(id)) errors.set(id, new Error(`VNDB ${id} was not found`));
      }
    } catch (error) {
      for (const id of batch) errors.set(id, error);
    }
  }

  return { records, errors };
}

let bangumiTokenRejected = false;

async function fetchBangumi(id) {
  const token = bangumiTokenRejected
    ? ""
    : process.env.BANGUMI_ACCESS_TOKEN?.trim();
  const request = async (accessToken) => {
    const headers = { Accept: "application/json", "User-Agent": SITE_AGENT };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return fetch(`https://api.bgm.tv/v0/subjects/${id}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
  };
  let response = await request(token);
  if (response.status === 401 && token) {
    bangumiTokenRejected = true;
    response = await request("");
  }
  if (!response.ok) throw new Error(`Bangumi returned ${response.status}`);
  return response.json();
}

function decodeHtml(value) {
  const namedEntities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&(amp|apos|gt|lt|quot);/gi, (_match, name) =>
      namedEntities[name.toLowerCase()])
    .trim();
}

function parseEgsTable(html) {
  const table = html.match(
    /<div\s+id=["']query_result_main["'][^>]*>\s*<table[^>]*>([\s\S]*?)<\/table>/i,
  )?.[1];
  if (!table) throw new Error("ErogameScape returned no result table");

  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(
    (match) => [...match[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
      .map((cell) => decodeHtml(cell[1])),
  );
  const [headers, ...values] = rows;
  if (!headers?.length) throw new Error("ErogameScape returned an empty result table");
  return values.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])),
  );
}

async function fetchErogameScape(ids) {
  const uniqueIds = [...new Set(ids.map(egsId).filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const sql = `
    SELECT game_id, gamename, average, median, count, allcount, sellday
      FROM toukei_temp_table
     WHERE game_id IN (${uniqueIds.join(",")})
     ORDER BY game_id
     LIMIT ${uniqueIds.length}
  `;
  const response = await fetch(EGS_SQL_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "text/html",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": SITE_AGENT,
    },
    body: new URLSearchParams({ sql }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`ErogameScape returned ${response.status}`);

  const records = new Map();
  for (const row of parseEgsTable(await response.text())) {
    const score = Number(row.average);
    const votes = Number(row.count);
    if (!/^\d+$/.test(row.game_id) || !Number.isFinite(score) || !Number.isFinite(votes)) {
      continue;
    }
    records.set(row.game_id, {
      id: row.game_id,
      name: row.gamename,
      score,
      median: Number(row.median),
      votes,
      played: Number(row.allcount),
      released: row.sellday,
    });
  }
  return records;
}

function validateCatalog(catalog) {
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.titles)) {
    throw new Error("data/catalog.json must contain schemaVersion 1 and a titles array");
  }
  const seen = new Set();
  for (const [index, title] of catalog.titles.entries()) {
    title.name = String(title.name ?? "").trim();
    title.vndbId = vndbId(title.vndbId);
    if (title.bangumiId !== undefined && title.bangumiId !== null && title.bangumiId !== "") {
      title.bangumiId = bangumiId(title.bangumiId);
      if (!title.bangumiId) throw new Error(`Catalog item ${index + 1} has an invalid bangumiId`);
    } else {
      delete title.bangumiId;
    }
    if (title.egsId !== undefined && title.egsId !== null && title.egsId !== "") {
      title.egsId = egsId(title.egsId);
      if (!title.egsId) throw new Error(`Catalog item ${index + 1} has an invalid egsId`);
    } else {
      delete title.egsId;
    }
    if (!title.name || !title.vndbId) {
      throw new Error(`Catalog item ${index + 1} needs name and vndbId`);
    }
    if (seen.has(title.vndbId)) throw new Error(`Duplicate VNDB ID: ${title.vndbId}`);
    seen.add(title.vndbId);
  }
}

function mergeMetadata(existing, vndb, bangumi) {
  const released = vndb?.released || bangumi?.date || existing.released;
  const tags = usefulTags((bangumi?.tags ?? []).map((tag) => tag.name));
  const localized = localizedCopy(existing, vndb, bangumi);
  return {
    titles: localized.titles,
    descriptions: localized.descriptions,
    released,
    year: Number(released?.slice(0, 4)) || existing.year || 0,
    image: vndb?.image?.url || bangumi?.images?.common || bangumi?.images?.large || existing.image,
    lengthMinutes: vndb?.length_minutes ?? existing.lengthMinutes ?? null,
    genres: tags.length ? tags : existing.genres,
    platforms: vndb?.platforms?.length ? vndb.platforms : existing.platforms,
  };
}

async function refreshTitle(title, vndbRecords, vndbErrors, egsRecords, egsFetchError) {
  const [bangumiResult] = title.bangumiId
    ? await Promise.allSettled([fetchBangumi(title.bangumiId)])
    : [];
  const vndb = vndbRecords.get(title.vndbId) ?? null;
  const vndbError = vndbErrors.get(title.vndbId);
  const bangumi = bangumiResult?.status === "fulfilled" ? bangumiResult.value : null;
  const egs = title.egsId ? egsRecords.get(title.egsId) : null;
  const errors = [
    vndbError ? `VNDB: ${vndbError.message ?? "failed"}` : null,
    bangumiResult?.status === "rejected" ? `Bangumi: ${bangumiResult.reason?.message ?? "failed"}` : null,
    title.egsId && egsFetchError ? `ErogameScape: ${egsFetchError.message}` : null,
    title.egsId && !egsFetchError && !egs ? `ErogameScape: ${title.egsId} was not found` : null,
  ].filter(Boolean);

  const metadata = mergeMetadata(title.metadata ?? {}, vndb, bangumi);
  return {
    title: {
      name: metadata.titles.ja || title.name,
      vndbId: title.vndbId,
      ...(title.bangumiId ? { bangumiId: title.bangumiId } : {}),
      ...(title.egsId ? { egsId: title.egsId } : {}),
      metadata,
      vndbScore: vndb?.rating ?? title.vndbScore ?? null,
      vndbVotes: vndb?.votecount ?? title.vndbVotes ?? null,
      bangumiScore: title.bangumiId
        ? bangumi?.rating?.score ? bangumi.rating.score * 10 : title.bangumiScore ?? null
        : null,
      bangumiVotes: title.bangumiId
        ? bangumi?.rating?.total ?? title.bangumiVotes ?? null
        : null,
      ...(title.egsId ? {
        egsScore: egs?.score ?? title.egsScore ?? null,
        egsVotes: egs?.votes ?? title.egsVotes ?? null,
        egsMedian: egs?.median ?? title.egsMedian ?? null,
      } : {}),
      scoresUpdatedAt: runAt,
      lastError: errors.length ? errors.join("; ").slice(0, 500) : null,
    },
    successes: Number(Boolean(vndb)) + Number(Boolean(bangumi)) + Number(Boolean(egs)),
  };
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index]);
      }
    }),
  );
  return results;
}

function overallScore(title) {
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

function toRanking(title) {
  const metadata = title.metadata ?? {};
  return {
    id: title.vndbId,
    titles: metadata.titles ?? { en: title.name, zh: title.name, ja: title.name },
    descriptions: metadata.descriptions ?? {
      en: metadata.synopsis || "This title is part of the curated visual novel ranking.",
      zh: metadata.synopsis || "本作收录于本站的视觉小说排名。",
    },
    year: metadata.year || 0,
    released: metadata.released || "Unknown",
    image: metadata.image || "",
    lengthMinutes: metadata.lengthMinutes ?? null,
    genres: metadata.genres?.length ? metadata.genres : ["Visual novel"],
    platforms: metadata.platforms?.length ? metadata.platforms : ["PC"],
    overallScore: overallScore(title),
    sources: {
      vndb: { score: title.vndbScore, votes: title.vndbVotes, href: `https://vndb.org/${title.vndbId}` },
      bangumi: {
        score: title.bangumiScore ?? null,
        votes: title.bangumiVotes ?? null,
        href: title.bangumiId ? `https://bgm.tv/subject/${title.bangumiId}` : null,
      },
      egs: {
        score: title.egsScore ?? null,
        votes: title.egsVotes ?? null,
        href: title.egsId
          ? `https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${title.egsId}`
          : null,
      },
    },
  };
}

await loadLocalSecrets();
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
validateCatalog(catalog);
const { records: vndbRecords, errors: vndbErrors } = await fetchVndbCatalog(
  catalog.titles.map((title) => title.vndbId),
);
let egsRecords = new Map();
let egsFetchError = null;
try {
  egsRecords = await fetchErogameScape(catalog.titles.map((title) => title.egsId));
} catch (error) {
  egsFetchError = error;
}
const refreshed = await mapConcurrent(
  catalog.titles,
  6,
  (title) => refreshTitle(title, vndbRecords, vndbErrors, egsRecords, egsFetchError),
);
if (catalog.titles.length && !refreshed.some((result) => result.successes > 0)) {
  throw new Error("Every source request failed; existing data was left unchanged");
}

catalog.titles = refreshed
  .map((result) => result.title)
  .sort((a, b) => overallScore(b) - overallScore(a));
const rankings = catalog.titles
  .map((title) => toRanking(title))
  .map((title, index) => ({ rank: index + 1, ...title }));

await mkdir(resolve(root, "public/data"), { recursive: true });
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
await writeFile(
  rankingsPath,
  `${JSON.stringify({
    rankings,
    updatedAt: catalog.titles.length ? runAt : null,
    source: "github-actions-static",
    catalogSize: catalog.titles.length,
    calculation: {
      method: "vote-weighted-average",
      formula: "sum(sourceScore * sourceVotes * sourceWeight) / sum(sourceVotes * sourceWeight)",
      weights: { vndb: 1, bangumi: 1, egs: EGS_VOTE_WEIGHT },
    },
  }, null, 2)}\n`,
);
console.log(`Updated ${catalog.titles.length} catalog titles and wrote ${rankings.length} rankings.`);
