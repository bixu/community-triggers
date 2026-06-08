# Coach - Pairing - Claude

A [Tuple](https://tuple.app) trigger that runs [Claude Code](https://claude.ai/code) against your live call to catch pairing **anti-patterns** as they happen (backseat driving, a checked-out partner, a silent driver, grinding without breaks, diving in with no shared goal) and nudge you toward the better move. When the call ends, the same session writes you a retro. The framework comes from [Tuple's Pair Programming Guide](https://tuple.app/pair-programming-guide/) and the practices the field's practitioners agree on.

It reads the call off disk through the bundled watcher, so it needs no `tuple` CLI.

One hook (`call-transcription-started`), two phases:

- **During the call, the coach.** Watches the live pairing dynamic and, when the session drifts into a known smell, nudges you with a one-line move you can make. Every nudge is a terminal line plus a best-effort desktop notification, so it works without notification permission and off macOS (the terminal line is the reliable channel). Silent by default; only speaks when confident.
- **When the call ends, the retro.** The same session reads the full transcript and writes `pairing-evaluation.md`: how the session ran, talk-time balance, anti-patterns with quotes, what worked, and the one thing to practice next time. Notifies you when it's ready.

The pairing framework is embedded into the system prompt. You do **not** need any Claude skill installed for this trigger to work; drop the folder in and go.

## What it does

### During the call

While you're pairing:

- Follows the call with **Tuple's bundled watcher** (`tuple-call-watcher.py`, shipped with this trigger): it catches up on the backlog once, then follows live. Where the `Monitor` tool is available (the preferred path) it `Monitor`s a continuous run that wakes the coach on each new batch of transcript read off disk, plus a short fallback timer so it can notice *silences*. Where `Monitor` is unavailable — e.g. on Bedrock — it falls back to looping the watcher in `--exit-on-batch --max-wait` mode over `Bash`, where each timed-out empty return is that same silence tick. A quiet navigator or a grinding session produce no transcript to wake on, which is why the silence check matters.
- Maps both participants to names once from `user_joined` events, and tracks lightweight session state: talk-time balance, who last spoke, whether a goal was set, and how long it's been since a break or swap.
- On each new line (or fallback tick), checks against the pairing smells in the system prompt.
- When confidence is high, prints a terminal line and fires a desktop notification through the bundled `tuple-notify.sh` (uses `terminal-notifier` for a clickable popup if installed, falls back to `osascript`):
  - Title: `Pairing Coach — Backseat driving` / `... — Quiet pair` / `... — Silent driver` / `... — Swap` / `... — Drift` / `... — No goal yet` / `... — Take a break`
  - Body: a one-line move you could make next (≤90 chars)
- The terminal line is always written, so you have an audit trail even if the popup is suppressed or you're off macOS.

It does **not** post anywhere external. It does **not** speak in the call. Its terminal is yours alone.

### When the call ends

When the call genuinely ends (it ignores mid-call transcription toggles), the same session switches from coach to analyst:

- Reads every `transcriptions.jsonl` on disk in chronological order for the complete record.
- Writes a markdown retro to `pairing-evaluation.md` in the call's session directory with:
  - **How the session ran**: shared goal up front? talk-time balance? swaps and breaks, or a grind?
  - **Anti-patterns that showed up**, each one named with a `[mm:ss]` quote behind it, so the pattern is something you can actually hear.
  - **What worked**: up to 3 good moves to repeat, such as a sharp question, a clean swap, or a well-narrated step.
  - **One thing to practice**: the single highest-leverage change for the next session with this partner, in your voice.
  - A `SUMMARY:` line at the end (≤120 chars) for the notification body.
- Notifies you through `tuple-notify.sh` when the file is ready. With `terminal-notifier` installed the notification is click-to-open; otherwise the path is printed to the terminal.

## What stays silent (during the call)

- Anything below high confidence.
- Repeats. It stays sparing (roughly one nudge every few minutes) and won't fire the same move twice for the same smell.
- Healthy quiet. A short pause while someone reads a stack trace is good pairing, not a checked-out navigator. Only *sustained* silence registers.
- Frustration at the code, tools, or infra. The smells are about how the two people work together, not how the build is behaving.
- Banter, reading code aloud, or a one-off "sorry, one sec" that resolves itself.

## Prerequisites

- **macOS.** Opens your preferred terminal (Ghostty, iTerm, Alacritty, or Terminal; set `PREFERRED_TERM` to choose).
- **Claude Code**: `npm install -g @anthropic-ai/claude-code`, so `claude` works in a new terminal.
- **`python3`** for the bundled `tuple-call-watcher.py` (install with `xcode-select --install`).
- **A Whisper model** configured in Tuple for live transcription. Email `support@tuple.app` if you need local transcription enabled for your team.
- **Optional: `terminal-notifier`** for clickable desktop popups. Without it the coach falls back to `osascript`; without notification permission it still prints every nudge to its terminal.

No MCP servers needed. No external accounts. No outbound network traffic from the coach itself.

## Installation

Drop this directory into your Tuple triggers folder:

- Production: `~/.tuple/triggers/coach-pairing-claude/`
- Staging: `~/.tuplestaging/triggers/coach-pairing-claude/`

The hook fires automatically the next time you start transcription.

## How it works

When `call-transcription-started` fires, Tuple provides `TUPLE_TRIGGER_CALL_ARTIFACTS_DIRECTORY`, the directory holding the current call's transcription artifacts. This trigger:

1. Copies the fixed `tuple-call-watcher.py` into that directory so Claude runs it verbatim rather than re-authoring a poll loop each session.
2. Copies `system-prompt.md` into that directory. If you have `~/.tuple/identity.md` (or the staging equivalent, inferred from the artifacts path), it's appended so Claude knows your name and how you tend to pair, though the trigger works fine without it.
3. Writes an executable `launch-coach-pairing-claude.command` wrapper into that directory and a short kickoff prompt telling Claude to catch up on the backlog first, then wait.
4. Opens it in your preferred terminal (Ghostty → iTerm → Alacritty → Terminal; override with `PREFERRED_TERM`) via `open` (LaunchServices). No AppleScript and no direct binary launch, so it triggers no macOS accessibility prompt and no stray windows. The wrapper starts a login-interactive zsh, changes to the transcripts root, and runs `claude` with the appended system prompt.

The session follows the call by reading transcripts off disk through the bundled watcher for the life of the call, coaching in real time. A PID file (`.coach-pairing-claude-<call-id>.pid`, keyed on the call id) keeps a second transcription start from launching a duplicate coach: if transcription stops and restarts mid-call, the trigger sees the live PID and exits, and the running coach's watcher picks up the new session directory automatically (it follows every `*@<call-id>/` directory). When a `call_ended` event arrives on the stream, the session reads the full transcript from disk, writes `pairing-evaluation.md` into the active session directory, and fires the "retro ready" notification.

For local testing without opening a terminal, set `COACH_PAIRING_CLAUDE_DRY_RUN=1`; it writes the prompt and launcher and exits.

## Identity (optional)

If you want the coach to personalize, drop a single file at `~/.tuple/identity.md` (or `~/.tuplestaging/identity.md`):

```markdown
# Identity

You're coaching [Your Name]. [One-liner about how they tend to pair, e.g. "tends to
keyboard-hog when they know the code", "goes quiet as a navigator", "corrects typos
too fast", "dives into the editor before setting a goal".]
```

The coach reads it. It works fine without it.

## Tuning the behavior

All behavior lives in `system-prompt.md`:

- **Coach only your own lines.** By default the coach watches the *whole pair* because balance and silence are two-person properties, but every nudge is still a move you can make. If you'd rather it only react to your own behavior, narrow the **Whose session you coach** section to your lines alone.
- **Tighten or loosen the confidence threshold.** It fires only when confident; make it chattier or quieter in **Fire criteria**.
- **How sparing it is.** By default it fires at most about one nudge every few minutes and never repeats a move for the same smell; adjust the guidance in **Fire criteria**.
- **Silence sensitivity.** The ~3-minute "quiet pair" and ~25-minute "swap" thresholds live in **The framework**; the ~6-minute functional fallback timer lives in **Setup**. Loosen them for long heads-down sessions, tighten for fast back-and-forth work.
- **Nudge format.** Title and body templates live in **Nudge format**. Delivery is handled by `tuple-notify.sh`, which prefers `terminal-notifier` and falls back to `osascript`.
- **End-of-call retro.** Edit the retro template and calibration in **On call end** directly. Add or drop sections, but keep the final `SUMMARY:` line so the notification body has something to show.

## Acknowledgments

The pairing framework is drawn from [Tuple's Pair Programming Guide](https://tuple.app/pair-programming-guide/) (its [antipatterns](https://tuple.app/pair-programming-guide/antipatterns), [styles](https://tuple.app/pair-programming-guide/styles), and [session template](https://tuple.app/pair-programming-guide/template)) and from the wider practice, notably Birgitta Böckeler and Nina Siessegger's [On Pair Programming](https://martinfowler.com/articles/on-pair-programming.html) and Llewellyn Falco's strong-style rule ("for an idea to go from your head into the computer it must go through someone else's hands"). This trigger listens for the markers and nudges you toward the better move, in the moment and after the fact.
