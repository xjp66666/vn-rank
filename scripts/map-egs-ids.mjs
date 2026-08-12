import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const catalogPath = resolve(root, "data/catalog.json");
const SITE_AGENT = "VN-Rank/1.0 (static curated visual novel ranking)";
const VNDB_RELEASE_ENDPOINT = "https://api.vndb.org/kana/release";
const EGS_SQL_ENDPOINT =
  "https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/sql_for_erogamer_form.php";
const VNDB_BATCH_SIZE = 20;
const EGS_BATCH_SIZE = 100;

function decodeHtml(value) {
  const namedEntities = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' };
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

function chunks(items, size) {
  return Array.from(
    { length: Math.ceil(items.length / size) },
    (_unused, index) => items.slice(index * size, (index + 1) * size),
  );
}

async function fetchVndbReleaseCandidates(titles) {
  const candidates = new Map(titles.map((title) => [title.vndbId, new Set()]));

  for (const batch of chunks(titles, VNDB_BATCH_SIZE)) {
    const vnFilter = ["or", ...batch.map((title) => ["id", "=", title.vndbId])];
    let page = 1;
    let more = true;

    while (more) {
      const response = await fetch(VNDB_RELEASE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": SITE_AGENT },
        body: JSON.stringify({
          fields: "vns.id,extlinks{name,id}",
          filters: ["vn", "=", vnFilter],
          results: 100,
          page,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`VNDB releases returned ${response.status}`);

      const data = await response.json();
      for (const release of data.results) {
        const egsIds = release.extlinks
          .filter((link) => link.name === "egs" && /^\d+$/.test(String(link.id)))
          .map((link) => String(link.id));
        for (const vn of release.vns) {
          const titleCandidates = candidates.get(vn.id);
          if (!titleCandidates) continue;
          for (const id of egsIds) titleCandidates.add(id);
        }
      }

      more = data.more;
      page += 1;
    }
  }

  return candidates;
}

async function fetchEgsRecords(ids) {
  const records = new Map();
  for (const batch of chunks([...new Set(ids)], EGS_BATCH_SIZE)) {
    if (!batch.length) continue;
    const sql = `
      SELECT game_id, gamename, average, median, count, allcount, sellday
        FROM toukei_temp_table
       WHERE game_id IN (${batch.join(",")})
       ORDER BY game_id
       LIMIT ${batch.length}
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

    for (const row of parseEgsTable(await response.text())) {
      if (!/^\d+$/.test(row.game_id)) continue;
      records.set(row.game_id, {
        id: row.game_id,
        name: row.gamename,
        score: Number(row.average),
        median: Number(row.median),
        votes: Number(row.count),
        played: Number(row.allcount),
        released: row.sellday,
      });
    }
  }
  return records;
}

function selectCandidate(title, candidateIds, records) {
  if (title.egsId && records.has(title.egsId)) return records.get(title.egsId);
  const released = title.metadata?.released;
  return [...candidateIds]
    .map((id) => records.get(id))
    .filter(Boolean)
    .sort((left, right) => {
      const leftOriginal = Number(Boolean(released && left.released === released));
      const rightOriginal = Number(Boolean(released && right.released === released));
      return rightOriginal - leftOriginal || right.votes - left.votes || right.played - left.played;
    })[0];
}

const write = process.argv.includes("--write");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const candidates = await fetchVndbReleaseCandidates(catalog.titles);
const requestedIds = catalog.titles.flatMap((title) => [
  ...(candidates.get(title.vndbId) ?? []),
  ...(title.egsId ? [title.egsId] : []),
]);
const records = await fetchEgsRecords(requestedIds);
const unmapped = [];

for (const title of catalog.titles) {
  const selected = selectCandidate(title, candidates.get(title.vndbId) ?? [], records);
  if (!selected) {
    unmapped.push(`${title.name} (${title.vndbId})`);
    continue;
  }
  title.egsId = selected.id;
  title.egsScore = selected.score;
  title.egsVotes = selected.votes;
  title.egsMedian = selected.median;
}

if (write) await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

console.log(`${write ? "Mapped" : "Found"} EGS entries for ${catalog.titles.length - unmapped.length}/${catalog.titles.length} titles.`);
if (unmapped.length) console.log(`No usable exact VNDB-to-EGS match:\n- ${unmapped.join("\n- ")}`);
if (!write) console.log("Run with --write to save these mappings to data/catalog.json.");
