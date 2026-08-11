"use client";

import { useEffect, useMemo, useState } from "react";
import {
  scoreFor,
  seedRankings,
  type RankingItem,
  type SourceKey,
} from "./data";

type ViewMode = SourceKey | "consensus";

const sourceLabels: Record<ViewMode, string> = {
  consensus: "Overall",
  vndb: "VNDB",
  bangumi: "Bangumi",
  erogamescape: "ErogameScape",
};

const formatVotes = (value: number | null) => {
  if (!value) return "No votes";
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k votes` : `${value} votes`;
};

const formatRuntime = (minutes: number | null) => {
  if (!minutes) return "Runtime unknown";
  return `About ${Math.round(minutes / 60)} hours`;
};

export default function Home() {
  const [rankings, setRankings] = useState(seedRankings);
  const [view, setView] = useState<ViewMode>("consensus");
  const [query, setQuery] = useState("");
  const [era, setEra] = useState("all");
  const [genre, setGenre] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [feedState, setFeedState] = useState<"syncing" | "live" | "snapshot">(
    "syncing",
  );
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/rankings", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Feed unavailable");
        return response.json();
      })
      .then((payload: { rankings?: RankingItem[]; updatedAt?: string }) => {
        if (payload.rankings?.length) setRankings(payload.rankings);
        setUpdatedAt(payload.updatedAt ?? null);
        setFeedState("live");
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setFeedState("snapshot");
      });

    return () => controller.abort();
  }, []);

  const genres = useMemo(
    () =>
      Array.from(new Set(rankings.flatMap((item) => item.genres))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [rankings],
  );

  const visibleRankings = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const eraStart = era === "all" ? 0 : Number(era);

    return rankings
      .filter((item) => {
        const matchesText =
          !needle ||
          item.title.toLowerCase().includes(needle) ||
          item.altTitle.toLowerCase().includes(needle);
        const matchesEra =
          era === "all" || (item.year >= eraStart && item.year < eraStart + 10);
        const matchesGenre = genre === "all" || item.genres.includes(genre);
        const hasSource = view === "consensus" || item.sources[view].score !== null;
        return matchesText && matchesEra && matchesGenre && hasSource;
      })
      .sort((a, b) => scoreFor(b, view) - scoreFor(a, view));
  }, [rankings, query, era, genre, view]);

  const lastUpdated = updatedAt
    ? new Date(updatedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Saved snapshot";

  return (
    <main className="app-shell">
      <section className="rankings-page" id="ranking">
        <div className="page-intro">
          <div>
            <p className="brand">VN Rank</p>
            <h1>Visual novel rankings</h1>
            <p className="intro-copy">
              A simple combined ranking from VNDB, Bangumi, and ErogameScape.
            </p>
          </div>
          <div className="feed-status" aria-live="polite">
            <span className={feedState}>
              <i /> {feedState === "syncing" ? "Updating" : feedState === "live" ? "Live data" : "Snapshot"}
            </span>
            <small>{lastUpdated}</small>
          </div>
        </div>

        <div className="toolbar">
          <label className="search-control">
            <span>Search</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Title or Japanese title"
              type="search"
              value={query}
            />
          </label>
          <label className="select-control">
            <span>Era</span>
            <select value={era} onChange={(event) => setEra(event.target.value)}>
              <option value="all">All years</option>
              <option value="2000">2000s</option>
              <option value="2010">2010s</option>
              <option value="2020">2020s</option>
            </select>
          </label>
          <label className="select-control">
            <span>Genre</span>
            <select
              value={genre}
              onChange={(event) => setGenre(event.target.value)}
            >
              <option value="all">All genres</option>
              {genres.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="ranking-nav">
          <div className="source-tabs" role="group" aria-label="Ranking source">
            {(Object.keys(sourceLabels) as ViewMode[]).map((source) => (
              <button
                className={view === source ? "selected" : ""}
                key={source}
                onClick={() => setView(source)}
                type="button"
              >
                {sourceLabels[source]}
              </button>
            ))}
          </div>
          <p>
            {visibleRankings.length} {visibleRankings.length === 1 ? "title" : "titles"}
          </p>
        </div>

        <div className="ranking-list">
          <div className="list-head" aria-hidden="true">
            <span>Rank</span>
            <span>Title</span>
            <span>Source scores</span>
            <span>{sourceLabels[view]} score</span>
          </div>

          {visibleRankings.map((item, index) => {
            const isExpanded = expanded === item.id;
            return (
              <article className="ranking-item" key={item.id}>
                <button
                  aria-expanded={isExpanded}
                  className="ranking-row"
                  onClick={() => setExpanded(isExpanded ? null : item.id)}
                  type="button"
                >
                  <span className="rank-number">{index + 1}</span>
                  <span className="cover">
                    <img
                      alt=""
                      height="76"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      src={item.image}
                      width="54"
                    />
                  </span>
                  <span className="title-info">
                    <strong>{item.title}</strong>
                    <small>{item.altTitle}</small>
                    <span className="title-meta">
                      <span>{item.year}</span>
                      <span>{item.genres.join(" / ")}</span>
                    </span>
                    <span className="mobile-scores">
                      VNDB {item.sources.vndb.score?.toFixed(1) ?? "-"} / Bangumi{" "}
                      {item.sources.bangumi.score?.toFixed(1) ?? "-"} / EGS{" "}
                      {item.sources.erogamescape.score?.toFixed(1) ?? "-"}
                    </span>
                  </span>
                  <span className="source-scores">
                    {(["vndb", "bangumi", "erogamescape"] as SourceKey[]).map(
                      (source) => (
                        <span key={source}>
                          <small>{source === "erogamescape" ? "EGS" : source}</small>
                          <strong>{item.sources[source].score?.toFixed(1) ?? "-"}</strong>
                        </span>
                      ),
                    )}
                  </span>
                  <strong className="overall-score">
                    {scoreFor(item, view).toFixed(1)}
                  </strong>
                  <span className="expand-button" aria-hidden="true">
                    {isExpanded ? "-" : "+"}
                  </span>
                </button>

                {isExpanded && (
                  <div className="ranking-details">
                    <div className="details-copy">
                      <h2>About this title</h2>
                      <p>{item.synopsis}</p>
                      <div className="details-meta">
                        <span>{formatRuntime(item.lengthMinutes)}</span>
                        <span>Released {item.released}</span>
                        <span>{item.platforms.join(" / ")}</span>
                      </div>
                    </div>
                    <div className="details-sources">
                      {(Object.keys(item.sources) as SourceKey[]).map((source) =>
                        item.sources[source].href ? (
                          <a
                            href={item.sources[source].href ?? "#"}
                            key={source}
                            rel="noreferrer"
                            target="_blank"
                          >
                            <span>
                              <strong>{sourceLabels[source]}</strong>
                              <small>{formatVotes(item.sources[source].votes)}</small>
                            </span>
                            <span>Open</span>
                          </a>
                        ) : null,
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}

          {!visibleRankings.length && (
            <div className="empty-state">
              <h2>No titles found</h2>
              <p>Try a different search, era, or genre.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setEra("all");
                  setGenre("all");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        <section className="method-card" aria-labelledby="method-title">
          <div>
            <p className="section-label">How scores work</p>
            <h2 id="method-title">One score, three communities.</h2>
          </div>
          <p>
            Each daily list starts with VNDB&apos;s top 100 visual novels that have
            at least 500 votes. Their Japanese or English titles are matched on
            Bangumi and ErogameScape, then scores are combined using 45% VNDB,
            30% Bangumi, and 25% ErogameScape.
          </p>
          <div className="weight-list" aria-label="Source weights">
            <span><strong>45%</strong> VNDB</span>
            <span><strong>30%</strong> Bangumi</span>
            <span><strong>25%</strong> ErogameScape</span>
          </div>
        </section>

        <p className="page-note">
          Independent ranking. Scores and cover images belong to their respective sources.
        </p>
      </section>
    </main>
  );
}
