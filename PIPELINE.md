# Aerolith Core Estimation — publish pipeline

Same Cursor ↔ GitHub ↔ `aerolith-core-releases` path as Cutlist. Process/wiring only; logos later.

| Piece | Detail |
|-------|--------|
| Source | `erpaiguy/aerolith-core-estimation` (private) |
| Public installers | `erpaiguy/aerolith-core-releases` |
| Publish | Actions `workflow_dispatch` — `Publish Estimation release` |
| Secret | Repository secret `AEROLITH_RELEASES_TOKEN` (fine-grained PAT, Contents R/W on `aerolith-core-releases` only) |
| Target asset | `Estimation-Setup.exe` on tag `v1.0.0` (when build is wired) |

Reuse the Cutlist PAT. Add it as a **Repository** secret (not Environment). Grant the **Cursor GitHub App** access to this repo.

## Checklist

- [x] Private GitHub repo
- [x] Stub publish workflow (fails until real installer build exists)
- [ ] `AEROLITH_RELEASES_TOKEN` repository secret
- [ ] Cursor GitHub App repo access
- [ ] Real Build-Installer / packaging scripts
- [ ] First published `Estimation-Setup.exe` on `aerolith-core-releases`
