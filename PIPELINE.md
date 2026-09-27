# Aerolith Core Estimation — publish pipeline

Same Cursor ↔ GitHub ↔ `aerolith-core-releases` path as Cutlist. Process/wiring only; logos later.

| Piece | Detail |
|-------|--------|
| Source | `erpaiguy/aerolith-core-estimation` (private) |
| Public installers | `erpaiguy/aerolith-core-releases` |
| Publish | Actions `workflow_dispatch` — `Publish Estimation release` |
| Secret | Repository secret `AEROLITH_RELEASES_TOKEN` (fine-grained PAT, Contents R/W on `aerolith-core-releases` only) |
| App name | Tauri `productName`: `Estimation` (`apps/desktop/src-tauri/tauri.conf.json`) |
| NSIS output | `apps/desktop/src-tauri/target/release/bundle/nsis/Estimation_0.1.0_x64-setup.exe` |
| Staged asset | `dist/Estimation-Setup.exe` (exact name the website download gate expects) |
| Target asset | `Estimation-Setup.exe` on tag `v1.0.0` |

Tauri CLI 2.11 writes the NSIS installer as `{productName}_{version}_{arch}-setup.exe` under `src-tauri/target/release/bundle/nsis/`. `productName` is `Estimation` and `version` is `0.1.0`, so on the Windows x64 runner the file is `Estimation_0.1.0_x64-setup.exe`. The workflow copies that file to `dist/Estimation-Setup.exe` and uploads it with `softprops/action-gh-release@v3` (`overwrite_files: true`). The existing `Cutlist-Setup.exe` on the same tag is left in place.

## Run once after this workflow is on `main`

`workflow_dispatch` runs from the default branch. After merge:

1. GitHub → **Actions** → **Publish Estimation release** → **Run workflow**.
2. Confirm `Estimation-Setup.exe` is on [v1.0.0](https://github.com/erpaiguy/aerolith-core-releases/releases/tag/v1.0.0).

Do not commit the token.

## Checklist

- [x] Private GitHub repo
- [x] Publish workflow builds the Tauri NSIS installer and uploads `Estimation-Setup.exe`
- [x] `AEROLITH_RELEASES_TOKEN` repository secret
- [ ] Cursor GitHub App repo access
- [ ] First published `Estimation-Setup.exe` on `aerolith-core-releases` (run the workflow once)
