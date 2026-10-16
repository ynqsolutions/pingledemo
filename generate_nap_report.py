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
            issues.append({"id": "phone-" + d, "severity": "high", "type": "Phone", "title": "A different phone number appears on %d page%s: %s" % (len(pg), "" if len(pg) == 1 else "s", pretty_phone(d)),
                           "found": pretty_phone(d), "expected": cfg["phone"], "pages": sorted(pg),
                           "why": "Customers and search engines see two numbers for one business. That splits your calls and can weaken your local search ranking.",
                           "fix": "Replace it with %s, or confirm it is a real second line." % cfg["phone"]})
    # names
    for (kind, label), cnt in names.items():
        if kind == "bad":
            fl = next(x for x in cfg["flagNames"] if x["label"] == label)
            issues.append({"id": "name-" + re.sub(r"\W+", "-", label.lower()), "severity": "medium", "type": "Name", "title": "The firm name is written differently on %d page%s: %s" % (cnt, "" if cnt == 1 else "s", label),
                           "found": label, "expected": fl["fix"], "pages": sorted(name_pages[(kind, label)]),
                           "why": "Search engines and directories match businesses by their exact name. A different spelling can make them treat it as a separate business.",
                           "fix": "Use “%s” everywhere the firm is named." % fl["fix"]})
    # addresses
    for raw, pg in sorted(addrs.items(), key=lambda kv: -len(kv[1])):
        if canon_street not in norm_addr(raw):
            issues.append({"id": "addr-" + re.sub(r"\W+", "-", raw.lower())[:40], "severity": "high", "type": "Address", "title": "A different street address appears on %d page%s: %s" % (len(pg), "" if len(pg) == 1 else "s", raw),
                           "found": raw, "expected": canon_full, "pages": sorted(pg),
                           "why": "A second address confuses search engines about where the business is, which hurts map and local results.",
                           "fix": "Use %s." % canon_full})
        elif not re.search(re.escape(a["zip"]), raw) and re.search(r"\bCA\b|California", raw):
            issues.append({"id": "zip-" + re.sub(r"\W+", "-", raw.lower())[:40], "severity": "medium", "type": "Address", "title": "The ZIP code is different on %d page%s: %s" % (len(pg), "" if len(pg) == 1 else "s", raw),
                           "found": raw, "expected": canon_full, "pages": sorted(pg),
                           "why": "Even a small difference in the address can stop listings from matching.", "fix": "Use ZIP %s." % a["zip"]})
    # schema
    gap = lambda key: sorted(p for p, g in schema_pages.items() if not g[key])
    for key, label, exp in (("telephone", "telephone", cfg["phone"]), ("address", "address", canon_full), ("url", "url", cfg.get("website", ""))):
        pg = gap(key)
        if pg:
            plain = {"telephone": "phone number", "address": "address", "url": "website address"}[key]
            issues.append({"id": "schema-" + key, "severity": "high" if key != "url" else "medium", "type": "Search data",
                           "title": "Your %s is missing from the hidden business data Google reads on %d page%s" % (plain, len(pg), "" if len(pg) == 1 else "s"),
                           "found": "No %s in the page's business data (LegalService schema)" % plain, "expected": exp, "pages": pg,
                           "why": "Behind each page is hidden code (called schema or structured data) that tells Google who the business is. Without your %s there, Google has to guess it from the page text." % plain,
                           "fix": "Add the %s to the LegalService block in each page's code." % plain})
    if schema_pages and "index.html" not in schema_pages:
        issues.append({"id": "schema-home", "severity": "medium", "type": "Search data", "title": "The home page has no hidden business data for Google (LegalService schema)",
                       "found": "None on the home page", "expected": "Name, website, phone and address in a LegalService block", "pages": ["index.html"],
                       "why": "The home page is the first place Google looks to learn who the business is and where it is.",
                       "fix": "Add one LegalService block with the official name, phone, address and website to the home page."})
    elif not schema_pages:
        issues.append({"id": "schema-none", "severity": "high", "type": "Search data", "title": "No hidden business data for Google (schema) was found on the site", "found": "None", "expected": "LegalService block", "pages": [],
                       "why": "Google uses this hidden data to understand the business.", "fix": "Add LegalService schema."})
    # contact card (vCard) files
    cards = []
    for vf in sorted(glob.glob("assets/*.vcf")):
        txt = open(vf, encoding="utf-8", errors="ignore").read()
        g = lambda k: (re.search(r"^%s[^:\n]*:(.*)$" % k, txt, re.M | re.I) or [None, ""])[1].strip()
        card = {"file": vf, "name": g("FN"), "org": g("ORG"), "phone": g("TEL"), "address": g("ADR"), "url": g("URL")}
        cards.append(card)
        probs = []
        if cfg["name"] not in card["name"] + " " + card["org"]:
            probs.append("the name reads “%s” instead of “%s”" % (card["org"] or card["name"], cfg["name"]))
        if digits(card["phone"]) != canon_phone:
            probs.append("the phone is %s" % (card["phone"] or "missing"))
        if not card["address"]:
            probs.append("there is no address")
        if cfg.get("website") and card["url"].rstrip("/") != cfg["website"].rstrip("/"):
            probs.append("the website is %s instead of %s" % (card["url"] or "missing", cfg["website"]))
        if probs:
            issues.append({"id": "vcard-" + os.path.basename(vf), "severity": "medium", "type": "Contact card", "title": "The “Save our contact” file doesn’t match your official details: %s" % "; ".join(probs),
                           "found": "; ".join(probs), "expected": "%s, %s, %s, %s" % (cfg["name"], cfg["phone"], canon_full, cfg.get("website", "")), "pages": [vf],
                           "why": "When someone taps “Save contact”, their phone stores these details. If they’re wrong or incomplete, that’s what customers see and share.",
                           "fix": "Update the contact file (%s) so it has the official name, phone, address and website." % os.path.basename(vf)})
    if canon_phone not in phones:
        issues.append({"id": "phone-missing", "severity": "high", "type": "Phone", "title": "The official phone number was not found on any page", "found": "", "expected": cfg["phone"], "pages": [],
                       "why": "Customers and search engines need to see the same number everywhere.", "fix": "Add the phone number to the header or footer."})
    if not any(canon_street in norm_addr(k) for k in addrs):
        issues.append({"id": "addr-missing", "severity": "high", "type": "Address", "title": "The official address was not found on any page", "found": "", "expected": canon_full, "pages": [],
                       "why": "Search engines match your listings to your website by comparing addresses.", "fix": "Show the address on the contact page and footer."})
    elif len([p for k, v in addrs.items() if canon_street in norm_addr(k) for p in v]) < max(3, indexable // 50):
        n = len(set(p for k, v in addrs.items() if canon_street in norm_addr(k) for p in v))
        issues.append({"id": "addr-sparse", "severity": "low", "type": "Address", "title": "Your address is shown on only %d page%s" % (n, "" if n == 1 else "s"),
                       "found": "%d page%s" % (n, "" if n == 1 else "s"), "expected": canon_full, "pages": [],
                       "why": "Search engines trust a business more when its address appears consistently, such as in the footer.",
                       "fix": "Add the address to the footer of every page if you want it public everywhere. Skip this if you prefer to show it only on the contact page."})

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
