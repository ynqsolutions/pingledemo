#!/usr/bin/env python3
"""Audio versions of blog posts (the "Prefer to listen?" player).

This is a LOCAL tool. It is not part of the Netlify build, because making
audio needs a Google Cloud key, and that key must never be in this folder.

One-time setup, in any folder outside the site:
    python3 -m venv ~/pingle-tts-venv
    ~/pingle-tts-venv/bin/pip install google-cloud-texttospeech beautifulsoup4 lameenc

Every new blog post needs an entry in content/audio.json ("tags" and a short
"label" per language), then:
    GOOGLE_APPLICATION_CREDENTIALS=~/pingle-tts-key.json \
        ~/pingle-tts-venv/bin/python generate_audio.py

That makes audio for every listed post that has none yet (languages are set by
"generate_langs" in content/audio.json; today English only), then puts or
refreshes the player on each page.

Refresh the players only (no Google calls, no key, plain python3):
    python3 generate_audio.py --players

Other options:
    --force slug [slug ...]   re-make the audio for those posts
    --limit N                 make at most N new audio files this run

Files: the site copy is a 32 kbps mono MP3 in assets/audio/. A better 64 kbps
master of each file is kept OUTSIDE the site, in ~/pingle-audio-master (or the
folder in PINGLE_AUDIO_MASTER), so it can be re-encoded or uploaded elsewhere
without spending Google characters again.

The script counts the characters it sends to Google each month and stops
before "monthly_character_cap" in content/audio.json.
"""
import datetime
import hashlib
import html
import json
import os
import re
import sys
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(ROOT, "content", "audio.json")
AUDIO_DIR = os.path.join(ROOT, "assets", "audio")
CSS_V = 4          # bump when css/audio-player.css changes
JS_V = 3           # bump when js/audio-player.js changes
MAX_RELATED = 3
LANGS = {"en": "", "es": "-es"}
SITE_KBPS = 32
MASTER_KBPS = 64
SAMPLE_RATE = 24000
MASTER_DIR = os.path.expanduser(os.environ.get("PINGLE_AUDIO_MASTER", "~/pingle-audio-master"))
# a shared industry counts double when picking related audio
INDUSTRY = {"healthcare", "restaurant", "hotel", "film", "construction", "farm", "mechanic",
            "retail", "office", "warehouse", "education", "personal-assistant", "social-media"}

TEXT = {
    "en": {
        "group": "Audio version of this article",
        "kicker": "Prefer to listen?",
        "play": "Play the audio version",
        "note": "AI-generated voice",
        "more": "Related audio",
        "summary": "In short.",
        "times": r"\1 times",
    },
    "es": {
        "group": "Versión en audio de este artículo",
        "kicker": "¿Prefiere escuchar?",
        "play": "Reproducir versión en audio",
        "note": "Voz generada por IA",
        "more": "Audio relacionado",
        "summary": "En resumen.",
        "times": r"\1 veces",
    },
}

START = "<!-- audio-player -->"
END = "<!-- /audio-player -->"


# ---------------------------------------------------------------- text

def article_text(path, lang):
    """The words a narrator would read: title, summary, sections, disclaimer."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(open(path, encoding="utf-8"), "html.parser")
    title = soup.find("h1").get_text(" ", strip=True)
    art = soup.select_one("article.blog-main")
    skip = [".ap", ".blog-post-meta-row", ".blog-toc", ".blog-share",
            ".blog-prev-next", ".blog-cta-box", ".blog-related", ".blog-sign-num",
            ".tldr-label", ".glossary-pop", "script", "style", "svg"]
    for sel in skip:
        for el in art.select(sel):
            el.decompose()
    parts = [title if title[-1] in ".?!" else title + ".", TEXT[lang]["summary"]]
    for el in art.find_all(["h1", "h2", "h3", "p", "li"]):
        t = re.sub(r"\s+", " ", el.get_text(" ", strip=True))
        t = re.sub(r" ([,.;:?!])", r"\1", t).strip()
        if not t:
            continue
        if el.name in ("h1", "h2", "h3") and t[-1] not in ".?!:":
            t += "."
        if re.match(r"^[A-Za-z\u00C0-\u00FF]+ \d{1,2}(?:,| de) .*\d{4} \u00b7", t):
            continue   # the "November 20, 2026 \u00b7 5 min read" line, wherever the page puts it
        t = re.sub(r"(\d)x\b", TEXT[lang]["times"], t)   # "1.5x pay" reads badly
        t = t.replace("&", "and" if lang == "en" else "y")
        t = re.sub(r"(\d)\+", r"\1 plus" if lang == "en" else r"\1 o m\u00e1s", t)
        t = re.sub(r"\bvs\.", "versus", t)
        t = re.sub(r"(?<=[A-Za-z])/(?=[A-Za-z])", " ", t)   # Cal/OSHA
        if t not in parts:
            parts.append(t)
    return parts


# --------------------------------------------------------------- audio

def mp3_seconds(data):
    """Length of a constant-bitrate MP3, from its first frame header."""
    i = 0
    if data[:3] == b"ID3":
        i = 10 + ((data[6] & 0x7F) << 21 | (data[7] & 0x7F) << 14
                  | (data[8] & 0x7F) << 7 | (data[9] & 0x7F))
    while i < len(data) - 4 and not (data[i] == 0xFF and (data[i + 1] & 0xE0) == 0xE0):
        i += 1
    mpeg1 = ((data[i + 1] >> 3) & 3) == 3
    table = ([0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] if mpeg1
             else [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])
    kbps = table[(data[i + 2] >> 4) & 0xF]
    return (len(data) - i) * 8 / (kbps * 1000)


def pcm_of(wav):
    """Raw samples from a WAV file (Google adds a header to each reply)."""
    return wav[wav.index(b"data") + 8:]


def encode_mp3(pcm, kbps):
    import lameenc
    enc = lameenc.Encoder()
    enc.set_bit_rate(kbps)
    enc.set_in_sample_rate(SAMPLE_RATE)
    enc.set_channels(1)
    enc.set_quality(2)
    return bytes(enc.encode(pcm)) + bytes(enc.flush())


def synthesize(parts, voice):
    """Narrate each paragraph and join them. Returns raw 16-bit samples."""
    from google.cloud import texttospeech as tts
    client = tts.TextToSpeechClient()
    out = b""
    for p in parts:
        for attempt in range(5):
            try:
                r = client.synthesize_speech(
                    input=tts.SynthesisInput(text=p),
                    voice=tts.VoiceSelectionParams(language_code=voice["lang"], name=voice["name"]),
                    audio_config=tts.AudioConfig(audio_encoding=tts.AudioEncoding.LINEAR16,
                                                 sample_rate_hertz=SAMPLE_RATE))
                break
            except Exception as e:   # rate limits and brief outages: wait and retry
                if attempt == 4:
                    raise
                time.sleep(2 ** attempt)
        out += pcm_of(r.audio_content)
    return out


def mp3_path(slug, lang):
    return os.path.join(AUDIO_DIR, slug + LANGS[lang] + ".mp3")


def file_info(path):
    data = open(path, "rb").read()
    return {"sec": round(mp3_seconds(data)), "v": hashlib.sha1(data).hexdigest()[:8]}


def make_audio(man, force, limit=None):
    month = datetime.date.today().strftime("%Y-%m")
    usage = man.setdefault("usage", {})
    cap = man.get("monthly_character_cap", 900000)
    langs = man.get("generate_langs", ["en"])
    os.makedirs(AUDIO_DIR, exist_ok=True)
    os.makedirs(MASTER_DIR, exist_ok=True)
    made = 0
    for post in man["posts"]:
        for lang in langs:
            suf = LANGS[lang]
            page = os.path.join(ROOT, post["slug"] + suf + ".html")
            out = mp3_path(post["slug"], lang)
            if not os.path.exists(page):
                continue
            if os.path.exists(out) and post["slug"] not in force:
                continue
            if limit is not None and made >= limit:
                return
            parts = article_text(page, lang)
            chars = sum(len(p) for p in parts)
            if usage.get(month, 0) + chars > cap:
                sys.exit(f"Stopped: {post['slug']}{suf} needs {chars:,} characters, and "
                         f"{usage.get(month, 0):,} of the {cap:,} monthly cap are used. "
                         "Run it again next month and it carries on from here.")
            pcm = synthesize(parts, man["voices"][lang])
            site = encode_mp3(pcm, SITE_KBPS)
            open(os.path.join(MASTER_DIR, post["slug"] + suf + ".mp3"), "wb").write(encode_mp3(pcm, MASTER_KBPS))
            open(out, "wb").write(site)
            usage[month] = usage.get(month, 0) + chars
            made += 1
            save(man)   # keep the count even if a later post fails
            print(f"audio  {post['slug']}{suf}  {chars:,} chars  {len(site) // 1024} KB", flush=True)


# -------------------------------------------------------------- player

PLAY = '<svg class="ap-ic-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>'
PAUSE = '<svg class="ap-ic-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>'
MINI = '<span class="ap-more-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>'


def minutes(sec):
    return max(1, round(sec / 60))


def related(post, lang, posts):
    scored = []
    for other in posts:
        if other is post or lang not in other.get("audio", {}):
            continue
        shared = set(post["tags"]) & set(other["tags"])
        if shared:
            score = len(shared) + len(shared & INDUSTRY)
            spread = hashlib.md5((post["slug"] + other["slug"]).encode()).hexdigest()
            scored.append((-score, spread, other))   # equal scores: a fixed but varied order
    return [o for _, _, o in sorted(scored, key=lambda s: s[:2])[:MAX_RELATED]]


def player_html(post, lang, posts):
    t, suf, e = TEXT[lang], LANGS[lang], html.escape
    info = post["audio"][lang]
    more = ""
    rel = related(post, lang, posts)
    if rel:
        items = "".join(
            f'\n            <li><a class="ap-more-link" href="{o["slug"]}{suf}.html">{MINI}'
            f'<span class="ap-more-t">{e(o["label"].get(lang) or o["label"]["en"])}</span>'
            f'<span class="ap-more-d">{minutes(o["audio"][lang]["sec"])} min</span></a></li>'
            for o in rel)
        more = (f'\n        <nav class="ap-more" aria-label="{e(t["more"])}">'
                f'\n          <span class="ap-more-k">{e(t["more"])}</span>'
                f'\n          <ul class="ap-more-list">{items}\n          </ul>'
                f'\n        </nav>')
    return f'''{START}
      <div class="ap" role="group" aria-label="{e(t["group"])}">
        <div class="ap-main">
          <button type="button" class="ap-play">{PLAY}{PAUSE}</button>
          <span class="ap-text"><span class="ap-k">{e(t["kicker"])}</span><span class="ap-t">{e(t["play"])} &middot; {minutes(info["sec"])} min</span></span>
          <span class="ap-note">{e(t["note"])}</span>
          <div class="ap-controls">
            <button type="button" class="ap-skip ap-back"><span>&minus;15</span></button>
            <input type="range" class="ap-seek" min="0" max="100" step="1" value="0">
            <button type="button" class="ap-skip ap-fwd"><span>+15</span></button>
            <span class="ap-time">0:00 / 0:00</span>
            <button type="button" class="ap-speed">1&times;</button>
          </div>
        </div>{more}
        <audio preload="none" src="assets/audio/{post["slug"]}{suf}.mp3?v={info["v"]}"></audio>
      </div>
      {END}'''


def ensure_tag(page, pattern, tag, after):
    """Update the versioned tag if present, else add it after the `after` line."""
    if re.search(pattern, page):
        return re.sub(pattern, lambda m: tag, page, count=1)
    line = re.search(r"^.*" + re.escape(after) + r".*$", page, re.M)
    if not line:
        sys.exit(f"Could not find {after} to place {tag}")
    return page[:line.end()] + "\n" + tag + page[line.end():]


def place_player(page, block, name):
    if START in page:
        return re.sub(re.escape(START) + r".*?" + re.escape(END), lambda m: block, page, count=1, flags=re.S)
    old = re.search(r'<div class="ap" role="group".*?</audio>\s*</div>', page, re.S)
    if old:   # first version of the player, before the markers existed
        return page[:old.start()] + block + page[old.end():]
    art = page.find('<article class="blog-main">')
    for anchor in ('<div class="article-inline-image"', '<div class="tldr">'):
        at = page.find(anchor, art)
        if art != -1 and at != -1:
            return page[:at] + block + "\n\n      " + page[at:]
    sys.exit(f"Could not find where to put the player in {name}")


def refresh_players(man):
    for post in man["posts"]:
        info = {}
        for lang in LANGS:
            if os.path.exists(mp3_path(post["slug"], lang)):
                info[lang] = file_info(mp3_path(post["slug"], lang))
        post["audio"] = info
    for post in man["posts"]:
        for lang, suf in LANGS.items():
            name = post["slug"] + suf + ".html"
            path = os.path.join(ROOT, name)
            if lang not in post["audio"] or not os.path.exists(path):
                continue
            page = open(path, encoding="utf-8").read()
            new = place_player(page, player_html(post, lang, man["posts"]), name)
            new = ensure_tag(new, r'<link rel="stylesheet" href="css/audio-player\.css\?v=\d+">',
                             f'<link rel="stylesheet" href="css/audio-player.css?v={CSS_V}">', "css/style.css?v=")
            new = ensure_tag(new, r'<script src="js/audio-player\.js\?v=\d+" defer></script>',
                             f'<script src="js/audio-player.js?v={JS_V}" defer></script>', "js/main.js?v=")
            if new != page:
                open(path, "w", encoding="utf-8").write(new)
                print("player", name)


def save(man):
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(man, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    args = sys.argv[1:]
    man = json.load(open(MANIFEST, encoding="utf-8"))
    force = set()
    if "--force" in args:
        i = args.index("--force") + 1
        force = {a for a in args[i:] if not a.startswith("--")}
    limit = int(args[args.index("--limit") + 1]) if "--limit" in args else None
    if "--players" not in args:
        if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
            sys.exit("Set GOOGLE_APPLICATION_CREDENTIALS to the key file, or use --players.")
        make_audio(man, force, limit)
    refresh_players(man)
    save(man)


if __name__ == "__main__":
    main()
