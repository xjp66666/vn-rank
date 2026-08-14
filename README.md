# VN Rank

A fully static visual novel ranking built from a VNDB-origin catalog. A daily
GitHub Actions workflow fetches exact VNDB records plus any optional Bangumi and
ErogameScape mappings, stores their current scores in the catalog, calculates
the combined ranking for the full catalog, and deploys the result to GitHub Pages.

New to JavaScript, HTTP, or GitHub Actions? Read the
**[complete beginner guide](docs/BEGINNER_GUIDE.md)**. Catalog contributors can
use the shorter **[contribution checklist](CONTRIBUTING.md)**.

```text
data/catalog.json (manual database)
        |
        v
GitHub Actions --> VNDB + Bangumi + optional EGS --> public/data/rankings.json
        |
        v
GitHub Pages (static React site)
```

There is no server, Cloudflare account, runtime database, or browser-side API
token.

## Catalog format

Add each visual novel to `data/catalog.json` using its permanent IDs:

```json
{
  "schemaVersion": 1,
  "titles": [
    {
      "name": "WHITE ALBUM2",
      "vndbId": "v7771",
      "bangumiId": "22290",
      "egsId": "13255"
    }
  ]
}
```

Only the name and VNDB ID are required. Bangumi and ErogameScape IDs are
optional best-effort mappings. IDs or full source URLs are accepted. After the
updater runs, that same object also contains source scores and votes,
English, Chinese, and original Japanese titles, bilingual descriptions,
cover metadata, and source scores. The IDs never change automatically, and the
catalog does not store per-entry refresh timestamps or transient errors. The page shows the top 100 initially; visitors can acknowledge
an accuracy warning to reveal ranks 101–200.

The website's **Manage database** screen is a convenient editor. Because the
site is static, it downloads a new `catalog.json`; replace `data/catalog.json`
with that file and commit it.

## Run locally

Requirements: Node.js 22 or later.

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Keep the Bangumi personal access token in the already ignored `.dev.vars`:

   ```dotenv
   BANGUMI_ACCESS_TOKEN="your-token"
   ```

   The token lets the updater read subjects that Bangumi hides from anonymous
   API requests. It is never included in the built site.

3. Refresh the static data:

   ```powershell
   npm run update:data
   ```

4. Start the site:

   ```powershell
   npm run dev
   ```

Open `http://localhost:3000`. You can also run `npm run build` to produce the
deployable `dist/` directory.

Before pushing, run `npm run check` to validate data, lint, type-check, and build
the site.

To fill an empty catalog from VNDB's highest-rated titles, run
`npm run import:top`. The importer targets 200 titles with at least 300 VNDB votes by default,
keeps exactly the requested number of VNDB results in VNDB order, preserves
existing mappings for those titles, and attempts normalized exact Bangumi title
matches. A missing Bangumi result does not replace the VN with a lower-ranked
one. Change the defaults with `TARGET_COUNT` or `VNDB_MIN_VOTES`, then run
`npm run update:data`. The import rewrites the catalog to that exact VNDB set,
so review the diff before committing.

To populate missing ErogameScape IDs from exact EGS links attached to VNDB
release records, run `npm run map:egs`. Existing valid manual EGS mappings are
preserved. When several editions are available, the mapper prefers the original
release date and then the edition with more EGS votes. It deliberately leaves a
title unmapped when VNDB has no exact EGS release link or EGS no longer returns
that record; review those titles manually instead of accepting a fuzzy name
match. Run `npm run update:data` after mapping to refresh every source and
rebuild the ranking.

## Deploy to GitHub Pages

1. Create an empty GitHub repository, then publish this cleaned project:

   ```powershell
   git add -A
   git commit -m "Build static VN ranking site"
   git remote add origin https://github.com/YOUR_USERNAME/vn-ranking.git
   git push -u origin main
   ```

2. Open **Settings → Secrets and variables → Actions → Secrets**, create a
   repository secret named `BANGUMI_ACCESS_TOKEN`, and paste your Bangumi token.

3. Open **Settings → Pages** and set **Source** to **GitHub Actions**.

4. Push to `main`, or manually run **Refresh rankings and deploy Pages** in the
   Actions tab.

The included workflow does all of this in one run:

- fetches the current scores;
- updates `data/catalog.json` and `public/data/rankings.json`;
- builds the static Vite frontend;
- deploys it to GitHub Pages.

Ordinary pushes refresh the deployed artifact without creating a competing bot
commit. Scheduled and manually dispatched runs also commit refreshed JSON when
`main` has not changed during the run. This reduces merge conflicts while still
keeping daily data in Git history.

It also runs every day at 08:17 UTC. The non-round minute reduces the chance of
GitHub's top-of-hour scheduling congestion. Scheduled jobs can still start late;
in an inactive public repository, GitHub disables scheduled workflows after 60
days without repository activity. You can re-enable or run it from the Actions
tab.

If the workflow cannot push its refreshed JSON, check **Settings → Actions →
General → Workflow permissions** and allow read/write access. The workflow itself
requests only the repository, Pages, and deployment permissions it needs.

## Ranking method

- Each source contributes its rating multiplied by its weighted vote count
- ErogameScape votes use a `2x` multiplier; VNDB and Bangumi use `1x`
- The products are added and divided by the combined weighted vote count
- The community with more votes for that title has more influence
- ErogameScape uses `average` as its score and `count` as its votes
- Output: every title from the manually curated catalog, sorted by combined score
- The website initially displays the top 100 and gates ranks 101–200 behind an accuracy notice

Bangumi's 10-point API score is converted to the same 100-point scale as VNDB.
The final result is a vote-weighted average on the same 0-to-100 scale.
If one source temporarily fails, its last stored value is kept. The failure is
reported in the workflow log instead of being written into every catalog entry.

Official references:

- [GitHub Actions scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub Actions token permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)
