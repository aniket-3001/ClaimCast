"""
Download a declared public document and record what actually arrived.

The whole point of this file is the verification, not the download. Government
portals answer a request for a missing PDF with HTTP 200 and an HTML error page
-- nha.gov.in does exactly this for HBP-2.2-manual.pdf, returning 3.8 KB of
markup under a .pdf URL -- and an ETL that wrote that to disk and moved on would
produce a source row with a checksum, a fetch date and nothing behind it. That
is worse than having no row at all, because it looks like provenance.

So a download is accepted only if the bytes are the kind of file that was
declared and there are enough of them to be the document rather than an error
page. Everything accepted lands in etl/raw/, which is gitignored because these
files are large and re-downloadable, and its SHA-256 goes into manifest.json,
which is tracked because it is the only record of which exact file a rate came
from.

    python -m etl.fetch            # everything declared
    python -m etl.fetch nha-hbp    # one source
"""

from __future__ import annotations

import hashlib
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
MANIFEST = ROOT / "manifest.json"

# Some of these portals are slow enough that the default would give up on a
# working server, and a few are large.
TIMEOUT = 120

# Certificate verification is never turned off here. What is allowed is a second
# attempt against a wider trust store: several of these hosts present chains that
# certifi does not carry but the operating system does, and hem.nha.gov.in is one
# of them. A file fetched that way is still authenticated, just against a
# different root set, and the manifest records which one so the difference is
# visible rather than assumed. A host whose chain neither store accepts does not
# get downloaded, and its source keeps its caveat.
SYSTEM_BUNDLES = [
    Path("C:/Program Files/Git/usr/ssl/certs/ca-bundle.crt"),
    Path("/etc/ssl/certs/ca-certificates.crt"),
    Path("/etc/pki/tls/certs/ca-bundle.crt"),
]

# A plain requests user-agent gets refused by more than one of these sites.
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
    ),
    "Accept": "*/*",
}

# What the first bytes of a file have to look like for us to believe its
# declared kind. Content-Type headers from these portals are not reliable --
# the same server returns application/pdf for HTML and text/html for PDFs --
# so the file itself is what gets checked.
MAGIC = {
    "pdf": (b"%PDF-",),
    "xlsx": (b"PK\x03\x04",),
    "zip": (b"PK\x03\x04",),
    "csv": (),  # no signature; size and a delimiter check is all there is
    "html": (),
}


class NotTheDocument(Exception):
    """What came back was reachable but is not the file that was declared."""


@dataclass(frozen=True)
class Download:
    """One file we claim to have, and how to tell whether we really do."""

    key: str
    """Stable name for this file inside its source, e.g. "hbp-2.2-master"."""

    source_id: str
    """The Source row in the database this file backs."""

    url: str
    kind: str
    """pdf | xlsx | zip | csv | html."""

    min_bytes: int
    """Below this, it is an error page or a stub. Set it from the real file."""

    note: str = ""
    """Why this particular file, where more than one candidate exists."""


def _manifest() -> dict:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text(encoding="utf-8"))
    return {}


def _write_manifest(m: dict) -> None:
    MANIFEST.write_text(
        json.dumps(m, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def path_for(d: Download) -> Path:
    return RAW / d.source_id / (d.key + "." + d.kind)


def verify(body: bytes, d: Download) -> None:
    if len(body) < d.min_bytes:
        raise NotTheDocument(
            "got " + str(len(body)) + " bytes, expected at least " + str(d.min_bytes)
            + " -- this is an error page, not the document"
        )
    signatures = MAGIC.get(d.kind, ())
    if signatures and not any(body.startswith(s) for s in signatures):
        head = body[:80].decode("utf-8", "replace").strip().replace("\n", " ")
        raise NotTheDocument(
            "declared " + d.kind + " but the file does not start like one: " + head
        )


def _get(url: str) -> tuple[requests.Response, str]:
    """GET with certifi, and on a chain failure once more with the system roots."""
    try:
        res = requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        res.raise_for_status()
        return res, "certifi"
    except requests.exceptions.SSLError:
        bundle = next((p for p in SYSTEM_BUNDLES if p.exists()), None)
        if bundle is None:
            raise
        print("        certifi rejected the chain, retrying against the system roots")
        res = requests.get(
            url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True, verify=str(bundle)
        )
        res.raise_for_status()
        return res, "system:" + bundle.name


def fetch(d: Download, force: bool = False) -> dict:
    """Download one declared file, verify it, record it. Returns its manifest entry."""
    m = _manifest()
    dest = path_for(d)
    if dest.exists() and d.key in m.get(d.source_id, {}) and not force:
        print("  have  " + d.source_id + "/" + d.key)
        return m[d.source_id][d.key]

    print("  get   " + d.url)
    res, trust = _get(d.url)
    body = res.content
    verify(body, d)

    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(body)

    entry = {
        "url": d.url,
        "finalUrl": res.url,
        "file": str(dest.relative_to(ROOT)).replace("\\", "/"),
        "sha256": hashlib.sha256(body).hexdigest(),
        "bytes": len(body),
        "contentType": res.headers.get("content-type", ""),
        "trustStore": trust,
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    if d.note:
        entry["note"] = d.note

    m.setdefault(d.source_id, {})[d.key] = entry
    _write_manifest(m)
    print("  ok    " + dest.name + "  " + f"{len(body):,}" + " bytes  " + entry["sha256"][:16])
    return entry


def checksum(source_id: str, key: str) -> str | None:
    """The recorded SHA-256 for a file, or None if it was never successfully fetched."""
    entry = _manifest().get(source_id, {}).get(key)
    return entry["sha256"] if entry else None


def main(argv: list[str]) -> int:
    from etl.sources import DOWNLOADS

    wanted = argv[1:]
    todo = [d for d in DOWNLOADS if not wanted or d.source_id in wanted or d.key in wanted]
    if not todo:
        print("nothing matches " + " ".join(wanted))
        return 1

    failed: list[tuple[Download, str]] = []
    for d in todo:
        print(d.source_id + " / " + d.key)
        try:
            fetch(d)
        except (requests.RequestException, NotTheDocument) as e:
            print("  FAIL  " + str(e))
            failed.append((d, str(e)))

    print("")
    if failed:
        # Not an error worth stopping the pipeline for. A source whose file we
        # could not get keeps its caveat and its figures stay labelled, which
        # is the honest outcome and the one the rest of the system expects.
        print(str(len(failed)) + " of " + str(len(todo)) + " could not be fetched:")
        for d, why in failed:
            print("  " + d.source_id + "/" + d.key + ": " + why)
        print("Those sources keep their caveat.")
    else:
        print("all " + str(len(todo)) + " files fetched and verified")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
