# harshveer.me

Static Astro site, built from data. See README.md for how content flows in.

- Never hand-edit `src/data/resume.json`; it is generated from `resume.tex` by `scripts/parse-resume.mjs`.
- Items are added via `scripts/add_item.py` or the wiki exporter.
- Never put a phone number, client name or internal metric in any item.
- Never commit the real `resume.tex`: `tests/fixtures/resume.tex` is a copy with the phone number replaced by a fake one.
- The design comes from the Claude Design handoff (tokens in `src/styles/global.css`). Don't add a UI framework or client-side JS.
- Every URL in `tests/legacy-urls.txt` must keep resolving (`npm run check:legacy`).
- Astro 7 needs Node 24 (`.nvmrc`).
