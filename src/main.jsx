// Keep the authenticated content workspace out of the editor startup bundle.
if (window.location.pathname === "/storyboard" || window.location.pathname.startsWith("/storyboard/")) {
  import("./sanity/entry.jsx");
} else {
  import("./editorEntry.jsx");
}
