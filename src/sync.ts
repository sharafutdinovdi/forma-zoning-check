import type { AppState } from "./fixture";
import type { Report, SiteData } from "./metrics";
import type { ParcelControls } from "./rules";

export interface SyncMessage {
  proposalId: string;
  computedAt: number;
  results: { state: AppState; data: SiteData; report: Report | null; message: string };
  controls: ParcelControls;
}
export function isSyncMessage(value: unknown): value is SyncMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as SyncMessage;
  return typeof m.proposalId === "string" && Number.isFinite(m.computedAt) && m.computedAt > 0 &&
    !!m.results && ["ready", "no-site-limit", "no-buildings-on-plot", "error"].includes(m.results.state) &&
    m.results.data?.proposalId === m.proposalId && Array.isArray(m.results.data.buildings) &&
    typeof m.results.message === "string" && (m.results.state !== "ready" || !!m.results.report && Array.isArray(m.results.report.checks) && Array.isArray(m.results.report.buildings)) &&
    !!m.controls && ["dubai", "riyadh"].includes(m.controls.jurisdiction) && typeof m.controls.presetId === "string" && Array.isArray(m.controls.roadEdges);
}
// No durable geometry cache: a newly opened view asks an existing peer for its snapshot.
export function createSync(receive: (message: SyncMessage) => void) {
  let channel: BroadcastChannel | undefined;
  let latest: SyncMessage | undefined;
  try { channel = new BroadcastChannel("zoning-check"); } catch { /* storage event fallback */ }
  const send = (message: unknown) => {
    if (channel) { channel.postMessage(message); return; }
    try { localStorage.setItem("zoning-check:sync", JSON.stringify(message)); localStorage.removeItem("zoning-check:sync"); }
    catch { /* Each view remains usable when storage is blocked. */ }
  };
  const accept = (value: unknown) => {
    if (isSyncMessage(value)) { receive(value); return; }
    const request = value as { type?: string; proposalId?: string; rootUrn?: string } | null;
    if (request?.type === "request" && latest && latest.proposalId === request.proposalId && latest.results.data.rootUrn === request.rootUrn) send(latest);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== "zoning-check:sync" || !event.newValue) return;
    try { accept(JSON.parse(event.newValue)); } catch { /* Ignore malformed storage. */ }
  };
  if (channel) channel.onmessage = event => accept(event.data);
  else window.addEventListener("storage", onStorage);
  return {
    remember(message: SyncMessage) { latest = message; },
    publish(message: SyncMessage) { latest = message; send(message); },
    request(proposalId: string, rootUrn?: string) { send({ type: "request", proposalId, rootUrn, nonce: Date.now() }); },
    close() { channel?.close(); window.removeEventListener("storage", onStorage); },
  };
}

// Used with the declared proposal subscription; polling is only a compatibility fallback.
export async function autoRefresh(options: {
  subscribe: (changed: (rootUrn: string) => void) => Promise<{ unsubscribe: () => void }>;
  fingerprint: () => Promise<string>;
  changed: (rootUrn?: string) => void;
}): Promise<() => void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  let stopped = false, busy = false, dirty = false;
  let last = "", root: string | undefined;
  const schedule = (nextRoot?: string) => {
    root = nextRoot; dirty = true; clearTimeout(timer);
    if (!document.hidden) timer = setTimeout(() => { timer = undefined; dirty = false; options.changed(root); }, 600);
  };
  const poll = async () => {
    if (document.hidden || busy || stopped) return;
    busy = true;
    try {
      const fingerprint = await options.fingerprint();
      if (stopped) return;
      if (last && last !== fingerprint) schedule();
      last = fingerprint;
    } catch (error) { console.warn("Zoning Check: change polling unavailable", error); }
    finally { busy = false; }
  };
  const visible = () => {
    if (document.hidden) { if (timer) { clearTimeout(timer); dirty = true; } }
    else if (dirty) schedule(root);
    else if (interval) void poll();
  };
  let unsubscribe = () => {};
  try { ({ unsubscribe } = await options.subscribe(schedule)); }
  catch (error) {
    console.warn("Zoning Check: subscription unavailable; polling paths every 4 seconds", error);
    await poll(); interval = setInterval(() => void poll(), 4000);
  }
  document.addEventListener("visibilitychange", visible);
  return () => { stopped = true; clearTimeout(timer); clearInterval(interval); unsubscribe(); document.removeEventListener("visibilitychange", visible); };
}
