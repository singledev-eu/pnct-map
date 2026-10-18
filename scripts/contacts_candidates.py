"""Candidate câmara contacts for curation (concelho card): one row per concelho, for a reviewer.

For each DICO (default: the PNCT concelhos not yet in data/contacts/camaras.csv, in DICO order):
  1. find the câmara's site: https://www.cm-<slug>.pt/ and https://cm-<slug>.pt/ for a few slugs of
     the name (with and without "a/da/de/do/dos/das", accents and hyphens removed), or SITES below;
  2. read the homepage and the usual contacts pages; on the JavaScript platform some câmaras use
     (only "Aguarde..." in the HTML), read the menu from /mapadosite, where it is escaped JSON;
  3. collect mailboxes on the site's domain, Portuguese phone numbers, and links whose text or URL
     mentions urbanismo / obras particulares / ordenamento / PDM / plano diretor / contactos.
Nothing is chosen here: the reviewer (kiro-cli first pass, then a human) opens the pages, picks the
generic mailbox and the page of the PDM in force, and writes data/contacts/camaras.csv.

Output: data/interim/contacts/<name>.csv (gitignored).
Usage: uv run python scripts/contacts_candidates.py --batch 1 --size 25
       uv run python scripts/contacts_candidates.py --dico 0104 0105 --name batch-02
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import re
import ssl
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pyogrio

ROOT = Path(__file__).resolve().parents[1]
CAOP_GPKG = ROOT / "data/external/CAOP_Continente_2025-gpkg/Continente_CAOP2025.gpkg"
TOPO = ROOT / "web/data/pnct.topo.json"
CONTACTS = ROOT / "data/contacts/camaras.csv"
OUT = ROOT / "data/interim/contacts"
UA = {"User-Agent": "Mozilla/5.0 (pnct-map contacts curation; +https://pnct.singledev.eu)"}
PARTICLES = {"a", "o", "da", "de", "do", "das", "dos", "e"}
CONTACT_PATHS = ["contactos", "contactos/", "municipio/contactos", "contactos.aspx", "pages/contactos"]
KEYWORDS = re.compile(r"urbanis|obras[- ]particulares|ordenamento|plano[- ]diretor|plano[- ]director|\bpdm\b|planeamento|contact", re.I)
# Sites whose domain isn't cm-<slug>.pt (filled in as curation finds them).
SITES: dict[str, str] = {}


def slugs(name: str) -> list[str]:
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower().replace("'", "")
    words = re.split(r"[\s-]+", plain)
    core = [w for w in words if w not in PARTICLES]
    out = ["".join(words), "".join(core), "-".join(words), "-".join(core), words[-1]]
    return list(dict.fromkeys(out))


def get(url: str, timeout: int = 20) -> tuple[str, str] | None:
    """(final URL, text) or None. Falls back to no TLS verification for incomplete chains."""
    for ctx in (None, ssl._create_unverified_context()):  # noqa: S323 (reading public pages only)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout, context=ctx) as r:
                return r.geturl(), r.read(3_000_000).decode("utf-8", errors="replace")
        except urllib.error.URLError as e:
            if ctx is None and isinstance(e.reason, ssl.SSLError):
                continue
            return None
        except (TimeoutError, ConnectionError, ValueError):
            return None
    return None


def find_site(dico: str, name: str) -> tuple[str, str] | None:
    if dico in SITES:
        page = get(SITES[dico])
        return (page[0], page[1]) if page else None
    for slug in slugs(name):
        for url in (f"https://www.cm-{slug}.pt/", f"https://cm-{slug}.pt/"):
            if page := get(url, timeout=15):
                return page
    return None


def join(base: str, href: str) -> str | None:
    """Absolute URL of href, or None if it doesn't parse (some sites have hrefs like "http://[...")."""
    try:
        url = urllib.parse.urljoin(base, href)
        urllib.parse.urlparse(url).hostname  # noqa: B018 (raises on a malformed netloc)
        return url
    except ValueError:
        return None


def links(base: str, text: str) -> list[tuple[str, str]]:
    found = []
    for href, label in re.findall(r'<a[^>]+href="([^"#][^"]*)"[^>]*>(.*?)</a>', text, re.S):
        label = re.sub(r"<[^>]+>|\s+", " ", html.unescape(label)).strip()
        if url := join(base, html.unescape(href)):
            found.append((label, url))
    # The JavaScript platform keeps its menu as escaped JSON: {\"title\":\"Urbanismo\",...,\"link\":\"/viver/urbanismo\"}
    unescaped = text.replace('\\"', '"').replace("\\/", "/")
    for label, href in re.findall(r'"title":"([^"]{2,80})"[^{}]*?"link":"(/[^"]*)"', unescaped):
        if url := join(base, href):
            found.append((label, url))
    return found


def candidates(dico: str, name: str) -> dict:
    row = {"dico": dico, "name": name, "website": "", "emails": "", "phones": "", "urbanism": "", "pdm": "", "contact_pages": "", "js_site": "", "notes": ""}
    site = find_site(dico, name)
    if not site:
        row["notes"] = f"site not found (tried cm-{{{','.join(slugs(name))}}}.pt); find it by hand"
        return row
    base, text = site
    host = urllib.parse.urlparse(base).hostname or ""
    domain = host.removeprefix("www.")
    row["website"] = f"https://{host}/"
    pages = [text]
    if "Aguarde" in text or "mapadosite" in text:
        row["js_site"] = "yes"
        if sm := get(urllib.parse.urljoin(base, "/mapadosite")):
            pages.append(sm[1])
    contact_pages = []
    for path in CONTACT_PATHS:
        if (p := get(urllib.parse.urljoin(base, path), timeout=15)) and p[0] not in contact_pages:
            contact_pages.append(p[0])
            pages.append(p[1])
    all_text = html.unescape("\n".join(pages))
    emails = sorted({m.lower() for m in re.findall(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", all_text) if m.lower().endswith("@" + domain) or m.lower().endswith("." + domain)})
    plain = re.sub(r"<[^>]+>", " ", all_text)
    phones = sorted({re.sub(r"\D", "", p)[-9:] for p in re.findall(r"(?:\+351\s?)?\b2\d{2}[\s.]?\d{3}[\s.]?\d{3}\b", plain)})
    found = {}
    for p in pages:
        for label, url in links(base, p):
            if KEYWORDS.search(label + " " + url) and urllib.parse.urlparse(url).hostname in (host, domain, "www." + domain):
                found.setdefault(url, label)
    is_pdm = lambda label, url: re.search(r"plano[- ]dire[c]?tor|\bpdm\b", f"{label} {url}", re.I)  # noqa: E731
    row["emails"] = "; ".join(emails)
    row["phones"] = "; ".join(f"+351 {p[:3]} {p[3:6]} {p[6:]}" for p in phones)
    row["pdm"] = " ;; ".join(f"{label} | {url}" for url, label in found.items() if is_pdm(label, url))
    row["urbanism"] = " ;; ".join(f"{label} | {url}" for url, label in found.items() if not is_pdm(label, url) and not re.search("contact", label + url, re.I))
    row["contact_pages"] = " ;; ".join(contact_pages + [f"{label} | {url}" for url, label in found.items() if re.search("contact", label + url, re.I)][:4])
    return row


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", type=int, default=1, help="1-based batch number over the remaining PNCT concelhos")
    ap.add_argument("--size", type=int, default=25)
    ap.add_argument("--dico", nargs="*", help="these DICOs instead of a batch")
    ap.add_argument("--name", help="output file name (default: batch-NN, or 'manual' with --dico)")
    a = ap.parse_args()
    caop = pyogrio.read_dataframe(CAOP_GPKG, layer="cont_municipios", read_geometry=False)
    names = dict(zip(caop.dtmn, caop.municipio))
    if a.dico:
        todo, out_name = a.dico, a.name or "manual"
    else:
        topo = json.loads(TOPO.read_text(encoding="utf-8"))
        pnct = sorted({g["properties"]["dicofre"][:4] for g in topo["objects"]["parishes"]["geometries"] if g["properties"]["pnct"]})
        with CONTACTS.open(newline="", encoding="utf-8") as f:
            done = {r["dico"] for r in csv.DictReader(f)}
        remaining = [d for d in pnct if d not in done]
        todo = remaining[: a.size]  # the batch is always the next `size` uncurated ones
        out_name = f"batch-{a.batch:02d}"
        print(f"{len(remaining)} PNCT concelhos left; this batch: {len(todo)}")
    with ThreadPoolExecutor(max_workers=8) as pool:
        rows = list(pool.map(lambda d: candidates(d, names[d]), todo))
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{out_name}.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    found = sum(bool(r["website"]) for r in rows)
    print(f"{path.relative_to(ROOT)}: {len(rows)} rows, site found for {found}, email for {sum(bool(r['emails']) for r in rows)}, PDM candidates for {sum(bool(r['pdm']) for r in rows)}")


if __name__ == "__main__":
    main()
