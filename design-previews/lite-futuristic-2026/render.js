/* Concept mockups — generates all Aerolith screens for one theme. */
const MODULES = [
  ["dashboard", "Dashboard"],
  ["source", "Client BOQ"],
  ["takeoff", "Take-off"],
  ["estimate", "Working BOQ"],
  ["analysis", "Rate Analysis"],
  ["margins", "Margins"],
  ["queries", "Client Queries"],
  ["buy", "Resource Prices"],
  ["submit", "Submission BOQ"],
  ["masters", "Masters"],
  ["settings", "Settings"],
];

const ICONS = {
  dashboard: "M3 12h7V3H3v9zm0 9h7v-7H3v7zm11 0h7V12h-7v9zm0-18v7h7V3h-7z",
  source: "M4 4h12l4 4v12H4V4zm12 0v4h4",
  takeoff: "M3 21l6-6 4 4 8-10",
  estimate: "M4 6h16M4 12h16M4 18h10",
  analysis: "M4 20V10m6 10V4m6 16v-7m6 7V8",
  margins: "M3 17l6-6 4 4 8-10",
  queries: "M4 5h16v10H7l-3 4V5z",
  buy: "M6 6h15l-2 8H7L5 3H2m5 16a1 1 0 100 2 1 1 0 000-2zm10 0a1 1 0 100 2 1 1 0 000-2z",
  submit: "M5 4h10l4 4v12H5V4zm3 12h8M8 8h5",
  masters: "M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z",
  settings: "M12 8a4 4 0 100 8 4 4 0 000-8zm9 4a7.5 7.5 0 00-.2-1.6l2-1.5-2-3.4-2.4 1A7.7 7.7 0 0016 5.2L15.6 2h-3.2L12 5.2A7.7 7.7 0 009.6 6.5l-2.4-1-2 3.4 2 1.5A7.5 7.5 0 007 12c0 .5.1 1.1.2 1.6l-2 1.5 2 3.4 2.4-1A7.7 7.7 0 0012 18.8l.4 3.2h3.2l.4-3.2a7.7 7.7 0 002.4-1.3l2.4 1 2-3.4-2-1.5c.1-.5.2-1.1.2-1.6z",
};

function svgIco(d) {
  return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
}

function titlebar(job, total) {
  return `<header class="titlebar">
    <span class="mark" aria-hidden="true">A</span>
    <span class="job">${job} <small>r3 · Trial 28d</small></span>
    <span class="sp"></span>
    <span class="gold">${total}</span>
    <div class="tb-actions">
      <button class="btn ghost" type="button">Inspector</button>
      <button class="btn ghost" type="button">Close</button>
      <button class="btn ghost" type="button">Open</button>
      <button class="btn primary" type="button">Save</button>
    </div>
    <span class="who">HS · owner</span>
  </header>`;
}

function modules(active) {
  return `<nav class="modules" aria-label="Modules">${MODULES.map(([id, label]) =>
    `<button type="button" class="mod ${id === active ? "on" : ""}">${label}</button>`
  ).join("")}</nav>`;
}

function rail(active) {
  return `<nav class="rail" aria-label="Modules">${MODULES.map(([id, label]) =>
    `<button type="button" class="${id === active ? "on" : ""}" aria-label="${label}">${svgIco(ICONS[id])}</button>`
  ).join("")}</nav>`;
}

function stepper(now) {
  const steps = ["Sign-in", "Home", "Measure", "Analyse", "Price", "Seal"];
  return `<div class="stepper" aria-label="Process">${steps.map((s) =>
    `<span class="${s === now ? "now" : ""}"><i class="dot"></i> ${s}</span>`
  ).join('<span aria-hidden="true"> / </span>')}</div>`;
}

function status(extra) {
  return `<footer class="status"><span class="ok">Ready</span><span>Keyboard: Tab · Enter · / search</span><span>${extra || "1440 × 1020 concept"}</span></footer>`;
}

function chrome(opts) {
  const chrome = document.documentElement.getAttribute("data-chrome");
  const { active, job, total, step, toolbar, body, extraStatus } = opts;
  const nav = chrome === "rail" ? rail(active) : modules(active);
  const stepRow = chrome === "horizon" ? stepper(step || "Measure") : "";
  return `<div class="desk">
    ${titlebar(job || "Interior Fit-out — Green", total || "QAR 100,826,297.13")}
    ${stepRow}
    ${nav}
    <main class="stage">
      <section class="workspace">
        <div class="toolbar">${/toolbar-row/.test(toolbar) ? toolbar : `<div class="toolbar-row">${toolbar}</div>`}</div>
        <div class="body">${body}</div>
      </section>
    </main>
    ${status(extraStatus)}
  </div>`;
}

function rows(data, keys, selected = 0) {
  return data.map((r, i) =>
    `<tr class="${i === selected ? "on" : ""}">${keys.map((k) => {
      const v = r[k];
      const cls = typeof v === "number" || (typeof v === "string" && /^\d|^QAR/.test(v)) ? "num" : "";
      return `<td class="${cls}">${v}</td>`;
    }).join("")}</tr>`
  ).join("");
}

function table(head, data, keys, selected) {
  return `<div class="scroll"><table class="grid">
    <thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows(data, keys, selected)}</tbody>
  </table></div>`;
}

const BOQ = [
  { code: "A-01", desc: "Demolition of existing partitions", unit: "m²", qty: "428.00", rate: "45.00", amt: "19,260.00" },
  { code: "A-12", desc: "Gypsum board partition 100mm", unit: "m²", qty: "1,240.00", rate: "92.50", amt: "114,700.00" },
  { code: "B-04", desc: "Ceramic floor tile 600×600", unit: "m²", qty: "860.00", rate: "118.00", amt: "101,480.00" },
  { code: "C-09", desc: "Emulsion paint 2 coats", unit: "m²", qty: "3,180.00", rate: "12.40", amt: "39,432.00" },
  { code: "E-02", desc: "LED downlight 12W", unit: "Nr", qty: "640", rate: "85.00", amt: "54,400.00" },
  { code: "M-11", desc: "Split AC 2.5 TR", unit: "Nr", qty: "48", rate: "2,450.00", amt: "117,600.00" },
];

const RESOURCES = [
  { code: "CEM-42.5", desc: "Ordinary Portland Cement 42.5", unit: "t", qty: "186.4", rate: "280.00", amt: "52,192.00", src: "Awarded", enq: "PK-014", quotes: "265 – 292" },
  { code: "STEEL-10", desc: "Deformed bar 10mm", unit: "t", qty: "42.8", rate: "2,150.00", amt: "92,020.00", src: "Quote", enq: "PK-014", quotes: "2,080 – 2,240" },
  { code: "GYPS-12", desc: "Gypsum board 12.5mm", unit: "m²", qty: "2,480", rate: "18.40", amt: "45,632.00", src: "Analysis", enq: "—", quotes: "—" },
  { code: "TILE-60", desc: "Porcelain tile 600×600", unit: "m²", qty: "860", rate: "42.00", amt: "36,120.00", src: "Typed", enq: "PK-021", quotes: "38 – 46" },
  { code: "LAB-SK", desc: "Skilled labour", unit: "hr", qty: "12,400", rate: "28.00", amt: "347,200.00", src: "Analysis", enq: "—", quotes: "—" },
];

function art(id, title, inner) {
  return `<div class="art-wrap" id="art-${id}">
    <div class="art-label"><strong>${title}</strong><span>Concept screenshot · not the live build</span></div>
    <section class="artboard" data-screen="${id}">${inner}</section>
  </div>`;
}

function screens() {
  const job = "Interior Fit-out — Green";
  const total = "QAR 100,826,297.13";

  const signin = `<div class="auth">
    <div class="auth-card">
      <span class="mark">A</span>
      <h1>Aerolith Core</h1>
      <p>Sign in to continue. Keyboard first. PIN is never shown.</p>
      <label for="user">User</label>
      <input class="field focus" id="user" value="admin" />
      <label for="pin">PIN</label>
      <input class="field" id="pin" type="password" value="••••" />
      <button class="btn primary" type="button">Continue</button>
    </div>
  </div>`;

  const home = `<div class="jobs">
    <div class="panel">
      <h2>Jobs</h2>
      <div class="pad">
        <div class="job-card on">
          <strong>Interior Fit-out — Green</strong>
          <div class="crumb">Qatar · QAR · revised 12 Aug</div>
          <div class="gold" style="margin-top:8px">100,826,297.13</div>
        </div>
        <div class="job-card">
          <strong>Al Maha Campus — All BOQs</strong>
          <div class="crumb">Qatar · QAR · sealed r2</div>
          <div class="gold" style="margin-top:8px">58,052,244.82</div>
        </div>
        <div class="job-card">
          <strong>New estimate</strong>
          <div class="crumb">Blank job · pick currency</div>
        </div>
      </div>
    </div>
    <div class="panel">
      <h2>Last session</h2>
      <div class="pad">
        <p>HS · owner</p>
        <p class="crumb">Dashboard → Resource Prices · 18:42</p>
        <button class="btn primary" type="button" style="margin-top:16px">Open last job</button>
      </div>
    </div>
  </div>`;

  const dashBody = `<div class="kpis">
    <div class="kpi"><div class="lbl">Tender total</div><div class="val">100.83m</div></div>
    <div class="kpi"><div class="lbl">Cost</div><div class="val">86.41m</div></div>
    <div class="kpi"><div class="lbl">Margin</div><div class="val">14.3%</div></div>
    <div class="kpi"><div class="lbl">Coverage</div><div class="val">72%</div></div>
  </div>
  <div class="grid2">
    <div class="panel"><h2>By bill</h2>${table(["Bill","Amount","Share"], [
      { b: "A Preliminaries", a: "4,812,400", s: "4.8%" },
      { b: "B Building works", a: "61,204,110", s: "60.7%" },
      { b: "C MEP", a: "28,441,200", s: "28.2%" },
      { b: "D External", a: "6,368,587", s: "6.3%" },
    ], ["b","a","s"])}</div>
    <div class="panel"><h2>Next actions</h2>
      <div class="pad">
        <p>14 resources still on analysis</p>
        <p>3 client queries open</p>
        <p>Settle rates when Pack PK-014 awards land</p>
        <button class="btn primary" type="button" style="margin-top:12px">Go to Resource Prices</button>
      </div>
    </div>
  </div>`;

  const clientBoq = chrome({
    active: "source", job, total, step: "Measure",
    toolbar: `<h1>Client BOQ</h1><span class="chip on">Interior</span><span class="sp"></span><input class="field" value="Search codes…" /><button class="btn">Import</button>`,
    body: `<div class="grid-side">
      <div class="panel"><h2>Bills</h2>${table(["Bill","Items"], [
        { b: "A Preliminaries", n: "42" }, { b: "B Building works", n: "318" }, { b: "C MEP", n: "206" },
      ], ["b","n"], 1)}</div>
      <div class="panel"><h2>Imported lines</h2>${table(["Code","Description","Unit","Qty"], BOQ, ["code","desc","unit","qty"])}</div>
    </div>`,
  });

  const takeoff = chrome({
    active: "takeoff", job, total, step: "Measure",
    toolbar: `<h1>Take-off</h1><span class="chip">Plan L02</span><span class="sp"></span><button class="btn">Calibrate</button><button class="btn primary">New run</button>`,
    body: `<div class="grid-split">
      <div class="panel"><h2>Drawing</h2><div class="draw"><div class="plan"></div><div class="room" style="left:80px;top:70px;width:220px;height:140px"></div></div></div>
      <div class="panel"><h2>Quantities</h2>${table(["Ref","Item","Qty","Unit"], [
        { r: "R-12", i: "Partition 100mm", q: "86.4", u: "m²" },
        { r: "R-13", i: "Floor tile", q: "42.0", u: "m²" },
        { r: "R-14", i: "Paint walls", q: "164.2", u: "m²" },
      ], ["r","i","q","u"])}</div>
    </div>`,
  });

  const working = chrome({
    active: "estimate", job, total, step: "Analyse",
    toolbar: `<h1>Working BOQ</h1><span class="chip on">All BOQs</span><span class="sp"></span><button class="btn">Insert</button><button class="btn primary">Analyse line</button>`,
    body: `<div class="panel" style="height:100%">${table(["Code","Description","Unit","Qty","Rate","Amount"], BOQ, ["code","desc","unit","qty","rate","amt"], 1)}</div>`,
  });

  const analysis = chrome({
    active: "analysis", job, total, step: "Analyse",
    toolbar: `<h1>Rate Analysis</h1><span class="crumb">A-12 · Gypsum board partition 100mm</span><span class="sp"></span><span class="chip ok">92.50 / m²</span>`,
    body: `<div class="grid-split">
      <div class="panel"><h2>Build-up</h2>${table(["Res","Desc","Unit","Coeff","Rate","Amt"], [
        { c: "GYPS-12", d: "Board 12.5mm", u: "m²", k: "2.10", r: "18.40", a: "38.64" },
        { c: "LAB-SK", d: "Skilled labour", u: "hr", k: "0.85", r: "28.00", a: "23.80" },
        { c: "TRK", d: "Track & studs", u: "m", k: "3.40", r: "6.20", a: "21.08" },
      ], ["c","d","u","k","r","a"])}</div>
      <div class="panel"><h2>Result</h2>
        <div class="pad">
          <div class="kpi"><div class="lbl">Net</div><div class="val">83.52</div></div>
          <div class="kpi" style="margin-top:8px"><div class="lbl">With OH</div><div class="val">92.50</div></div>
          <p class="crumb" style="margin-top:16px">Linked to Resource Prices · GYPS-12 still on analysis</p>
        </div>
      </div>
    </div>`,
  });

  const pricesToolbar = (room) =>
    `<div class="toolbar-row">
       <span class="crumb">Summary / <b>${room}</b></span>
       <button class="btn ${room === "Summary" ? "primary" : ""}">Summary</button>
       <button class="btn ${room === "Pack" ? "primary" : ""}">Pack</button>
       <button class="btn ${room === "Send" ? "primary" : ""}">Send</button>
       <button class="btn ${room === "Receive" ? "primary" : ""}">Receive</button>
       <button class="btn ${room === "Award" ? "primary" : ""}">Award</button>
     </div>
     <div class="toolbar-row">
       <span class="chip">quoted 18</span><span class="chip">awarded 9</span><span class="chip on">still on analysis 14</span>
       <span class="sp"></span>
     </div>`;

  const pricesSummary = chrome({
    active: "buy", job, total, step: "Price",
    toolbar: `<div class="toolbar-row"><h1>Resource Prices</h1></div>${pricesToolbar("Summary")}<div class="toolbar-row"><span class="sp"></span><button class="btn">New pack</button><button class="btn primary">Settle rates</button></div>`,
    body: `<div class="panel" style="height:100%">${table(
      ["Code","Description","Unit","Qty","Applied rate","Amount","Source","Enquiry","Quotes"],
      RESOURCES, ["code","desc","unit","qty","rate","amt","src","enq","quotes"]
    )}</div>`,
  });

  const pack = chrome({
    active: "buy", job, total, step: "Price",
    toolbar: `${pricesToolbar("Pack")}<div class="toolbar-row"><span class="sp"></span><button class="btn primary">Add to pack</button></div>`,
    body: `<div class="grid-side">
      <div class="panel"><h2>Packs</h2>${table(["Pack","Items","State"], [
        { p: "PK-014 Cement & steel", n: "12", s: "Open" },
        { p: "PK-021 Tiles", n: "6", s: "Sent" },
      ], ["p","n","s"])}</div>
      <div class="panel"><h2>Lines in PK-014</h2>${table(["Code","Description","Qty"], RESOURCES.slice(0,3), ["code","desc","qty"])}</div>
    </div>`,
  });

  const send = chrome({
    active: "buy", job, total, step: "Price",
    toolbar: `${pricesToolbar("Send")}<div class="toolbar-row"><span class="sp"></span><button class="btn primary">Mark sent</button></div>`,
    body: `<div class="panel" style="height:100%">
      <h2>Issue PK-014</h2>
      <div class="pad">
        <label class="crumb">To</label>
        <input class="field" style="width:100%;margin:8px 0 16px" value="Al Jazeera Trading · procurement@…" />
        <p>12 lines · due 18 Sep · RFQ PDF attached</p>
        <button class="btn primary" type="button" style="margin-top:12px">Send pack</button>
      </div>
    </div>`,
  });

  const receive = chrome({
    active: "buy", job, total, step: "Price",
    toolbar: `${pricesToolbar("Receive")}<div class="toolbar-row"><span class="sp"></span><button class="btn primary">Log quote</button></div>`,
    body: `<div class="panel" style="height:100%">${table(["Vendor","Resource","Rate","Valid"], [
      { v: "Al Jazeera", r: "CEM-42.5", n: "275.00", d: "30d" },
      { v: "Gulf Steel", r: "STEEL-10", n: "2,080.00", d: "14d" },
      { v: "Qatar Cement", r: "CEM-42.5", n: "292.00", d: "21d" },
    ], ["v","r","n","d"])}</div>`,
  });

  const award = chrome({
    active: "buy", job, total, step: "Price",
    toolbar: `${pricesToolbar("Award")}<div class="toolbar-row"><span class="sp"></span><button class="btn primary">Award selected</button></div>`,
    body: `<div class="panel" style="height:100%">${table(["Resource","Low","High","Pick","Vendor"], [
      { r: "CEM-42.5", lo: "265.00", hi: "292.00", pk: "275.00", v: "Al Jazeera" },
      { r: "STEEL-10", lo: "2,080.00", hi: "2,240.00", pk: "2,150.00", v: "Gulf Steel" },
    ], ["r","lo","hi","pk","v"])}</div>`,
  });

  const settle = chrome({
    active: "buy", job, total, step: "Seal",
    toolbar: `<h1>Settle rates</h1><span class="crumb">From Summary · apply awards to the book</span><span class="sp"></span><button class="btn">Keep analysis</button><button class="btn warn">Apply awards</button>`,
    body: `<div class="sheet" style="position:relative;right:auto;top:auto;bottom:auto;width:100%;height:100%">
      <h2 style="padding:12px 16px;margin:0;border-bottom:1px solid var(--line)">Checklist · 9 to apply · 14 remain on analysis</h2>
      ${table(["Code","Current","Awarded","Action"], [
        { c: "CEM-42.5", cur: "280.00 Analysis", aw: "275.00", a: "Replace" },
        { c: "STEEL-10", cur: "2,200.00 Quote", aw: "2,150.00", a: "Replace" },
        { c: "GYPS-12", cur: "18.40 Analysis", aw: "—", a: "Keep" },
      ], ["c","cur","aw","a"])}
    </div>`,
  });

  const margins = chrome({
    active: "margins", job, total, step: "Seal",
    toolbar: `<h1>Margins</h1><span class="sp"></span><button class="btn">Reset</button><button class="btn primary">Apply</button>`,
    body: `<div class="kpis">
      <div class="kpi"><div class="lbl">OH</div><div class="val">8.0%</div></div>
      <div class="kpi"><div class="lbl">Profit</div><div class="val">6.0%</div></div>
      <div class="kpi"><div class="lbl">Risk</div><div class="val">1.5%</div></div>
      <div class="kpi"><div class="lbl">Net margin</div><div class="val">14.3%</div></div>
    </div>
    <div class="panel" style="flex:1;min-height:0">${table(["Bill","Cost","OH","Profit","Sell"], [
      { b: "B Building works", c: "52.40m", o: "4.19m", p: "3.14m", s: "61.20m" },
      { b: "C MEP", c: "24.60m", o: "1.97m", p: "1.48m", s: "28.44m" },
    ], ["b","c","o","p","s"])}</div>`,
  });

  const queries = chrome({
    active: "queries", job, total, step: "Measure",
    toolbar: `<h1>Client Queries</h1><span class="chip on">Open 3</span><span class="sp"></span><button class="btn primary">New query</button>`,
    body: `<div class="panel" style="height:100%">${table(["No","Item","Question","State"], [
      { n: "CQ-04", i: "B-04", q: "Confirm tile finish at wet areas", s: "Open" },
      { n: "CQ-05", i: "E-02", q: "Driver type for downlights", s: "Sent" },
      { n: "CQ-06", i: "M-11", q: "Make of split units", s: "Open" },
    ], ["n","i","q","s"])}</div>`,
  });

  const submit = chrome({
    active: "submit", job, total, step: "Seal",
    toolbar: `<h1>Submission BOQ</h1><span class="chip">Unsealed</span><span class="sp"></span><button class="btn">Export</button><button class="btn primary">Seal revision</button>`,
    body: `<div class="panel" style="height:100%">${table(["Code","Description","Qty","Rate","Amount"], BOQ, ["code","desc","qty","rate","amt"])}</div>`,
  });

  const masters = chrome({
    active: "masters", job, total, step: "Analyse",
    toolbar: `<h1>Masters</h1><span class="chip on">Resources</span><span class="chip">Assemblies</span><span class="sp"></span><button class="btn primary">New resource</button>`,
    body: `<div class="panel" style="height:100%">${table(["Code","Description","Unit","Rate"], RESOURCES, ["code","desc","unit","rate"])}</div>`,
  });

  const settings = chrome({
    active: "settings", job, total, step: "Seal",
    toolbar: `<h1>Settings</h1>`,
    body: `<div class="grid2">
      <div class="panel"><h2>Access</h2>
        <div class="pad">
          <p>Roles · Estimator can view Resource Prices, cannot Settle</p>
          <p>Keyboard shortcuts on</p>
          <p>Reduce motion: off</p>
        </div>
      </div>
      <div class="panel"><h2>Firm</h2>
        <div class="pad">
          <p>Currency QAR · decimals 2</p>
          <p>Catalog v4</p>
        </div>
      </div>
    </div>`,
  });

  const homeFull = `<div class="workspace" style="height:100%">
      <div class="toolbar"><div class="toolbar-row"><span class="mark">A</span><h1>Aerolith Core</h1><span class="sp"></span><span class="who">HS · owner</span><button class="btn ghost" type="button">Sign out</button></div></div>
      <div class="body">${home}</div>
    </div>`;

  const dash = chrome({
    active: "dashboard", job, total, step: "Measure",
    toolbar: `<h1>Dashboard</h1><span class="chip on">Interior</span><span class="sp"></span><span class="crumb">GREEN total locked</span>`,
    body: dashBody,
  });

  return [
    art("signin", "01 · Sign-in", signin),
    art("home", "02 · Home / jobs", homeFull),
    art("dashboard", "03 · Dashboard", dash),
    art("client-boq", "04 · Client BOQ", clientBoq),
    art("takeoff", "05 · Take-off", takeoff),
    art("working-boq", "06 · Working BOQ", working),
    art("rate-analysis", "07 · Rate Analysis", analysis),
    art("prices-summary", "08 · Resource Prices · Summary", pricesSummary),
    art("prices-pack", "09 · Resource Prices · Pack", pack),
    art("prices-send", "10 · Resource Prices · Send", send),
    art("prices-receive", "11 · Resource Prices · Receive", receive),
    art("prices-award", "12 · Resource Prices · Award", award),
    art("prices-settle", "13 · Resource Prices · Settle", settle),
    art("margins", "14 · Margins", margins),
    art("queries", "15 · Client Queries", queries),
    art("submit", "16 · Submission BOQ", submit),
    art("masters", "17 · Masters", masters),
    art("settings", "18 · Settings", settings),
  ].join("");
}

document.getElementById("screens").innerHTML = screens();
