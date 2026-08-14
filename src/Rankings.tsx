import { useEffect, useMemo, useState } from "react";
import { scoreFor, type RankingItem, type SourceKey } from "./ranking";
import { loadStaticRankings } from "./data";

type Language = "en" | "zh";

const activeSources: SourceKey[] = ["vndb", "bangumi", "egs"];
const sourceLabels: Record<SourceKey, string> = {
  vndb: "VNDB",
  bangumi: "Bangumi",
  egs: "EGS",
};

const copy = {
  en: {
    heading: "Visual novel rankings",
    intro: "A simple combined ranking from VNDB, Bangumi, and optional EGS data.",
    updating: "Updating",
    live: "Static data",
    unavailable: "Data unavailable",
    notUpdated: "Not updated yet",
    manage: "Manage database",
    search: "Search",
    searchPlaceholder: "English, Chinese, or Japanese title",
    era: "Era",
    genre: "Genre",
    allYears: "All years",
    allGenres: "All genres",
    title: "Title",
    titles: "titles",
    oneTitle: "title",
    rank: "Rank",
    sourceScores: "Source scores",
    overallScore: "Overall score",
    about: "About this title",
    runtimeUnknown: "Runtime unknown",
    released: "Released",
    hours: "About {hours} hours",
    noVotes: "No votes",
    votes: "{votes} votes",
    open: "Open",
    noResults: "No titles found",
    empty: "Your database is empty",
    tryFilters: "Try a different search, era, or genre.",
    addPrompt: "Add a visual novel and its fixed source links.",
    clearFilters: "Clear filters",
    addFirst: "Add your first title",
    showCount: "Showing {shown} of {total} titles",
    showMore: "Show more rankings",
    showTop: "Show top 100 only",
    warningTitle: "Before showing the remaining titles",
    warning: "Lower-ranked titles may be less accurate because their source matches and vote totals are less consistent. Check the linked source pages before relying on them.",
    continue: "Show remaining rankings",
    cancel: "Keep top 100",
    how: "How scores work",
    methodTitle: "One score, multiple communities.",
    method: "Each available source record is linked permanently. GitHub Actions refreshes those exact scores once per day and averages the ratings by vote count. Each ErogameScape vote has twice the influence of a VNDB or Bangumi vote.",
    formulaOne: "Rating × votes for each source",
    formulaTwo: "EGS votes × 2",
    formulaThree: "÷ combined votes overall",
    note: "Independent ranking. Scores and cover images belong to their respective sources.",
    yearUnknown: "Year unknown",
  },
  zh: {
    heading: "视觉小说排名",
    intro: "综合 VNDB、Bangumi 与可选 EGS 数据的简洁排名。",
    updating: "正在更新",
    live: "静态数据",
    unavailable: "数据不可用",
    notUpdated: "尚未更新",
    manage: "管理数据库",
    search: "搜索",
    searchPlaceholder: "英文、中文或日文标题",
    era: "年代",
    genre: "类型",
    allYears: "全部年份",
    allGenres: "全部类型",
    title: "标题",
    titles: "部作品",
    oneTitle: "部作品",
    rank: "排名",
    sourceScores: "来源评分",
    overallScore: "综合评分",
    about: "作品简介",
    runtimeUnknown: "时长未知",
    released: "发行于",
    hours: "约 {hours} 小时",
    noVotes: "暂无投票",
    votes: "{votes} 票",
    open: "打开",
    noResults: "未找到作品",
    empty: "数据库为空",
    tryFilters: "请尝试其他搜索词、年代或类型。",
    addPrompt: "添加视觉小说及其固定来源链接。",
    clearFilters: "清除筛选",
    addFirst: "添加第一部作品",
    showCount: "当前显示 {shown} / {total} 部作品",
    showMore: "显示更多排名",
    showTop: "只显示前 100 名",
    warningTitle: "显示其余作品前请注意",
    warning: "排名较后的作品，其来源匹配和投票数量可能较不稳定，排名也可能不够准确。请在采用结果前检查对应的来源页面。",
    continue: "显示其余排名",
    cancel: "保留前 100 名",
    how: "评分方式",
    methodTitle: "一个分数，多个社区。",
    method: "每部作品会永久链接到对应的来源记录。GitHub Actions 每天更新一次评分，并按投票数计算加权平均分。每一张 ErogameScape 投票的影响力是 VNDB 或 Bangumi 投票的两倍。",
    formulaOne: "各来源评分 × 投票数",
    formulaTwo: "EGS 投票数 × 2",
    formulaThree: "÷ 总加权投票数",
    note: "本站为独立排名；评分与封面图片归各数据来源所有。",
    yearUnknown: "年份未知",
  },
} as const;

function formatVotes(value: number | null, language: Language) {
  const text = copy[language];
  if (!value) return text.noVotes;
  const votes = value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
  return text.votes.replace("{votes}", votes);
}

function formatRuntime(minutes: number | null, language: Language) {
  const text = copy[language];
  if (!minutes) return text.runtimeUnknown;
  return text.hours.replace("{hours}", String(Math.round(minutes / 60)));
}

function localizedTitle(item: RankingItem, language: Language) {
  return item.titles[language] || item.titles.ja;
}

function localizedDescription(item: RankingItem, language: Language) {
  const fallbackLanguage = language === "en" ? "zh" : "en";
  return item.descriptions[language] || item.descriptions[fallbackLanguage];
}

export function Rankings() {
  const [rankings, setRankings] = useState<RankingItem[]>([]);
  const [language, setLanguage] = useState<Language>("en");
  const [query, setQuery] = useState("");
  const [era, setEra] = useState("all");
  const [genre, setGenre] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showAccuracyWarning, setShowAccuracyWarning] = useState(false);
  const [feedState, setFeedState] = useState<"syncing" | "live" | "offline">(
    "syncing",
  );
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const text = copy[language];

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

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

  const availableRankings = useMemo(
    () => (showAll ? rankings : rankings.slice(0, 100)),
    [rankings, showAll],
  );

  const genres = useMemo(
    () =>
      Array.from(new Set(availableRankings.flatMap((item) => item.genres))).sort(
        (a, b) => a.localeCompare(b, language === "zh" ? "zh-CN" : "en"),
      ),
    [availableRankings, language],
  );

  const visibleRankings = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const eraStart = era === "all" ? 0 : Number(era);
    return availableRankings.filter((item) => {
      const matchesText =
        !needle ||
        Object.values(item.titles).some((title) =>
          title.toLocaleLowerCase().includes(needle),
        );
      const matchesEra =
        era === "all" || (item.year >= eraStart && item.year < eraStart + 10);
      const matchesGenre = genre === "all" || item.genres.includes(genre);
      return matchesText && matchesEra && matchesGenre;
    });
  }, [availableRankings, query, era, genre]);

  const lastUpdated = updatedAt
    ? new Date(updatedAt).toLocaleDateString(language === "zh" ? "zh-CN" : "en", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : text.notUpdated;

  const countText = text.showCount
    .replace("{shown}", String(availableRankings.length))
    .replace("{total}", String(rankings.length));

  return (
    <main className="app-shell">
      <section className="rankings-page" id="ranking">
        <div className="page-intro">
          <div>
            <p className="brand">VN Rank</p>
            <h1>{text.heading}</h1>
            <p className="intro-copy">{text.intro}</p>
          </div>
          <div className="intro-actions">
            <div className="language-switcher" aria-label="Language / 语言">
              <button
                aria-pressed={language === "en"}
                className={language === "en" ? "active" : ""}
                onClick={() => setLanguage("en")}
                type="button"
              >
                English
              </button>
              <button
                aria-pressed={language === "zh"}
                className={language === "zh" ? "active" : ""}
                onClick={() => setLanguage("zh")}
                type="button"
              >
                中文
              </button>
            </div>
            <div className="feed-status" aria-live="polite">
              <span className={feedState}>
                <i />{" "}
                {feedState === "syncing"
                  ? text.updating
                  : feedState === "live"
                    ? text.live
                    : text.unavailable}
              </span>
              <small>{lastUpdated}</small>
              <a className="manage-link" href="#manage">
                {text.manage}
              </a>
            </div>
          </div>
        </div>

        <div className="toolbar">
          <label className="search-control">
            <span>{text.search}</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder={text.searchPlaceholder}
              type="search"
              value={query}
            />
          </label>
          <label className="select-control">
            <span>{text.era}</span>
            <select value={era} onChange={(event) => setEra(event.target.value)}>
              <option value="all">{text.allYears}</option>
              <option value="1990">1990s</option>
              <option value="2000">2000s</option>
              <option value="2010">2010s</option>
              <option value="2020">2020s</option>
            </select>
          </label>
          <label className="select-control">
            <span>{text.genre}</span>
            <select value={genre} onChange={(event) => setGenre(event.target.value)}>
              <option value="all">{text.allGenres}</option>
              {genres.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="ranking-nav">
          <p>{countText}</p>
        </div>

        <div className="ranking-list">
          <div className="list-head" aria-hidden="true">
            <span>{text.rank}</span>
            <span>{text.title}</span>
            <span>{text.sourceScores}</span>
            <span>{text.overallScore}</span>
          </div>

          {visibleRankings.map((item) => {
            const isExpanded = expanded === item.id;
            const title = localizedTitle(item, language);
            const originalTitle = item.titles.ja;
            return (
              <article className="ranking-item" key={item.id}>
                <button
                  aria-expanded={isExpanded}
                  className="ranking-row"
                  onClick={() => setExpanded(isExpanded ? null : item.id)}
                  type="button"
                >
                  <span className="rank-number">{item.rank}</span>
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
                    <strong>{title}</strong>
                    {originalTitle && originalTitle !== title ? (
                      <small lang="ja">{originalTitle}</small>
                    ) : null}
                    <span className="title-meta">
                      <span>{item.year || text.yearUnknown}</span>
                      <span>{item.genres.join(" / ")}</span>
                    </span>
                    <span className="mobile-scores">
                      {activeSources
                        .map(
                          (source) =>
                            `${sourceLabels[source]} ${item.sources[source].score?.toFixed(1) ?? "—"}`,
                        )
                        .join(" / ")}
                    </span>
                  </span>
                  <span className="source-scores">
                    {activeSources.map((source) => (
                      <span key={source}>
                        <small>{source}</small>
                        <strong>{item.sources[source].score?.toFixed(1) ?? "—"}</strong>
                      </span>
                    ))}
                  </span>
                  <strong className="overall-score">{scoreFor(item).toFixed(1)}</strong>
                  <span className="expand-button" aria-hidden="true">
                    {isExpanded ? "−" : "+"}
                  </span>
                </button>

                {isExpanded ? (
                  <div className="ranking-details">
                    <div className="details-copy">
                      <h2>{text.about}</h2>
                      <p>{localizedDescription(item, language)}</p>
                      <div className="details-meta">
                        <span>{formatRuntime(item.lengthMinutes, language)}</span>
                        <span>{text.released} {item.released}</span>
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
                              <small>{formatVotes(item.sources[source].votes, language)}</small>
                            </span>
                            <span>{text.open}</span>
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
              <h2>{rankings.length ? text.noResults : text.empty}</h2>
              <p>{rankings.length ? text.tryFilters : text.addPrompt}</p>
              {rankings.length ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setEra("all");
                    setGenre("all");
                  }}
                >
                  {text.clearFilters}
                </button>
              ) : (
                <a className="empty-action" href="#manage">
                  {text.addFirst}
                </a>
              )}
            </div>
          ) : null}
        </div>

        {rankings.length > 100 ? (
          <div className="ranking-extension">
            {showAll ? (
              <button
                className="show-rankings-button secondary"
                onClick={() => {
                  setShowAll(false);
                  setExpanded(null);
                }}
                type="button"
              >
                {text.showTop}
              </button>
            ) : (
              <button
                className="show-rankings-button"
                onClick={() => setShowAccuracyWarning(true)}
                type="button"
              >
                {text.showMore}
              </button>
            )}

            {showAccuracyWarning && !showAll ? (
              <div className="accuracy-warning" role="alertdialog" aria-labelledby="accuracy-title">
                <div>
                  <h2 id="accuracy-title">{text.warningTitle}</h2>
                  <p>{text.warning}</p>
                </div>
                <div className="warning-actions">
                  <button
                    onClick={() => setShowAccuracyWarning(false)}
                    type="button"
                  >
                    {text.cancel}
                  </button>
                  <button
                    className="confirm"
                    onClick={() => {
                      setShowAll(true);
                      setShowAccuracyWarning(false);
                    }}
                    type="button"
                  >
                    {text.continue}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <section className="method-card" aria-labelledby="method-title">
          <div>
            <p className="section-label">{text.how}</p>
            <h2 id="method-title">{text.methodTitle}</h2>
          </div>
          <p>{text.method}</p>
          <div className="weight-list" aria-label="Score formula">
            <span><strong>{text.formulaOne}</strong></span>
            <span><strong>{text.formulaTwo}</strong></span>
            <span><strong>{text.formulaThree}</strong></span>
          </div>
        </section>

        <p className="page-note">{text.note}</p>
      </section>
    </main>
  );
}
