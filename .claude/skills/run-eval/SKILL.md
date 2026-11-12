---
name: run-eval
description: Run an evaluation config on a split and compare with previous runs.
---

# run-eval

Run `make eval CONFIG=<id> SPLIT=<dev|test>`. Summarize metrics in a table and compare with the previous run in runs/. Use SPLIT=test only for final evaluation after the test split is frozen.
