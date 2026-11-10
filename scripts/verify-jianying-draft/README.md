# Jianying draft field-level comparison

Development-only verification; Python and the vendored package are not Host runtime dependencies.
Run from the repository root with a Node runtime supporting TypeScript type stripping and Python 3.
Build the web assets first (`npm run build`) because the harness inspects a bundled sticker:

```sh
node scripts/verify-jianying-draft/compare.mjs
node scripts/export-jianying.mjs --help
```

`PYTHON` may select the local Python executable. No dependency installation is performed.
The fixture supplies synthetic absolute media paths and declared metadata. The Python
reference bypasses media probing only; material/segment/script serialization uses the
vendored upstream implementation. Thus this does not validate real media probing.

Eight transition variants are compared on the same basic multi-track fixture,
including a trimmed, constant-speed zoom-in/zoom-out sample and the built-in sticker
represented as an editable image layer. The harness
also resolves that sticker from the current `dist/assets/stickers` tree and reads its
real PNG dimensions; project media paths and metadata remain synthetic.
Comparison includes canvas, fps, duration, all material buckets, tracks, segments and
time ranges. Random IDs are canonicalized consistently, material bucket order is
normalized and nested text JSON is parsed before comparison. Referenced material IDs
must exist. No differing semantic fields are silently dropped.

The oracle explicitly corrects one upstream serialization defect: TextSegment creates
a speed material reference but the script omits registration of that speed material.
`generate-reference.py` registers it; vendored files remain unchanged. This correction
is intentional, so this is not a byte-for-byte comparison with unmodified upstream output.

Additional checks cover reported missing media/unsupported features, invalid names,
non-macOS rejection, missing/default/explicit roots, four metadata files plus deduplicated
`assets/media` and its manifest, and refusal to overwrite an existing draft.
Synthetic output is retained in the printed OS temporary
directory for inspection; it is not a playable project.

Not covered: authenticated Host HTTP requests, real project media, production packaging,
native Jianying sticker resources, advanced effect fidelity or opening the result in Jianying Pro.

## Export contract

`scripts/export-jianying.mjs --help` describes the authenticated loopback request.
The project must be open in an existing Host page and its editor snapshot saved.
Supply the existing bearer through `TIMELINE_STUDIO_PAGE_BEARER`; the CLI never
bootstraps a session or saves unsaved edits. The Host reads only the committed
snapshot and requires the locally installed domestic Jianying Pro 11.6.0 on macOS
to be closed before exporting into a fresh directory.

The output retains independent clips, source trims, constant speed, volume, base
transforms, and position/scale/rotation keyframes. A zoom-back-out is retained when
it is present in the saved timeline; export does not invent an ending animation.
Scale uses `KFTypeScaleX` with uniform scaling enabled. Video keyframes are written
at `source.start + localTime * speed`; image keyframes use their zero-based source
clock. Curves use the timeline's provided samples with linear interpolation.

The report separates mapped, degraded, unsupported, and blocked features. Native
fade has downstream Jianying 11.6.0 visual evidence, but its centered overlap is not
frame-equivalent to the browser's outgoing transition window. Other transition IDs
have only synthetic schema evidence. Alpha keyframes remain editable but are not
relied upon for video fades. Subject outlines, masks, color grading, variable speed,
and other unmapped effects are reported; no flattened movie is substituted.

The target profile does not establish compatibility with international CapCut,
Windows, or other Jianying versions.

## Provenance

The vendored `pyJianYingDraft` and template sources come from `jianying-editor-skill`
reference commit `32c56928ded4f9e2c2b80e099dc7abb793d2c30b`. Preserve the vendor license
and `apps/host/jianying-draft/{LICENSE,LICENSE.jianying-editor-skill,NOTICE}` when
redistributing their respective derived material.
