# M&A Compounders Tracker

A lightweight website to **screen, rank, and track** serial acquirers / M&A compounders that can be traded on Interactive Brokers.

## What it includes

1. **What we look for** — screening pillars for roll-ups and decentralized serial acquirers (deal machine, multiple arbitrage, 1+1>2, runway, capital allocation, incentives, cash quality).
2. **Rankings** — first-pass weighted scores plus **your own rank** (drag rows or edit rank #; saved in browser `localStorage`).
3. **Country tabs** — companies grouped by **industry** within each country.
4. **Company detail** — thesis, pillar scores, sources, and a development log you can append over time.

Data lives in `data/companies.json` and `data/framework.json` (no PDFs).

## Sources informing the first ranking

- Books / papers in the Drive *M&A Compounders* folder (Thorndike, Nyland, Mauboussin, Demesne, Serial Acquirers special report, etc.)
- Investor letters and interview notes (CSU orbit, Lifco, etc.)
- Public X discourse (Quartr 75+ list, AcquirerHQ, PrivatEquityGuy, ValueByMarkus, Compounding Quality, Dutch Investors, and others)

This is **not investment advice**. Scores are a starting point for research.

## Run locally

Serve the folder over HTTP (ES modules need a server):

```bash
# Python
python -m http.server 8080

# or Node
npx --yes serve .
```

Open `http://localhost:8080`.

## Edit companies

Add or update names in `data/companies.json`:

- `ticker` / `ibkr` / `exchange` / `country` / `industry`
- `scores` (1–10 per pillar in `framework.json`)
- `rank` (default order)
- `ceo`, `added` (optional)
- `segment: "banks"` + `bank` object (banks only)
- `segment: "emerging"` + `emerging` object (emerging acquirers only)
- `thesis`, `sources`, `developments`

Then refresh the site. User ranks/developments stay in the browser until reset.

## Deploy (GitHub Pages)

1. Push this repo to GitHub.
2. Settings → Pages → Deploy from branch `main` / root (or `/docs` if you prefer).
3. Site will be available at `https://<user>.github.io/<repo>/`.

## Top of the first-pass ranking

| Rank | Company | Ticker | Why (short) |
|---:|---|---|---|
| 1 | Constellation Software | CSU | Elite VMS deal machine + capital hurdles |
| 2 | Amphenol | APH | Decentralized interconnect acquirer, Norwitt since 2009 |
| 3 | Waste Connections | WCN | Founder-led waste roll-up in exclusive markets |
| 4 | Danaher | DHR | DBS / platform M&A, 1+1>2 operating system |
| 5 | Lifco | LIFCO.B | Swedish autonomy model reference |
| 6 | HEICO | HEI | Niche aero serial acquirer, long compounding |
| 7 | FirstService | FSV | Hennick partnership model in property services |
| 8 | AMETEK | AME | Niche instruments + operating system, Zapico |
| 9 | The Ensign Group | ENSG | Local-leader autonomy in skilled nursing |
| 10 | Watsco | WSO | HVAC buy-and-build, Nahmad since 1972 |

## Valuation %

Each company shows where its market multiple sits vs roughly the last ten years of its own history:

- **0%** = at the low end of the range (cheaper)
- **100%** = at the high end (richer)

Market multiple by type:

- Most serial acquirers / industrials / software → **EV/EBITDA** (spot); the 0–100% bar uses EV/EBITDA when history is long enough, otherwise trailing **P/E** for the ~10y range
- Banks → **P/TBV** (or P/B / P/E if tangible book history is thin)

Refresh data with:

```bash
python scripts/fetch_valuations.py
```

Writes `data/valuations.json` (Yahoo Finance via `yfinance`).

## Changelog

- **2026-11-12** — Added valuation % of ~10y range (0=cheap, 100=rich) using market-driven multiples (EV/EBITDA / P/TBV), with refresh script `scripts/fetch_valuations.py`.
- **2026-11-12** — New **Emerging** segment: 50 smaller or newer acquirers across 15 countries in their own tab (group by country, industry or score), with `emergingLens` in `framework.json`. Each has `segment: "emerging"` and an `emerging` object (`sector`, `size`, `prove`).
- **2026-11-12** — New **Banks** segment: 14 bank consolidators (12 US, BAWAG, OTP) in their own tab with a bank-specific lens (`bankLens` in `framework.json`). Each bank has `segment: "banks"` and a `bank` object (`status`, `assets`, `record`, `proof`); status is Proven / Steady / Digesting depending on whether returns improved after its deals. Rankings gained a segment filter.
- **2026-11-11** — Added 38 established acquirers screened for proven CEOs and remaining runway (US, Canada, Sweden, Ireland, Denmark, Switzerland, Netherlands, UK, Australia, Japan). New optional fields in `companies.json`: `ceo` (shown in the detail view, searchable) and `added` (most recent batch gets a "New" badge).
