# Update prompt: peer benchmark (`data/peers.json`)

Run this **once a year** (best in spring, after the annual reports are out) or when a big rating announcement happens. It works in any AI assistant **with web search**, e.g. Microsoft 365 Copilot (web grounding on) or Claude.

1. Open `data/peers.json` on GitHub and copy its `companies` block for **one company** (e.g. Essity).
2. Copy the prompt below, paste the company block where it says so, and run it.
3. Check the answer: every changed value must have a `src` link you can open, and old values must have moved into `history`. Then replace that company's block in `data/peers.json` (GitHub → ✏️ Edit) and set `meta.updated` to today.
4. Repeat for the other companies. Doing one company per run gives the most reliable results.

To add a company, copy an existing block, change `id`, `name`, `country`, `groups` (`europe` and/or `global`) and `aliases` (names used in news headlines), empty the `kpis` and `targets`, and run the prompt for it.

---

```
You update a peer benchmark of tissue paper manufacturers. Below is the current JSON block
for one company. Search the web for the latest PUBLIC values of these KPIs and return the
updated block.

KPIs (keys in "kpis"):
- sbti: one of "None" | "Committed" | "Validated" | "Net-zero validated"
- netZeroYear: number (year of net-zero or climate-neutrality target)
- scope12Target: number = % reduction target for Scope 1+2 (put base year, target year,
  absolute/intensity and achieved progress in "d", e.g. "−35% by 2030 (2016) · −27% achieved")
- scope3Target: number = % reduction target for Scope 3 (details in "d")
- renewableElectricity: number = % of electricity from renewable sources
- cdpClimate, cdpForests, cdpWater: CDP score letter, e.g. "A", "A-", "B"
- ecovadis: "Bronze" | "Silver" | "Gold" | "Platinum" (score in "d" if known)
- msci: MSCI ESG rating, e.g. "A", "AA"
- recycledFibre: number = % recycled fibre in total fibre use
- certifiedFibre: number = % certified (FSC/PEFC) fibre
- recyclablePackaging: number = % recyclable (or reusable) packaging
- plasticTarget: number = % plastic reduction target (details in "d")
- waterTarget: text, e.g. "−25% freshwater intake by 2032 (2022) · −12% achieved"
- womenTotal: number = % women in the workforce
- womenManagement: number = % women in management
- safety: text, e.g. "TRIR 0.65 (employees)"

Each KPI is an object: { "v": value, "d": optional display text, "y": "year of the data",
"src": "URL of the page or report you used" }.

Trend history (shown as arrows in the table and in the company pop-up):
- If you find a NEWER value for a KPI, move the old value into that KPI's "history" list before
  replacing it: "history": [ { "v": old v, "d": old d, "y": old y }, … ] (oldest first, keep max 5).
- If the value is unchanged but the year is newer, only update "y" and "src".
- Never delete existing "history" entries.

Rules:
- Only use values you found on a page you actually opened. Never estimate or invent.
- Prefer the company's own report or press release, CDP / SBTi / EcoVadis announcements.
- Keep a KPI unchanged if you find nothing newer. Remove a KPI only if it is clearly outdated
  and withdrawn.
- Update "targets" (max 4 short lines with the most important targets and facts).
- Return ONLY the complete updated JSON block in a code block, then a short list of what
  changed and which values you could not find.

For WEPA only: also update "targets2030" (used by the "Our targets 2030" widget) from the newest
WEPA sustainability report: for each item keep "label", "target" and "fmt", and set "current" to the
reported value; set "year" to the report year and "src" to the report link.

Current block:
<PASTE THE COMPANY BLOCK HERE>
```

---

## Part 2 (yearly): industry figures for the Market page (`data/industry.json`)

The monthly German figures in `germanyMonthly` update automatically. Once a year, update the two yearly blocks:

- **`europe`** – after Cepi publishes its Key Statistics (usually July).
- **`germanyRecoveredRate`** – after DIE PAPIERINDUSTRIE publishes its Leistungsbericht PAPIER (the Umweltbundesamt republishes the table "Altpapiereinsatzquoten" in December).

```
Update the JSON blocks below with the newest published figures. Search the web.
1) "europe": Cepi Key Statistics of the latest year (cepi.org, press release or report). Keep the same
   KPI labels where possible; set "year", "label" and "source" (label + URL of the document you used).
2) "germanyRecoveredRate": add the newest year to "years" and one value per series
   (Altpapiereinsatzquote in % for Hygienepapiere, Gesamt, Verpackungspapiere gesamt, Grafische Papiere gesamt)
   from the table of Die Papierindustrie / Umweltbundesamt. Update "wepaRef.value" with WEPA's recycled
   fibre share from its newest sustainability report.
Rules: only values you found on a page you opened; never estimate. Return ONLY the two updated JSON
blocks, then a short list of what changed.

<PASTE THE BLOCKS "europe" AND "germanyRecoveredRate" FROM data/industry.json HERE>
```
