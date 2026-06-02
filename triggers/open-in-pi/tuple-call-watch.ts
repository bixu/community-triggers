// Tuple call watcher — shipped with the "Open in Pi" trigger.
//
// Loaded automatically from `.pi/extensions/` in the transcription directory, so
// it is active the moment Pi starts — no /reload, no self-authoring required.
//
// What it does:
//   - tails `transcriptions.jsonl` and `events.jsonl` (plus sibling directories
//     for the same call) from saved byte offsets,
//   - surfaces new lines live in the TUI via `ctx.ui.notify` while Pi is idle,
//   - re-injects everything Pi has not yet seen on `before_agent_start`, so the
//     full transcript is already in context the moment Pi takes a turn — even a
//     turn where the user is just chatting.
//
// The trigger writes `tuple-call-watch.config.json` next to this file with the
// artifacts directory and call id. Absent that, the extension watches the
// current working directory.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import fs from "node:fs";
import path from "node:path";

type SpeakerMap = Record<string, string>;

const POLL_MS = 1500;
const SKIP_EVENT_CATEGORIES = new Set(["user_audio_started", "user_audio_stopped"]);

function readConfig(cwd: string): { artifactsDir: string; callId: string } {
  const candidates = [
    path.join(cwd, ".pi", "extensions", "tuple-call-watch.config.json"),
    path.join(cwd, ".tuple-call-watch.json"),
  ];
  for (const file of candidates) {
    try {
      const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
      if (cfg && typeof cfg.artifactsDir === "string") {
        return { artifactsDir: cfg.artifactsDir, callId: String(cfg.callId ?? "") };
      }
    } catch {
      // try the next candidate
    }
  }
  return { artifactsDir: cwd, callId: "" };
}

// The artifacts directory plus any sibling directories whose names end with the
// call id (Tuple sometimes splits one call across per-participant directories).
function watchDirs(artifactsDir: string, callId: string): string[] {
  const dirs = new Set<string>([artifactsDir]);
  if (callId) {
    try {
      const parent = path.dirname(artifactsDir);
      for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.endsWith(callId)) {
          dirs.add(path.join(parent, entry.name));
        }
      }
    } catch {
      // parent unreadable — just watch the primary directory
    }
  }
  return [...dirs];
}

function hms(value: unknown): string {
  // events carry ISO `time`; transcripts carry numeric `start` seconds.
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString().slice(11, 19);
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(11, 19);
  }
  return "--:--:--";
}

function isWake(text: string): boolean {
  if (/\b(value of pi|slice of pie|pi day|pie chart)\b/i.test(text)) return false;
  return /(^|\b)(hey\s+pi\b|pi\s*[,:]|pi\s+(can|could|would|are|did|do|please|what|why|how))/i.test(text);
}

export default function (pi: ExtensionAPI) {
  const cwd = process.cwd();
  const { artifactsDir, callId } = readConfig(cwd);
  const speakers: SpeakerMap = {};
  const offsets: Record<string, number> = {};
  const pending: string[] = [];
  let alerts = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  function resolveSpeaker(userId: unknown): string {
    const id = typeof userId === "string" ? userId : "";
    return speakers[id] || id || "unknown";
  }

  function ingestEvent(rec: any): string | null {
    const category = String(rec.category ?? "");
    if (rec.user && (category === "user_joined" || category === "participant_joined")) {
      const name = typeof rec.message === "string" ? rec.message.replace(/\s+(joined|connected).*$/i, "").trim() : "";
      if (name) speakers[String(rec.user)] = name;
    }
    if (SKIP_EVENT_CATEGORIES.has(category)) return null;
    if (category === "recording_stopped" || category === "call_ended") alerts++;
    return `- ${hms(rec.time)} event: ${category}${rec.message ? ` (${rec.message})` : ""}`;
  }

  function ingestTranscript(rec: any): string {
    const text = String(rec.text ?? "");
    if (isWake(text)) alerts++;
    return `- ${hms(rec.start)} ${resolveSpeaker(rec.user_id)}: ${text}`;
  }

  function scanFile(file: string) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      return; // file not created yet
    }
    const from = offsets[file] ?? 0;
    if (stat.size <= from) {
      offsets[file] = stat.size; // handle truncation/rotation
      return;
    }
    let chunk = "";
    try {
      const fd = fs.openSync(file, "r");
      const buf = Buffer.alloc(stat.size - from);
      fs.readSync(fd, buf, 0, buf.length, from);
      fs.closeSync(fd);
      chunk = buf.toString("utf8");
    } catch {
      return;
    }
    offsets[file] = stat.size;
    const isEvents = file.endsWith("events.jsonl");
    for (const line of chunk.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const rec = JSON.parse(trimmed);
        const formatted = isEvents ? ingestEvent(rec) : ingestTranscript(rec);
        if (formatted) pending.push(formatted);
      } catch {
        // partial final line — its bytes are excluded from the offset next pass
      }
    }
  }

  function scan() {
    for (const dir of watchDirs(artifactsDir, callId)) {
      scanFile(path.join(dir, "events.jsonl"));
      scanFile(path.join(dir, "transcriptions.jsonl"));
    }
  }

  function poll(ctx: any) {
    const before = pending.length;
    const beforeAlerts = alerts;
    scan();
    if (!ctx?.hasUI) return;
    const fresh = pending.slice(before);
    if (fresh.length) ctx.ui.notify(fresh.join("\n"), alerts > beforeAlerts ? "warn" : "info");
  }

  pi.on("session_start", async (_event: any, ctx: any) => {
    try {
      scan(); // catch up on everything written before Pi started
      if (ctx?.hasUI) {
        ctx.ui.notify(
          `Tuple call watcher active — monitoring ${path.basename(artifactsDir)}${callId ? ` (call ${callId})` : ""}.`,
          "info",
        );
      }
      timer = setInterval(() => poll(ctx), POLL_MS);
      timer.unref?.(); // never keep the process alive on the watcher's account
    } catch {
      // a watcher hiccup must never take down the session
    }
  });

  // Hand Pi everything it has not yet seen at the start of each turn, so a reply
  // — including a turn where the user is just chatting — is always fully caught up.
  // This message is context only: how to react lives in the sidekick prompt, so
  // nothing here ever tells Pi to stay silent.
  pi.on("before_agent_start", async () => {
    scan();
    if (!pending.length) return undefined;
    const batch = pending.splice(0, pending.length).join("\n");
    const flagged = alerts > 0;
    alerts = 0;
    return {
      message: {
        customType: "tuple-call-watch",
        content:
          `New Tuple call activity the user has already seen live (use as context for your reply):\n\n${batch}` +
          (flagged
            ? "\n\nThis batch includes a wake word or a recording_stopped/call_ended event."
            : ""),
        display: false,
      },
    };
  });

  pi.on("session_shutdown", async () => {
    if (timer) clearInterval(timer);
  });
}
