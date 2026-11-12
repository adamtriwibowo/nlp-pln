---
name: add-qa
description: Help the user add validated QA entries to data/eval/qa.jsonl.
---

# add-qa

The user writes the questions, reference answers and gold_chunk_ids; you never invent them. Validate against the Pydantic schema (id, question, reference_answer, gold_chunk_ids, type, split, source_note) and help find candidate chunks with `k2 qa-candidates`.
