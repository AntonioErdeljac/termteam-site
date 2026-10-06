# Replay and verification tools

The live Framer site is replayed offline from `capture/` (real Framer runtime, recorded responses), then:

- `harvest.js <route> <width> <out.json>` — settled DOM, scroll motion log, hovers, clicks, WAAPI animations.
- `explore.js <route> <width> <harvest.json> <out.json>` — every click from every state a click group can reach.
- `formrec.js <width> <out.json>` — contact form states; the submit request is answered locally, nothing is sent.
- `../build-static.cjs <capture> <harvestDir> <outDir> <slug>` — builds the page (env FORMDIR, XDIR point at the form / explore files).
- `pair.js`, `itest.js`, `seqtest.js`, `ftest.js` — screenshot live replay and the static build the same way and diff them.

Needs `playwright` and Chromium (`CHROME=/path/to/chromium`).
