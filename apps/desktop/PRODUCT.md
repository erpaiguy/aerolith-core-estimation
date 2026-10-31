# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The desktop window is a Tauri shell around this same interface. The design language is the web app, not a per-OS native kit.

## Users

Quantity surveyors and estimators pricing a tender on a job, often with several buildings or bills in one file. (Inferred from the product: multi-BOQ campus sample, client bill, take-off, rate analysis, and submission seal.)

They work at a desk, in daylight, with the issued bill beside the screen. A dark theme is available for the same interface.

## Product Purpose

Bid Craft prices a construction tender from the client bill through measurement, rate analysis, margin, and a sealed submission. Success is a working total the estimator can explain, check, and send.

## Positioning

One job file holds every issued bill, keeps the same item numbers on each bill, and builds the submission from rate analysis plus a margin stack (overhead, profit, logistics, contingency). Source lock is per bill. The working total is the figure the rest of the job is judged against.

## Operating Context

A job moves through Overview, Source, Measure, Price, Commercial, and Submit. Files are `.aero`. Currency in the seeded resources and samples is QAR. Print and Save PDF exist on sheets that can be issued. Undo and redo cover edits. Search filters items on the measuring and pricing screens.

## Capabilities and Constraints

Confirmed in the app: client BOQ, take-off, working BOQ, rate analysis, margins, resource prices, client queries, submission summary, checks, and seal. Library (masters) and settings (license, appearance, numbers, legal, updates, report layouts, users when the workspace is not solo). Licensing, sign-in, and read-only access are real states and must stay honest.

Appearance styles (clean minimal, dense spreadsheet, dark-first modern, soft cards, classic enterprise) and centre layouts remain user settings. The default style is clean minimal.

Do not invent prices, customers, or license terms that the license screen does not already show.

## Brand Commitments

The product name is Bid Craft. The wordmark artwork stays the brand kit. Third-party UI code stays free and open source (OFL fonts, MIT icons). No paid UI kit.

## Evidence on Hand

Sample jobs and the campus loader in `apps/desktop/src`. Golden total and resource master live in the repo. License copy is rendered by the license panel from the signed-in session.

## Product Principles

- The estimator should know which building and which step they are in without decoding a tab.
- Amounts that are meant to be compared share one column.
- Every control names the job it does, in the language of the bill.
- Read-only, locked source, and expired license stay visible. They are not styling.
- The default screen is for a bright desk. Dark is the same structure, not a second product.

## Accessibility & Inclusion

Keyboard access for menus (arrows, Home, End, Escape). Focus rings stay visible. Figures use a face chosen so similar characters are harder to confuse, with tabular numbers in amount columns.
