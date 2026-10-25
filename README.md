# harshveer.me

Personal site of Harshveer Singh, served at <https://harshveer.me> by GitHub Pages. It is a static
[Astro](https://astro.build) site with plain CSS, built entirely from data. Pages are never edited by hand.
The only script is a small inline one for the light/dark toggle in the header. The site is light by
default, ignores the system theme, and remembers the visitor's choice in `localStorage`.

| Route | What it is | Built from |
|---|---|---|
| `/` | Home: photo, role and LinkedIn headline, introduction, experience, focus areas, expertise, education, short bio, links | `src/data/resume.json` + `src/data/site.yaml` |
| `/writing/` | Writing & appearances, grouped by year, newest first | `src/content/items/*.md` |
| `/writing/<slug>/` | One page per essay (items with `kind: essay`) | the essay's Markdown body |
| `/rss.xml` (and `/feed.xml`, the old Jekyll path) | RSS of every item | `src/content/items/` |
| `/404.html`, `/sitemap-index.xml`, `/robots.txt`, `/og/*.png` | generated | |

Old URLs keep working: `/about/` redirects to `/`, each essay with a `legacy_path` gets a redirect page there, and the old
post images are still served at `/assets/images/posts/…`. The list of URLs that must keep resolving is
`tests/legacy-urls.txt`, and CI checks it on every build.

## How content gets in

```
harshveers/resume (private)       wiki exporter          scripts/add_item.py <url>
  resume.tex ── push ──┐                │                          │
                       ▼                ▼                          ▼
   repository_dispatch "resume-updated"   src/content/items/<yyyy-mm-dd>-<slug>.md
                       │                                           │
                       ▼                                           ▼
     scripts/parse-resume.mjs ──► src/data/resume.json ──► astro build ──► GitHub Pages
```

The site rebuilds on every push to `main`, when the resume repo sends a `resume-updated` dispatch,
daily at 02:30 UTC, and on demand (Actions › Build and deploy › Run workflow).

### 1. The resume

`resume.tex` (RenderCV 1.x, sb2nov theme, hand-edited) lives in the private repo `harshveers/resume`.
The first build step, `scripts/parse-resume.mjs`, reads its structure and writes
`src/data/resume.json`. That file is generated on every build, so it is not committed.

- **Privacy:** from the header only the name, city, email, LinkedIn URL and website are read. The phone
  number and `tel:` link are never read, and the build fails if anything phone-like reaches the output.
- **Strictness:** anything the parser does not recognise inside a section it reads stops the build with
  the `.tex` line number. A half-parsed resume is never published.
- **CI access:** the workflow checks out `harshveers/resume` using the `SITE_PAT` secret: a fine-grained
  token with *Contents: read* on that one repo. Pull-request builds without the secret fall back to the
  redacted fixture `tests/fixtures/resume.tex` with a warning. Deploys never do.
- **Rebuild on resume push:** add this workflow to `harshveers/resume`, with a secret `SITE_DISPATCH_PAT`
  that can write to this repo (*Contents: read and write* on `harshveers.github.io`):

  ```yaml
  # .github/workflows/notify-site.yml in harshveers/resume
  on: { push: { branches: [main], paths: [resume.tex] } }
  jobs:
    notify:
      runs-on: ubuntu-latest
      steps:
        - run: gh api repos/harshveers/harshveers.github.io/dispatches -f event_type=resume-updated
          env: { GH_TOKEN: '${{ secrets.SITE_DISPATCH_PAT }}' }
  ```

### 2. Feed items

Every entry on Home is one Markdown file, `src/content/items/<yyyy-mm-dd>-<slug>.md`. The schema is in
`src/content.config.ts`, and any violation fails the build:

| Field | Rule |
|---|---|
| `kind` | `linkedin` · `x` · `youtube` · `webinar` · `whitepaper` · `podcast` · `talk` · `article` · `essay` |
| `title` | text. For a LinkedIn post with no title, its first line |
| `date` | `YYYY-MM-DD`, and must match the file name |
| `url` | required for every kind except `essay`, and not allowed on essays |
| `excerpt` | 40–320 characters: the real first lines, never a paraphrase |
| `image` | optional, a file under `src/assets/items/` (never a remote URL) |
| `source_name` | optional, e.g. `Elucidata` → the pill reads "Elucidata webinar" |
| `tags` | optional. `archive` gives an item the low-prominence treatment (smaller title, no excerpt) |
| `featured` | optional boolean, default `false` |
| `legacy_path` | essays only: an old URL ending `.html` that should redirect to the essay |

**With the script** (needs Python 3.10+ and `pip install -r scripts/requirements.txt`):

```sh
python3 scripts/add_item.py https://www.youtube.com/watch?v=…
python3 scripts/add_item.py https://example.com/webinar --kind webinar --source-name Elucidata
python3 scripts/add_item.py <url> --dry-run      # print the file instead of writing it
```

It reads `og:title`, `og:description`, `og:image` and the published date (plus oEmbed and the
`i.ytimg.com` thumbnail for YouTube), downloads the image into `src/assets/items/` at most 1200px wide,
and writes the item. Anything it cannot find is written as `TODO` and the script exits 1. Fill those
in before building. It never makes up a date or an excerpt. If the page shows a date that isn't in its
metadata, pass it with `--date`.

**LinkedIn and X block these fetches.** For those URLs the script scaffolds the file from the URL alone.
The date is decoded from the post ID (both encode a timestamp), and you supply the rest:

```sh
python3 scripts/add_item.py "https://www.linkedin.com/posts/sharshveer_…-activity-…" \
  --title "First line of the post" --excerpt "The first two or three sentences, as written."
```

**By hand:** copy an existing item, rename it `<date>-<slug>.md` and edit the front matter.
An essay is the same with `kind: essay`, no `url`, and the text as the Markdown body. Put its images in
`src/assets/posts/<slug>/` and reference them relatively (`../../assets/posts/<slug>/1.png`) with
alt text.

### 3. Site copy

`src/data/site.yaml` holds the tagline, focus areas, short bio, social handles and headshot path.
A value of `TODO` is left off the site, and the build lists it as a warning. The headshot
(`src/assets/headshot.jpg`) is optional. When the file exists it appears on About as AVIF/WebP, as the
"Download headshot" link, and on the default Open Graph image.

## Running locally

Node 24 (see `.nvmrc`) and, for HTML validation only, Java 11+.

```sh
npm ci
npm run dev            # parses the resume, then http://localhost:4321
npm run build          # parse resume + build into dist/
npm run preview        # serve dist/
```

The resume is read from `$RESUME_PATH`, else `.resume/resume.tex`, else `../resume-latex/resume.tex`.
To build without the private repo: `RESUME_PATH=tests/fixtures/resume.tex npm run build`.

## Quality gates (CI runs all of these before deploying)

```sh
npm test               # resume parser unit tests (vitest)
npm run check          # astro check (types + content schema)
npm run check:links    # every internal link in dist/ resolves
npm run check:legacy   # every URL in tests/legacy-urls.txt resolves
npm run validate:html  # W3C Nu HTML Checker over dist/
npm run lighthouse     # performance, accessibility, SEO ≥ 0.95 on / and one essay
```

Each run uploads the built site, the legacy-URL report and the Lighthouse reports as the
`site-preview` artifact.

## When a build fails

Nothing is deployed, and the live site stays as it was. The failing step tells you where to look:

| Step | Usually means | Fix |
|---|---|---|
| Check out harshveers/resume / Choose the resume source | `SITE_PAT` missing or expired | renew the token, update the secret |
| Parse resume | `resume.tex` has a structure the parser doesn't know (the message gives the line) | adjust the `.tex`, or teach `scripts/parse-resume.mjs` the new shape and add a test |
| astro check / Build | an item breaks the schema or still has a `TODO` | fix the front matter named in the error |
| Internal links / Legacy URLs | a page links somewhere that doesn't exist, or an old URL lost its redirect | restore the page or add a `legacy_path` |
| Validate HTML | invalid markup in a template or an essay | fix the line reported |
| Lighthouse | a score fell below 0.95 | open the report in the `site-preview` artifact |
