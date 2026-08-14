import { readFile } from "node:fs/promises";

const EGS_VOTE_WEIGHT = 1.5;

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

if (rankings.rankings.length !== catalog.titles.length) {
  throw new Error(
    "public/data/rankings.json must contain every title from data/catalog.json",
  );
}

if (rankings.calculation?.method !== "vote-weighted-average") {
  throw new Error("rankings must use the vote-weighted-average calculation");
}

if (rankings.calculation?.weights?.egs !== EGS_VOTE_WEIGHT) {
  throw new Error(`rankings must use EGS vote weight ${EGS_VOTE_WEIGHT}`);
}

const vndbIds = new Set();
const bangumiIds = new Set();
const egsIds = new Set();

for (const [index, title] of catalog.titles.entries()) {
  const label = `catalog title ${index + 1}`;

  if (typeof title.name !== "string" || title.name.trim() === "") {
    throw new Error(`${label} must have a non-empty name`);
  }

  if (!/^v\d+$/.test(title.vndbId)) {
    throw new Error(`${label} has an invalid VNDB ID: ${title.vndbId}`);
  }

  if (title.bangumiId !== undefined && !/^\d+$/.test(title.bangumiId)) {
    throw new Error(`${label} has an invalid Bangumi ID: ${title.bangumiId}`);
  }

  if (title.egsId !== undefined && !/^\d+$/.test(title.egsId)) {
    throw new Error(`${label} has an invalid EGS ID: ${title.egsId}`);
  }

  if (vndbIds.has(title.vndbId)) {
    throw new Error(`duplicate VNDB ID in catalog: ${title.vndbId}`);
  }

  if (title.bangumiId && bangumiIds.has(title.bangumiId)) {
    throw new Error(`duplicate Bangumi ID in catalog: ${title.bangumiId}`);
  }

  if (title.egsId && egsIds.has(title.egsId)) {
    throw new Error(`duplicate EGS ID in catalog: ${title.egsId}`);
  }

  vndbIds.add(title.vndbId);
  if (title.bangumiId) bangumiIds.add(title.bangumiId);
  if (title.egsId) egsIds.add(title.egsId);
}

const rankedIds = new Set();

for (const [index, title] of rankings.rankings.entries()) {
  if (title.rank !== index + 1) {
    throw new Error(`ranking ${index + 1} must have rank ${index + 1}`);
  }

  if (!vndbIds.has(title.id)) {
    throw new Error(`ranking ${index + 1} references unknown VNDB ID: ${title.id}`);
  }

  if (rankedIds.has(title.id)) {
    throw new Error(`duplicate VNDB ID in rankings: ${title.id}`);
  }

  for (const language of ["en", "zh", "ja"]) {
    if (typeof title.titles?.[language] !== "string" || !title.titles[language].trim()) {
      throw new Error(`ranking ${index + 1} needs a ${language} title`);
    }
  }

  for (const language of ["en", "zh"]) {
    if (
      typeof title.descriptions?.[language] !== "string"
      || !title.descriptions[language].trim()
    ) {
      throw new Error(`ranking ${index + 1} needs a ${language} description`);
    }
  }

  if (
    index > 0
    && rankings.rankings[index - 1].overallScore < title.overallScore
  ) {
    throw new Error(`ranking ${index + 1} is out of score order`);
  }

  if (!Number.isFinite(title.overallScore) || title.overallScore < 0 || title.overallScore > 100) {
    throw new Error(`ranking ${index + 1} must have an overallScore from 0 to 100`);
  }

  const vndbScore = title.sources?.vndb?.score ?? 0;
  const vndbVotes = title.sources?.vndb?.votes ?? 0;
  const bangumiScore = title.sources?.bangumi?.score ?? 0;
  const bangumiVotes = title.sources?.bangumi?.votes ?? 0;
  const egsScore = title.sources?.egs?.score ?? 0;
  const egsVotes = title.sources?.egs?.votes ?? 0;
  const weightedEgsVotes = egsVotes * EGS_VOTE_WEIGHT;
  const totalVotes = vndbVotes + bangumiVotes + weightedEgsVotes;
  const expectedScore = totalVotes
    ? (vndbScore * vndbVotes
      + bangumiScore * bangumiVotes
      + egsScore * weightedEgsVotes)
    / totalVotes
    : 0;
  if (Math.abs(title.overallScore - expectedScore) > 1e-8) {
    throw new Error(`ranking ${index + 1} has an incorrectly calculated overallScore`);
  }

  rankedIds.add(title.id);
}

console.log(
  `Validated ${catalog.titles.length} catalog titles and ${rankings.rankings.length} rankings.`,
);
