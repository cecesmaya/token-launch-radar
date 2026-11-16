# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/cecesmaya/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/cecesmaya/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar that ranks 198 pre-token DeFi protocols from a sealed DefiLlama snapshot by implied value, with a concrete farm plan and a FARM / THIN / SKIP verdict for each protocol and a sortable, filterable dashboard. The value model is a size curve fitted on the live-token set and chosen over the category medians by a blind out-of-sample test, shown in full on the dashboard's Model tab.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22 or newer, standard library only, no network. The program reads the sealed snapshot, scores every pre-token protocol, writes the ranked board to `out/board.json`, copies the dashboard and screenshots to `out/`, and writes `out/dossier.json`, the summary the judge reads.

## How it works

Implied value is TVL priced off the live-token set, times a growth factor times a maturity factor. Two candidates price the base: the category medians (the median market-cap-to-TVL ratio of live-token protocols in the same category) and a size curve (a log-log fit of market cap on TVL over all 119 live-token protocols). Both are fitted on a training half of the live set and tested blind on the held-out half — a random holdout and a time split that trains on the older half and tests on the younger — against a naive global-median baseline. On this snapshot the curve wins on the pooled held-out error (1.150 vs 1.462 median |log error|), so the board prices off the curve: ln(market cap) = 7.79 + 0.47 × ln(TVL). The slope is below 1, so market cap grows more slowly than TVL and a flat multiple would overprice the giants. Growth is the protocol's 7-day TVL change, clamped, at half weight. Maturity rewards protocols that have run longer with no token. Wrapped, bridged, staked and exchange-branded products are excluded from ranking, as are live-token protocols, which are shown separately at their market values. The validation is reported honestly on the dashboard, errors included: the typical prediction lands within about three times the market's own value, so the board is a ranking, not a price.

Each ranked protocol carries a farm plan: seven concrete steps with what to do, what it costs and how long it takes, derived from the protocol's category, chains and size. The first step is the verdict — FARM when the protocol's implied value is at least a million times the gas the plan spends, THIN at a hundred thousand times, SKIP below — so the plan is netted, not just listed.

## Dashboard

`dashboard/` is a static page with no framework and no network. It sorts and filters the board (including by farm verdict), opens a detail view per protocol with the model math and the farm plan, shows the live-token set at market values, and has a model view with the blind-test results, the fitted curve, the rival category multiples and an interactive sandbox that re-ranks the board under different growth weights, maturity floors and multiple caps.

---

<sub>Entered on [make.fun](https://make.fun/?ref=rqexrnj5&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
