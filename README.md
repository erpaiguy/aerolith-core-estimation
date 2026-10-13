# Aerolith Core Estimation

Desktop-first estimating product. New UI, new calc kernel. Not a port of Aerolith Estimation and not an Excel clone.

## How to run the preview (Cursor)

1. In Cursor, click **Terminal** in the top menu, then **New Terminal**. A panel opens at the bottom of the window. That is where every `npm` command goes — not into this chat, not into a file.
2. Check the prompt shows `Aerolith Core Estimation`. If it does not:
   ```bash
   cd "C:\Users\hseja\Projects\Aerolith Core Estimation"
   ```
3. First time only:
   ```bash
   npm install
   ```
4. Start the app:
   ```bash
   npm run dev
   ```
5. Wait until you see `Local: http://localhost:5173/`. Chrome or Edge should open by itself. If not, open **Microsoft Edge** or **Google Chrome** (not Cursor’s chat) and type:
   `http://localhost:5173`
6. You should see **Bid Craft**. The left sidebar opens each module. Click **New project** to start estimating, or open one of the two sample jobs: **single BOQ** (working total stays **GREEN** at QAR 100,826,297.13) or **multi-BOQ** campus (three buildings).

To stop the server later, click in that same Terminal and press `Ctrl+C`.

To run tests (optional):
```bash
npm test
```

## Native Windows app

Fully quit and reopen Cursor if `rustc` is not recognized in the Terminal (Cursor must start after Rust is on your user PATH). Then:

```bash
npm run dev:desktop
```

That script loads Visual Studio 2022 Build Tools before compiling. A plain `tauri dev` from this machine can pick Visual Studio 2026’s linker, which is missing `msvcrt.lib` and fails to link.

That opens **Bid Craft** as a Windows window (the installed app identifier stays `com.aerolith.core`). **Save .aero** and **Open .aero** use native dialogs and write under `Documents\Aerolith\Projects` unless you pick another folder. Browser preview (`npm run dev`) still downloads `.aero`. Settings includes currency (default INR), decimal precision, and in-app updates.

## What this slice includes

- Calc kernel (rate analysis → cost → 47.5% margin stack → submission + tender adjustments)
- Golden tests against `Estimation Master - Complete One Project with Global Masters.xlsx`
- Workspace: Source, Take-off, Estimate, Buy, Submit, Masters
- Save / Open `.aero` on disk from the desktop window (SQLite)

## Decisions used (recommended defaults)

- Qty policy: client bill + tender adjustments
- Margin: OH 10% + profit 30% + logistics 2.5% + contingency 5%
- Currency: INR (samples that were priced in QAR stay in QAR)
- License grace (later): 14 days
- Default folder: Documents/Aerolith/Projects

## Licensing (commercial sale)

Your application code is proprietary (`LICENSE`). Third-party pieces are MIT / Apache-2.0 / public domain only — listed in `NOTICE`. No GPL, no paid UI kits, no copied WPF or Excel UI.
