import { APP_VERSION } from "../auth/releaseConfig";
import "../v3/theme.css";

const STEPS = ["Application files verified", "Local database ready", "Checking licence", "Opening workspace"];

export function SplashShell({ status }: { status?: string; children?: never }) {
  const step = !status ? 2 : /licen/i.test(status) ? 2 : /workspace|open/i.test(status) ? 3 : 1;
  return (
    <div className="v3">
      <div style={{ flex: 1, background: "#102433", color: "#fff", display: "flex", flexDirection: "column", padding: "56px 72px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ width: 52, height: 52, borderRadius: 10, background: "#0e6b56", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 22 }}>BC</span>
          <div>
            <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>Bid Craft</div>
            <div style={{ color: "#c5d4e0" }}>by Aerolith Core</div>
          </div>
        </div>
        <div style={{ marginTop: 72, maxWidth: 560 }}>
          <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.15 }}>Estimate, price and submit tenders from one workspace.</div>
          <p style={{ margin: "16px 0 0", color: "#c5d4e0", fontSize: 16 }}>Client BOQ to rate analysis to sealed submission. Your jobs stay on this computer.</p>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 40, alignItems: "end" }}>
          <div>
            {STEPS.map((label, index) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", color: index <= step ? "#fff" : "#c5d4e0", fontWeight: index === step ? 700 : 400 }}>
                <i className={`splash-dot${index < step ? " ok" : index === step ? " run" : ""}`} />
                {label}
              </div>
            ))}
            <div style={{ height: 6, borderRadius: 3, background: "#1d4e73", marginTop: 14, overflow: "hidden" }}>
              <div style={{ width: `${((step + 1) / STEPS.length) * 100}%`, height: "100%", background: "#2fbf8f" }} />
            </div>
            {status ? <p style={{ color: "#c5d4e0" }}>{status}</p> : null}
          </div>
          <div style={{ textAlign: "right", color: "#c5d4e0" }}>
            <div className="m" style={{ marginTop: 12 }}>Version {APP_VERSION}</div>
            <div style={{ marginTop: 4 }}>Proprietary software. All rights reserved.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
