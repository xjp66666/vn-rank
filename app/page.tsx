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
  consensus: "Consensus",
  vndb: "VNDB",
  bangumi: "Bangumi",
  erogamescape: "ErogameScape",
};

const formatVotes = (value: number | null) => {
  if (!value) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toString();
};

const formatRuntime = (minutes: number | null) => {
  if (!minutes) return "Runtime unknown";
  return `≈ ${Math.round(minutes / 60)} hours`;
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

  const leader = visibleRankings[0] ?? rankings[0];
  const totalVotes = rankings.reduce(
    (total, item) =>
      total +
      Object.values(item.sources).reduce(
        (sourceTotal, source) => sourceTotal + (source.votes ?? 0),
        0,
      ),
    0,
  );

  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="VN Rank home">
          VN<span>/</span>RANK
        </a>
        <nav aria-label="Primary navigation">
          <a className="active" href="#ranking">
            Ranking
          </a>
          <a href="#method">Method</a>
          <a href="#sources">Sources</a>
        </nav>
        <a className="header-cta" href="#ranking">
          Explore the list <span aria-hidden="true">↘</span>
        </a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">
            <span /> The cross-database visual novel index
          </p>
          <h1>
            The canon,
            <br />
            <em>recalculated.</em>
          </h1>
          <p className="hero-intro">
            One opinion is taste. Three communities are a signal. VN Rank
            combines scores from the biggest Japanese and international visual
            novel databases into one legible leaderboard.
          </p>
        </div>

        <aside className="hero-scorecard" aria-label="Current ranking leader">
          <div className="scorecard-topline">
            <span>Current #1</span>
            <span className={`feed-pill ${feedState}`}>
              <i /> {feedState}
            </span>
          </div>
          <div className="leader-lockup">
            <div>
              <span className="leader-index">001</span>
              <h2>{leader.title}</h2>
              <p>{leader.altTitle}</p>
            </div>
            <strong>{scoreFor(leader).toFixed(1)}</strong>
          </div>
          <div className="source-stack" id="sources">
            {(["vndb", "bangumi", "erogamescape"] as SourceKey[]).map(
              (source) => (
                <div className={`source-line ${source}`} key={source}>
                  <span>{sourceLabels[source]}</span>
                  <div>
                    <i
                      style={{
                        width: `${leader.sources[source].score ?? 0}%`,
                      }}
                    />
                  </div>
                  <b>{leader.sources[source].score?.toFixed(1) ?? "—"}</b>
                </div>
              ),
            )}
          </div>
          <div className="scorecard-foot">
            <span>{rankings.length} titles in the live shortlist</span>
            <span>{updatedAt ? "synced just now" : "cached snapshot"}</span>
          </div>
        </aside>
      </section>

      <section className="signal-strip" aria-label="Dataset summary">
        <div>
          <small>COMMUNITY SIGNALS</small>
          <strong>{totalVotes.toLocaleString()}+</strong>
          <span>ratings compared</span>
        </div>
        <div>
          <small>SOURCE MIX</small>
          <strong>45 / 30 / 25</strong>
          <span>normalized weighting</span>
        </div>
        <div>
          <small>REFRESH RATE</small>
          <strong>06H</strong>
          <span>with snapshot fallback</span>
        </div>
        <p>
          Built for readers who want the shape of the conversation—not another
          unexplained top ten.
        </p>
      </section>

      <section className="ranking-section" id="ranking">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              <span /> Live leaderboard
            </p>
            <h2>Top visual novels</h2>
          </div>
          <p>
            Scores are normalized to 100. Switch sources to see where the
            communities agree—and where they really don’t.
          </p>
        </div>

        <div className="rank-controls">
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
          <label className="search-field">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">Search titles</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a title…"
              type="search"
              value={query}
            />
          </label>
          <label className="filter-field">
            <span>Era</span>
            <select value={era} onChange={(event) => setEra(event.target.value)}>
              <option value="all">All years</option>
              <option value="2000">2000s</option>
              <option value="2010">2010s</option>
              <option value="2020">2020s</option>
            </select>
          </label>
          <label className="filter-field">
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

        <div className="ranking-table">
          <div className="table-head" aria-hidden="true">
            <span>Rank</span>
            <span>Title</span>
            <span>Source scores</span>
            <span>{sourceLabels[view]} score</span>
          </div>

          {visibleRankings.map((item, index) => {
            const isExpanded = expanded === item.id;
            return (
              <article className="rank-card" key={item.id}>
                <button
                  aria-expanded={isExpanded}
                  className="rank-row"
                  onClick={() => setExpanded(isExpanded ? null : item.id)}
                  type="button"
                >
                  <span className="rank-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="cover-wrap">
                    <img
                      alt=""
                      height="96"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      src={item.image}
                      width="68"
                    />
                  </span>
                  <span className="title-cell">
                    <strong>{item.title}</strong>
                    <small>
                      {item.altTitle} <i /> {item.year}
                    </small>
                    <span>
                      {item.genres.map((itemGenre) => (
                        <em key={itemGenre}>{itemGenre}</em>
                      ))}
                    </span>
                  </span>
                  <span className="mini-sources">
                    {(["vndb", "bangumi", "erogamescape"] as SourceKey[]).map(
                      (source) => (
                        <span className={source} key={source}>
                          <small>{source === "erogamescape" ? "EGS" : source}</small>
                          <b>{item.sources[source].score?.toFixed(1) ?? "—"}</b>
                          <i>{formatVotes(item.sources[source].votes)}</i>
                        </span>
                      ),
                    )}
                  </span>
                  <strong className="consensus-score">
                    {scoreFor(item, view).toFixed(1)}
                    <small>/100</small>
                  </strong>
                  <span className="expand-mark" aria-hidden="true">
                    {isExpanded ? "−" : "+"}
                  </span>
                </button>

                {isExpanded && (
                  <div className="rank-details">
                    <p>{item.synopsis}</p>
                    <div>
                      <span>{formatRuntime(item.lengthMinutes)}</span>
                      <span>Released {item.released}</span>
                      <span>{item.platforms.join(" · ")}</span>
                    </div>
                    <nav aria-label={`Source links for ${item.title}`}>
                      {(Object.keys(item.sources) as SourceKey[]).map((source) =>
                        item.sources[source].href ? (
                          <a
                            href={item.sources[source].href ?? "#"}
                            key={source}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Open on {sourceLabels[source]} ↗
                          </a>
                        ) : null,
                      )}
                    </nav>
                  </div>
                )}
              </article>
            );
          })}

          {!visibleRankings.length && (
            <div className="empty-state">
              <span>∅</span>
              <h3>No titles found</h3>
              <p>Try a wider era, another genre, or a shorter search.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setEra("all");
                  setGenre("all");
                }}
              >
                Reset filters
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="method-section" id="method">
        <div className="method-title">
          <p className="eyebrow">
            <span /> Method, not magic
          </p>
          <h2>Three scenes.<br />One common scale.</h2>
        </div>
        <div className="method-grid">
          <article>
            <span>01</span>
            <h3>Collect</h3>
            <p>
              Pull Bayesian ratings and vote counts from VNDB, Bangumi subject
              ratings, and ErogameScape median scores.
            </p>
          </article>
          <article>
            <span>02</span>
            <h3>Normalize</h3>
            <p>
              Convert each source to a 100-point scale. Missing sources are
              excluded instead of being treated as zero.
            </p>
          </article>
          <article>
            <span>03</span>
            <h3>Combine</h3>
            <p>
              Weight VNDB 45%, Bangumi 30%, and ErogameScape 25%, then rebalance
              the mix across available sources.
            </p>
          </article>
        </div>
        <div className="method-note">
          <strong>Why these weights?</strong>
          <p>
            VNDB has the broadest VN-focused international sample. Bangumi adds
            a distinct Chinese-speaking audience. ErogameScape adds deep
            Japanese eroge coverage but often a smaller sample. The raw scores
            always remain visible so the consensus can be audited.
          </p>
        </div>
      </section>

      <footer>
        <div className="wordmark">
          VN<span>/</span>RANK
        </div>
        <p>Independent index. Data belongs to its respective communities.</p>
        <div>
          <a href="https://vndb.org" rel="noreferrer" target="_blank">
            VNDB ↗
          </a>
          <a href="https://bgm.tv" rel="noreferrer" target="_blank">
            Bangumi ↗
          </a>
          <a
            href="https://erogamescape.org/~ap2/ero/toukei_kaiseki/"
            rel="noreferrer"
            target="_blank"
          >
            ErogameScape ↗
          </a>
        </div>
      </footer>
    </main>
  );
}
