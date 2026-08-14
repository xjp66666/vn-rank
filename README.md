# VN Rank

[VN Rank](https://vnrank.app) is a static visual-novel ranking built from VNDB, Bangumi, and ErogameScape data. GitHub Actions refreshes the scores daily and deploys the site to GitHub Pages.

## Contribute a visual novel

Edit `data/catalog.json` and add an entry inside `titles`:

```json
{
  "name": "Visual Novel Name",
  "vndbId": "v1234",
  "bangumiId": "5678",
  "egsId": "12345"
}
```

- `name` and at least one id is required.
- Make sure every ID points to the same visual novel.
- Do not add an ID that already exists in the catalog.
- Do not add scores or other fetched data manually.

Then run:

```powershell
npm install
npm run check
```

Commit your catalog change and open a pull request. You do not need to fetch scores or regenerate the rankings; GitHub Actions does that after the change is merged. Never commit `.dev.vars`, access tokens, `node_modules/`, or `dist/`.

## Run locally

Install [Node.js 22 or later](https://nodejs.org/), then run:

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`.

To access Bangumi subjects hidden from anonymous users, create an ignored `.dev.vars` file:

```dotenv
BANGUMI_ACCESS_TOKEN="your-token"
```

## Data flow

`data/catalog.json` is the editable database. `npm run update:data` fetches current source data, recalculates the ranking, and writes `public/data/rankings.json`. The website reads that generated file; it does not call the source APIs in visitors' browsers.
