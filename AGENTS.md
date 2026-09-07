# AGENTS

## Repo context
- Path: /Users/amol/Library/Mobile Documents/com~apple~CloudDocs/Documents/root/dadsbot
- Default branch: main
- Reminder: after any manual edits, run `git status`, commit with a clear message, and open a PR describing the automation or code changes.

## Current priorities
- Read [`AI-TODO.md`](AI-TODO.md) before starting work. It is the ordered beta-readiness
  backlog with acceptance criteria; `ToDoLater.txt` is the longer-horizon product wishlist.
- The app is **not beta ready**. Do not treat it as deployable until every P0 in
  `AI-TODO.md` is checked off.
- `npm run ci-check && npm test` must pass before any push.

## Automation helpers
- Auto git helper scripts live at `/usr/local/bin/push_dadsbot.sh` and `/usr/local/bin/push_dadsbot_if_dirty.sh`.
- LaunchAgent label: `com.amol.dadsbot-auto-push` (plist at `~/Library/LaunchAgents/com.amol.dadsbot-auto-push.plist`).
