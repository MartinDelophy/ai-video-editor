# Project deletion — 2026-09-22

Project cards reveal a trash action on hover or keyboard focus; touch/coarse-pointer devices always show it. Confirmation names the project and explains that both catalog references (current and previous save) are removed. The currently open project is protected: switch to another project first. Busy state disables dismissal and repeated submission; success refreshes the list.

Deletion is a serialized catalog write guarded by both the loaded revision and the cloud ETag. It preserves the current project's snapshot, saved timestamp and revision (the immutable manifest still describes that revision), and updates the local ETag baseline. Shared media files are not deleted. The project list has no undo for removal; exported project packages can still be imported. All new copy is present in 13 languages.

Validation: targeted lint, production build; external temporary store harness checked current-project protection, stale revisions, stale catalog rejection, current content preservation, and no resurrection on the next save. A temporary browser fixture exercised the actual dialog's confirm/loading/success flow. No real user project was deleted and no test fixture was added to the repository.

Strict validation passed. Working draft r33 uploaded and ready; hash `b98c76c97e76ce94b6ab855a1b20009f48c4ee85e89eb3be5ff4479cea515397`. No review submitted.

Layout refinement: moved the hover/focus trash control into a reserved 32px cell beside Open/Rename instead of floating over the card corner. Previous-save recovery is a lower-emphasis text action. Reduced card padding and aligned action groups; mobile places actions on a separate row. Browser screenshots verified both hidden and keyboard-focused deletion states without layout movement.

Layout build, lint and strict validation passed. Working draft r34 ready; hash `0a643cd89de001f7effd7c70c490f6ae001f71938cc63cf4439deffe786fb6de`. No review submitted.
