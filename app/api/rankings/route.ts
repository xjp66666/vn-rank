import { env } from "cloudflare:workers";
import { seedRankings, scoreFor, type RankingItem } from "../../data";
import { runDailyPipeline, type PipelineResult } from "./pipeline";

const PIPELINE_VERSION = 2;

async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS pipeline_runs (
      snapshot_date TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL,
      pipeline_version INTEGER NOT NULL DEFAULT 1,
      vndb_count INTEGER NOT NULL DEFAULT 0,
      bangumi_count INTEGER NOT NULL DEFAULT 0,
      erogamescape_count INTEGER NOT NULL DEFAULT 0,
      matched_count INTEGER NOT NULL DEFAULT 0,
      error TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS source_entries (
      id TEXT PRIMARY KEY,
      snapshot_date TEXT NOT NULL,
      source TEXT NOT NULL,
      source_rank INTEGER NOT NULL,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      score REAL NOT NULL,
      votes INTEGER NOT NULL,
      source_url TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS daily_rankings (
      id TEXT PRIMARY KEY,
      snapshot_date TEXT NOT NULL,
      rank INTEGER NOT NULL,
      canonical_key TEXT NOT NULL,
      consensus_score REAL NOT NULL,
      source_count INTEGER NOT NULL,
      item_json TEXT NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_source_entries_date_source_rank
      ON source_entries(snapshot_date, source, source_rank)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_daily_rankings_date_rank
      ON daily_rankings(snapshot_date, rank)`),
  ]);

  const columns = await db
    .prepare("PRAGMA table_info(pipeline_runs)")
    .all<{ name: string }>();
  if (!columns.results.some((column) => column.name === "pipeline_version")) {
    await db
      .prepare(
        "ALTER TABLE pipeline_runs ADD COLUMN pipeline_version INTEGER NOT NULL DEFAULT 1",
      )
      .run();
  }
}

async function latestSnapshot(db: D1Database, date?: string) {
  const result = date
    ? await db
        .prepare(
          "SELECT item_json FROM daily_rankings WHERE snapshot_date = ? ORDER BY rank LIMIT 50",
        )
        .bind(date)
        .all<{ item_json: string }>()
    : await db
        .prepare(
          `SELECT item_json FROM daily_rankings
           WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM pipeline_runs WHERE status = 'complete')
           ORDER BY rank LIMIT 50`,
        )
        .all<{ item_json: string }>();
  return result.results.map((row) => JSON.parse(row.item_json) as RankingItem);
}

async function runExists(db: D1Database, date: string) {
  return db
    .prepare(
      "SELECT status, pipeline_version FROM pipeline_runs WHERE snapshot_date = ?",
    )
    .bind(date)
    .first<{ status: string; pipeline_version: number }>();
}

async function writeInChunks(db: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += 50) {
    await db.batch(statements.slice(index, index + 50));
  }
}

async function persistResult(
  db: D1Database,
  date: string,
  result: PipelineResult,
) {
  await db.batch([
    db.prepare("DELETE FROM source_entries WHERE snapshot_date = ?").bind(date),
    db.prepare("DELETE FROM daily_rankings WHERE snapshot_date = ?").bind(date),
  ]);

  const sourceStatements = result.rawEntries.map((entry) =>
    db
      .prepare(
        `INSERT INTO source_entries
         (id, snapshot_date, source, source_rank, external_id, title, score, votes, source_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `${date}:${entry.source}:${entry.externalId}`,
        date,
        entry.source,
        entry.sourceRank,
        entry.externalId,
        entry.title,
        entry.score,
        entry.votes,
        entry.href,
      ),
  );
  await writeInChunks(db, sourceStatements);

  const rankingStatements = result.rankings.map((item, index) => {
    const sourceCount = Object.values(item.sources).filter(
      (source) => source.score !== null,
    ).length;
    return db
      .prepare(
        `INSERT INTO daily_rankings
         (id, snapshot_date, rank, canonical_key, consensus_score, source_count, item_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `${date}:${item.id}`,
        date,
        index + 1,
        item.id,
        scoreFor(item),
        sourceCount,
        JSON.stringify(item),
      );
  });
  await writeInChunks(db, rankingStatements);

  await db
    .prepare(
      `UPDATE pipeline_runs SET status = 'complete', pipeline_version = ?, completed_at = ?,
       vndb_count = ?, bangumi_count = ?, erogamescape_count = ?, matched_count = ?, error = NULL
       WHERE snapshot_date = ?`,
    )
    .bind(
      PIPELINE_VERSION,
      new Date().toISOString(),
      result.sourceCounts.vndb,
      result.sourceCounts.bangumi,
      result.sourceCounts.erogamescape,
      result.matchedCount,
      date,
    )
    .run();
}

export async function GET(request: Request) {
  const db = env.DB;
  const today = new Date().toISOString().slice(0, 10);
  const url = new URL(request.url);
  const forceLocalRefresh =
    url.searchParams.get("refresh") === "1" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");

  try {
    await ensureSchema(db);
    const existing = await runExists(db, today);

    if (
      existing?.status === "complete" &&
      existing.pipeline_version === PIPELINE_VERSION &&
      !forceLocalRefresh
    ) {
      const rankings = await latestSnapshot(db, today);
      return Response.json(
        { rankings, updatedAt: `${today}T00:00:00.000Z`, source: "daily-snapshot" },
        { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
      );
    }

    if (
      existing?.status === "running" &&
      existing.pipeline_version === PIPELINE_VERSION
    ) {
      const rankings = await latestSnapshot(db);
      if (rankings.length) {
        return Response.json(
          { rankings, updatedAt: null, source: "previous-snapshot", refreshing: true },
          { headers: { "Cache-Control": "public, max-age=60" } },
        );
      }
    }

    await db
      .prepare(
        `INSERT INTO pipeline_runs (snapshot_date, started_at, status, pipeline_version)
         VALUES (?, ?, 'running', ?)
         ON CONFLICT(snapshot_date) DO UPDATE SET started_at = excluded.started_at,
           status = 'running', pipeline_version = excluded.pipeline_version, error = NULL`,
      )
      .bind(today, new Date().toISOString(), PIPELINE_VERSION)
      .run();

    const result = await runDailyPipeline();
    await persistResult(db, today, result);

    return Response.json(
      {
        rankings: result.rankings,
        updatedAt: new Date().toISOString(),
        source: "fresh-import",
        sourceCounts: result.sourceCounts,
      },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown pipeline error";
    try {
      await db
        .prepare(
          `INSERT INTO pipeline_runs
           (snapshot_date, started_at, completed_at, status, pipeline_version, error)
           VALUES (?, ?, ?, 'failed', ?, ?)
           ON CONFLICT(snapshot_date) DO UPDATE SET completed_at = excluded.completed_at,
             status = 'failed', pipeline_version = excluded.pipeline_version,
             error = excluded.error`,
        )
        .bind(
          today,
          new Date().toISOString(),
          new Date().toISOString(),
          PIPELINE_VERSION,
          message.slice(0, 500),
        )
        .run();
      const rankings = await latestSnapshot(db);
      if (rankings.length) {
        return Response.json(
          { rankings, updatedAt: null, source: "previous-snapshot", warning: message },
          { headers: { "Cache-Control": "public, max-age=300" } },
        );
      }
    } catch {
      // The verified seed keeps the site useful during first-run database failures.
    }

    return Response.json(
      { rankings: seedRankings, updatedAt: null, source: "seed-snapshot", warning: message },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }
}
