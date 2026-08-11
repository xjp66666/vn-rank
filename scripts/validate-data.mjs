import { readFile } from "node:fs/promises";

const dataFiles = [
  ["catalog", new URL("../data/catalog.json", import.meta.url)],
  ["rankings", new URL("../public/data/rankings.json", import.meta.url)],
];

const parsed = {};

for (const [name, url] of dataFiles) {
  const source = await readFile(url, "utf8");

  if (/^(?:<<<<<<<|=======|>>>>>>>)/m.test(source)) {
    throw new Error(`${url.pathname}: unresolved Git merge markers found`);
  }

  try {
    parsed[name] = JSON.parse(source);
  } catch (error) {
    throw new Error(`${url.pathname}: invalid JSON (${error.message})`, {
      cause: error,
    });
  }
}

const { catalog, rankings } = parsed;

if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.titles)) {
  throw new Error("data/catalog.json must use schemaVersion 1 and contain a titles array");
}

if (!Array.isArray(rankings.rankings)) {
  throw new Error("public/data/rankings.json must contain a rankings array");
}

if (rankings.rankings.length > 50) {
  throw new Error("public/data/rankings.json cannot contain more than 50 rankings");
}

const vndbIds = new Set();
const bangumiIds = new Set();

for (const [index, title] of catalog.titles.entries()) {
  const label = `catalog title ${index + 1}`;

  if (typeof title.name !== "string" || title.name.trim() === "") {
    throw new Error(`${label} must have a non-empty name`);
  }

  if (!/^v\d+$/.test(title.vndbId)) {
    throw new Error(`${label} has an invalid VNDB ID: ${title.vndbId}`);
  }

  if (!/^\d+$/.test(title.bangumiId)) {
    throw new Error(`${label} has an invalid Bangumi ID: ${title.bangumiId}`);
  }

  if (vndbIds.has(title.vndbId)) {
    throw new Error(`duplicate VNDB ID in catalog: ${title.vndbId}`);
  }

  if (bangumiIds.has(title.bangumiId)) {
    throw new Error(`duplicate Bangumi ID in catalog: ${title.bangumiId}`);
  }

  vndbIds.add(title.vndbId);
  bangumiIds.add(title.bangumiId);
}

const rankedIds = new Set();

for (const [index, title] of rankings.rankings.entries()) {
  if (!vndbIds.has(title.id)) {
    throw new Error(`ranking ${index + 1} references unknown VNDB ID: ${title.id}`);
  }

  if (rankedIds.has(title.id)) {
    throw new Error(`duplicate VNDB ID in rankings: ${title.id}`);
  }

  rankedIds.add(title.id);
}

console.log(
  `Validated ${catalog.titles.length} catalog titles and ${rankings.rankings.length} rankings.`,
);
