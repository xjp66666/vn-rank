# Contributing to VN Rank

Thank you for helping improve the catalog. Most contributions only need to edit
`data/catalog.json`.

## Add a visual novel

Add an object to the top-level `titles` array:

```json
{
  "name": "Visual Novel Name",
  "vndbId": "v1234",
  "bangumiId": "5678",
  "egsId": "12345"
}
```

Only `name` and `vndbId` are required. `bangumiId` and `egsId` are optional. If
provided, each must identify the same work or edition; omit a mapping when it
has not been verified.

Before opening a pull request:

1. Open every supplied external page and confirm it represents the same visual novel.
2. Confirm none of the supplied source IDs is already present in the catalog.
3. Run `npm install` if dependencies are not installed.
4. Optionally run `npm run map:egs` to look up an exact EGS release link from
   VNDB. Check the selected edition before committing it.
5. Run `npm run validate:data`.
6. Run `npm run check`.
7. Commit the catalog change and open a pull request.

Do not add API tokens, `.dev.vars`, `node_modules/`, `dist/`, or unrelated
generated files. Contributors do not need a Bangumi token. After the pull
request is merged, the deployment workflow fetches and publishes current scores
using the owner's secret; the scheduled daily run also persists refreshed data
in Git.

## Pull request checklist

- [ ] The title has one valid `v...` VNDB ID.
- [ ] Any optional Bangumi ID points to the same work.
- [ ] Any optional EGS ID points to the same edition.
- [ ] Every supplied page describes the same work or intended edition.
- [ ] The IDs are unique in the catalog.
- [ ] JSON validation and project checks pass.
- [ ] No secret or personal token is included.

For architecture, local setup, HTTP, ranking logic, and troubleshooting, read
[`docs/BEGINNER_GUIDE.md`](docs/BEGINNER_GUIDE.md).
