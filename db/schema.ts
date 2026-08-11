import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const pipelineRuns = sqliteTable("pipeline_runs", {
  snapshotDate: text("snapshot_date").primaryKey(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  status: text("status").notNull(),
  vndbCount: integer("vndb_count").notNull().default(0),
  bangumiCount: integer("bangumi_count").notNull().default(0),
  erogamescapeCount: integer("erogamescape_count").notNull().default(0),
  matchedCount: integer("matched_count").notNull().default(0),
  error: text("error"),
});

export const sourceEntries = sqliteTable(
  "source_entries",
  {
    id: text("id").primaryKey(),
    snapshotDate: text("snapshot_date").notNull(),
    source: text("source").notNull(),
    sourceRank: integer("source_rank").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    score: real("score").notNull(),
    votes: integer("votes").notNull(),
    sourceUrl: text("source_url").notNull(),
  },
  (table) => [
    index("idx_source_entries_date_source_rank").on(
      table.snapshotDate,
      table.source,
      table.sourceRank,
    ),
  ],
);

export const dailyRankings = sqliteTable(
  "daily_rankings",
  {
    id: text("id").primaryKey(),
    snapshotDate: text("snapshot_date").notNull(),
    rank: integer("rank").notNull(),
    canonicalKey: text("canonical_key").notNull(),
    consensusScore: real("consensus_score").notNull(),
    sourceCount: integer("source_count").notNull(),
    itemJson: text("item_json").notNull(),
  },
  (table) => [
    index("idx_daily_rankings_date_rank").on(table.snapshotDate, table.rank),
  ],
);
