import { useEffect, useMemo, useState } from "react";
import {
  scoreFor,
  type RankingItem,
  type SourceKey,
} from "./ranking";
import { loadStaticRankings } from "./data";

const activeSources: SourceKey[] = ["vndb", "bangumi", "egs"];
const sourceLabels: Record<SourceKey, string> = {
  vndb: "VNDB",
  bangumi: "Bangumi",
  egs: "EGS",
};

function formatVotes(value: number | null) {
  if (!value) return "No votes";
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k votes` : `${value} votes`;
}

function formatRuntime(minutes: number | null) {
  if (!minutes) return "Runtime unknown";
  return `About ${Math.round(minutes / 60)} hours`;
}

export function Rankings() {
  const [rankings, setRankings] = useState<RankingItem[]>([]);
  const [query, setQuery] = useState("");
  const [era, setEra] = useState("all");
  const [genre, setGenre] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [feedState, setFeedState] = useState<"syncing" | "live" | "offline">(
    "syncing",
  );
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadStaticRankings<{ rankings: RankingItem[]; updatedAt: string | null }>(
      controller.signal,
    )
      .then((payload) => {
        setRankings(payload.rankings ?? []);
        setUpdatedAt(payload.updatedAt ?? null);
        setFeedState("live");
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setFeedState("offline");
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
        return matchesText && matchesEra && matchesGenre;
      })
      .sort((a, b) => scoreFor(b) - scoreFor(a));
  }, [rankings, query, era, genre]);

  const lastUpdated = updatedAt
    ? new Date(updatedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Not updated yet";

  return (
    <main className="app-shell">
      <section className="rankings-page" id="ranking">
        <div className="page-intro">
          <div>
            <p className="brand">VN Rank</p>
            <h1>Visual novel rankings</h1>
            <p className="intro-copy">
              A simple combined ranking from VNDB, Bangumi, and optional EGS data.
            </p>
          </div>
          <div className="feed-status" aria-live="polite">
            <span className={feedState}>
              <i />{" "}
              {feedState === "syncing"
                ? "Updating"
                : feedState === "live"
                  ? "Static data"
                  : "Data unavailable"}
            </span>
            <small>{lastUpdated}</small>
            <a className="manage-link" href="#manage">
              Manage database
            </a>
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
              <option value="1990">1990s</option>
              <option value="2000">2000s</option>
              <option value="2010">2010s</option>
              <option value="2020">2020s</option>
            </select>
          </label>
          <label className="select-control">
            <span>Genre</span>
            <select value={genre} onChange={(event) => setGenre(event.target.value)}>
              <option value="all">All genres</option>
              {genres.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="ranking-nav">
          <p>
            {visibleRankings.length} {visibleRankings.length === 1 ? "title" : "titles"}
          </p>
        </div>

        <div className="ranking-list">
          <div className="list-head" aria-hidden="true">
            <span>Rank</span>
            <span>Title</span>
            <span>Source scores</span>
            <span>Overall score</span>
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
                    {item.image ? (
                      <img
                        alt=""
                        height="76"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        src={item.image}
                        width="54"
                      />
                    ) : null}
                  </span>
                  <span className="title-info">
                    <strong>{item.title}</strong>
                    <small>{item.altTitle}</small>
                    <span className="title-meta">
                      <span>{item.year || "Year unknown"}</span>
                      <span>{item.genres.join(" / ")}</span>
                    </span>
                    <span className="mobile-scores">
                      {activeSources.map((source) =>
                        `${sourceLabels[source]} ${item.sources[source].score?.toFixed(1) ?? "–"}`
                      ).join(" / ")}
                    </span>
                  </span>
                  <span className="source-scores">
                    {activeSources.map((source) => (
                      <span key={source}>
                        <small>{source}</small>
                        <strong>{item.sources[source].score?.toFixed(1) ?? "–"}</strong>
                      </span>
                    ))}
                  </span>
                  <strong className="overall-score">
                    {scoreFor(item).toFixed(1)}
                  </strong>
                  <span className="expand-button" aria-hidden="true">
                    {isExpanded ? "−" : "+"}
                  </span>
                </button>

                {isExpanded ? (
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
                      {activeSources.map((source) =>
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
                ) : null}
              </article>
            );
          })}

          {!visibleRankings.length ? (
            <div className="empty-state">
              <h2>{rankings.length ? "No titles found" : "Your database is empty"}</h2>
              <p>
                {rankings.length
                  ? "Try a different search, era, or genre."
                  : "Add a visual novel and its fixed source links."}
              </p>
              {rankings.length ? (
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
              ) : (
                <a className="empty-action" href="#manage">
                  Add your first title
                </a>
              )}
            </div>
          ) : null}
        </div>

        <section className="method-card" aria-labelledby="method-title">
          <div>
            <p className="section-label">How scores work</p>
            <h2 id="method-title">One score, multiple communities.</h2>
          </div>
          <p>
            You permanently link each available source record. GitHub Actions
            refreshes those exact scores once per day, stores them in the catalog,
            then averages the ratings by vote count. Each ErogameScape vote has
            twice the influence of a VNDB or Bangumi vote.
          </p>
          <div className="weight-list" aria-label="Score formula">
            <span><strong>Rating × votes</strong> for each source</span>
            <span><strong>EGS votes × 2</strong></span>
            <span><strong>÷ combined votes</strong> overall</span>
          </div>
        </section>

        <p className="page-note">
          Independent ranking. Scores and cover images belong to their respective sources.
        </p>
      </section>
    </main>
  );
}
