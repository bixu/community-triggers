// Tuple call watcher — shipped with the "Open in Pi" trigger.
//
// Loaded automatically from `.pi/extensions/` in the transcription directory, so
// it is active the moment Pi starts — no /reload, no self-authoring required.
//
// Unlike a passive transcript viewer, this makes Pi an active listener. It tails
// the live transcript and, whenever the talkers pause, feeds the new lines to Pi
// as a message that *triggers a turn* (`pi.sendMessage(..., { triggerTurn: true })`).
// Pi consumes each batch and — per its prompt — stays silent unless something is
// worth interjecting. Turns are only triggered while Pi is idle, so the user's own
// messages always take priority: Pi answers you, then resumes consuming the call.
//
// The trigger writes `tuple-call-watch.config.json` next to this file with the
// artifacts directory and call id. Absent that, the extension watches the current
// working directory.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import fs from "node:fs";
import path from "node:path";

type SpeakerMap = Record<string, string>;

const POLL_MS = 1500; // how often to check the files for new lines
const QUIET_MS = 3500; // a pause this long flushes the buffered batch to Pi
const MAX_WAIT_MS = 20000; // force a flush during long continuous talking
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

  const backlog: string[] = []; // lines from before Pi started — context only
  let backlogDelivered = false;

  const buffer: string[] = []; // new lines since startup, awaiting a flush to Pi
  let firstBufferedAt = 0;
  let lastArrivalAt = 0;
  let bufferFlagged = false; // batch contains a wake word or stop/end event

  let timer: ReturnType<typeof setInterval> | undefined;

  function resolveSpeaker(userId: unknown): string {
    const id = typeof userId === "string" ? userId : "";
    return speakers[id] || id || "unknown";
  }

  function format(file: string, rec: any): { line: string; flag: boolean } | null {
    if (file.endsWith("events.jsonl")) {
      const category = String(rec.category ?? "");
      if (rec.user && (category === "user_joined" || category === "participant_joined")) {
        const name = typeof rec.message === "string" ? rec.message.replace(/\s+(joined|connected).*$/i, "").trim() : "";
        if (name) speakers[String(rec.user)] = name;
      }
      if (SKIP_EVENT_CATEGORIES.has(category)) return null;
      const flag = category === "recording_stopped" || category === "call_ended";
      return { line: `- ${hms(rec.time)} event: ${category}${rec.message ? ` (${rec.message})` : ""}`, flag };
    }
    const text = String(rec.text ?? "");
    return { line: `- ${hms(rec.start)} ${resolveSpeaker(rec.user_id)}: ${text}`, flag: isWake(text) };
  }

  function scanFile(file: string, sink: string[]): boolean {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      return false; // not created yet
    }
    const from = offsets[file] ?? 0;
    if (stat.size <= from) {
      offsets[file] = stat.size; // handle truncation/rotation
      return false;
    }
    let chunk = "";
    try {
      const fd = fs.openSync(file, "r");
      const buf = Buffer.alloc(stat.size - from);
      fs.readSync(fd, buf, 0, buf.length, from);
      fs.closeSync(fd);
      chunk = buf.toString("utf8");
    } catch {
      return false;
    }
    // Only advance the offset past whole lines, so a half-written final line is
    // re-read in full next pass.
    const lastNl = chunk.lastIndexOf("\n");
    if (lastNl === -1) return false;
    offsets[file] = from + Buffer.byteLength(chunk.slice(0, lastNl + 1), "utf8");
    let added = false;
    for (const line of chunk.slice(0, lastNl).split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const formatted = format(file, JSON.parse(trimmed));
        if (formatted) {
          sink.push(formatted.line);
          if (formatted.flag) bufferFlagged = true;
          added = true;
        }
      } catch {
        // skip an unparseable line
      }
    }
    return added;
  }

  function scan(sink: string[]): boolean {
    let added = false;
    for (const dir of watchDirs(artifactsDir, callId)) {
      // events first so a speaker join is mapped before the transcript line lands
      if (scanFile(path.join(dir, "events.jsonl"), sink)) added = true;
      if (scanFile(path.join(dir, "transcriptions.jsonl"), sink)) added = true;
    }
    return added;
  }

  function maybeFlush(ctx: any) {
    if (!buffer.length) return;
    // Only ever trigger a turn when Pi is free, so the user's own messages and
    // any in-progress reply always take priority over consuming the call.
    if (typeof ctx?.isIdle === "function" && !ctx.isIdle()) return;
    if (typeof ctx?.hasPendingMessages === "function" && ctx.hasPendingMessages()) return;
    const now = Date.now();
    const paused = now - lastArrivalAt >= QUIET_MS;
    const overdue = firstBufferedAt > 0 && now - firstBufferedAt >= MAX_WAIT_MS;
    if (!paused && !overdue) return; // still mid-thought — keep buffering

    const batch = buffer.splice(0, buffer.length).join("\n");
    const flagged = bufferFlagged;
    firstBufferedAt = 0;
    bufferFlagged = false;
    pi.sendMessage(
      {
        customType: "tuple-call-watch",
        content:
          `New on the call:\n\n${batch}\n\n` +
          (flagged
            ? "This includes a line addressed to you or a recording_stopped/call_ended event — act per your instructions."
            : "Interject only if something here is worth it; otherwise reply with no text."),
        display: false,
      },
      { triggerTurn: true },
    );
  }

  pi.on("session_start", async (_event: any, ctx: any) => {
    try {
      scan(backlog); // capture the call so far as context; offsets advance to end
      bufferFlagged = false; // backlog flags are not live alerts
      if (ctx?.hasUI) {
        ctx.ui.notify(
          `Listening to the call${callId ? ` (${callId})` : ""} — I'll chime in when it matters.`,
          "info",
        );
      }
      timer = setInterval(() => {
        try {
          if (scan(buffer)) {
            const now = Date.now();
            if (!firstBufferedAt) firstBufferedAt = now;
            lastArrivalAt = now;
          }
          maybeFlush(ctx);
        } catch {
          // a single bad tick must not kill the watcher
        }
      }, POLL_MS);
      timer.unref?.();
    } catch {
      // a watcher hiccup must never take down the session
    }
  });

  // Deliver the pre-start backlog once, as grounding context for Pi's first turn.
  pi.on("before_agent_start", async () => {
    if (backlogDelivered || !backlog.length) return undefined;
    backlogDelivered = true;
    const history = backlog.splice(0, backlog.length).join("\n");
    return {
      message: {
        customType: "tuple-call-watch",
        content: `The call so far, for context — do not comment on it retroactively:\n\n${history}`,
        display: false,
      },
    };
  });

  pi.on("session_shutdown", async () => {
    if (timer) clearInterval(timer);
  });
}
