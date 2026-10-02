---
name: change-story
description: Maintain the diff-vis change narrative while implementing a coherent repository change and before handing off work.
---

# Publish a change story

Use the local diff-vis MCP server to keep the review report aligned with the saved source. Stories describe author intent; do not claim that the tool independently verified behavior.

1. Call `prepare_review` before writing the first story. Use only the returned source ID, expected revision, and change-unit references.
2. After each coherent implementation step, publish the affected complete story records. Keep stable story IDs, describe concrete intent, and add decisions, evidence references, and direct/inferred impact only when supported by your inspection.
3. Mark tests as changes to tests. State test purpose separately from execution; report results as agent-reported only when you actually ran them.
4. Keep unrelated stories intact. Explicitly remove obsolete story IDs. Give every exclusion a specific reason.
5. Before handoff, call `check_review`. Repair stale references or pending units, then check again. If the stop hook reports that its retry limit was reached, explain the unresolved state without claiming completion.

Do not invent rationale, rejected alternatives, test success, or effects that the code does not support. If intent is unknown, say so while accounting for the captured changes.
