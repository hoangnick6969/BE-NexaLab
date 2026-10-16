#!/usr/bin/env python3
"""Bounded connector for the explicitly authorized public NXBGD KHTN 8 reader."""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import unicodedata
from pathlib import Path
from typing import Any

try:
    import truststore
except ImportError:  # fixture mode does not need TLS dependencies
    truststore = None  # type: ignore[assignment]

ALLOWED_HOST = "taphuan.nxbgd.vn"
ALLOWED_PREFIXES = ("/tap-huan/", "/storage/upload/taphuan/")
USER_AGENT = "NexaLabIngest/0.1 (+https://nexalab.local/source-policy)"
CHALLENGE = re.compile(r"captcha|verify you are human|cloudflare ray id|bot detection", re.I)
READER_LINK = re.compile(r'''(?:href|src)=["']([^"']*/tap-huan/doc-sach/[^"']+)["']''', re.I)
EXTERNAL_REF = re.compile(r'''(?:href|src)=["'](https?://[^"']+)["']''', re.I)


def die(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def confined(root: Path, candidate: Path) -> Path:
    root = root.resolve()
    candidate = candidate.resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        die(f"Path escapes configured output root: {candidate}")
    return candidate


def assert_allowed_url(value: str) -> str:
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != "https" or (parsed.hostname or "").lower() != ALLOWED_HOST:
        die(f"External or non-HTTPS acquisition URL rejected: {value}")
    if not (parsed.path.startswith(ALLOWED_PREFIXES) or parsed.path == "/robots.txt"):
        die(f"Path outside authorized NXBGD collection scope: {parsed.path}")
    if parsed.query or parsed.fragment:
        die(f"Query/fragment not allowlisted for authorized collection: {value}")
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc.lower(), parsed.path, "", ""))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> None:
        return None


class Client:
    def __init__(self, fixture_map: dict[str, Any] | None, timeout: float, retries: int, rpm: int, max_bytes: int) -> None:
        self.fixture_map = fixture_map
        self.timeout = timeout
        self.retries = retries
        self.interval = 60.0 / rpm
        self.max_bytes = max_bytes
        self.last_fetch = 0.0
        if fixture_map is None:
            if truststore is None:
                raise SystemExit("Missing truststore. Install python/requirements.txt in the dedicated virtualenv.")
            tls_context = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            tls_context.check_hostname = True
            tls_context.verify_mode = ssl.CERT_REQUIRED
            self.opener = urllib.request.build_opener(NoRedirect, urllib.request.HTTPSHandler(context=tls_context))
        else:
            self.opener = urllib.request.build_opener(NoRedirect)

    def fetch(self, url: str, expected: set[str]) -> tuple[bytes, str]:
        assert_allowed_url(url)
        if self.fixture_map is not None:
            if url not in self.fixture_map:
                die(f"Missing offline fixture for {url}")
            entry = self.fixture_map[url]
            status = int(entry.get("status", 200))
            if 300 <= status < 400:
                die(f"Redirect blocked for {url}: {entry.get('location', '')}")
            if status == 401:
                die(f"Authentication/access control encountered for {url}")
            if status in (403, 429):
                for attempt in range(self.retries + 1):
                    if attempt == self.retries:
                        die(f"Repeated HTTP {status} for {url} after {attempt + 1} consecutive attempts")
            body = Path(entry["path"]).read_bytes()
            content_type = str(entry.get("contentType", "application/octet-stream")).split(";", 1)[0]
            return self._validate(url, body, content_type, expected)

        for attempt in range(self.retries + 1):
            wait = self.interval - (time.monotonic() - self.last_fetch)
            if wait > 0:
                time.sleep(wait)
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": ", ".join(sorted(expected))})
            try:
                self.last_fetch = time.monotonic()
                with self.opener.open(request, timeout=self.timeout) as response:
                    content_type = response.headers.get_content_type()
                    declared = int(response.headers.get("Content-Length", "0") or "0")
                    if declared > self.max_bytes:
                        die(f"Declared content exceeds cap for {url}")
                    body = response.read(self.max_bytes + 1)
                    return self._validate(url, body, content_type, expected)
            except urllib.error.HTTPError as exc:
                if 300 <= exc.code < 400:
                    die(f"Redirect blocked for {url}: {exc.headers.get('Location', '')}")
                if exc.code == 401:
                    die(f"Authentication/access control encountered for {url}")
                if exc.code in (403, 429) and attempt < self.retries:
                    time.sleep(min(2 ** attempt, 4))
                    continue
                if exc.code in (403, 429):
                    die(f"Repeated HTTP {exc.code} for {url} after {attempt + 1} consecutive attempts")
                die(f"HTTP {exc.code} for {url}")
            except urllib.error.URLError as exc:
                if attempt == self.retries:
                    die(f"Network failure for {url}: {exc.reason}")
                time.sleep(min(2 ** attempt, 4))
        die(f"Fetch retry exhausted for {url}")

    def _validate(self, url: str, body: bytes, content_type: str, expected: set[str]) -> tuple[bytes, str]:
        if len(body) > self.max_bytes:
            die(f"Content exceeds cap for {url}")
        if content_type not in expected:
            die(f"MIME mismatch for {url}: {content_type}")
        if content_type == "text/html" and CHALLENGE.search(body[:16384].decode("utf-8", "ignore")):
            die(f"Bot challenge detected for {url}")
        return body, content_type


def extract_balanced_array(source: str, field: str) -> list[str]:
    match = re.search(rf'''["']?{re.escape(field)}["']?\s*:\s*\[''', source)
    if not match:
        die(f"Malformed reader data: missing {field}")
    start = source.find("[", match.start())
    depth, quote, escaped = 0, None, False
    for index in range(start, len(source)):
        char = source[index]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
        elif char in "\"'":
            quote = char
        elif char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                raw = source[start:index + 1]
                try:
                    value = json.loads(raw)
                except json.JSONDecodeError:
                    value = re.findall(r'''["']([^"']+)["']''', raw)
                if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
                    die(f"Malformed reader data: invalid {field}")
                return value
    die(f"Malformed reader data: unterminated {field}")


def extract_reader(reader_html: str, reader_url: str) -> tuple[int, list[str], list[dict[str, str]]]:
    if "TRAINING_READER.init" not in reader_html:
        die("Malformed reader data: TRAINING_READER.init not found")
    total_match = re.search(r'''["']?totalPages["']?\s*:\s*(\d+)''', reader_html)
    if not total_match:
        die("Malformed reader data: totalPages not found")
    total_pages = int(total_match.group(1))
    pages = [urllib.parse.urljoin(reader_url, html.unescape(value).replace("\\/", "/")) for value in extract_balanced_array(reader_html, "download_book_pages_urls")]
    if total_pages != len(pages):
        die(f"Malformed reader data: totalPages={total_pages}, page URLs={len(pages)}")
    references: list[dict[str, str]] = []
    seen: set[str] = set()
    for raw in EXTERNAL_REF.findall(reader_html):
        url = html.unescape(raw)
        host = (urllib.parse.urlsplit(url).hostname or "").lower()
        if host != ALLOWED_HOST and url not in seen:
            kind = classify_reference(url)
            references.append({"kind": kind, "url": url, "downloaded": False})
            seen.add(url)
    return total_pages, pages, references


def external_references(*documents: str) -> list[dict[str, str]]:
    references: list[dict[str, str]] = []
    seen: set[str] = set()
    for document in documents:
        for raw in EXTERNAL_REF.findall(document):
            url = html.unescape(raw)
            host = (urllib.parse.urlsplit(url).hostname or "").lower()
            if host != ALLOWED_HOST and url not in seen:
                kind = classify_reference(url)
                references.append({"kind": kind, "url": url, "downloaded": False})
                seen.add(url)
    return references


def classify_reference(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    host = (parsed.hostname or "").lower()
    path = parsed.path.lower()
    if host.endswith("youtube.com") or host == "youtu.be" or host.endswith("vimeo.com"):
        return "VIDEO_REF"
    if "presentation" in path or host in {"docs.google.com", "slides.google.com"} or path.endswith((".ppt", ".pptx")):
        return "SLIDE_REF"
    return "EXTERNAL_REF"


def maybe_ocr(path: Path) -> tuple[str | None, str]:
    try:
        import pytesseract  # type: ignore
        from PIL import Image  # type: ignore
        return pytesseract.image_to_string(Image.open(path), lang="vie+eng"), "COMPLETED"
    except ImportError:
        return None, "UNAVAILABLE"
    except Exception as exc:
        return None, f"FAILED:{type(exc).__name__}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--detail-url")
    parser.add_argument("--reader-url", help="Direct same-host reader URL; skips detail-page discovery")
    parser.add_argument("--out", required=True)
    parser.add_argument("--authorization-file", required=True)
    parser.add_argument("--run-id")
    parser.add_argument("--max-pages", type=int, default=220)
    parser.add_argument("--max-bytes", type=int, default=15_000_000)
    parser.add_argument("--max-total-bytes", type=int, default=1_000_000_000)
    parser.add_argument("--timeout", type=float, default=15.0)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--rate-per-minute", type=int, default=6)
    parser.add_argument("--ocr", action="store_true")
    parser.add_argument("--fixture-map", help="Offline test fixture map; never used for live acquisition")
    args = parser.parse_args()
    if not (1 <= args.max_pages <= 500) or args.max_bytes <= 0 or args.max_total_bytes <= 0 or not (0 <= args.retries <= 2) or not (0 < args.timeout <= 15):
        die("Invalid acquisition caps")

    if not args.detail_url and not args.reader_url:
        die("Provide --detail-url or --reader-url")
    detail_url = assert_allowed_url(args.detail_url) if args.detail_url else None
    direct_reader_url = assert_allowed_url(args.reader_url) if args.reader_url else None
    authorization_path = Path(args.authorization_file).resolve()
    authorization_bytes = authorization_path.read_bytes()
    authorization = json.loads(authorization_bytes)
    if authorization.get("assertion") != "CUSTOM-AUTHORIZATION" or authorization.get("scope") != "NXBGD-KHTN8" or not authorization.get("reference") or not authorization.get("recordedAt"):
        die("Missing or invalid CUSTOM-AUTHORIZATION assertion for NXBGD-KHTN8")

    fixture_map = json.loads(Path(args.fixture_map).read_text("utf-8")) if args.fixture_map else None
    client = Client(fixture_map, args.timeout, args.retries, args.rate_per_minute, args.max_bytes)
    robots_url = f"https://{ALLOWED_HOST}/robots.txt"
    robots_body, _ = client.fetch(robots_url, {"text/plain"})
    robots = urllib.robotparser.RobotFileParser()
    robots.set_url(robots_url)
    robots.parse(robots_body.decode("utf-8", "replace").splitlines())
    if detail_url and not robots.can_fetch(USER_AGENT, detail_url):
        die("robots.txt disallows the authorized detail URL")
    output_root = Path(args.out).resolve()
    run_id = args.run_id or f"nxbgd-khtn8-{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}"
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{1,127}", run_id):
        die("Unsafe run ID")
    run_dir = confined(output_root, output_root / run_id)
    run_dir.mkdir(parents=True, exist_ok=False)
    snapshots = confined(run_dir, run_dir / "snapshots")
    assets = confined(run_dir, run_dir / "assets")
    snapshots.mkdir(); assets.mkdir()

    detail_body = b""
    detail_text = ""
    if detail_url:
        detail_body, _ = client.fetch(detail_url, {"text/html"})
        detail_text = detail_body.decode("utf-8", "replace")
    title = re.search(r"<title[^>]*>(.*?)</title>", detail_text, re.I | re.S)
    title_text = re.sub(r"\s+", " ", html.unescape(title.group(1))).strip() if title else ""
    heading_text = " ".join(re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", value))).strip() for value in re.findall(r"<h[1-3]\b[^>]*>(.*?)</h[1-3]>", detail_text, re.I | re.S))
    visible_source = re.sub(r"<script\b[^>]*>.*?</script>|<style\b[^>]*>.*?</style>", " ", detail_text, flags=re.I | re.S)
    visible_text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", visible_source))).strip()
    label_pattern = r"(?:Khoa\s*học\s*tự\s*nhiên|KHTN)\s*(?:lớp\s*)?(\d+)"
    primary_evidence = f"{title_text} {heading_text}".strip()
    primary_match = re.search(label_pattern, primary_evidence, re.I)
    visible_grades = [int(value) for value in re.findall(label_pattern, visible_text, re.I)]
    if detail_url and ((primary_match and int(primary_match.group(1)) != 8) or (not primary_match and (8 not in visible_grades or any(grade != 8 for grade in visible_grades)))):
        die("Detail page is not the authorized KHTN 8 collection")
    collection_label = primary_match.group(0) if primary_match else "KHTN 8"
    reader_match = READER_LINK.search(detail_text) if detail_url else None
    if direct_reader_url:
        reader_url = direct_reader_url
    elif reader_match and detail_url:
        reader_url = assert_allowed_url(urllib.parse.urljoin(detail_url, html.unescape(reader_match.group(1))))
    else:
        die("Authorized detail page does not expose a same-host reader link")
    if not robots.can_fetch(USER_AGENT, reader_url):
        die("robots.txt disallows the reader URL")
    reader_body, _ = client.fetch(reader_url, {"text/html"})
    reader_text = reader_body.decode("utf-8", "replace")
    total_pages, page_urls, _ = extract_reader(reader_text, reader_url)
    references = external_references(detail_text, reader_text)
    if total_pages > args.max_pages:
        die(f"Reader page cap exceeded: {total_pages} > {args.max_pages}")

    if detail_body:
        (snapshots / "detail.html").write_bytes(detail_body)
    (snapshots / "reader.html").write_bytes(reader_body)
    manifest_assets: list[dict[str, Any]] = []
    normalized_sections: list[dict[str, Any]] = []
    normalized_warnings: set[str] = set()
    pages_digest = hashlib.sha256()
    total_bytes = len(detail_body) + len(reader_body)
    for page_number, page_url in enumerate(page_urls, start=1):
        page_url = assert_allowed_url(page_url)
        if not robots.can_fetch(USER_AGENT, page_url):
            die(f"robots.txt disallows page asset {page_number}")
        body, mime = client.fetch(page_url, {"image/png", "image/jpeg"})
        pages_digest.update(body)
        total_bytes += len(body)
        if total_bytes > args.max_total_bytes:
            die("Run total-byte cap exceeded")
        extension = ".png" if mime == "image/png" else ".jpg"
        local = confined(run_dir, assets / f"page-{page_number:04d}{extension}")
        local.write_bytes(body)
        ocr_text, ocr_status = maybe_ocr(local) if args.ocr else (None, "NOT_REQUESTED")
        manifest_assets.append({"page": page_number, "sourceUrl": page_url, "localKey": local.relative_to(run_dir).as_posix(), "mime": mime, "bytes": len(body), "sha256": digest(body), "ocrStatus": ocr_status, "ocrText": ocr_text})
        if ocr_text:
            normalized_text = unicodedata.normalize("NFC", ocr_text)
            normalized_sections.append({
                "id": f"section-page-{page_number:04d}-ocr",
                "locator": {"type": "PDF_PAGE", "value": f"page:{page_number}:ocr"},
                "heading": None,
                "text": normalized_text,
                "sourcePreserved": False,
                "stats": {"characters": len(normalized_text), "words": len(normalized_text.split())},
                "humanCheck": {"required": True, "reasons": ["OCR_USED"]},
            })
        elif ocr_status == "UNAVAILABLE":
            normalized_warnings.add("OCR_UNAVAILABLE")
        elif ocr_status.startswith("FAILED:"):
            normalized_warnings.add("OCR_FAILED")
        else:
            normalized_warnings.add("OCR_NOT_REQUESTED")

    if not normalized_sections:
        normalized_warnings.add("EMPTY_EXTRACTION")
    sections_document = {
        "schemaVersion": 1,
        "kind": "NXBGD_PAGE_SECTIONS",
        "sourceSha256": pages_digest.hexdigest(),
        "sections": normalized_sections,
        "stats": {
            "sections": len(normalized_sections),
            "characters": sum(section["stats"]["characters"] for section in normalized_sections),
            "words": sum(section["stats"]["words"] for section in normalized_sections),
        },
        "humanCheckRequired": bool(normalized_sections or normalized_warnings),
        "warnings": sorted(normalized_warnings),
    }
    normalized_dir = confined(run_dir, run_dir / "normalized")
    normalized_dir.mkdir()
    sections_bytes = stable_json(sections_document).encode("utf-8")
    sections_path = confined(run_dir, normalized_dir / "sections.json")
    sections_path.write_bytes(sections_bytes)

    snapshots_manifest = [{"localKey": "snapshots/reader.html", "sha256": digest(reader_body)}]
    if detail_body:
        snapshots_manifest.insert(0, {"localKey": "snapshots/detail.html", "sha256": digest(detail_body)})
    manifest = {
        "schemaVersion": 1,
        "kind": "NXBGD_KHTN8_REVIEW_MANIFEST",
        "runId": run_id,
        "sourceKey": "nxbgd-khtn8-authorized",
        "canonicalDetailUrl": detail_url,
        "readerUrl": reader_url,
        "title": title_text or None,
        "collectionLabel": collection_label,
        "authorization": {"assertion": "CUSTOM-AUTHORIZATION", "scope": "NXBGD-KHTN8", "reference": authorization["reference"], "recordedAt": authorization["recordedAt"], "evidenceSha256": digest(authorization_bytes)},
        "snapshots": snapshots_manifest,
        "totalPages": total_pages,
        "assets": manifest_assets,
        "normalizedSections": {"localKey": "normalized/sections.json", "sha256": digest(sections_bytes)},
        "externalReferences": references,
        "status": "NEEDS_REVIEW",
        "releaseEligible": False,
        "published": False,
        "localKeysAreUploaded": False,
    }
    (run_dir / "manifest.json").write_text(stable_json(manifest), "utf-8")
    sys.stdout.write(str(run_dir) + "\n")


if __name__ == "__main__":
    main()
