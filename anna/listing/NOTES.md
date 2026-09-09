# Anna listing images

Captured on 2026-09-08 from the actual Anna edition running at the local Vite preview, using the standard 1280 × 720 editor viewport. These images are listing assets, not a test harness or bundled sample media.

- `editor-library.jpg`: a real Wikimedia Commons `nature` search, native video preview, and imported video filmstrip.
- `export-settings.jpg`: the same project with the actual 720p H.264 export settings and an explicit silent-audio selection. This image demonstrates settings, not a completed export.

The visible video is Wikimedia Commons [Nature montage around Aberfeldy.webm](https://commons.wikimedia.org/wiki/File:Nature_montage_around_Aberfeldy.webm), marked CC0 by its API metadata. Both captures are unretouched application screenshots. They contain no Anna dashboard, credentials, email, or RPC log.

The ordered local paths remain configured in `anna/app.json`. On **2026-09-09**, the user-authorized official CLI update uploaded both screenshots and server read-back associated these CDN URLs with app 254:

- `editor-library.jpg` → [uploaded editor/library image](https://cdn.anna.partners/production/app-screenshots/254-timeline-studio/20260909023730_fd3c4baf.webp)
- `export-settings.jpg` → [uploaded export-settings image](https://cdn.anna.partners/production/app-screenshots/254-timeline-studio/20260909023731_e3afa8e1.webp)

Server association and CDN delivery were verified: both HEAD requests returned HTTP 200 with `image/webp`; the editor/library image is 85,910 bytes and the export-settings image is 82,080 bytes. The screenshots remain local Anna-edition captures and do not establish production compatibility. Recheck them against the final release candidate and capture the production AI review screen after the platform blockers are fixed. The same update produced working draft r6 ready; it did not create a new immutable version or resubmit the app for review.
