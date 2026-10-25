#!/usr/bin/env python3
"""Scaffold a feed item in src/content/items/ from a URL.

    python3 scripts/add_item.py <url> [--kind K] [--date YYYY-MM-DD] [--title T] [--excerpt E]
                                      [--source-name S] [--dry-run]

Fetches og:title, og:description, og:image and the published date (article:published_time,
JSON-LD datePublished, itemprop=datePublished). YouTube also uses oEmbed and the i.ytimg.com
thumbnail. The image is downloaded into src/assets/items/ and resized to at most 1200px wide.

LinkedIn and X block fetches, so for those the file is scaffolded from the URL only: the date
is decoded from the post ID (both encode a timestamp), and the caller supplies --title/--excerpt.

Nothing is invented. A field it could not get is written as TODO and the script exits 1, so the
caller fills it in (the build fails until they do). --dry-run prints the file instead of writing.
Needs Pillow (pip install -r scripts/requirements.txt).
"""

from __future__ import annotations

import argparse
import html
import io
import json
import re
import ssl
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ITEMS = ROOT / "src" / "content" / "items"
IMAGES = ROOT / "src" / "assets" / "items"
KINDS = ["linkedin", "x", "youtube", "webinar", "whitepaper", "podcast", "talk", "article", "essay"]
TODO = "TODO"
UA = "Mozilla/5.0 (compatible; harshveer.me add_item; +https://harshveer.me)"
EXCERPT_MIN, EXCERPT_MAX = 40, 320
MAX_WIDTH = 1200


class Meta(HTMLParser):
    """Collects <meta> tags, JSON-LD blocks and <title>."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self.jsonld: list[str] = []
        self.title = ""
        self._in: str | None = None

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "meta":
            key = (a.get("property") or a.get("name") or a.get("itemprop") or "").lower()
            if key and "content" in a and key not in self.meta:
                self.meta[key] = a["content"].strip()
        elif tag == "script" and a.get("type") == "application/ld+json":
            self._in = "jsonld"
            self.jsonld.append("")
        elif tag == "title":
            self._in = "title"

    def handle_endtag(self, tag):
        if tag in ("script", "title"):
            self._in = None

    def handle_data(self, data):
        if self._in == "jsonld":
            self.jsonld[-1] += data
        elif self._in == "title":
            self.title += data


def _tls() -> ssl.SSLContext:
    # python.org's macOS builds ship without CA certificates; certifi fills the gap when installed.
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


TLS = _tls()


def fetch(url: str, accept: str = "text/html") -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    with urllib.request.urlopen(req, timeout=20, context=TLS) as resp:
        return resp.read()


def host_of(url: str) -> str:
    return (urllib.parse.urlparse(url).hostname or "").removeprefix("www.").removeprefix("m.")


def guess_kind(url: str) -> str | None:
    host = host_of(url)
    if host.endswith("linkedin.com"):
        return "linkedin"
    if host in ("x.com", "twitter.com", "mobile.twitter.com"):
        return "x"
    if host in ("youtube.com", "youtu.be", "music.youtube.com"):
        return "youtube"
    return None


def date_from_snowflake(url: str, kind: str) -> str | None:
    """LinkedIn activity IDs and X status IDs both encode their creation time."""
    if kind == "linkedin":
        m = re.search(r"(?:activity|share|ugcPost)[:-](\d{15,})", url)
        if m:
            ms = int(m.group(1)) >> 22  # first 41 bits: ms since the Unix epoch
            return datetime.fromtimestamp(ms / 1000, timezone.utc).date().isoformat()
    if kind == "x":
        m = re.search(r"/status(?:es)?/(\d{15,})", url)
        if m:
            ms = (int(m.group(1)) >> 22) + 1288834974657  # Twitter epoch
            return datetime.fromtimestamp(ms / 1000, timezone.utc).date().isoformat()
    return None


def slug_from_linkedin(url: str) -> str | None:
    # linkedin.com/posts/<user>_<first-words-of-the-post>-activity-<id>-<hash>
    m = re.search(r"/posts/[^_/]+_(.+?)-(?:activity|share|ugcpost)-\d", url, re.I)
    return m.group(1).lower() if m else None


def slugify(text: str, words: int = 8) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return "-".join(text.split("-")[:words]) or "item"


def iso_date(value: str) -> str | None:
    value = value.strip()
    m = re.match(r"(\d{4}-\d{2}-\d{2})", value)
    if m:
        return m.group(1)
    try:
        return datetime.strptime(value, "%b %d, %Y").date().isoformat()
    except ValueError:
        return None


def find_date(meta: Meta) -> str | None:
    for key in ("article:published_time", "og:published_time", "datepublished", "date", "publish_date", "uploaddate"):
        if meta.meta.get(key) and (d := iso_date(meta.meta[key])):
            return d
    for block in meta.jsonld:
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        stack = [data]
        while stack:
            node = stack.pop()
            if isinstance(node, list):
                stack.extend(node)
            elif isinstance(node, dict):
                for key in ("datePublished", "uploadDate", "startDate"):
                    if isinstance(node.get(key), str) and (d := iso_date(node[key])):
                        return d
                stack.extend(node.values())
    return None


def youtube_id(url: str) -> str | None:
    u = urllib.parse.urlparse(url)
    if u.hostname and u.hostname.endswith("youtu.be"):
        return u.path.strip("/").split("/")[0] or None
    q = urllib.parse.parse_qs(u.query).get("v")
    if q:
        return q[0]
    m = re.search(r"/(?:shorts|embed|live)/([\w-]{6,})", u.path)
    return m.group(1) if m else None


def fit_excerpt(text: str | None) -> str | None:
    """Trims a description to the schema's 320-character limit at a word boundary. Never pads."""
    if not text:
        return None
    text = re.sub(r"\s+", " ", html.unescape(text)).strip()
    if len(text) <= EXCERPT_MAX:
        return text
    cut = text[: EXCERPT_MAX - 1]
    sentence = cut.rfind(". ")
    if sentence >= EXCERPT_MIN:
        return cut[: sentence + 1]
    return cut[: cut.rfind(" ")].rstrip(",;:") + "…"


def save_image(image_url: str, stem: str, dry_run: bool) -> str | None:
    from PIL import Image  # imported here so --help works without Pillow

    data = fetch(image_url, accept="image/*")
    img = Image.open(io.BytesIO(data))
    img.load()
    if img.width > MAX_WIDTH:
        img = img.resize((MAX_WIDTH, round(img.height * MAX_WIDTH / img.width)), Image.LANCZOS)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    rel = f"src/assets/items/{stem}.jpg"
    if dry_run:
        print(f"[dry-run] would save {image_url} -> {rel} ({img.width}x{img.height})", file=sys.stderr)
    else:
        IMAGES.mkdir(parents=True, exist_ok=True)
        img.save(ROOT / rel, "JPEG", quality=85, optimize=True, progressive=True)
    return rel


def yaml_str(value: str) -> str:
    return value if value == TODO else json.dumps(value, ensure_ascii=False)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url")
    ap.add_argument("--kind", choices=KINDS)
    ap.add_argument("--date", help="YYYY-MM-DD (overrides what the page says)")
    ap.add_argument("--title")
    ap.add_argument("--excerpt", help=f"{EXCERPT_MIN}-{EXCERPT_MAX} characters, the real first lines")
    ap.add_argument("--source-name", help='e.g. "Elucidata" for an Elucidata webinar')
    ap.add_argument("--dry-run", action="store_true", help="print the file instead of writing it")
    args = ap.parse_args()

    url = args.url.strip()
    if not re.match(r"https?://", url):
        print("add_item: the url must start with http:// or https://", file=sys.stderr)
        return 2
    if args.date and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.date):
        print("add_item: --date must be YYYY-MM-DD", file=sys.stderr)
        return 2
    if args.kind == "essay":
        print("add_item: essays are written by hand in src/content/items/ (they have no url)", file=sys.stderr)
        return 2
    for existing in ITEMS.glob("*.md"):
        if re.search(rf"^url:\s*\"?{re.escape(url)}\"?\s*$", existing.read_text(encoding="utf-8"), re.M):
            print(f"add_item: {existing.relative_to(ROOT)} already has this url", file=sys.stderr)
            return 2

    kind = args.kind or guess_kind(url)
    title, excerpt, date, image_url, slug_hint = None, None, None, None, None
    notes: list[str] = []

    if kind in ("linkedin", "x"):
        # These block anonymous fetches: scaffold from the URL only.
        date = date_from_snowflake(url, kind)
        if date:
            notes.append(f"date {date} decoded from the post ID")
        slug_hint = slug_from_linkedin(url) if kind == "linkedin" else None
    else:
        try:
            meta = Meta()
            meta.feed(fetch(url).decode("utf-8", errors="replace"))
            title = meta.meta.get("og:title") or meta.meta.get("twitter:title") or meta.title.strip() or None
            excerpt = meta.meta.get("og:description") or meta.meta.get("description") or meta.meta.get("twitter:description")
            image_url = meta.meta.get("og:image") or meta.meta.get("twitter:image")
            date = find_date(meta)
        except Exception as exc:  # noqa: BLE001 - report and fall through to TODOs
            notes.append(f"could not fetch the page: {exc}")
        if kind == "youtube" and (vid := youtube_id(url)):
            try:
                oembed = json.loads(fetch(f"https://www.youtube.com/oembed?format=json&url={urllib.parse.quote(url, safe='')}", "application/json"))
                title = oembed.get("title") or title
            except Exception as exc:  # noqa: BLE001
                notes.append(f"YouTube oEmbed failed: {exc}")
            image_url = f"https://i.ytimg.com/vi/{vid}/maxresdefault.jpg"

    title = args.title or (html.unescape(title).strip() if title else None)
    excerpt = fit_excerpt(args.excerpt) if args.excerpt else fit_excerpt(excerpt)
    date = args.date or date

    slug = slugify(title) if title else (slug_hint and slugify(slug_hint)) or slugify(host_of(url))
    stem = f"{date}-{slug}" if date else f"{TODO}-{slug}"

    image_rel = None
    if image_url:
        image_url = urllib.parse.urljoin(url, image_url)
        try:
            image_rel = save_image(image_url, stem, args.dry_run)
        except Exception as exc:  # noqa: BLE001
            if kind == "youtube" and image_url.endswith("maxresdefault.jpg"):
                try:
                    image_rel = save_image(image_url.replace("maxresdefault", "hqdefault"), stem, args.dry_run)
                except Exception as exc2:  # noqa: BLE001
                    notes.append(f"could not download the image: {exc2}")
            else:
                notes.append(f"could not download the image: {exc}")

    todos = []
    if not kind:
        todos.append(f"kind (one of: {', '.join(k for k in KINDS if k != 'essay')})")
    if not title:
        todos.append("title" + (" (for LinkedIn: the post's first line)" if kind == "linkedin" else ""))
    if not date:
        todos.append("date, and the file name's date")
    if not excerpt:
        todos.append(f"excerpt ({EXCERPT_MIN}-{EXCERPT_MAX} characters, the post's real first lines)")
    elif len(excerpt) < EXCERPT_MIN:
        todos.append(f"excerpt is only {len(excerpt)} characters; the schema needs {EXCERPT_MIN}+")
    if kind in ("webinar", "whitepaper", "podcast", "talk") and not args.source_name:
        notes.append("consider --source-name (e.g. the host organisation) for the pill label")

    lines = [
        "---",
        f"kind: {kind or TODO}",
        f"title: {yaml_str(title or TODO)}",
        f"date: {date or TODO}",
        f"url: {yaml_str(url)}",
        f"excerpt: {yaml_str(excerpt or TODO)}",
    ]
    if image_rel:
        lines.append(f"image: {image_rel}")
    if args.source_name:
        lines.append(f"source_name: {yaml_str(args.source_name)}")
    lines += ["---", ""]
    text = "\n".join(lines)

    target = ITEMS / f"{stem}.md"
    if args.dry_run:
        print(f"# would write {target.relative_to(ROOT)}")
        print(text, end="")
    else:
        if target.exists():
            print(f"add_item: {target.relative_to(ROOT)} already exists", file=sys.stderr)
            return 2
        ITEMS.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
        print(f"wrote {target.relative_to(ROOT)}")

    for note in notes:
        print(f"note: {note}", file=sys.stderr)
    if todos:
        print("TODO, fill these in before building:", file=sys.stderr)
        for t in todos:
            print(f"  - {t}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
