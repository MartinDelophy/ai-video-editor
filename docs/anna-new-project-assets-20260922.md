# Anna new-project media isolation — 2026-09-22

Anna's new-project transaction already saves the outgoing project and clears timeline tracks, but the shared reset left userAssets intact. Imported and generated music cards therefore appeared in a newly created project's media list. Anna now explicitly requests a project-scoped asset reset and clears the library selection. Other editions retain their existing reset behavior. No existing saved project is migrated or cleared.

Validated the real useProjectFiles hook together with the real clearMusicTrack action in a temporary browser fixture outside the repository: new-project assets and selection empty, music blob null, music segments empty, duration zero, playback stopped and playhead zero. Production build passed. Targeted lint reported no errors (seven existing unused-variable warnings in App.jsx). The user's live project was not modified during testing.
