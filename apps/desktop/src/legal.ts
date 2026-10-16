export type LegalId = "privacy" | "terms-of-service" | "terms-and-conditions" | "license";

export type LegalSection = {
  heading: string;
  paragraphs: string[];
};

export type LegalDocument = {
  id: LegalId;
  title: string;
  effective: string;
  summary: string;
  sections: LegalSection[];
};

export const LEGAL_DOCS: LegalDocument[] = [
  {
    id: "privacy",
    title: "Privacy policy",
    effective: "16 October 2026",
    summary: "What Bid Craft keeps on this computer, and what is sent to sign in.",
    sections: [
      {
        heading: "Tender files stay on this computer",
        paragraphs: [
          "Bid Craft is a single-user desktop app for one tender file at a time. The .aero file, its bills, rates, queries, and frozen revisions are written under your Documents/Aerolith folder, or to a path you choose in the save dialog.",
          "The app does not upload the tender, the resource master, or attached working papers as part of sign-in, license checks, or updates.",
        ],
      },
      {
        heading: "Account and license",
        paragraphs: [
          "Sign-in sends your email and password to Aerolith account services over HTTPS so this device can start or refresh the Bid Craft trial. The app then stores the session on this device so you can reopen the workspace.",
          "A license check sends the app id aerolith-estimation, a device hash, and the app version. It does not send bill lines or prices.",
          "The trial is 30 days for this app. When it ends, the workspace locks until the plan is renewed. Signing out clears the saved session on this device.",
        ],
      },
      {
        heading: "Updates",
        paragraphs: [
          "The installed app can check a signed update manifest. That check does not include your tender file. You choose when an update is installed.",
        ],
      },
      {
        heading: "Contact",
        paragraphs: [
          "Questions about this policy: hello@theaerolithcore.com. Account, trial, and pricing pages are on https://www.theaerolithcore.com.",
        ],
      },
    ],
  },
  {
    id: "terms-of-service",
    title: "Terms of service",
    effective: "16 October 2026",
    summary: "The account, the seat, and the trial.",
    sections: [
      {
        heading: "One seat",
        paragraphs: [
          "Bid Craft is licensed to one person on this device. The account is an Aerolith account. A new account starts a 30-day trial for this app.",
          "Do not share the seat, the session, or the license token. Access ends when the trial or paid term ends, or when you sign out.",
        ],
      },
      {
        heading: "The service",
        paragraphs: [
          "Aerolith provides the app, sign-in, and the license check. Paid plans, when they are offered, are started from the Aerolith website and then used by signing in here.",
          "The website can refuse or end an account that is misused, including attempts to bypass the license check.",
        ],
      },
    ],
  },
  {
    id: "terms-and-conditions",
    title: "Terms and conditions",
    effective: "16 October 2026",
    summary: "How you use the estimates the app produces.",
    sections: [
      {
        heading: "Your figures",
        paragraphs: [
          "Quantities, rates, margins, adjustments, and the submission pack are yours. Bid Craft calculates from what you enter and from the resource prices in the file. You are responsible for checking the offer before it goes to a client.",
          "Sample jobs are examples. Their totals are not a quotation.",
        ],
      },
      {
        heading: "Use of the app",
        paragraphs: [
          "Use the app to prepare your own tenders. Do not use it to break the law, to probe someone else’s account, or to interfere with the license service.",
          "These conditions describe the product. They are not a form of contract between you and your client.",
        ],
      },
    ],
  },
  {
    id: "license",
    title: "License terms",
    effective: "16 October 2026",
    summary: "The proprietary license for this copy of Bid Craft.",
    sections: [
      {
        heading: "Grant",
        paragraphs: [
          "Aerolith grants you a personal, non-exclusive, non-transferable license to install and run this copy of Bid Craft on one device, for the trial or paid term that the license service reports.",
          "Your .aero files remain yours. This license covers the software, not your tender data.",
        ],
      },
      {
        heading: "Limits",
        paragraphs: [
          "You may not redistribute the installer, rent the seat, remove the publisher marks, or bypass the sign-in and license check.",
          "The app is provided as a tool for estimating. Aerolith does not warrant that a total is the price you should submit.",
        ],
      },
    ],
  },
];

export function legalDocument(id: LegalId): LegalDocument {
  const doc = LEGAL_DOCS.find((item) => item.id === id);
  if (!doc) throw new Error(`Unknown legal document ${id}`);
  return doc;
}
