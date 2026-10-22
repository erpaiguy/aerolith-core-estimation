import { useState } from "react";
import { LEGAL_DOCS, legalDocument, type LegalId } from "../legal";

export function LegalArticle({ id, titleId }: { id: LegalId; titleId?: string }) {
  const doc = legalDocument(id);
  return (
    <article className="legal-doc">
      <h1 className="view" id={titleId}>
        {doc.title}
      </h1>
      <p className="hint">
        Effective {doc.effective}. {doc.summary}
      </p>
      {doc.sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
    </article>
  );
}

export function LegalBrowser({ initial = "privacy" }: { initial?: LegalId }) {
  const [id, setId] = useState<LegalId>(initial);
  return (
    <div className="legal-browser">
      <nav className="legal-nav" aria-label="Legal documents">
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
    <div className="modal-back" role="presentation" onMouseDown={onClose}>
      <div
        className="modal legal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <LegalArticle id={id} titleId="legal-dialog-title" />
        <div className="legal-dialog-actions">
          <button type="button" className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
