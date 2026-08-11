# VN Rank

A fully static visual novel ranking built from a manually curated catalog. A
daily GitHub Actions workflow fetches the exact VNDB and Bangumi records, stores
their current scores in the catalog, calculates the combined top 50, and deploys
the result to GitHub Pages.

New to JavaScript, HTTP, or GitHub Actions? Read the
**[complete beginner guide](docs/BEGINNER_GUIDE.md)**. Catalog contributors can
use the shorter **[contribution checklist](CONTRIBUTING.md)**.

```text
data/catalog.json (manual database)
        |
        v
GitHub Actions --> VNDB + Bangumi --> public/data/rankings.json
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
      "bangumiId": "22290"
    }
  ]
}
```

IDs or full source URLs are accepted. After the updater runs, that same object
also contains its VNDB score and votes, Bangumi score and votes, cover/metadata,
last refresh time, and any source error. The IDs never change automatically.

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
`npm run import:top`. The importer requires at least 500 VNDB votes by default,
keeps existing manual mappings, and only accepts normalized exact Bangumi title
matches. Change the defaults with `TARGET_COUNT` or `VNDB_MIN_VOTES` environment
variables, then run `npm run update:data`.

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

- Each source value: rating multiplied by votes
- Each source value is normalized against that source's catalog maximum
- Overall score: 60% normalized VNDB + 40% normalized Bangumi
- Output: top 50 from the manually curated catalog

Bangumi's 10-point API score is converted to the same 100-point scale as VNDB.
The final overall score remains on a readable 0-to-100 scale while giving more
popular, highly rated titles a higher position.
If one source temporarily fails, its last stored value is kept and the error is
written into that title's catalog object.

Official references:

- [GitHub Actions scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub Actions token permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)
