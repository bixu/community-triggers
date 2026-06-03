# Claude Drama Triangle Coach

A [Tuple](https://tuple.app) trigger that runs [Claude Code](https://claude.ai/code) against your live call to surface **Karpman Drama Triangle** dynamics (Victim, Persecutor, Rescuer) and nudge you toward the empowered alternatives: Creator, Challenger, Coach. When the call ends, the same session writes you a per-teammate analysis.

It reads the call off disk through the bundled watcher, so it needs no `tuple` CLI.

One hook (`call-transcription-started`), two phases:

- **During the call, the coach.** Listens to *your own* lines in the live transcript and, when you slip into a drama role, leaves a one-line reframe as a terminal line plus a best-effort desktop notification. Nudges work without notification permission and off macOS (the terminal line is the reliable channel). Silent by default; only speaks when confident.
- **When the call ends, the analysis.** The same session reads the full transcript and writes an evaluation to `drama-evaluation.md`: per-teammate drama profiles, hook moments, and playbooks for how to work with each person going forward. Notifies you when the analysis is ready.

The Drama Triangle framework is embedded into the system prompt. You do **not** need any Claude skill installed for this trigger to work; drop the folder in and go.

## What it does

### During the call

While you're talking:

- Follows the call with the bundled `tuple-call-watcher.py`: catches up on the backlog, then `Monitor`s a live run so it wakes on new lines (no polling).
- Maps participant IDs to names once from `user_joined` events, then watches **only the lines attributed to you**.
- On each new line, checks against the Drama Triangle markers in the system prompt.
- When confidence is high (≥90%), prints a terminal line and fires a desktop notification through the bundled `tuple-notify.sh` (uses `terminal-notifier` for a clickable popup if installed, falls back to `osascript`):
  - Title: `Drama Triangle Coach — Victim` / `... — Persecutor` / `... — Rescuer`
  - Body: a one-line reframe you could say next (≤90 chars)
- The terminal line is always written, so you have an audit trail even if the popup is suppressed or you're off macOS.

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
- Notifies you through `tuple-notify.sh` when the file is ready. With `terminal-notifier` installed the notification is click-to-open; otherwise the path is printed to the terminal.

## What stays silent (during the call)

- Anything below ~90% confidence.
- Repeats. It stays sparing (roughly one nudge every few minutes) and won't fire the same reframe twice for the same pattern.
- The other party's drama in real time. The real-time coach is a self-coaching tool; teammate dynamics are the job of the end-of-call analysis.
- Venting, jokes, quoting someone else, self-aware naming of the pattern.

## Prerequisites

- **macOS.** Opens your preferred terminal (Ghostty, iTerm, Alacritty, or Terminal; set `PREFERRED_TERM` to choose).
- **Claude Code**: `npm install -g @anthropic-ai/claude-code`, so `claude` works in a new terminal.
- **`python3`** for the bundled watcher (install with `xcode-select --install`).
- **A Whisper model** configured in Tuple for live transcription. Email `support@tuple.app` if you need local transcription enabled for your team.
- **Optional: `terminal-notifier`** for clickable desktop popups. Without it the coach falls back to `osascript`; without notification permission it still prints every nudge to its terminal.

No MCP servers needed. No external accounts. No outbound network traffic from the coach itself.

## Installation

Drop this directory into your Tuple triggers folder:

- Production: `~/.tuple/triggers/claude-drama-triangle-coach/`
- Staging: `~/.tuplestaging/triggers/claude-drama-triangle-coach/`

The hook fires automatically the next time you start transcription.

## How it works

When `call-transcription-started` fires, Tuple provides `TUPLE_TRIGGER_CALL_ARTIFACTS_DIRECTORY`, the directory holding this call's transcription artifacts. The trigger:

1. Copies the fixed `tuple-call-watcher.py` and writes the kickoff prompt into that directory.
2. Copies `system-prompt.md` into the same directory. If you have `~/.tuple/identity.md` (or `~/.tuplestaging/identity.md`), it's appended so Claude knows whose voice to coach, though the trigger works fine without it. The environment is inferred from the artifacts path (no daemon probe).
3. Writes an executable `launch-drama-triangle-coach.command` wrapper.
4. Opens it in your preferred terminal (Ghostty → iTerm → Alacritty → Terminal; override with `PREFERRED_TERM`) via `open` (LaunchServices). No AppleScript and no direct binary launch, so no macOS accessibility prompt and no stray windows.

The wrapper starts a login-interactive zsh, changes to the transcripts root, and runs Claude. Claude runs the bundled watcher once to catch up, then `Monitor`s a continuous run for the life of the call, coaching your lines in real time off disk. The watcher follows every session directory for the call, so if transcription stops and restarts mid-call it picks the resumed stream up automatically. A PID file in the transcripts root, keyed by call ID, keeps a second transcription start from launching a duplicate coach. When a `call_ended` event arrives, the session reads the full transcript from disk, writes `drama-evaluation.md` into the active session directory, and fires the "analysis ready" notification.

For local testing without opening a terminal, set `CLAUDE_DRAMA_TRIANGLE_COACH_DRY_RUN=1`; it writes the prompt and launcher and exits.

## Identity (optional)

If you want the coach to personalize, drop a single file at `~/.tuple/identity.md` (or `~/.tuplestaging/identity.md`):

```markdown
# Identity

You're coaching [Your Name]. [One-liner about how they tend to land in the triangle,
e.g. "defaults to Rescuer with their direct reports", "slips into Victim on vendor
calls", "tends to villainize sales when prioritization disagreements come up".]
```

The coach reads it. It works fine without it.

## Tuning the behavior

All behavior lives in `system-prompt.md`:

- **Watch the other party too.** Remove the "only evaluate the user's own lines" constraint in the **Setup** section if you also want real-time notifications about drama *being done to you*. This increases noise, and be aware it risks turning the coach into a teammate-villainizing tool.
- **Tighten or loosen the confidence threshold.** Default 90%+ to fire.
- **How sparing it is.** By default it fires at most about one nudge every few minutes and never repeats a reframe for the same pattern; adjust the guidance in **Fire criteria**.
- **Nudge format.** Title and body templates live in the **Nudge format** section. Delivery is handled by `tuple-notify.sh`, which prefers `terminal-notifier` and falls back to `osascript`.
- **End-of-call analysis.** Edit the evaluation template and calibration in **On call end** directly. Add or drop sections, but keep the final `SUMMARY:` line so the notification body has something to show.

## Acknowledgments

The Drama Triangle framework is Stephen Karpman's. The Creator / Challenger / Coach reframe (TED, The Empowerment Dynamic) is David Emerald's. This trigger listens for the markers and nudges you toward the better stance, in the moment and after the fact.
