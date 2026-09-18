# Exercise Vault v2.6 — smooth automatic clip loop

Changes from v2.5:
- Restores automatic looping in the single clip preview player.
- Removes the Replay button.
- Keeps the original YouTube thumbnail on library cards.
- Uses only Clip Start / Clip End.
- Rewinds before the endpoint with `seekTo()` only; it no longer calls `playVideo()` on every loop.
- Retains the auto-update/service-worker strategy so new GitHub Pages builds are easier to pick up.

YouTube does not expose an official arbitrary-timestamp still-frame thumbnail API, so this build intentionally falls back to the source video's original thumbnail rather than extracting frames.
