// Internal generation guides. These never enter the project asset library,
// conversation attachments, mention candidates, or the visible node graph.
export async function loadStoryboardReferences(signal) {
  const sources = [
    { name: "internal-character-guide.png", src: "/assets/storyboard/default-character.png" },
    { name: "internal-storyboard-guide.png", src: "/assets/storyboard/default-planning-board.png" },
  ];
  return Promise.all(
    sources.map(async ({ name, src }) => {
      const response = await fetch(src, { signal });
      if (!response.ok) throw new Error("REFERENCE_UNAVAILABLE");
      const blob = await response.blob();
      if (!blob.size || !blob.type.startsWith("image/")) throw new Error("REFERENCE_UNAVAILABLE");
      return { name, type: "image", blob };
    }),
  );
}
