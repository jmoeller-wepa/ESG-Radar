# Update prompt: regulation & best practice

Use this prompt **quarterly** (regulation) or whenever you want to add curated entries.
It works in any AI assistant **with web search**, e.g. Microsoft 365 Copilot (make sure web grounding is on) or Claude. It's optional: the monthly feed run is fully automatic. This prompt adds curated entries with deadlines and a "Why it matters for us" line.

1. Copy everything inside the box below.
2. Replace `{{LAST_UPDATE}}` with the `lastCuratedUpdate` date from `data/radar.json`.
3. Paste the returned JSON objects into the `entries` list in `data/radar.json` (GitHub → file → ✏️ Edit), and set `meta.lastCuratedUpdate` to today's date.
4. Commit. The page updates within about a minute.

---

```
You are a research assistant for the ESG Controlling & Digitization team of a European
tissue paper manufacturer (paper mills under EU ETS, packaging, pulp & recovered paper,
CSRD reporting, Microsoft Fabric / Power BI data platform, Fabric data agents, Microsoft Foundry).

Search the web for developments published AFTER {{LAST_UPDATE}} on:
A) EU regulation & standards: CSRD/ESRS (incl. XBRL taxonomy, Voluntary Standard), Omnibus
   follow-ups, EU Taxonomy, CSDDD, EUDR, PPWR, Empowering Consumers / green claims, EU ETS
   and ETS2, CBAM, GHG Protocol (Scope 2/3 revisions), SBTi, ISSB, German transposition of CSRD.
B) Best practice: published examples of companies or consultancies using data platforms or AI
   (especially Microsoft Fabric, Power BI, Copilot, data agents) for sustainability reporting
   or ESG controlling; useful guides on semantic models / data agents.

Rules:
- Only include items you found in a source you actually opened. Never invent dates or facts.
- Prefer primary sources (EUR-Lex, European Commission, EFRAG, ESMA, standard setters,
  Microsoft Learn) or reputable law/advisory firms.
- Skip items that only repeat something already known before {{LAST_UPDATE}}.
- Maximum 10 items, most important first.

Return a JSON array in a code block (no commentary inside it) of objects in exactly this format:
{
  "id": "short-kebab-case-unique-id",
  "date": "YYYY-MM-DD (publication or decision date)",
  "type": "regulation" | "practice",
  "tags": ["max 3 short tags"],
  "title": "One-line headline, max 110 characters",
  "summary": "2–3 factual sentences: what happened, key numbers, dates.",
  "whyItMatters": "1–2 sentences on the impact for an ESG controlling / data team in a paper manufacturer.",
  "status": "e.g. Proposal | Adopted | In force | Consultation | Published | Reference",
  "relevance": "high" | "medium" | "low",
  "nextDate": "YYYY-MM-DD of the next relevant deadline, or null",
  "nextDateLabel": "short label for nextDate, or null",
  "source": "Publisher name",
  "url": "https://… (the page you used)",
  "origin": "curated",
  "added": "today's date YYYY-MM-DD"
}

After the JSON array, list any existing topics whose status changed (e.g. a proposal adopted),
so I can update those entries by hand.
```
