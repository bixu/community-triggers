// Tuple call watcher — shipped with the "Open in Pi" trigger.
//
// Loaded automatically from `.pi/extensions/` in the transcription directory, so
// it is active the moment Pi starts — no /reload, no self-authoring required.
//
// Unlike a passive transcript viewer, this makes Pi an active listener. It tails
// the live transcript and, whenever the talkers pause, feeds the new lines to Pi
// as a message that *triggers a turn* (`pi.sendMessage(..., { triggerTurn: true })`).
// Pi consumes each batch and — per its prompt — leaves a one-line summary of
// what they just covered, escalating to a real interjection only when it matters.
// Turns are only triggered while Pi is idle and no earlier triggered turn is
// still pending, so the user's own messages always take priority: Pi answers
// you, then resumes consuming the call.
//
// The trigger writes `tuple-call-watch.config.json` next to this file with the
// artifacts directory and call id. Absent that, the extension watches the current
// working directory.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import fs from "node:fs";
import path from "node:path";

type SpeakerMap = Record<string, string>;
type ScanResult = { added: boolean; urgent: boolean };

const POLL_MS = 1500; // how often to check the files for new lines
const QUIET_MS = 3500; // a pause this long flushes the buffered batch to Pi
const MAX_WAIT_MS = 20000; // force a flush during long continuous talking
const STUCK_MS = 15000; // clear a stuck pending-turn guard if no turn ever ran
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

function userIdKey(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" || typeof id === "number") return String(id);
  }
  return "";
}

function displayName(user: unknown): string {
  if (!user || typeof user !== "object") return "";
  const u = user as { full_name?: unknown; short_name?: unknown; email?: unknown };
  for (const field of [u.full_name, u.short_name, u.email]) {
    if (typeof field === "string" && field.trim()) return field.trim();
  }
  return "";
}

function parseUserNameFromMessage(message: unknown): string {
  if (typeof message !== "string") return "";
  const fullName = message.match(/full_name=([^,)]+)/)?.[1]?.trim();
  if (fullName) return fullName;
  if (/\buser\(id=/.test(message)) return "";
  const joinedName = message.replace(/\s+(joined|connected).*$/i, "").trim();
  return joinedName && joinedName !== message.trim() ? joinedName : "";
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
  let bufferUrgent = false; // batch contains a wake word or stop/end event

  let turnPending = false; // a turn we triggered is queued or running
  let turnPendingSince = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  function resolveSpeaker(userId: unknown): string {
    const id = userIdKey(userId);
    return speakers[id] || id || "unknown";
  }

  // Returns the formatted dot-line and whether it demands Pi's attention.
  // Learning speaker names from user-bearing events is a side effect; `scan`
  // processes every directory's events before transcripts so names resolve correctly.
  function format(file: string, rec: any): { line: string; urgent: boolean } | null {
    if (file.endsWith("events.jsonl")) {
      const category = String(rec.category ?? "");
      if (rec.user) {
        const id = userIdKey(rec.user);
        const name = displayName(rec.user) || parseUserNameFromMessage(rec.message);
        if (id && name) speakers[id] = name;
      }
      if (SKIP_EVENT_CATEGORIES.has(category)) return null;
      const urgent = category === "recording_stopped" || category === "call_ended";
      return { line: `- ${hms(rec.time)} event: ${category}${rec.message ? ` (${rec.message})` : ""}`, urgent };
    }
    const text = String(rec.text ?? "");
    return { line: `- ${hms(rec.start)} ${resolveSpeaker(rec.user_id)}: ${text}`, urgent: isWake(text) };
  }

  function scanFile(file: string, sink: string[]): ScanResult {
    const result: ScanResult = { added: false, urgent: false };
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      return result; // not created yet
    }
    const from = offsets[file] ?? 0;
    if (stat.size <= from) {
      offsets[file] = stat.size; // truncation/rotation: snap forward, drop the gap
      return result;
    }
    let chunk = "";
    try {
      const fd = fs.openSync(file, "r");
      const buf = Buffer.alloc(stat.size - from);
      fs.readSync(fd, buf, 0, buf.length, from);
      fs.closeSync(fd);
      chunk = buf.toString("utf8");
    } catch {
      return result;
    }
    // `from` always sits just after a newline, so the only partial record is a
    // half-written final line with no `\n` yet. Consume whole lines only; the
    // remainder (and any multi-byte char split at `stat.size`) is re-read next
    // pass. A complete JSONL record always ends in `\n`.
    const lastNl = chunk.lastIndexOf("\n");
    if (lastNl === -1) return result;
    const consumed = chunk.slice(0, lastNl + 1);
    offsets[file] = from + Buffer.byteLength(consumed, "utf8");
    for (const line of consumed.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const formatted = format(file, JSON.parse(trimmed));
        if (formatted) {
          sink.push(formatted.line);
          result.added = true;
          if (formatted.urgent) result.urgent = true;
        }
      } catch {
        // skip an unparseable line
      }
    }
    return result;
  }

  function scan(sink: string[]): ScanResult {
    const result: ScanResult = { added: false, urgent: false };
    const dirs = watchDirs(artifactsDir, callId);
    // All events first (across every directory) so a speaker's join is mapped
    // before any transcript line that names them, even across sibling dirs.
    for (const dir of dirs) {
      const r = scanFile(path.join(dir, "events.jsonl"), sink);
      result.added ||= r.added;
      result.urgent ||= r.urgent;
    }
    for (const dir of dirs) {
      const r = scanFile(path.join(dir, "transcriptions.jsonl"), sink);
      result.added ||= r.added;
      result.urgent ||= r.urgent;
    }
    return result;
  }

  function maybeFlush(ctx: any) {
    if (!buffer.length) return;
    const now = Date.now();
    if (turnPending) {
      // Normally cleared on agent_end; guard against a triggered send that never
      // produced a turn so the watcher can't get stuck silent for the session.
      if (ctx.isIdle() && now - turnPendingSince > STUCK_MS) turnPending = false;
      else return;
    }
    // Only ever trigger a turn while Pi is free, so the user's own messages and
    // any in-progress reply always take priority over consuming the call. If
    // these methods are absent on an older Pi, the call throws and the tick's
    // catch skips the flush — failing closed (no surprise turns) by design.
    if (!ctx.isIdle() || ctx.hasPendingMessages()) return;
    const paused = now - lastArrivalAt >= QUIET_MS;
    const overdue = now - firstBufferedAt >= MAX_WAIT_MS;
    if (!paused && !overdue) return; // still mid-thought — keep buffering

    const batch = buffer.splice(0, buffer.length).join("\n");
    const urgent = bufferUrgent;
    firstBufferedAt = 0;
    bufferUrgent = false;
    turnPending = true;
    turnPendingSince = now;
    pi.sendMessage(
      {
        customType: "tuple-call-watch",
        content:
          `New on the call:\n\n${batch}\n\n` +
          (urgent
            ? "This includes a line addressed to you or a recording_stopped/call_ended event — respond per your instructions."
            : "Leave a one-line `·` summary of what they just covered; escalate to `👋` only if something matters."),
        display: false,
      },
      { triggerTurn: true },
    );
  }

  pi.on("session_start", async (_event: any, ctx: any) => {
    try {
      scan(backlog); // capture the call so far as context; offsets advance to end
    } catch {
      // no pre-call context, but keep going and start the live watcher below
    }
    try {
      if (ctx?.hasUI) {
        ctx.ui.notify(
          `Listening to the call${callId ? ` (${callId})` : ""} — I'll chime in when it matters.`,
          "info",
        );
      }
    } catch {
      // notify is best-effort
    }
    // Install the watcher independently, so a backlog-scan failure above never
    // leaves the session without a live watcher.
    timer = setInterval(() => {
      try {
        const r = scan(buffer);
        if (r.added) {
          const now = Date.now();
          if (!firstBufferedAt) firstBufferedAt = now;
          lastArrivalAt = now;
          if (r.urgent) bufferUrgent = true;
        }
        maybeFlush(ctx);
      } catch {
        // a single bad tick (or a missing ctx method) must not kill the watcher
      }
    }, POLL_MS);
    timer.unref?.();
  });

  // A turn we triggered has finished — let the next batch flush.
  pi.on("agent_end", async () => {
    turnPending = false;
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
