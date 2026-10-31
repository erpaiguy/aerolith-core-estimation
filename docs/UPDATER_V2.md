# Bid Craft 2.0 updater checklist

Installed desktop apps already call the updater. They do not need a new URL. They update when a **signed** `estimation-latest.json` on the existing release says the app version is newer than the one they are running.

Channel (do not move this URL):

`https://github.com/erpaiguy/aerolith-core-releases/releases/download/v1.0.0/estimation-latest.json`

The public key already in `apps/desktop/src-tauri/tauri.conf.json` is a minisign **public** key. Key id: `0D2A07F09EBF1044`. It is not a private key. Do not commit a private key, a password, or `TAURI_SIGNING_PRIVATE_KEY`.

## What CI does

Workflow: **Publish Estimation release** (`.github/workflows/publish-estimation-release.yml`).

Merge is not required. Bid Craft 2.0 stays on branch `cursor/bid-craft-v2.0-4380`. Run the release from that branch:

1. GitHub → **Actions** → **Publish Estimation release**.
2. **Run workflow**.
3. **Use workflow from** → branch `cursor/bid-craft-v2.0-4380`.
4. **Run workflow**.

`workflow_dispatch` uses the workflow file and the code from the branch you select. `actions/checkout` then builds that same commit. Choosing `main` would build the copy of the workflow on `main`, which is not 2.0.1. Leave the pull request open.

| Secrets present | Result |
| --- | --- |
| `AEROLITH_RELEASES_TOKEN` and both signing secrets | Signed `Estimation-Setup.exe`, `.sig`, and `estimation-latest.json` replace those three assets on tag `v1.0.0`. Installed apps can update to 2.0.1. |
| Token present, signing secrets empty | Unsigned installer is uploaded as a **draft** release tagged `v2.0.1-draft`. `estimation-latest.json` is left alone, so installed apps do not see an update they cannot verify. |
| Token empty | The workflow stops. Nothing is published. |

## One-time signing setup (Windows, only if the private key was never stored)

Skip this if GitHub already has `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` and that key matches the public key in `tauri.conf.json`.

1. On the developer machine, from `apps/desktop`:

   ```powershell
   npm run tauri signer generate -- -w "$env:USERPROFILE\.tauri\bidcraft.key"
   ```

2. The command prints a public key and writes a password-protected private key file. Put **only** the public key into `plugins.updater.pubkey` in `apps/desktop/src-tauri/tauri.conf.json`.
3. GitHub → repository secrets on `aerolith-core-estimation` (never in git):
   - `TAURI_SIGNING_PRIVATE_KEY`: full contents of the `.key` file
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the password you chose
   - `AEROLITH_RELEASES_TOKEN`: fine-grained PAT with Contents read/write on `erpaiguy/aerolith-core-releases` only
4. Reinstall is required for copies that were built with a different public key. Copies built with the key already in this repo will accept updates signed by its pair.
5. Run **Publish Estimation release** from branch `cursor/bid-craft-v2.0-4380` (see above). Confirm `Estimation-Setup.exe`, `Estimation-Setup.exe.sig`, and `estimation-latest.json` (version `2.0.1`) are on the `v1.0.0` release. Open an installed 1.x Bid Craft and use Settings → Updates → Check now.

## Human checklist before the first signed 2.0 update works

- [ ] Confirm the private key that matches pubkey `0D2A07F09EBF1044` is in `TAURI_SIGNING_PRIVATE_KEY`, or generate a new pair and replace only the public key in git
- [ ] `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is set
- [ ] `AEROLITH_RELEASES_TOKEN` is set
- [ ] Merge is not required. Leave the pull request open
- [ ] Actions → Publish Estimation release → Run workflow → choose branch `cursor/bid-craft-v2.0-4380` → Run workflow (`workflow_dispatch` uses the workflow file and code from that branch)
- [ ] `estimation-latest.json` on tag `v1.0.0` shows `"version": "2.0.1"` and a `windows-x86_64` signature
- [ ] An installed copy offers 2.0.1 from Settings → Updates
