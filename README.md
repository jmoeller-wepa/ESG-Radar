# ESG Radar

A lightweight website for the sustainability team, with five pages that share the same header, status dot and sidebar (the seven ESG areas):

Climate & Energy · Forests & Biodiversity · Circularity & Packaging · Water & Pollution · People & Supply chain · Reporting & Governance · Data & AI

| Page | What it shows |
|---|---|
| **Overview** (`index.html`, start page) | Personal dashboard: everyone picks and orders their own widgets (drag with the mouse in "Customize"; saved per browser). Widgets: carbon cost exposure, market alerts (threshold adjustable), our 2030 targets, next deadlines, new since last visit, peer news, consultations closing, regulation changes, saved items, market snapshot, WEPA vs. peers, data status. Old links like `…/#area=climate` are forwarded to the News page. |
| **News** (`news.html`) | News, regulation, tool updates and best practice as cards. Above them is the **What's ahead** panel: **Deadlines** · **Timeline** · **Events**, plus **Coming next** (planned Fabric / Power BI features by quarter) when Data & AI is selected. |
| **Regulation** (`regulation.html`) | Open EU consultations that match our topics ("Give feedback" links), and a **tracker** with one row per law or standard: stage, latest official step, next date. Switch to **Roadmap** for the 2024–2030 phase view. Click a topic for all steps, upcoming dates and related news. |
| **Peers** (`peers.html`) | Public sustainability KPIs of 12 tissue companies, with colour-coded comparison, trend arrows and a history pop-up per company. For *All areas* and *Climate & Energy* it also shows the **EU ETS verified emissions** of the European peers, per company and per site. |
| **Market** (`market.html`) | Free official statistics behind tissue costs (producer prices for tissue, pulp and paper, energy prices, grid carbon intensity, carbon price, EUR/USD). In the side panel: a **period slicer** (years → months, like a Power BI hierarchy slicer; quick buttons for 12 months / 3 / 5 years / all) and an **indicator checklist** (up to 4 lines in the compare chart; clicking tiles works too). |

It only uses public information. There are no licences, no servers and no internal data.

## Features

- **Look:** WEPA colours throughout – Dunkelblau header, Mittelblau/Grün accents; chart lines use WEPA Grün, Mittelblau, a coral from WEPA Pink and a cyan from Hellblau (checked for colour-blind safety). Shared styles are in `assets/theme.css`.
- **Legend** is in the side panel on News and Peers, so it is always visible.

- **Sidebar on every page.** The selected area carries over between pages: on the Peers page it selects the matching KPI set, and on the Market page it filters the tiles.
- **Views** (News): *All entries*, *New since last visit* and *Saved* (★ on a card). Both "new" and "saved" are remembered per browser, so no login is needed.
- **Filters above the cards**: impact (*Reporting*, *Data model*, *Suppliers*, *Products & claims*, *Costs*, *Watch*), type, relevance and sort. For Data & AI there are also a tool filter (Fabric, Power BI, Copilot …) and a *Monthly updates* type.
- **Status dot** (top right on every page): green = the last weekly run worked, amber = a source failed (old values are kept), red = no update for 14+ days. Click it for details and what to do.
- **Regulation pop-up → "Show on the News page"** shows only the cards for that topic (`index.html#topic=ppwr`).
- **Shareable links**: for example `index.html#area=climate&impact=costs` or `market.html#area=forests&period=5y`.
- Optional weekly **Teams post** with new high-relevance items (see below).

## How it updates

A GitHub Action (`.github/workflows/collect-feeds.yml`) runs **every Monday** and can also be started by hand from the Actions tab. No review is needed.

1. `scripts/collect_feeds.py` reads the RSS feeds in `config/feeds.json`. It keeps matching items, rates their relevance, and assigns areas and impacts by keyword. Items older than a year move to `data/archive.json`.
2. `scripts/collect_market.py` fetches the market indicators listed in `config/market.json` and writes them to `data/market.json`.
   - Each indicator is fetched on its own. If a source is down, the previous values stay and the tile shows a note.
   - Nothing is ever estimated.
3. `scripts/collect_ets.py` checks the EU Union Registry page for the newest yearly "verified emissions" file (published every April). It adds up the emissions of each peer's sites and writes `data/peer_emissions.json`. If nothing changed, it skips the download.
4. `scripts/collect_regulation.py` reads open consultations from the Commission's "Have your say" portal and the latest official steps of the procedures in `config/regulation.json` from the European Parliament. A new official step also becomes a "Status update" card on the News page.
5. `scripts/collect_sbti.py` updates the SBTi column of the Peers page from the SBTi Target Dashboard download (old value → history).
6. `scripts/collect_fabric.py` collects planned Fabric / Power BI features for "Coming next".
7. Every script reports how it went to `data/status.json` (the status dot). The changes are committed, and GitHub Pages publishes them within about a minute.
8. Optionally, the run posts to Teams.

These parts are updated by hand, with the prompts in `prompts/` (they work in M365 Copilot with web grounding):

| What | How often | Prompt / file |
|---|---|---|
| Curated regulation entries, events, roadmap changes | quarterly | `prompts/update-prompt.md` → `data/radar.json`, `data/events.json`, `data/roadmap.json` |
| Peer KPIs (old values move into `history`, which feeds the trend arrows) | yearly, after annual reports | `prompts/peers-update-prompt.md` → `data/peers.json` |
| EU carbon price (EUA) | quarterly or when needed | `config/market.json` → indicator `eua` → add `{date, value, note, url}` to `values` |

## Files

| File | Purpose |
|---|---|
| `index.html` (Overview), `news.html`, `regulation.html`, `peers.html`, `market.html` | The five pages |
| `assets/carbon.js` | Carbon cost exposure (Overview widget and Market page) |
| `assets/side.css`, `assets/side.js` | Shared sidebar used by Regulation, Peers and Market |
| `assets/status.js` | Status dot in the header (reads `data/status.json`) |
| `config/regulation.json`, `config/sbti.json` | Procedure numbers & consultation keywords; SBTi name patterns |
| `data/regulation.json`, `data/fabric_roadmap.json`, `data/status.json` | Created by the weekly run (do not edit by hand) |
| `data/radar.json` | All radar entries (curated + feed) |
| `data/roadmap.json` | Rows and phases of the regulation roadmap |
| `data/events.json` | Events tab |
| `data/peers.json` | Peer companies, KPI definitions and values with sources |
| `data/market.json` | Created by the market collector (do not edit by hand) |
| `data/last_run.json`, `data/archive.json` | Created automatically by the feed run |
| `config/feeds.json` | Feeds, keywords, area and impact rules |
| `config/market.json` | Market indicators, sources, areas and the manual EUA values |
| `config/peer_installations.json` | Which EU ETS sites belong to which peer |
| `data/peer_emissions.json` | Created by the ETS collector (do not edit by hand) |
| `scripts/*.py` | Collectors and the Teams post |

## EU ETS peer emissions

- **Source:** European Commission, Union Registry, "verified emissions" file (CC BY 4.0). It has one row per installation, with verified CO₂e per year.
- **Assigning sites to companies:** `config/peer_installations.json` matches installation names against patterns such as `WEPA`, `Krengel`, `Essity`, `SCA Hygiene`, `Sofidel` and `Soffass`.
- **After the first run, check the sites:** on the Peers page, click a company in the emissions table to see its sites. To fix the list, add the site code (e.g. `DE-1234`) to `exclude` or `include` for that company. The next run picks up the change.
- **Limits:**
  - Only sites in the EU, Norway, Iceland and Liechtenstein are covered, so the UK, Switzerland and non-European mills are missing.
  - The values are absolute Scope 1 emissions. They depend on size and energy setup (e.g. own CHP plants), so they don't measure efficiency.
  - A `*` marks years in which not all sites reported, so the total is not comparable for that year.
  - The global peers are not mapped, because they have no or almost no tissue mills in the EU.

## Regulation page: sources and settings

| Part | Source | Note |
|---|---|---|
| Open consultations | European Commission, "Have your say" portal | No official API – the script reads the data the website loads. If the Commission changes the site, the status dot turns amber and the last list stays. Keywords in `config/regulation.json` → `consultations.keywords`. |
| Latest official step | European Parliament Open Data (Legislative Observatory), CC BY 4.0 | Each roadmap row needs its procedure number in `config/regulation.json` → `procedures` (e.g. `"ppwr": "2022/0396(COD)"`). Rows without one (standards, delegated acts) show the curated roadmap phase instead, marked "from the roadmap". **Please check the pre-filled numbers once** on the Legislative Observatory – the run summary prints the title the Parliament has for each number. |
| Phases, milestones | `data/roadmap.json` (curated, quarterly prompt) | |

## Other automatic sources

| What | Source | Note |
|---|---|---|
| Peer news (Peers page, Overview) | Google News search per company, set in `config/peer_news.json` | Free, not officially documented by Google. Headlines link to the original outlet. |
| EUR-Lex | Public RSS "Acts of the Official Journal L", filtered by keywords in `config/feeds.json` | New EU acts on our topics appear on the News page. |
| EFRAG | Google News search limited to efrag.org (`config/feeds.json`) | EFRAG has no RSS feed of its own. |
| Free allocation (carbon cost) | Same Union Registry file as the verified emissions | Net cost = (emissions − free allocation) × EUA price. |
| SBTi status (Peers) | Science Based Targets initiative – Target Dashboard download | Company names are matched with `config/sbti.json`. SBTi asks for credit and a link, which the Peers page shows. Check their terms before making the site public. |
| Coming next (News, Data & AI) | Fabric GPS (fabric-gps.com) – a free community mirror of Microsoft's official Fabric roadmap | Not run by Microsoft. If it disappears, only this tab stays on its last list; the official roadmap is aka.ms/FabricRoadmap. |
| Grid carbon intensity (Market) | Ember, monthly electricity data (CC BY 4.0) | Countries in `config/market.json` (group `grid`). Shown as a ranked table (12-month averages) plus one tile per country. |

## Market data: sources and licences

| Indicator | Source | Frequency | Licence / note |
|---|---|---|---|
| Producer prices for tissue (C17.22), pulp (C17.11) and paper (C17.12); production volume of the paper industry (C17), all EU | Eurostat (`sts_inppd_m`, `sts_inpr_m`) | monthly | Free reuse with attribution |
| Industrial electricity and gas prices, Germany | Eurostat (`nrg_pc_205`, `nrg_pc_203`) | half-yearly | Free reuse with attribution |
| TTF natural gas | IMF via FRED (`PNGASEUUSDM`) | monthly | Public |
| Recovered paper and wood pulp producer price indices (US) | US BLS via FRED (`WPU0912`, `WPU0911`) | monthly | Public domain. Used only as a trend proxy for fibre prices |
| EUR/USD | Federal Reserve via FRED (`EXUSEU`) | monthly | Public |
| Renewable share of German power generation | Bundesnetzagentur \| SMARD.de | monthly | CC BY 4.0 |
| Wholesale electricity price Germany (day-ahead DE-LU, monthly average) | Bundesnetzagentur \| SMARD.de (filter 4169) | monthly | CC BY 4.0 |
| EU import price of pulp: NBSK (CN 4703 21) and BHKP / eucalyptus (CN 4703 29) | Eurostat Comext (`DS-045409`), unit value = import value ÷ volume, extra-EU | monthly, about 2 months' delay | Free reuse with attribution. A market signal, not a contract price |
| EU export price of recovered paper (HS 4707, all grades) | Eurostat Comext (`DS-045409`), unit value of extra-EU exports | monthly, about 2 months' delay | Free reuse with attribution |
| Recovered paper by grade: OCC (4707 10), white/office (4707 20), news & PAMS (4707 30), mixed (4707 90) – exports outside the EU; OCC and white grades also within the EU | Eurostat Comext (`DS-045409`), unit values | monthly, about 2 months' delay | Free reuse with attribution |
| German wholesale prices for recovered paper: 1.02, 1.04, 4.03, 1.11 (index 2021 = 100) | Destatis GENESIS table `61281-0006` | monthly | Datenlizenz Deutschland – Namensnennung 2.0. Needs the secret `DESTATIS_TOKEN` (free GENESIS account). Older months are kept, because the table only holds the current and previous year |
| Producer prices for corrugated paper & packaging (C17.21), EU | Eurostat (`sts_inppd_m`) | monthly | Free reuse with attribution |
| Recycled paperboard and corrugated boxes (US) | US BLS via FRED (`WPU09141105`, `WPU09150301`) | monthly | Public domain |
| Industry tab: German production and sales by grade (incl. hygiene papers) | DIE PAPIERINDUSTRIE, Statistische Kurzinformation (PDF), `scripts/collect_industry.py` | monthly | Public; figures shown with source |
| Industry tab: recovered paper utilisation rate by grade (DE), European key figures | Umweltbundesamt / DIE PAPIERINDUSTRIE, Cepi – in `data/industry.json` | yearly, by hand (prompt part 2 in `prompts/peers-update-prompt.md`) | Public; figures shown with source |
| EU carbon price (EUA) | Press / exchange reports | manual | Exchange prices are licensed, so this value is entered by hand with its source |

**Not included:** Exchange-quoted pulp prices (NBSK/BHKP) and European recovered paper prices from FOEX, Fastmarkets or EUWID are paid data; the Comext unit values above are the free alternative. If a Comext series fails, `data/debug/comext.json` shows which codes were tried; for Destatis see `data/debug/destatis.json` (it also lists further GENESIS tables found for tissue, energy and pulp prices), for the industry PDF `data/debug/industry.json`.

**Changing indicators:** edit `config/market.json`. For Eurostat, `params` filter the query. If a code doesn't exist, the collector tries `alts` and finally only geo, NACE and product, choosing the remaining codes from `prefer`. The run summary in the Actions tab shows which parameters were actually used.

## Setup (once)

1. Upload all files to the repository, keeping the folder structure (including the hidden `.github` folder).
2. Allow the workflow to save changes: **Settings → Actions → General → Workflow permissions → Read and write permissions**.
3. Turn on Pages: **Settings → Pages → Deploy from a branch → `main` / root**.
4. Start the first run: **Actions → Weekly data update → Run workflow**. Until then, the Market page shows "No data yet".
5. Share the Pages link, for example as a website tab in your Teams channel.

**Visibility:** On GitHub Free, Pages sites come from public repositories and are visible to anyone with the link. With GitHub Enterprise Cloud, the site can be limited to your organisation.

## Teams post (optional)

1. In Teams, open the channel and go to **⋯ → Workflows → "Post to a channel when a webhook request is received"**. Copy the URL it gives you.
2. In GitHub, go to **Settings → Secrets and variables → Actions → New repository secret**. Name it `TEAMS_WEBHOOK_URL` and paste the URL as the value.
3. The next run posts only if it found new high-relevance items. To switch the post off, delete the secret.

## Adapting

- **Small changes:** open the file on GitHub → ✏️ Edit → Commit.
- **Bigger changes:** give the page file to M365 Copilot, describe the change, and paste the result back.
- **Preview locally:** run `python -m http.server` and open `http://localhost:8000`. Double-clicking the HTML doesn't work, because browsers block reading JSON from disk.
- **Feeds:** add or change them in `config/feeds.json`. A feed that fails is reported in the run summary and skipped.

Summaries are aids, not legal advice. Market indices are for trend orientation only. Always check the linked source.

## Look & feel (Nov 2026)

- **Search window:** the "Search · Ctrl K" button in the header (or the "/" key) opens one search across all pages, with filters by type and a preview of the selected result (`assets/search.js`).
- **Overview as a briefing:** summary sentence, five key numbers (choose them under "Customize"), the monthly round-up, the next 30 days – and your own cards below.
- **Dark mode:** the half-moon button in the header switches Auto (follows the computer) → Light → Dark (`assets/theme.js`). Colours in the pages are written as `var(--d-<colour>-<role>, <light colour>)`; the dark values live at the end of `assets/theme.css`. When you add a new colour, write it the same way – or just use the light colour, it will then stay the same in dark mode.
- **Smooth page changes:** pages fade into each other (CSS view transitions; browsers without support simply switch).
