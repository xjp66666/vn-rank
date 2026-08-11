import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const catalogPath = resolve(root, "data/catalog.json");
const rankingsPath = resolve(root, "public/data/rankings.json");
const SITE_AGENT = "VN-Rank/1.0 (static curated visual novel ranking)";
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

function stripHtml(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function usefulTags(tags) {
  const ignored = /^(pc|ps[2-5]|psp|psv|ns|switch|xbox|windows|galgame|game|游戏)$/iu;
  return tags.filter((tag) => !ignored.test(tag)).slice(0, 3);
}

async function fetchVndb(id) {
  const response = await fetch("https://api.vndb.org/kana/vn", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": SITE_AGENT },
    body: JSON.stringify({
      fields: "title,alttitle,rating,votecount,released,image.url,length_minutes,platforms",
      filters: ["id", "=", id],
      results: 1,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`VNDB returned ${response.status}`);
  const record = (await response.json()).results?.[0];
  if (!record) throw new Error(`VNDB ${id} was not found`);
  return record;
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

function validateCatalog(catalog) {
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.titles)) {
    throw new Error("data/catalog.json must contain schemaVersion 1 and a titles array");
  }
  const seen = new Set();
  for (const [index, title] of catalog.titles.entries()) {
    title.name = String(title.name ?? "").trim();
    title.vndbId = vndbId(title.vndbId);
    title.bangumiId = bangumiId(title.bangumiId);
    if (!title.name || !title.vndbId || !title.bangumiId) {
      throw new Error(`Catalog item ${index + 1} needs name, vndbId, and bangumiId`);
    }
    if (seen.has(title.vndbId)) throw new Error(`Duplicate VNDB ID: ${title.vndbId}`);
    seen.add(title.vndbId);
  }
}

function mergeMetadata(existing, vndb, bangumi) {
  const released = vndb?.released || bangumi?.date || existing.released;
  const tags = usefulTags((bangumi?.tags ?? []).map((tag) => tag.name));
  return {
    altTitle: vndb?.alttitle || bangumi?.name || existing.altTitle,
    released,
    year: Number(released?.slice(0, 4)) || existing.year || 0,
    image: vndb?.image?.url || bangumi?.images?.common || bangumi?.images?.large || existing.image,
    lengthMinutes: vndb?.length_minutes ?? existing.lengthMinutes ?? null,
    genres: tags.length ? tags : existing.genres,
    platforms: vndb?.platforms?.length ? vndb.platforms : existing.platforms,
    synopsis: bangumi?.summary ? stripHtml(bangumi.summary).slice(0, 500) : existing.synopsis,
  };
}

async function refreshTitle(title) {
  const [vndbResult, bangumiResult] = await Promise.allSettled([
    fetchVndb(title.vndbId),
    fetchBangumi(title.bangumiId),
  ]);
  const vndb = vndbResult.status === "fulfilled" ? vndbResult.value : null;
  const bangumi = bangumiResult.status === "fulfilled" ? bangumiResult.value : null;
  const errors = [
    vndbResult.status === "rejected" ? `VNDB: ${vndbResult.reason?.message ?? "failed"}` : null,
    bangumiResult.status === "rejected" ? `Bangumi: ${bangumiResult.reason?.message ?? "failed"}` : null,
  ].filter(Boolean);

  return {
    title: {
      name: title.name,
      vndbId: title.vndbId,
      bangumiId: title.bangumiId,
      vndbScore: vndb?.rating ?? title.vndbScore ?? null,
      vndbVotes: vndb?.votecount ?? title.vndbVotes ?? null,
      bangumiScore: bangumi?.rating?.score ? bangumi.rating.score * 10 : title.bangumiScore ?? null,
      bangumiVotes: bangumi?.rating?.total ?? title.bangumiVotes ?? null,
      metadata: mergeMetadata(title.metadata ?? {}, vndb, bangumi),
      scoresUpdatedAt: runAt,
      lastError: errors.length ? errors.join("; ").slice(0, 500) : null,
    },
    successes: Number(Boolean(vndb)) + Number(Boolean(bangumi)),
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
  const available = [
    [title.vndbScore, 0.6],
    [title.bangumiScore, 0.4],
  ].filter(([score]) => score !== null && score !== undefined);
  const totalWeight = available.reduce((total, [, weight]) => total + weight, 0);
  return totalWeight
    ? available.reduce((total, [score, weight]) => total + score * weight / totalWeight, 0)
    : 0;
}

function toRanking(title) {
  const metadata = title.metadata ?? {};
  return {
    id: title.vndbId,
    title: title.name,
    altTitle: metadata.altTitle || title.name,
    year: metadata.year || 0,
    released: metadata.released || "Unknown",
    image: metadata.image || "",
    lengthMinutes: metadata.lengthMinutes ?? null,
    genres: metadata.genres?.length ? metadata.genres : ["Visual novel"],
    platforms: metadata.platforms?.length ? metadata.platforms : ["PC"],
    synopsis: metadata.synopsis || "This title is part of the manually curated visual novel database.",
    sources: {
      vndb: { score: title.vndbScore, votes: title.vndbVotes, href: `https://vndb.org/${title.vndbId}` },
      bangumi: { score: title.bangumiScore, votes: title.bangumiVotes, href: `https://bgm.tv/subject/${title.bangumiId}` },
    },
  };
}

await loadLocalSecrets();
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
validateCatalog(catalog);
const refreshed = await mapConcurrent(catalog.titles, 6, refreshTitle);
if (catalog.titles.length && !refreshed.some((result) => result.successes > 0)) {
  throw new Error("Every source request failed; existing data was left unchanged");
}

catalog.titles = refreshed.map((result) => result.title);
const rankings = catalog.titles
  .map(toRanking)
  .sort((a, b) => {
    const source = (item) => {
      const title = catalog.titles.find((entry) => entry.vndbId === item.id);
      return overallScore(title);
    };
    return source(b) - source(a);
  })
  .slice(0, 50);

await mkdir(resolve(root, "public/data"), { recursive: true });
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
await writeFile(
  rankingsPath,
  `${JSON.stringify({ rankings, updatedAt: catalog.titles.length ? runAt : null, source: "github-actions-static", catalogSize: catalog.titles.length }, null, 2)}\n`,
);
console.log(`Updated ${catalog.titles.length} catalog titles and wrote ${rankings.length} rankings.`);
