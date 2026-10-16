# Aerolith Core Estimation — publish pipeline

Same Cursor ↔ GitHub ↔ `aerolith-core-releases` path as Cutlist. Process/wiring only; logos later.

| Piece | Detail |
|-------|--------|
| Source | `erpaiguy/aerolith-core-estimation` (private) |
| Public installers | `erpaiguy/aerolith-core-releases` |
| Publish | Actions `workflow_dispatch` — `Publish Estimation release` |
| Secret | Repository secret `AEROLITH_RELEASES_TOKEN` (fine-grained PAT, Contents R/W on `aerolith-core-releases` only) |
| Updater secrets | `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (minisign key; never commit either) |
| App name | Tauri `productName`: `Bid Craft` (`apps/desktop/src-tauri/tauri.conf.json`), identifier `com.aerolith.core` |
| NSIS output | `apps/desktop/src-tauri/target/release/bundle/nsis/Bid Craft_1.2.0_x64-setup.exe` plus the sibling `.sig` |
| Staged assets | `dist/Estimation-Setup.exe`, `dist/Estimation-Setup.exe.sig`, `dist/estimation-latest.json` |
| Target assets | Those three names on tag `v1.0.0` (the download page still expects `Estimation-Setup.exe`) |
| Updater manifest | `https://github.com/erpaiguy/aerolith-core-releases/releases/download/v1.0.0/estimation-latest.json` |

Tauri writes the NSIS installer as `{productName}_{version}_{arch}-setup.exe` under `src-tauri/target/release/bundle/nsis/`. `productName` is `Bid Craft` and `version` is `1.2.0`, so on the Windows x64 runner the file is `Bid Craft_1.2.0_x64-setup.exe`. `createUpdaterArtifacts` signs it with the private key. The workflow copies the installer to `dist/Estimation-Setup.exe`, copies the signature to `dist/Estimation-Setup.exe.sig`, writes `dist/estimation-latest.json` (app version `1.2.0`, not the git tag), and uploads all three with `softprops/action-gh-release@v3` (`overwrite_files: true`). The existing `Cutlist-Setup.exe` on the same tag is left in place. The tag stays `v1.0.0` so the updater URL does not move.

## Run once after this workflow is on `main`

`workflow_dispatch` runs from the default branch. After merge:

1. GitHub → **Actions** → **Publish Estimation release** → **Run workflow**.
2. Confirm `Estimation-Setup.exe`, `Estimation-Setup.exe.sig`, and `estimation-latest.json` are on [v1.0.0](https://github.com/erpaiguy/aerolith-core-releases/releases/tag/v1.0.0).

Do not commit the token or the updater private key. The public key in `tauri.conf.json` must be the pair of `TAURI_SIGNING_PRIVATE_KEY` before the first signed release, or installed apps will reject the update.

## Checklist

- [x] Private GitHub repo
- [x] Publish workflow builds the Tauri NSIS installer and uploads `Estimation-Setup.exe`
- [x] `AEROLITH_RELEASES_TOKEN` repository secret
- [ ] Cursor GitHub App repo access
- [ ] First published `Estimation-Setup.exe` on `aerolith-core-releases` (run the workflow once)
