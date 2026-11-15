# Token Radar — pre-token protocols ranked by implied launch value

A make.fun `token-radar-01` entry. `main.ts` (Node 22, standard library only) reads the
sealed DefiLlama snapshot at `/input/snapshot.json`, scores every rankable pre-token protocol,
and writes the ranked board, the dashboard and its dossier to `/output`.

## The model (radar-2)

No protocol name is ever special-cased. The implied value follows only from the snapshot's
own figures:

- **Category multiple** — calibrated from the snapshot itself: the median mcap / TVL of the
  live-token protocols in that category, winsorized to 0.02–3.0× and shrunk toward the global
  median by n / (n + 6), so a category with one live token does not set its own price.
- **Base** = TVL × category multiple.
- **Growth** = 1 + clamp(7-day TVL change, −50%, +150%) × 0.6.
- **Maturity** = 0.7 + min(age, 4y) / 4y × 0.5 — a long run with no token recorded carries
  more pent-up launch value.
- **Breadth** = 1 + 0.03 × extra chains (max 5).

`implied = base × growth × maturity × breadth`.

The board ranks all 198 rankable pre-token protocols: the snapshot's 40-protocol watchlist
plus every rankable pre-token protocol below its $50M floor. Protocols whose token already
trades are kept apart in the Live view at the market's own value. Each row carries a
seven-step farm plan derived from the protocol's own category, chains, TVL and age, with a
cost and a time for every step.

## The dashboard

`dashboard/` is a static page with no network: a sortable, filterable board, a watchlist
view, a live-token view, a detail drawer for every protocol (the model behind its value,
the farm plan, live comparables in its category) and the calibration table the model
computed. It answers to the URL hash (`#tab=watchlist`, `#cat=Lending`,
`#detail=<slug>` …).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

## License

MIT — see `LICENSE`.
