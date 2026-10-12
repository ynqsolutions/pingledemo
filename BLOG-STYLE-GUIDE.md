# Blog style guide (Pingle Law)

How blog posts are written and built on this site. Follow it exactly so every post matches. The reference posts are `blog-1099-or-employee-entertainment-california.html` (standard article) and `blog-common-interview-questions.html` (article with flashcards).

## 1. Voice and writing rules
- Plain English, written for a worker with no legal background. Short sentences, active voice, no legalese without a one-line explanation.
- Direct answer first. The first block answers the headline question in 2-4 sentences (this is what AI tools quote).
- California-specific. Say "California" naturally; never imply law outside California.
- Never promise outcomes, never give individualized legal advice, never say "you will win". Use "may", "generally", "can".
- No invented statistics, quotes, case results or deadlines. Any statement of law, number or deadline must be one Corey can verify; flag every legal claim in the hand-off so he reviews it before promotion.
- No emojis in body copy. Plain, calm, practical tone.
- Titles are a real question or a clear promise a worker would search ("Can X do Y in California?", "Do Z Get Overtime?"). Title tag follows CLAUDE.md: one "California", under about 65 characters, ends "| Pingle Law".
- Meta description: one sentence, 140-160 characters, states the answer or what the reader gets.

## 2. Article structure (top to bottom)
1. **Hero:** back link to `resources.html`, one category tag (`resource-article-tag`), `<h1>`, one-sentence subtitle (`blog-sub`), the two pill buttons (Free Consultation, Contact Us).
2. **Byline row:** "By Corey A. Pingle, Esq." / "Employment Law Attorney" with `assets/Pingle_HS_Cutout.png`, and `<p class="blog-meta">Month D, YYYY &middot; N min read</p>`.
3. **Hero image** (`article-inline-image`) when the post has one.
4. **TL;DR** (`.tldr` with `.tldr-label`): 2-4 sentences, the direct answer.
5. **"In This Article"** table of contents (`.blog-toc`), numbered, anchors `#pt-1`, `#pt-2`...
6. **Intro paragraph(s):** why this matters, what the post covers.
7. **Numbered sections** (`.blog-sign` with `.blog-sign-num` and an `<h2>`; ids `pt-N`). 4-7 sections. Each is short paragraphs; use bullets only for real lists.
8. **Example boxes** (`.blog-example` with `assets/Pingle_HS_Thinking.png`, `<strong>Example</strong>`): a concrete two-to-three sentence scenario in one or two sections.
9. **Definitions:** first use of a legal or technical term is a glossary button: `<button type="button" class="glossary-term" data-term="Term" data-def="One or two plain sentences.">term</button>`. The site JS shows the "Did You Know?" popup. Use 2-6 per post.
10. **"What to do" section** last: concrete next steps, ending with a soft pointer to the Free Case Review (never pushy).
11. **Disclaimer** (`.article-disclaimer`): general educational purposes, not legal advice, no attorney-client relationship.
12. **Share block** (`.blog-share`), then **Previous / Next** (`.blog-prev-next`), plus `data-prev-post` / `data-next-post` on `<body>`.
13. **Sidebar:** "Need Legal Help?" card, the free-tools banner, and a **Related Articles** list (4-8 links; tag each with its category).
14. Footer / final CTA are copied unchanged from an existing post.

Keep the page template (header, mobile nav, sticky CTA, footer, scripts) byte-identical to an existing post. Do not hand-edit the shared pieces.

## 3. Interactive Q&A variant (like the interview post)
- Questions are real HTML cards (`.iq-item`) with: `Q#` badge + question (`h3`), "What they're really asking", "How to answer" (2-3 steps), a **Sample answer** quote, an **Avoid** line, and an optional "Did you know?" pill (`glossary-term iq-dyk`).
- Group cards into numbered `.blog-sign` sections.
- Flashcards (`js/interview-qa.js`, `css/interview-qa.css`) are built from those cards, so all text stays in the HTML. Interactivity may only reveal text that already exists in the page; never load answers by script.
- Add `FAQPage` JSON-LD whose text matches the visible answers, and `Article` JSON-LD (author Corey).
- Nothing the visitor does is stored or sent; calculators and templates never carry data to the case review.

## 4. Every new post also needs
- **Spanish twin:** `blog-<slug>-es.html`, the same structure, with the EN/ES toggle linking both ways (`lang="es"`, translated title, description, meta line "28 de agosto de 2026 · 7 min de lectura").
- **Resources card** in `resources.html` (`resource-article-card` with `data-category` and `data-industry`, tag, title, date, icon `assets/blog-icons/blog-<slug>.png`).
- **Cache-busting:** use the current `?v=` numbers from an existing post for `css/style.css`, `js/main.js` and any other asset.
- **Canonical URL, one `<h1>`, descriptive image alt text.**
- Do not add a visible "last updated" date. `generate_page_dates.py` and the auto-date workflow add hidden metadata, and the "Updated" line on posts, when a post is really changed.
- The sitemap and IndexNow/Search Console notifications are handled by the build and the admin Search Updates page.

## 5. Checklist before pushing
- [ ] Direct answer in the TL;DR and first section
- [ ] Every legal statement flagged for Corey's review
- [ ] Definitions and examples present
- [ ] EN and ES pages, both linked from the toggle
- [ ] Resources card added
- [ ] No unrelated files staged (never commit the unstaged "blog icons/*" deletions or `pinglelaw-knowledge-base.md`)
