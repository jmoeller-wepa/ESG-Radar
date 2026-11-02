# ESG Data & Tech Radar

A lightweight web page for the sustainability team. It tracks regulation, tool updates and best practice across seven ESG areas:

Climate & Energy · Forests & Biodiversity · Circularity & Packaging · Water & Pollution · People & Supply chain · Reporting & Governance · Data & AI

**Features**
- Area bar to switch areas; the deadlines panel and the cards follow the selected area. Views can be shared as links, e.g. `…/#area=circularity` or `…/#tab=monthly`.
- **New** tab: entries added since your last visit (remembered per browser).
- **Star** on each card to save it; the **Saved** button shows your saved cards (also per browser, no login).
- Optional monthly **Teams post** with the new high-relevance items (see below).

It only uses public information. There are no licenses, no servers and no internal data.

## How it works

| Part | What it does |
|---|---|
| `index.html` | The radar page. It reads `data/radar.json` and shows deadlines, filters and cards. |
| `peers.html` | The peer benchmark page. It reads `data/peers.json` (KPIs) and `data/radar.json` (news). |
| `data/peers.json` | Peer KPIs with sources. Updated yearly with `prompts/peers-update-prompt.md`. |
| `data/radar.json` | All entries. The feed run adds to it automatically. |
| `config/feeds.json` | RSS feeds, keywords and automatic relevance rules. |
| `.github/workflows/collect-feeds.yml` | Runs on the 1st of every month, adds and rates new feed items, and publishes. |
| `scripts/collect_feeds.py` | The collector the workflow runs. It also assigns areas by keyword (`areaKeywords` in `config/feeds.json`). |
| `scripts/post_teams.py` | Sends the monthly Teams post (only if a Teams webhook is set up). |
| `data/last_run.json` | Created automatically: what the last feed run added (used for the Teams post). |
| `prompts/update-prompt.md` | Optional prompt for curated regulation and best-practice entries (e.g. in M365 Copilot). |
| `data/archive.json` | Created automatically: feed items older than 365 days move here. |

**Fully automatic monthly rhythm, no review needed**
- On the 1st, the workflow reads the feeds and keeps items that match the keywords. It rates them automatically:
  - The monthly **Power BI / Fabric feature summaries** are always rated *high* and appear in the "Monthly feature updates" tab.
  - Items matching a feed's `highKeywords` are rated *high*, and everything else gets the feed's `defaultRelevance`.
- Items older than a year are archived automatically.
- *Optional, e.g. quarterly:* run `prompts/update-prompt.md` in M365 Copilot to add curated regulation entries with deadlines and a "Why it matters for us" line.

## Setup (about 15 minutes, once)

1. **Create a repository** on GitHub, e.g. `esg-radar`, and upload all files in this folder, keeping the folder structure (including the hidden `.github` folder; see the tip below).
2. **Allow the workflow to save changes:** Settings → Actions → General → *Workflow permissions* → **Read and write permissions** → Save.
3. **Turn on the website:** Settings → Pages → *Build and deployment* → Source: **Deploy from a branch**, Branch: `main`, folder `/ (root)` → Save. After a minute the page is live at `https://<org-or-user>.github.io/esg-radar/`.
4. **Run the first feed collection:** Actions tab → *Collect feeds (monthly)* → **Run workflow**. The run summary lists which feeds worked and what was added.
5. Share the Pages link with the team, e.g. as a tab in your Teams channel (＋ → Website).

**Tip for uploading:** Folders starting with a dot are hidden on Windows and macOS and sometimes skipped when dragging files into GitHub. If the Actions tab shows no workflow after uploading, create it directly on GitHub: *Add file → Create new file*, name it `.github/workflows/collect-feeds.yml`, and paste the file's content.

**Visibility:** On GitHub Free, Pages sites are published from public repositories and are visible to anyone with the link. That's fine for public content, but check your internal policy. With GitHub Enterprise Cloud you can make the repository and the Pages site private, limited to members of your organisation.

## Peer benchmark page (`peers.html`)

Reached via **Radar | Peers** in the top bar. It compares public sustainability KPIs of 12 tissue companies in two peer groups (Tissue Europe, Global tissue), with a KPI filter per area (Overview, Climate & Energy, Forests & Fibre, Circularity & Packaging, Water, People, Ratings).

- **Colours:** each value is compared within the selected peer group. Green = best, light green = better than the median, grey = around the median, red = below the median. Columns with fewer than 3 values stay grey.
- **Every value links to its source**, with the year underneath. Empty cells = not found in public sources.
- **Peer profiles** below the table show key KPIs and targets, plus the latest news about that company from the radar feeds. The news updates automatically each month.
- **KPI values** are in `data/peers.json` and don't come from feeds. Refresh them once a year with `prompts/peers-update-prompt.md` (one company per run, e.g. in M365 Copilot).
- Shareable views: `peers.html#group=global&set=climate`.

## Monthly Teams post (optional)

After each feed run, the new high-relevance items and the next three deadlines can be posted to a Teams channel. If there's nothing new and important, nothing is posted.

1. In Teams, open the channel → **⋯** → **Workflows** → template **"Post to a channel when a webhook request is received"** → follow the steps and copy the URL it shows at the end.
2. In GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Name: `TEAMS_WEBHOOK_URL`, value: the copied URL → **Add secret**.
3. Test: Actions → *Collect feeds (monthly)* → **Run workflow**. It posts only if this run found new high-relevance items.

To switch it off, delete the secret. The webhook URL is like a password: keep it only in the GitHub secret.

## Adapting the page

The page is one file, `index.html`, and can be changed anytime:
- **Small changes** (texts, colours, labels): open `index.html` on GitHub → ✏️ Edit → Commit. The live page updates within about a minute.
- **Bigger changes** (new sections, charts, filters): give `index.html` (and, if useful, `data/radar.json`) to M365 Copilot or another AI assistant, describe the change, and paste the result back into the file on GitHub.
- **Before committing a bigger change**, you can preview it locally: run `python -m http.server` in the folder and open `http://localhost:8000`. Double-clicking `index.html` doesn't work, because browsers block reading the JSON file from disk.

## Changing feeds and rules

- **Add a feed:** copy a block in `config/feeds.json` and change `name`, `url`, `type` (`regulation` / `tool` / `practice`) and the keywords. An empty `keywords` list takes every item from that feed.
- **Less noise:** remove broad keywords or lower `maxItems`. **More coverage:** add keywords.
- **Edit a curated entry:** change it directly in `data/radar.json`. Deadline tiles come from `nextDate` + `nextDateLabel`; the area pills come from `areas` (`climate`, `forests`, `circularity`, `water`, `people`, `reporting`, `data`).
- **Areas for feed items:** an item gets every area whose keywords (`areaKeywords` in `config/feeds.json`) match, otherwise the feed's `defaultArea`. Tool feeds (`onlyDefaultArea: true`) always go to Data & AI.
- If a feed URL stops working, the run reports it and skips it. Nothing else breaks.

Summaries are aids, not legal advice. Always check the linked source. Some Fabric/Power BI feature statuses in the starter entries cite third-party blogs; verify them on Microsoft Learn before planning.
