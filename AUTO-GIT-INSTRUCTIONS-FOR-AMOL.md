# Auto Git Instructions for Amol

## Overview
The LaunchAgent `com.amol.dadsbot-auto-push` runs `/usr/local/bin/push_dadsbot_if_dirty.sh` every 60 seconds. That script calls `/usr/local/bin/push_dadsbot.sh`, which commits and pushes to `origin/main` whenever the working tree has changes and you are on `main`.

## Manual controls
- Kick off immediately: `launchctl kickstart -k gui/$UID/com.amol.dadsbot-auto-push`
- Pause automation: `launchctl unload ~/Library/LaunchAgents/com.amol.dadsbot-auto-push.plist`
- Resume automation: `launchctl load -w ~/Library/LaunchAgents/com.amol.dadsbot-auto-push.plist`

## Logs
- Standard output: `/tmp/dadsbot-auto-push.out`
- Standard error: `/tmp/dadsbot-auto-push.err`

## Maintenance tips
1. Ensure `/bin/zsh`, `/usr/bin/git`, and the helper scripts have Full Disk Access so macOS does not block repo access.
2. Keep the working tree clean when the automation is active—any tracked or untracked files not ignored will be added and pushed.
3. After manual edits inside the repo, follow the AGENTS reminder: `git status` → `git commit -m "<message>"` → open a PR summarizing the change.
