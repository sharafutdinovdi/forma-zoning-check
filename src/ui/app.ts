import type { AppState } from "../fixture";
import type { SiteData } from "../metrics";
import type { ParcelControls } from "../rules";
import { sourceLink } from "./controls";
export function createApp(root: HTMLElement, fixture: boolean, debug = false): void {
  root.innerHTML = `<section id="mini" aria-label="Zoning Check mini panel"></section><div id="full"><header><div><p class="eyebrow">FORMA · MASSING TOOLS</p><h1>Zoning <em>Check</em></h1></div><button id="refresh" class="primary" type="button">Refresh</button><div class="proposal-line"><span id="proposal-name">Current proposal</span><span id="jurisdiction" class="pill">Dubai</span></div></header>
    ${fixture ? '<aside class="fixture-bar"><span>Synthetic preview</span><label>State <select id="fixture-state" aria-label="Fixture state"><option>ready</option><option>loading</option><option>no-site-limit</option><option>no-buildings-on-plot</option><option>error</option></select></label></aside>' : ""}
    <div id="state-message" role="status" aria-live="polite"></div>
    <p id="notice" class="notice" role="status" hidden></p>
    <button id="open-full" class="compact-only primary" type="button">Open full panel</button>
    <section id="controls" class="controls surface full-only" aria-label="Parcel controls"></section>
    <section id="results" class="results" aria-label="Check results"></section>
    <footer><div id="source"></div><p>Estimated massing check — not a compliance statement</p><button id="export" type="button" disabled>Export CSV</button></footer></div>`;
  {
    const button = document.createElement("button");
    button.id = "debug-download"; button.type = "button";
    button.textContent = "Download debug JSON"; button.disabled = true; button.hidden = !debug;
    button.title = "Waiting for real Forma element data";
    root.querySelector("header .proposal-line")!.before(button);
  }
}
export function renderState(state: AppState, data: SiteData | null, c: ParcelControls, message = ""): void {
  const main = document.querySelector("main")!;
  main.dataset.state = state;
  document.querySelector("#proposal-name")!.textContent = data?.proposalName ?? "Current proposal";
  document.querySelector("#jurisdiction")!.textContent = c.jurisdiction === "dubai" ? "Dubai" : "Riyadh";
  document.querySelector("#source")!.innerHTML = sourceLink(c);
  (document.querySelector("#refresh") as HTMLButtonElement).disabled = state === "loading";
  (document.querySelector("#export") as HTMLButtonElement).disabled = state !== "ready";
  const results = document.querySelector<HTMLElement>("#results")!;
  results.setAttribute("aria-busy", String(state === "loading"));
  const messages: Record<AppState, [string, string]> = {
    ready: ["", ""], loading: ["Measuring the proposal…", "Reading the site limit, footprints and building geometry."],
    "no-site-limit": ["Draw a site limit to start", "In Forma, draw a closed site limit around your parcel. Results appear automatically."],
    "no-buildings-on-plot": ["Add a building inside the site limit", message || "Create or move a building onto this plot, results update automatically."],
    error: ["Could not check this proposal", message || "Check the active proposal and connection, then press Refresh."],
  };
  const stateBox = document.querySelector<HTMLElement>("#state-message")!;
  stateBox.replaceChildren();
  if (state !== "ready") {
    const title = document.createElement("h2"), text = document.createElement("p");
    title.textContent = messages[state][0]; text.textContent = messages[state][1];
    const content = document.createElement("div"); content.className = "state-content";
    content.append(title, text);
    if (state === "no-buildings-on-plot" && message && !c.includeExisting) {
      const button = document.createElement("button");
      button.id = "include-existing"; button.type = "button";
      button.textContent = "Include existing";
      button.style.cssText = "border:0;border-radius:0;background:transparent;min-height:0;padding:0;font-size:12px;color:var(--primary);text-decoration:underline";
      text.append(" ", button);
    }
    stateBox.append(content);
  }
  stateBox.hidden = state === "ready";
  const select = document.querySelector<HTMLSelectElement>("#fixture-state");
  if (select) select.value = state;
}
export function showNotice(message: string): void {
  const notice = document.querySelector<HTMLElement>("#notice")!;
  notice.textContent = message; notice.hidden = !message;
}
