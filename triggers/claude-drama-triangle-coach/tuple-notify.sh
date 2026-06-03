#!/bin/sh
# tuple-notify.sh -- best-effort desktop notification, no escaping required.
#
#   ./tuple-notify.sh "Title" "Body" ["/abs/path/to/open"]
#
# Title and body are passed as ARGUMENTS (never interpolated into an
# AppleScript string), so quotes and apostrophes in the text need no
# escaping. Prefers terminal-notifier (clickable; can open a file on click),
# falls back to osascript, and exits non-zero if neither is available or the
# post fails. Callers should ALWAYS keep their own terminal log line so a
# missing popup loses nothing -- the notification is a bonus, not the channel.
title=${1:-Tuple}
body=${2:-}
open_path=${3:-}

if command -v terminal-notifier >/dev/null 2>&1; then
    if [ -n "$open_path" ]; then
        terminal-notifier -title "$title" -message "$body" -open "file://$open_path" -sound Tink >/dev/null 2>&1 && exit 0
    else
        terminal-notifier -title "$title" -message "$body" -sound Tink >/dev/null 2>&1 && exit 0
    fi
fi

if command -v osascript >/dev/null 2>&1; then
    osascript \
        -e 'on run argv' \
        -e 'display notification (item 2 of argv) with title (item 1 of argv) sound name "Tink"' \
        -e 'end run' \
        "$title" "$body" >/dev/null 2>&1 && exit 0
fi

exit 1
