# Current version: v2.4

### Update reliability patch

This build is designed for rapid GitHub Pages iteration:

- versioned `app.js`, `styles.css`, manifest, and service-worker URLs
- service-worker registration uses `updateViaCache: none`
- the app explicitly checks for a new service worker on load
- a newly activated worker reloads the page once so all shell files match
- app requests are network-first with `cache: no-store`; cache is only an offline fallback
- old Exercise Vault caches are deleted automatically

Your IndexedDB library is not cleared by these updates.

## Current version: v2.3

Clip-specific looping previews: exercise cards now cue and loop from each clip’s own saved preview range. Visible-card players are mounted only while near the viewport to reduce resource use.

## Current version: v2.2

Adds a visible version badge at the top of the app and bumps the service-worker cache so deployed updates are easier to verify.

# Exercise Vault V1

A browser-based personal exercise/video indexing app.

## What works now
- Persistent IndexedDB storage
- Source videos with multiple clips per source
- YouTube normal URLs, youtu.be URLs, and Shorts URL parsing
- Clip start/end plus separate preview-loop range
- Real YouTube loop preview using the official IFrame Player API
- Exercise records with aliases, tags, equipment, body area, goals, and notes
- Search across exercise metadata
- Workout builder with EMOM, Tabata, AMRAP, Circuit, Superset, Straight Sets, For Time, Mobility Flow, and Custom formats
- Inbox for quick saves
- JSON backup/export and restore/import
- PWA manifest + service worker

## Run locally
Because service workers and some browser APIs work best over HTTP, run a tiny local server instead of double-clicking the HTML file.

Python:

    python -m http.server 8000

Then open:

    http://localhost:8000

## GitHub Pages
Upload the contents of this folder to a GitHub repository and enable GitHub Pages from the repository root.

## Next build steps
1. Replace the demo source and seed data with first-run onboarding.
2. Add YouTube Data API metadata lookup after URL paste.
3. Bulk playlist import.
4. Supabase authentication + sync.
5. Chrome/Edge extension for current URL + current YouTube timestamp capture.
6. Android/PWA share-target capture.
7. Transcript indexing / semantic search.
8. Rich workout player/timers.


## V2.1 preview-loop update
YouTube exercise previews now rewind slightly before the saved preview endpoint, check more frequently, and immediately resume if the player reaches an ended state. This reduces the center play/pause overlay on very short looping clips. Standard YouTube UI can still briefly appear during initial load or buffering.
