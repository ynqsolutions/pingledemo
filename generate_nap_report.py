#!/usr/bin/env python3
"""
NAP (Name, Address, Phone) consistency scan of this site's own pages.

Reads content/nap.json (the source of truth), scans every top-level .html
file, and writes admin/nap-report.json for the admin's "NAP Checker" page.
Pure text matching: no external services and no AI. Runs on every Netlify
deploy (see netlify.toml), so the report always reflects the live pages.

Checks:
  - phone numbers in visible text, tel: links and JSON-LD telephone
  - business name variants (accepted brand names vs. known wrong ones)
  - street addresses that differ from the source of truth
  - JSON-LD (LegalService / Organization) completeness: name, url, telephone,
    address, sameAs
"""
import glob
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from html import unescape

CONFIG = "content/nap.json"
OUTPUT = "admin/nap-report.json"
NOINDEX_RE = re.compile(r'<meta\s+name="robots"\s+content="[^"]*noindex[^"]*"', re.I)
SCRIPT_RE = re.compile(r"<(script|style|noscript)\b.*?</\1>", re.I | re.S)
TAG_RE = re.compile(r"<[^>]+>")
JSONLD_RE = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)
PHONE_RE = re.compile(r"(?<!\d)(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(?!\d)")
STREET_RE = re.compile(
    r"\b((?!(?:19|20)\d\d\b)\d{3,5}\s+(?:[NSEW]\.?\s+)?[A-Z][A-Za-z.']+(?:\s+[A-Z][A-Za-z.']+)?\s+"
    r"(?:Ave(?:nue)?|St(?:reet)?|Blvd|Boulevard|Rd|Road|Dr(?:ive)?|Way|Pkwy|Parkway|Ln|Lane)\.?"
    r"(?:\s*(?:,\s*)?(?:Suite|Ste\.?|Unit|#)\s*[\w-]+)?"
    r"(?:\s*,\s*[A-Z][A-Za-z. ]+,\s*(?:CA|California)\s*\d{5})?)"
)


def digits(s):
    d = re.sub(r"\D", "", s or "")
    return d[1:] if len(d) == 11 and d.startswith("1") else d


def pretty_phone(d):
    return "(%s) %s-%s" % (d[:3], d[3:6], d[6:]) if len(d) == 10 else d


def norm_addr(s):
    s = s.lower()
    s = re.sub(r"[.,]", " ", s)
    for a, b in ((r"\bavenue\b", "ave"), (r"\bstreet\b", "st"), (r"\bboulevard\b", "blvd"), (r"\bsuite\b", "#"), (r"\bste\b", "#"), (r"\bunit\b", "#"), (r"\bcalifornia\b", "ca")):
        s = re.sub(a, b, s)
    s = re.sub(r"#\s*", "#", s)
    return re.sub(r"\s+", " ", s).strip()


REVIEW_RE = re.compile(r'<(p|div|blockquote|q|span)\b[^>]*class="[^"]*(?:rr-text|testimonial|review-text|quote)[^"]*"[^>]*>.*?</\1>', re.I | re.S)
ATTR_RE = re.compile(r'(?:<title>(.*?)</title>|<meta[^>]+(?:name="description"|property="og:(?:title|description|site_name)")[^>]*content="([^"]*)"|\balt="([^"]*)")', re.I | re.S)


def visible_text(html):
    html = REVIEW_RE.sub(" ", html)
    extra = " ".join(unescape(x) for m in ATTR_RE.findall(html) for x in m if x)
    body = SCRIPT_RE.sub(" ", html)
    body = TAG_RE.sub(" ", body)
    return re.sub(r"\s+", " ", unescape(body) + " " + extra)


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    cfg = json.load(open(CONFIG, encoding="utf-8"))
    canon_phone = digits(cfg["phone"])
    a = cfg["address"]
    canon_street = norm_addr(a["street"])
    canon_full = "%s %s, %s, %s %s" % (a["street"], a["suite"], a["city"], a["state"], a["zip"])
    flag_res = [(re.compile(f["pattern"]), f) for f in cfg.get("flagNames", [])]
    official = cfg["name"]

    pages = sorted(glob.glob("*.html"))
    phones = defaultdict(set)     # digits -> pages
    phone_src = defaultdict(set)  # digits -> {text, tel, schema}
    names = Counter(); name_pages = defaultdict(set)
    addrs = defaultdict(set)
    pages_with_phone, pages_with_name, pages_with_addr = set(), set(), set()
    schema = {"pages": 0, "name": 0, "url": 0, "telephone": 0, "address": 0, "sameAs": 0}
    schema_pages = {}
    indexable = 0

    for f in pages:
        try:
            html = open(f, encoding="utf-8").read()
        except (OSError, UnicodeDecodeError):
            continue
        if NOINDEX_RE.search(html):
            continue
        indexable += 1
        text = visible_text(html)

        found = set()
        for m in PHONE_RE.finditer(text):
            found.add(m.group(1) + m.group(2) + m.group(3))
        for m in re.finditer(r'href="tel:([^"]+)"', html):
            d = digits(m.group(1))
            if d:
                found.add(d); phone_src[d].add("tel link")
        for d in found:
            phones[d].add(f); phone_src[d].add("page text")
        if found:
            pages_with_phone.add(f)

        for label in cfg.get("acceptedNames", []):
            if label in text:
                names[("ok", label)] += 1; name_pages[("ok", label)].add(f)
        for rx, fl in flag_res:
            if rx.search(text):
                names[("bad", fl["label"])] += 1; name_pages[("bad", fl["label"])].add(f)
        if official in text:
            pages_with_name.add(f)

        for m in STREET_RE.finditer(text):
            raw = m.group(1).strip().rstrip(",")
            addrs[raw].add(f)
            pages_with_addr.add(f)

        has_ls = False
        got = {"name": False, "url": False, "telephone": False, "address": False, "sameAs": False}
        for blob in JSONLD_RE.findall(html):
            try:
                data = json.loads(blob)
            except ValueError:
                continue
            def walk(o):
                nonlocal has_ls
                if isinstance(o, dict):
                    t = o.get("@type")
                    ts = t if isinstance(t, list) else [t]
                    if any(x in ("LegalService", "LocalBusiness", "Attorney") for x in ts):
                        has_ls = True
                        for k in got:
                            if o.get(k):
                                got[k] = True
                        if o.get("telephone"):
                            d = digits(o["telephone"]); phones[d].add(f); phone_src[d].add("schema")
                    for v in o.values():
                        walk(v)
                elif isinstance(o, list):
                    for v in o:
                        walk(v)
            walk(data)
        if has_ls:
            schema["pages"] += 1
            schema_pages[f] = got
            for k, v in got.items():
                if v:
                    schema[k] += 1

    issues = []
    # phones
    for d, pg in sorted(phones.items(), key=lambda kv: -len(kv[1])):
        if d != canon_phone:
            issues.append({"id": "phone-" + d, "severity": "high", "type": "Phone", "title": "Different phone number: %s" % pretty_phone(d),
                           "found": pretty_phone(d), "expected": cfg["phone"], "pages": sorted(pg),
                           "fix": "Replace with %s, or confirm it is a real second line." % cfg["phone"]})
    # names
    for (kind, label), cnt in names.items():
        if kind == "bad":
            fl = next(x for x in cfg["flagNames"] if x["label"] == label)
            issues.append({"id": "name-" + re.sub(r"\W+", "-", label.lower()), "severity": "medium", "type": "Name", "title": "Name variant on %d page%s: %s" % (cnt, "" if cnt == 1 else "s", label),
                           "found": label, "expected": fl["fix"], "pages": sorted(name_pages[(kind, label)]),
                           "fix": "Use “%s” everywhere the firm is named." % fl["fix"]})
    # addresses
    for raw, pg in sorted(addrs.items(), key=lambda kv: -len(kv[1])):
        if canon_street not in norm_addr(raw):
            issues.append({"id": "addr-" + re.sub(r"\W+", "-", raw.lower())[:40], "severity": "high", "type": "Address", "title": "Different street address: %s" % raw,
                           "found": raw, "expected": canon_full, "pages": sorted(pg),
                           "fix": "Use %s." % canon_full})
        elif not re.search(re.escape(a["zip"]), raw) and re.search(r"\bCA\b|California", raw):
            issues.append({"id": "zip-" + re.sub(r"\W+", "-", raw.lower())[:40], "severity": "medium", "type": "Address", "title": "Address with a different ZIP: %s" % raw,
                           "found": raw, "expected": canon_full, "pages": sorted(pg), "fix": "Use ZIP %s." % a["zip"]})
    # schema
    gap = lambda key: sorted(p for p, g in schema_pages.items() if not g[key])
    for key, label, exp in (("telephone", "telephone", cfg["phone"]), ("address", "address", canon_full), ("url", "url", cfg.get("website", ""))):
        pg = gap(key)
        if pg:
            issues.append({"id": "schema-" + key, "severity": "high" if key != "url" else "medium", "type": "Schema",
                           "title": "LegalService structured data has no %s (%d page%s)" % (label, len(pg), "" if len(pg) == 1 else "s"),
                           "found": "no " + label, "expected": exp, "pages": pg,
                           "fix": "Add %s to the LegalService schema so search engines read the same details as the page." % label})
    if schema_pages and "index.html" not in schema_pages:
        issues.append({"id": "schema-home", "severity": "medium", "type": "Schema", "title": "The home page has no LegalService / LocalBusiness structured data",
                       "found": "none", "expected": "LegalService with name, url, telephone, address", "pages": ["index.html"],
                       "fix": "Add one LegalService block with the official name, phone, address and website to the home page."})
    elif not schema_pages:
        issues.append({"id": "schema-none", "severity": "high", "type": "Schema", "title": "No LegalService / LocalBusiness structured data found", "found": "none", "expected": "LegalService", "pages": [], "fix": "Add LegalService schema."})
    # contact card (vCard) files
    cards = []
    for vf in sorted(glob.glob("assets/*.vcf")):
        txt = open(vf, encoding="utf-8", errors="ignore").read()
        g = lambda k: (re.search(r"^%s[^:\n]*:(.*)$" % k, txt, re.M | re.I) or [None, ""])[1].strip()
        card = {"file": vf, "name": g("FN"), "org": g("ORG"), "phone": g("TEL"), "address": g("ADR"), "url": g("URL")}
        cards.append(card)
        probs = []
        if cfg["name"] not in card["name"] + " " + card["org"]:
            probs.append("name is “%s” (expected “%s”)" % (card["org"] or card["name"], cfg["name"]))
        if digits(card["phone"]) != canon_phone:
            probs.append("phone is %s" % (card["phone"] or "missing"))
        if not card["address"]:
            probs.append("no address")
        if cfg.get("website") and card["url"].rstrip("/") != cfg["website"].rstrip("/"):
            probs.append("website is %s (expected %s)" % (card["url"] or "missing", cfg["website"]))
        if probs:
            issues.append({"id": "vcard-" + os.path.basename(vf), "severity": "medium", "type": "Contact card", "title": "Saved-contact file %s differs: %s" % (os.path.basename(vf), "; ".join(probs)),
                           "found": "; ".join(probs), "expected": "%s, %s, %s, %s" % (cfg["name"], cfg["phone"], canon_full, cfg.get("website", "")), "pages": [vf],
                           "fix": "Update the .vcf so the contact people save matches the official name, phone, address and website."})
    if canon_phone not in phones:
        issues.append({"id": "phone-missing", "severity": "high", "type": "Phone", "title": "The official phone number was not found on any page", "found": "", "expected": cfg["phone"], "pages": [], "fix": "Add the phone number to the header or footer."})
    if not any(canon_street in norm_addr(k) for k in addrs):
        issues.append({"id": "addr-missing", "severity": "high", "type": "Address", "title": "The official address was not found on any page", "found": "", "expected": canon_full, "pages": [], "fix": "Show the address on the contact page and footer."})
    elif len([p for k, v in addrs.items() if canon_street in norm_addr(k) for p in v]) < max(3, indexable // 50):
        n = len(set(p for k, v in addrs.items() if canon_street in norm_addr(k) for p in v))
        issues.append({"id": "addr-sparse", "severity": "low", "type": "Address", "title": "The address appears on only %d page%s" % (n, "" if n == 1 else "s"),
                       "found": "%d pages" % n, "expected": canon_full, "pages": [],
                       "fix": "Search engines match listings to the site more confidently when the address is also in the footer or in schema. Add it to the footer if you want it public everywhere."})

    sev = {"high": 0, "medium": 1, "low": 2}
    issues.sort(key=lambda i: (sev[i["severity"]], -len(i["pages"])))

    ok_phone_pages = len(phones.get(canon_phone, set()))
    bad_phone_pages = len(set(p for d, pg in phones.items() if d != canon_phone for p in pg))
    def lst(c):  # counter dict -> sorted rows
        return c
    report = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "canonical": {"name": cfg["name"], "brand": cfg["brand"], "phone": cfg["phone"], "address": canon_full, "website": cfg.get("website", "")},
        "summary": {
            "pagesScanned": indexable, "pagesWithPhone": len(pages_with_phone), "pagesWithOfficialPhone": ok_phone_pages, "pagesWithOtherPhone": bad_phone_pages,
            "pagesWithOfficialName": len(pages_with_name), "pagesWithAddress": len(set(p for k, v in addrs.items() if canon_street in norm_addr(k) for p in v)),
            "issues": len(issues), "high": sum(1 for i in issues if i["severity"] == "high"),
        },
        "phones": [{"value": pretty_phone(d), "ok": d == canon_phone, "pages": len(pg), "where": sorted(phone_src[d]), "sample": sorted(pg)[:6]} for d, pg in sorted(phones.items(), key=lambda kv: -len(kv[1]))],
        "names": [{"text": label, "ok": kind == "ok", "pages": cnt, "sample": sorted(name_pages[(kind, label)])[:6]} for (kind, label), cnt in sorted(names.items(), key=lambda kv: (kv[0][0] != "ok", -kv[1]))],
        "addresses": [{"text": raw, "ok": canon_street in norm_addr(raw), "pages": len(pg), "sample": sorted(pg)[:6]} for raw, pg in sorted(addrs.items(), key=lambda kv: -len(kv[1]))],
        "schema": schema,
        "cards": cards,
        "issues": issues,
        "citations": cfg.get("citations", []),
    }
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print("generate_nap_report.py: %d pages scanned, %d issue(s) -> %s" % (indexable, len(issues), OUTPUT))


if __name__ == "__main__":
    main()
