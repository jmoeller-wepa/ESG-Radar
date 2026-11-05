# Gap-fill prompt: missing peer KPIs

Use this to fill empty fields on the Peers page. It works in Microsoft 365 Copilot (turn **web search / web grounding on**) or Claude.
Best results: run it for **one company at a time** and, if you have it, **attach the company's latest sustainability report** (PDF) – Copilot then reads the report instead of guessing from web pages.

1. Copy the prompt below.
2. Replace `{{COMPANY}}` and `{{MISSING}}` with one line from the table at the end.
3. Paste Copilot's answer (the JSON) into the ESG Radar chat – Claude checks it and returns an updated `data/peers.json`. Alternatively, a colleague can add the values to `data/peers.json` by hand.

---

```
You are a research assistant for the ESG team of a European tissue paper manufacturer.
Find the latest PUBLIC values for the KPIs listed below for the company {{COMPANY}}.
Use the company's own sustainability / annual report or official website first; ratings
(CDP, EcoVadis, SBTi) may also come from the rating provider or an official press release.
If a report is attached, use it as the primary source.

KPIs to find: {{MISSING}}

Definitions and format of "v" (the value):
- sbti: one of "None" | "Committed" | "Validated" | "Net-zero validated"
- netZeroYear: year of the net-zero / climate-neutrality target (number)
- scope12Target / scope3Target: % reduction target (number, e.g. 42); put base year, target
  year, absolute or per tonne, and achieved progress into "d"
- renewableElectricity: % of electricity from renewable sources (number)
- cdpClimate / cdpForests / cdpWater: CDP score letter, e.g. "A-", or "Not participating"
- ecovadis: "Platinum" | "Gold" | "Silver" | "Bronze" (score in "d" if available)
- recycledFibre: % recycled fibre in total fibre input (number)
- certifiedFibre: % of fresh / virgin fibre that is FSC or PEFC certified (number)
- recyclablePackaging: % of packaging that is recyclable (number)
- plasticTarget: % reduction target for (virgin / fossil) plastic in packaging (number);
  details in "d"
- waterTarget: text, e.g. "−25% freshwater intake by 2032 (2022) · −12% achieved"
- womenTotal: % women in the total workforce (number)
- womenManagement: % women in management (number); say which management level in "d"
- safety: text, e.g. "TRIR 0.65 (employees, 2025)" or "LTIR 1.2"

Rules:
- Only report values you found on a page or in a document you actually opened.
  Never estimate, convert or calculate. If you can't find a KPI, list it under "notFound".
- Always give the reporting year of the value ("y") and a direct link ("src") to the
  report or page. For PDF reports add the page number.
- Add "quote": the exact sentence or table row the value comes from (max 25 words).
- If the company reports at group level only (e.g. Metsä Group for Metsä Tissue), say so in "d".

Return ONLY this JSON, nothing else:
{
  "company": "{{COMPANY}}",
  "values": [
    { "kpi": "womenTotal", "v": 31.2, "d": "31.2% of employees", "y": "2025",
      "src": "https://…", "page": "p. 112", "quote": "…" }
  ],
  "notFound": ["kpi names you could not find"]
}
```

---

## Currently missing (as of 5 Nov 2026)

| {{COMPANY}} | {{MISSING}} |
|---|---|
| Essity | renewableElectricity, cdpWater, recycledFibre, recyclablePackaging, womenTotal |
| Sofidel | renewableElectricity, cdpWater, recycledFibre, womenTotal, womenManagement, safety |
| Metsä Tissue | sbti, netZeroYear, renewableElectricity, cdpClimate, cdpForests, cdpWater, recycledFibre, certifiedFibre, recyclablePackaging, plasticTarget, waterTarget, womenTotal, womenManagement, safety |
| Lucart | netZeroYear, renewableElectricity, cdpClimate, cdpForests, cdpWater, certifiedFibre, plasticTarget, womenTotal, womenManagement, safety |
| Kimberly-Clark | netZeroYear, cdpClimate, cdpForests, cdpWater, ecovadis, recycledFibre, recyclablePackaging, womenTotal, womenManagement |
| Procter & Gamble | scope3Target, cdpClimate, cdpForests, cdpWater, ecovadis, recycledFibre, certifiedFibre, plasticTarget, safety |
| Georgia-Pacific | sbti, netZeroYear, scope12Target, scope3Target, renewableElectricity, cdpClimate, cdpForests, cdpWater, ecovadis, recycledFibre, certifiedFibre, recyclablePackaging, plasticTarget, waterTarget, womenTotal, womenManagement, safety |
| APP / Sinar Mas | renewableElectricity, ecovadis, recycledFibre, certifiedFibre, recyclablePackaging, plasticTarget, waterTarget, womenTotal, womenManagement, safety |
| Hengan | sbti, netZeroYear, scope12Target, scope3Target, renewableElectricity, cdpClimate, cdpForests, cdpWater, ecovadis, recycledFibre, certifiedFibre, recyclablePackaging, plasticTarget, safety |
| CMPC Softys | renewableElectricity, cdpClimate, cdpForests, cdpWater, ecovadis, recycledFibre, certifiedFibre, recyclablePackaging, plasticTarget, safety |
| Kruger Products | sbti, netZeroYear, scope3Target, renewableElectricity, cdpClimate, recyclablePackaging, womenTotal, womenManagement |

Some fields will stay empty because companies don't publish them (for example Georgia-Pacific is privately owned and discloses little; CDP scores exist only for companies that answer CDP).
