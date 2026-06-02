# Claude Drama Triangle Coach

A [Tuple](https://tuple.app) trigger that runs [Claude Code](https://claude.ai/code) against your live call to surface **Karpman Drama Triangle** dynamics (Victim, Persecutor, Rescuer) and nudge you toward the empowered alternatives: Creator, Challenger, Coach. When the call ends, the same session writes you a per-teammate analysis.

One hook (`call-transcription-started`), two phases:

- **During the call, the coach.** Listens to *your own* lines in the live transcript and fires a quiet macOS notification with a one-line reframe when you slip into a drama role. Silent by default; only speaks when confident.
- **When the call ends, the analysis.** The same session reads the full transcript and writes an evaluation to `drama-evaluation.md`: per-teammate drama profiles, hook moments, and playbooks for how to work with each person going forward. Notifies you when the analysis is ready.

The Drama Triangle framework is embedded into the system prompt. You do **not** need any Claude skill installed for this trigger to work; drop the folder in and go.

## What it does

### During the call

While you're talking:

- Subscribes to the merged Tuple transcription stream so it wakes on new lines (no polling).
- Maps participant IDs to names once via `tuple state`, then watches **only the lines attributed to you**.
- On each new line, checks against the Drama Triangle markers in the system prompt.
- When confidence is high (≥90%) and cooldown has elapsed, fires a **macOS notification** via `osascript`:
  - Title: `Drama Triangle Coach — Victim` / `… — Persecutor` / `… — Rescuer`
  - Body: a one-line reframe you could say next (≤90 chars)
- Logs every fired notification to its terminal so you have an audit trail when you alt-tab.

It does **not** post anywhere external. It does **not** speak in the call. Its terminal is yours alone.

### When the call ends

When the call genuinely ends (it ignores mid-call transcription toggles), the same session switches from in-the-moment coach to analyst. Your real-time coaching watched only your own lines; the evaluation is broader, analyzing every participant:

- Reads every `transcriptions.jsonl` and `events.jsonl` on disk in chronological order.
- Writes a markdown evaluation to `drama-evaluation.md` in the call root with:
  - **Per-participant profile**: primary roles each person played, hooks they bit on or offered, where they showed up empowered.
  - **Hook moments**: a chronological list of the 3 to 6 most consequential moments where the conversation tipped toward or away from the triangle, with quotes.
  - **"How to engage <name> next time"**: for each teammate who showed a recurring pattern, strategies, phrases that land, phrases to avoid, and what they seem to need under the drama.
  - **What I'd practice before the next call with this group**: up to 3 specific reframes in your voice.
  - A `SUMMARY:` line at the end (≤120 chars) for the notification body.
- Fires a macOS notification when the file is ready. With `terminal-notifier` installed, the notification is click-to-open; otherwise it shows the path.

## What stays silent (during the call)

- Anything below ~90% confidence.
- Anything inside the cooldown window (default: 3 minutes between notifications).
- More than 5 notifications per call.
- The other party's drama in real time. The real-time coach is a self-coaching tool; teammate dynamics are the job of the end-of-call analysis.
- Venting, jokes, quoting someone else, self-aware naming of the pattern.

## Prerequisites

- **macOS.** Uses `open` / `Ghostty.app` and `osascript` for notifications. Optionally `terminal-notifier` for click-to-open.
- **Claude Code**: `npm install -g @anthropic-ai/claude-code`
- **The `tuple` CLI**, which ships with Tuple.
- **A Whisper model** configured in Tuple for live transcription. Email `support@tuple.app` if you need local transcription enabled for your team.
- **Notification permission** for the AppleScript runner. The first time a notification tries to fire, macOS will prompt; accept it, otherwise the call is silent.

No MCP servers needed. No external accounts. No outbound network traffic from the coach itself.

## Installation

Drop this directory into your Tuple triggers folder:

- Production: `~/.tuple/triggers/claude-drama-triangle-coach/`
- Staging: `~/.tuplestaging/triggers/claude-drama-triangle-coach/`

The hook fires automatically the next time you start transcription.

## How it works

When `call-transcription-started` fires:

1. Detects which Tuple environment (`prod`, `staging`, `dev`) owns the call by probing each daemon's `state` for a matching call ID, and exports `TUPLE_ENV` so every `tuple` CLI call inside Claude scopes to the right daemon.
2. Copies `system-prompt.md` into the call's artifact directory. If you have `~/.tuple/identity.md` (or the staging equivalent), it's appended so Claude knows whose voice to coach, though the trigger works fine without it.
3. Inlines the last 100 lifecycle events and last 100 transcript lines into the initial prompt so Claude has context if it joins mid-call.
4. Opens a terminal (Ghostty if installed, otherwise the system `.command` handler) running Claude Code inside the call's artifact directory.

The session stays subscribed to the transcription stream for the life of the call, coaching your lines in real time. If transcription stops and restarts mid-call, the trigger sees the live PID file and exits; the existing session's subscription picks up the resumed stream without restarting. When the stream reports the call is genuinely over (an `HTTP 410 Gone` on the transcript endpoint), the session reads the full transcript from disk, writes `drama-evaluation.md` in the call root, and fires the "analysis ready" notification.

## Identity (optional)

If you want the coach to personalize, drop a single file at `~/.tuple/identity.md` (or `~/.tuplestaging/identity.md`):

```markdown
# Identity

You're coaching [Your Name]. [One-liner about how they tend to land in the triangle —
e.g. "defaults to Rescuer with their direct reports", "slips into Victim on vendor
calls", "tends to villainize sales when prioritization disagreements come up".]
```

The coach reads it. It works fine without it.

## Tuning the behavior

All behavior lives in `system-prompt.md`:

- **Watch the other party too.** Remove the "only evaluate the user's own lines" constraint in the **Setup** section if you also want real-time notifications about drama *being done to you*. This increases noise, and be aware it risks turning the coach into a teammate-villainizing tool.
- **Tighten or loosen the confidence threshold.** Default 90%+ to fire.
- **Cooldown / per-call cap.** Default 180s between notifications, max 5 per call.
- **Notification style.** Swap `osascript` for `terminal-notifier` in the **Notification format** section if you have it installed.
- **Stream interval.** 30s keeps wake rate low at the cost of ~30s lag; drop to `10s` for snappier reactions.
- **End-of-call analysis.** Edit the evaluation template and calibration in **On call end** directly. Add or drop sections, but keep the final `SUMMARY:` line so the notification body has something to show.

## Acknowledgments

The Drama Triangle framework is Stephen Karpman's. The Creator / Challenger / Coach reframe (TED, The Empowerment Dynamic) is David Emerald's. This trigger listens for the markers and nudges you toward the better stance, in the moment and after the fact.
