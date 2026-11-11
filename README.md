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
| 2 | Danaher | DHR | DBS / platform M&A, 1+1>2 operating system |
| 3 | Lifco | LIFCO.B | Swedish autonomy model reference |
| 4 | HEICO | HEI | Niche aero serial acquirer, long compounding |
| 5 | TransDigm | TDG | Proprietary aero parts + aggressive CA |
| 6 | Addtech | ADDT.B | Deep Swedish compounding history |
| 7 | Lagercrantz | LAGR.B | High-quality Nordic niche acquirer |
| 8 | Halma | HLMA | UK critical-niche autonomy compounder |
| 9 | Topicus | TOI | European VMS runway, CSU orbit |
| 10 | Roper | ROP | Asset-light software/tech consolidator |
