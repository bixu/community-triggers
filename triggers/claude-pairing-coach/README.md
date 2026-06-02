# Claude Pairing Coach

A [Tuple](https://tuple.app) trigger that runs [Claude Code](https://claude.ai/code) against your live call to catch pairing **anti-patterns** as they happen (backseat driving, a checked-out partner, a silent driver, grinding without breaks, diving in with no shared goal) and nudge you toward the better move. When the call ends, the same session writes you a retro. The framework comes from [Tuple's Pair Programming Guide](https://tuple.app/pair-programming-guide/) and the practices the field's practitioners agree on.

One hook (`call-transcription-started`), two phases:

- **During the call, the coach.** Watches the live pairing dynamic and fires a quiet macOS notification with a one-line move you can make when the session drifts into a known smell. Silent by default; only speaks when confident.
- **When the call ends, the retro.** The same session reads the full transcript and writes `pairing-evaluation.md`: how the session ran, talk-time balance, anti-patterns with quotes, what worked, and the one thing to practice next time. Notifies you when it's ready.

The pairing framework is embedded into the system prompt. You do **not** need any Claude skill installed for this trigger to work; drop the folder in and go.

## What it does

### During the call

While you're pairing:

- Subscribes to the merged Tuple transcription stream so it wakes on new lines (no polling), plus a short fallback timer so it can notice *silences*: a quiet navigator or a grinding session produce no transcript to wake on.
- Maps both participants to names once via `tuple state`, and tracks lightweight session state: talk-time balance, who last spoke, whether a goal was set, and how long it's been since a break or swap.
- On each new line (or fallback tick), checks against the pairing smells in the system prompt.
- When confidence is high and cooldown has elapsed, fires a **macOS notification** via `osascript`:
  - Title: `Pairing Coach — Backseat driving` / `… — Quiet pair` / `… — Silent driver` / `… — Swap` / `… — Drift` / `… — No goal yet` / `… — Take a break`
  - Body: a one-line move you could make next (≤90 chars)
- Logs every fired notification to its terminal so you have an audit trail when you alt-tab.

It does **not** post anywhere external. It does **not** speak in the call. Its terminal is yours alone.

### When the call ends

When the call genuinely ends (it ignores mid-call transcription toggles), the same session switches from coach to analyst:

- Reads every `transcriptions.jsonl` on disk in chronological order for the complete record.
- Writes a markdown retro to `pairing-evaluation.md` in the call root with:
  - **How the session ran**: shared goal up front? talk-time balance? swaps and breaks, or a grind?
  - **Anti-patterns that showed up**, each one named with a `[mm:ss]` quote behind it, so the pattern is something you can actually hear.
  - **What worked**: up to 3 good moves to repeat, such as a sharp question, a clean swap, or a well-narrated step.
  - **One thing to practice**: the single highest-leverage change for the next session with this partner, in your voice.
  - A `SUMMARY:` line at the end (≤120 chars) for the notification body.
- Fires a macOS notification when the file is ready. With `terminal-notifier` installed, the notification is click-to-open; otherwise it shows the path.

## What stays silent (during the call)

- Anything below high confidence.
- Anything inside the cooldown window (default: 3 minutes between notifications).
- More than 5 notifications per call.
- Healthy quiet. A short pause while someone reads a stack trace is good pairing, not a checked-out navigator. Only *sustained* silence registers.
- Frustration at the code, tools, or infra. The smells are about how the two people work together, not how the build is behaving.
- Banter, reading code aloud, a one-off "sorry, one sec" that resolves itself.

## Prerequisites

- **macOS.** Uses `open` / `Ghostty.app` and `osascript` for notifications. Optionally `terminal-notifier` for click-to-open.
- **Claude Code**: `npm install -g @anthropic-ai/claude-code`
- **The `tuple` CLI**, which ships with Tuple.
- **A Whisper model** configured in Tuple for live transcription. Email `support@tuple.app` if you need local transcription enabled for your team.
- **Notification permission** for the AppleScript runner. The first time a notification tries to fire, macOS will prompt; accept it, otherwise the call is silent.

No MCP servers needed. No external accounts. No outbound network traffic from the coach itself.

## Installation

Drop this directory into your Tuple triggers folder:

- Production: `~/.tuple/triggers/claude-pairing-coach/`
- Staging: `~/.tuplestaging/triggers/claude-pairing-coach/`

The hook fires automatically the next time you start transcription.

## How it works

When `call-transcription-started` fires:

1. Detects which Tuple environment (`prod`, `staging`, `dev`) owns the call by probing each daemon's `state` for a matching call ID, and exports `TUPLE_ENV` so every `tuple` CLI call inside Claude scopes to the right daemon.
2. Copies `system-prompt.md` into the call's artifact directory. If you have `~/.tuple/identity.md` (or the staging equivalent), it's appended so Claude knows your name and how you tend to pair, though the trigger works fine without it.
3. Inlines the last 100 lifecycle events and last 100 transcript lines into the initial prompt so Claude has context if it joins mid-call.
4. Opens a terminal (Ghostty if installed, otherwise the system `.command` handler) running Claude Code inside the call's artifact directory.

The session stays subscribed to the transcription stream for the life of the call, coaching in real time. If transcription stops and restarts mid-call, the trigger sees the live PID file and exits; the existing session's subscription picks up the resumed stream without restarting. When the stream reports the call is genuinely over (an `HTTP 410 Gone` on the transcript endpoint), the session reads the full transcript from disk, writes `pairing-evaluation.md` in the call root, and fires the "retro ready" notification.

## Identity (optional)

If you want the coach to personalize, drop a single file at `~/.tuple/identity.md` (or `~/.tuplestaging/identity.md`):

```markdown
# Identity

You're coaching [Your Name]. [One-liner about how they tend to pair — e.g. "tends to
keyboard-hog when they know the code", "goes quiet as a navigator", "corrects typos
too fast", "dives into the editor before setting a goal".]
```

The coach reads it. It works fine without it.

## Tuning the behavior

All behavior lives in `system-prompt.md`:

- **Coach only your own lines.** By default the coach watches the *whole pair* because balance and silence are two-person properties, but every nudge is still a move you can make. If you'd rather it only react to your own behavior, narrow the **Whose session you coach** section to your lines alone.
- **Tighten or loosen the confidence threshold.** It fires only when confident; make it chattier or quieter in **Fire criteria**.
- **Cooldown / per-call cap.** Default 180s between notifications, max 5 per call.
- **Silence sensitivity.** The ~3-minute "quiet pair" and ~25-minute "swap" thresholds live in **The framework**; the ~6-minute functional fallback timer lives in **Setup**. Loosen them for long heads-down sessions, tighten for fast back-and-forth work.
- **Notification style.** Swap `osascript` for `terminal-notifier` in **Notification format** if you have it installed.
- **Stream interval.** 30s keeps wake rate low at the cost of ~30s lag; drop to `10s` for snappier reactions.
- **End-of-call retro.** Edit the retro template and calibration in **On call end** directly. Add or drop sections, but keep the final `SUMMARY:` line so the notification body has something to show.

## Acknowledgments

The pairing framework is drawn from [Tuple's Pair Programming Guide](https://tuple.app/pair-programming-guide/) (its [antipatterns](https://tuple.app/pair-programming-guide/antipatterns), [styles](https://tuple.app/pair-programming-guide/styles), and [session template](https://tuple.app/pair-programming-guide/template)) and from the wider practice, notably Birgitta Böckeler and Nina Siessegger's [On Pair Programming](https://martinfowler.com/articles/on-pair-programming.html) and Llewellyn Falco's strong-style rule ("for an idea to go from your head into the computer it must go through someone else's hands"). This trigger listens for the markers and nudges you toward the better move, in the moment and after the fact.
