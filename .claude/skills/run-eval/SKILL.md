---
name: run-eval
description: Run an evaluation config on a split and compare with previous runs.
---

# run-eval

Retrieval metrics: `make eval CONFIG=<id> SPLIT=<dev|test>` (B1, B2, M1, M2). Generation metrics: `make eval-gen CONFIG=<id> SPLIT=<dev|test>` (B0, B1, M1, M3; needs JUDGE_MODEL != LLM_MODEL). Summarize metrics in a table and compare with the previous run in runs/. Use SPLIT=test only for final evaluation after the test split is frozen.
