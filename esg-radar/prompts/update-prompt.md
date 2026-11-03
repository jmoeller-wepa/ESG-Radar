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
A) EU regulation & standards across all ESG areas:
   - Climate & Energy: EU ETS and ETS2, CBAM, GHG Protocol (Scope 2/3 revisions), SBTi, energy efficiency
   - Forests & Biodiversity: EUDR, TNFD, nature restoration, forest certification
   - Circularity & Packaging: PPWR, ESPR/ecodesign, EPR, plastics, waste
   - Water & Pollution: Industrial Emissions Directive, water reuse, PFAS/chemicals in paper and packaging
   - People & Supply chain: CSDDD, German LkSG, forced labour regulation, health & safety
   - Reporting & Governance: CSRD/ESRS (incl. XBRL taxonomy, Voluntary Standard), Omnibus follow-ups,
     EU Taxonomy, ISSB, assurance, Empowering Consumers / green claims, German transposition of CSRD
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
  "areas": ["1–2 of: climate, forests, circularity, water, people, reporting, data"],
  "impacts": ["1–2 of: reporting (changes what/how we report), datamodel (new data points or calculation logic),
              suppliers (supplier data or due diligence), products (product, packaging or claims), costs (direct cost effect),
              watch (no action yet)"],
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

Then, in a second JSON code block, list up to 5 upcoming EVENTS (next 18 months) that matter for this
team: Microsoft Fabric / Power BI conferences, EFRAG/ESRS webinars, CSRD or ESG reporting conferences
in Europe. Only events with a confirmed date on an official page. Format:
{ "id": "kebab-id", "date": "YYYY-MM-DD (first day)", "end": "YYYY-MM-DD (last day)", "title": "…",
  "location": "City, venue or Online", "area": "one of: climate, forests, circularity, water, people, reporting, data",
  "kind": "Conference | Webinar | Deadline event", "url": "https://… (official page)" }
```

**Events:** paste the objects from the second code block into `data/events.json` (inside the `events` list) and delete events that are over. They appear in the **Events** tab of the "What's ahead" panel on the News page.

**Roadmap (Regulation page):** when a topic changes phase (e.g. a proposal is adopted, an application date moves), adjust the matching row in `data/roadmap.json` (phases with `from`, `to`, `status`: proposal | adopted | applies). New official steps from the European Parliament are added automatically; if a new topic gets an EU procedure, add its number in `config/regulation.json`.
