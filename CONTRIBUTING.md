# Contributing to VN Rank

Thank you for helping improve the catalog. Most contributions only need to edit
`data/catalog.json`.

## Add a visual novel

Add an object to the top-level `titles` array:

```json
{
  "name": "Visual Novel Name",
  "vndbId": "v1234",
  "bangumiId": "5678"
}
```

Before opening a pull request:

1. Open both external pages and confirm they represent the same visual novel.
2. Confirm neither VNDB nor Bangumi ID is already present in the catalog.
3. Run `npm install` if dependencies are not installed.
4. Run `npm run validate:data`.
5. Run `npm run check`.
6. Commit the catalog change and open a pull request.

Do not add API tokens, `.dev.vars`, `node_modules/`, `dist/`, or unrelated
generated files. Contributors do not need a Bangumi token. After the pull
request is merged, the repository's daily workflow fetches current scores and
metadata using the owner's secret.

## Pull request checklist

- [ ] The title has one valid `v...` VNDB ID.
- [ ] The title has one numeric Bangumi subject ID.
- [ ] Both pages describe the same work and edition.
- [ ] The IDs are unique in the catalog.
- [ ] JSON validation and project checks pass.
- [ ] No secret or personal token is included.

For architecture, local setup, HTTP, ranking logic, and troubleshooting, read
[`docs/BEGINNER_GUIDE.md`](docs/BEGINNER_GUIDE.md).
