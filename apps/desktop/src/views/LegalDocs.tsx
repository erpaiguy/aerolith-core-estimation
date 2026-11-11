import { useState } from "react";
import { LEGAL_DOCS, legalDocument, type LegalId } from "../legal";

export function LegalArticle({ id, titleId }: { id: LegalId; titleId?: string }) {
  const doc = legalDocument(id);
  return (
    <article>
      <h2 id={titleId}>{doc.title}</h2>
      <p style={{ color: "#2c4558" }}>
        Effective {doc.effective}. {doc.summary}
      </p>
      {doc.sections.map((section) => (
        <section key={section.heading}>
          <h3 style={{ margin: "14px 0 4px", fontSize: 15 }}>{section.heading}</h3>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} style={{ margin: "6px 0" }}>{paragraph}</p>
          ))}
        </section>
      ))}
    </article>
  );
}

export function LegalBrowser({ initial = "privacy" }: { initial?: LegalId }) {
  const [id, setId] = useState<LegalId>(initial);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <nav className="tabs" aria-label="Legal documents">
        {LEGAL_DOCS.map((doc) => (
          <button key={doc.id} type="button" className={doc.id === id ? "on" : ""} aria-current={doc.id === id ? "page" : undefined} onClick={() => setId(doc.id)}>
            {doc.title}
          </button>
        ))}
      </nav>
      <LegalArticle id={id} />
    </div>
  );
}

export function LegalDialog({ id, onClose }: { id: LegalId; onClose: () => void }) {
  return (
    <div className="legal-back" role="presentation" onMouseDown={onClose}>
      <div
        className="legal-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <LegalArticle id={id} titleId="legal-dialog-title" />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className="b p" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function LegalLinks({ onOpen }: { onOpen: (id: LegalId) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {LEGAL_DOCS.map((doc) => (
        <button key={doc.id} className="b s" type="button" onClick={() => onOpen(doc.id)}>
          {doc.title}
        </button>
      ))}
    </div>
  );
}
