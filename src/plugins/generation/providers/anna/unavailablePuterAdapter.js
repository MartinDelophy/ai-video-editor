// Anna uses its host-managed generation connector. Never import the Puter
// SDK here: its eager socket connection is incompatible with the host CSP.
export function createPuterAdapter() {
  const unavailable = () => { throw Object.assign(new Error("Puter is unavailable in the Anna edition"), { code: "PROVIDER_UNAVAILABLE" }); };
  return { connect: unavailable, generate: unavailable };
}
