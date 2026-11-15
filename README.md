# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/cecesmaya/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/cecesmaya/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar that ranks 198 pre-token DeFi protocols from a sealed DefiLlama snapshot by implied value, with a concrete farm plan for each protocol and a sortable, filterable dashboard.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22 or newer, standard library only, no network. The program reads the sealed snapshot, scores every pre-token protocol, writes the ranked board to `out/board.json`, copies the dashboard and screenshots to `out/`, and writes `out/dossier.json`, the summary the judge reads.

## How it works

Implied value is TVL times a category multiple times a growth factor times a maturity factor. The category multiple is the median market-cap-to-TVL ratio of live-token protocols in the same category, taken from the snapshot itself, so a DEX is priced like a DEX and a lending market like a lending market, never by a flat multiple. Growth is the protocol's 7-day TVL change, clamped, at half weight. Maturity rewards protocols that have run longer with no token. Wrapped, bridged, staked and exchange-branded products are excluded from ranking, as are live-token protocols, which are shown separately at their market values.

Each ranked protocol carries a farm plan: six concrete steps with what to do, what it costs and how long it takes, derived from the protocol's category, chains and size.

## Dashboard

`dashboard/` is a static page with no framework and no network. It sorts and filters the board, opens a detail view per protocol with the model math and the farm plan, shows the live-token set at market values, and has a model view with the comparables table and an interactive sandbox that re-ranks the board under different growth weights, maturity floors and multiple caps.

---

<sub>Entered on [make.fun](https://make.fun/?ref=rqexrnj5&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
