import { type FormEvent, useState } from "react";
import initialCatalogJson from "../data/catalog.json";
import {
  voteWeightedScore,
  type CatalogFile,
  type CatalogRecord,
} from "./ranking";

type FormState = { name: string; vndbId: string; bangumiId: string; egsId: string };
const emptyForm: FormState = { name: "", vndbId: "", bangumiId: "", egsId: "" };
const initialCatalog = initialCatalogJson as unknown as CatalogFile;

function normalizeVndb(value: string) {
  return value.match(/(?:vndb\.org\/)?(v\d+)/i)?.[1].toLowerCase() ?? "";
}

function normalizeBangumi(value: string) {
  return value.match(/(?:(?:bgm\.tv|bangumi\.tv)\/subject\/)?(\d+)/i)?.[1] ?? "";
}

function normalizeEgs(value: string) {
  const text = value.trim();
  return text.match(/[?&]game=(\d+)/i)?.[1] ?? text.match(/^\d+$/)?.[0] ?? "";
}

function formatScore(value: number | null | undefined) {
  return value == null ? "–" : value.toFixed(1);
}

export function Manage() {
  const [titles, setTitles] = useState<CatalogRecord[]>(initialCatalog.titles);
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState(
    "Edit the catalog here, then download and commit the JSON file.",
  );

  function saveTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const vndbId = normalizeVndb(form.vndbId);
    const bangumiId = normalizeBangumi(form.bangumiId);
    const egsId = normalizeEgs(form.egsId);
    if (!form.name.trim() || !vndbId) {
      setStatus("Enter a name and valid VNDB ID or URL.");
      return;
    }
    if (form.bangumiId.trim() && !bangumiId) {
      setStatus("Enter a valid numeric Bangumi ID or subject URL.");
      return;
    }
    if (form.egsId.trim() && !egsId) {
      setStatus("Enter a valid numeric ErogameScape ID or game URL.");
      return;
    }

    const existing = titles.find((title) => title.vndbId === vndbId);
    const next: CatalogRecord = {
      name: form.name.trim(),
      vndbId,
      ...(bangumiId ? { bangumiId } : {}),
      ...(egsId ? { egsId } : {}),
      metadata: existing?.metadata ?? {},
      vndbScore: existing?.vndbScore ?? null,
      vndbVotes: existing?.vndbVotes ?? null,
      bangumiScore: existing?.bangumiId === bangumiId ? existing.bangumiScore ?? null : null,
      bangumiVotes: existing?.bangumiId === bangumiId ? existing.bangumiVotes ?? null : null,
      ...(egsId ? {
        egsScore: existing?.egsId === egsId ? existing.egsScore ?? null : null,
        egsVotes: existing?.egsId === egsId ? existing.egsVotes ?? null : null,
        egsMedian: existing?.egsId === egsId ? existing.egsMedian ?? null : null,
      } : {}),
    };
    setTitles((current) => {
      const found = current.some((title) => title.vndbId === vndbId);
      return found
        ? current.map((title) => (title.vndbId === vndbId ? next : title))
        : [...current, next];
    });
    setForm(emptyForm);
    setStatus(`${next.name} is ready. Download catalog.json to save the change.`);
  }

  function removeTitle(title: CatalogRecord) {
    if (!window.confirm(`Remove ${title.name} from this catalog draft?`)) return;
    setTitles((current) => current.filter((item) => item.vndbId !== title.vndbId));
    setStatus(`${title.name} removed from the draft. Download catalog.json to save.`);
  }

  function editTitle(title: CatalogRecord) {
    setForm({
      name: title.name,
      vndbId: title.vndbId,
      bangumiId: title.bangumiId ?? "",
      egsId: title.egsId ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function downloadCatalog() {
    const catalog: CatalogFile = { schemaVersion: 1, titles };
    const blob = new Blob([`${JSON.stringify(catalog, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "catalog.json";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Downloaded. Replace data/catalog.json with this file and commit it.");
  }

  return (
    <main className="app-shell">
      <section className="manager-page">
        <div className="manager-intro">
          <div>
            <a className="back-link" href="#ranking">← Rankings</a>
            <h1>Visual novel catalog</h1>
            <p>
              The website is static. This editor prepares the repository JSON; GitHub
              Actions fetches and stores the scores after you commit it.
            </p>
          </div>
          <button onClick={downloadCatalog} type="button">Download catalog.json</button>
        </div>

        <div className="catalog-help">
          <p>
            Save the download as <code>data/catalog.json</code>, commit, and push.
            The workflow updates VNDB and any optional Bangumi/ErogameScape scores
            and republishes the ranking. No API token is ever sent to this page.
          </p>
        </div>

        <form className="catalog-form" onSubmit={saveTitle}>
          <label>
            <span>Name</span>
            <input
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="WHITE ALBUM2"
              required
              value={form.name}
            />
          </label>
          <label>
            <span>VNDB ID or URL</span>
            <input
              onChange={(event) => setForm({ ...form, vndbId: event.target.value })}
              placeholder="v7771"
              required
              value={form.vndbId}
            />
          </label>
          <label>
            <span>Bangumi ID or URL (optional)</span>
            <input
              onChange={(event) => setForm({ ...form, bangumiId: event.target.value })}
              placeholder="54898"
              value={form.bangumiId}
            />
          </label>
          <label>
            <span>EGS ID or URL (optional)</span>
            <input
              onChange={(event) => setForm({ ...form, egsId: event.target.value })}
              placeholder="13255"
              value={form.egsId}
            />
          </label>
          <button type="submit">Save to draft</button>
        </form>

        <div className="catalog-status" aria-live="polite">{status}</div>

        <div className="catalog-list">
          <div className="catalog-head" aria-hidden="true">
            <span>Title</span><span>Fixed links</span><span>Stored scores</span><span />
          </div>
          {titles.map((title) => (
            <article className="catalog-row" key={title.vndbId}>
              <div>
                <strong>{title.name}</strong>
              </div>
              <div className="catalog-links">
                <a href={`https://vndb.org/${title.vndbId}`} rel="noreferrer" target="_blank">
                  {title.vndbId}
                </a>
                {title.bangumiId ? (
                  <a href={`https://bgm.tv/subject/${title.bangumiId}`} rel="noreferrer" target="_blank">
                    Bangumi {title.bangumiId}
                  </a>
                ) : null}
                {title.egsId ? (
                  <a
                    href={`https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${title.egsId}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    EGS {title.egsId}
                  </a>
                ) : null}
              </div>
              <div className="catalog-scores">
                <span><small>VNDB</small>{formatScore(title.vndbScore)}</span>
                <span><small>Bangumi</small>{formatScore(title.bangumiScore)}</span>
                <span><small>EGS</small>{formatScore(title.egsScore)}</span>
                <strong>{formatScore(voteWeightedScore(title))}</strong>
              </div>
              <div className="catalog-actions">
                <button onClick={() => editTitle(title)} type="button">Edit</button>
                <button className="remove" onClick={() => removeTitle(title)} type="button">
                  Remove
                </button>
              </div>
            </article>
          ))}
          {!titles.length ? <div className="catalog-empty">Add your first visual novel above.</div> : null}
        </div>
      </section>
    </main>
  );
}
