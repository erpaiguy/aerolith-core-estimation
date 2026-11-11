# Changelog

## 3.0.2

- Forgot password emails a one-time reset link. Pasting the link, or the code, sets a new password without signing the device in.
- The webview content security policy allows the app, the account service, and the Google fonts used by the light theme. External links stay on the Aerolith site. Temporary PDF names cannot leave the temp folder. PIN hashes compare in constant time.
- Undo and redo restore the last project edit from the Edit menu and from Ctrl+Z / Ctrl+Y. Both stay disabled while a job is sealed or locked.
- A successful save keeps the previous `.aero.bak`.
- Privacy, terms of service, terms and conditions, and the licence text are readable on the sign-in screen and in Settings.

Save-and-close and the Amend lock from 3.0.1 are unchanged.

Publish Estimation release was not run for this version.

## 3.0.1

Fixes the 3.0.0 desktop shell after the installed build.

- Legacy button rules no longer squash rows, inputs, or navigation.
- Header menus sit on their own buttons. File, Edit, View, and Help only list actions that run.
- Unfinished modules are hidden. Nothing in the rail or landing page is marked New.
- Reports preview, CSV export, and print all use the selected suite and the live job.
- Catalogue, update, and conflict notices sit in the page instead of floating over the header.

## 3.0.0

Desktop estimation UI rebuilt to the approved Bid Craft screens 1–28: navy header, ice rail, light canvas, teal actions, and amber warnings.

- Splash, sign-in, close job, sign-out, job landing, five-step new-job wizard, and owner console.
- Job workflow for dashboard, client BOQ, take-off, working BOQ, rate analysis, margins, client queries, resource prices, submission, and finalise.
- Supplier enquiries, compare-and-choose, and follow-up notes stored on the job.
- Rate register, link or clone, component editor, cost categories, resource detail, masters, settings, reports, and the design specimen.
- Calculation, `.aero`, licence, and updater behaviour are unchanged underneath. Screens 29 and later are not included.

Publish Estimation release was not run for this version.
