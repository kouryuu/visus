---
name: change-story
description: Maintain the visus change narrative while implementing a coherent repository change and before handing off work.
---

# Publish a change story

Use the visus CLI and a JSON draft to keep the review report aligned with the saved source. Run commands from the Git worktree root, or pass `--root <worktree>`. Draft and input-file paths are resolved relative to that root. Stories describe author intent; do not claim that the tool independently verified behavior.

1. After saving a coherent implementation step, run `visus prepare --draft .visus/draft-01.json`. Use a new draft filename for each publication. Preparation generates the update ID, source ID, and expected revision; an existing draft is never overwritten. Use only the returned change-unit references. Page through large inventories with `--offset N --limit N` without `--draft`.
2. Edit the generated draft's `stories`, `entities`, and optional `exclusions`. Keep the generated `updateId`, `sourceId`, and `expectedRevision`. Keep stable story IDs, describe concrete intent, and add decisions, evidence references, and direct/inferred impact only when supported by your inspection. Run `visus schema` for the complete authoring contract.
   - Write the title and summary around what a reader can now do, see, or understand. Describe the concrete change and its effect in plain language.
   - Give affected entities readable names. Explain each supported relationship in a sentence; the explorer uses these labels and summaries to draw the visual explanation.
   - Use decisions to explain the choices and their reasons. Keep file paths and line references as supporting inspection context.
3. Mark tests as changes to tests. State test purpose separately from execution; report results as agent-reported only when you actually ran them.
4. Keep unrelated stories intact. Drafts contain updates: publication preserves existing stories and entities whose references remain valid. Use `removeStories` or `removeEntities` to explicitly remove obsolete records. Omit `exclusions` to retain valid existing exclusions; supplying it replaces the exclusion list. Give every exclusion a specific reason.
5. Run `visus validate --file .visus/draft-01.json`, then `visus publish --file .visus/draft-01.json`. Validation checks schema, references, source freshness, and the expected revision without saving a report. A valid partial update reports `incomplete` and pending references; it may be published incrementally. Invalid JSON, unknown references, or stale source/revision return a nonzero exit code. Fix the draft before publishing. If preparation is stale, generate a new draft and move the explanations into it using fresh references. A changed published draft needs a new generated update ID; retrying the same unchanged draft returns `already-published` and its saved acknowledgment. That acknowledgment does not recheck current freshness; use `check`.
6. Before handoff, run `visus check`. It returns a nonzero exit code for missing, stale, or incomplete reviews. Repair stale references or pending units, then check again. If the stop hook reports that its retry limit was reached, explain the unresolved state without claiming completion.

## Draft example

The following story is synthetic. Keep the metadata from the generated draft and replace every `CHANGE_REF_FROM_PREPARE` with a real reference returned by preparation.

```json
{
  "updateId": "UPDATE_ID_FROM_DRAFT",
  "sourceId": "SOURCE_ID_FROM_DRAFT",
  "expectedRevision": null,
  "author": "agent",
  "entities": [
    { "id": "settings-request", "label": "Save request", "refs": ["CHANGE_REF_FROM_PREPARE"] },
    { "id": "settings-screen", "label": "Settings screen", "refs": ["CHANGE_REF_FROM_PREPARE"] }
  ],
  "stories": [
    {
      "id": "keep-settings-on-failure",
      "title": "Keep your settings when saving fails",
      "summary": "A failed save keeps the entered values visible and offers a retry.",
      "groups": [{ "kind": "implementation", "refs": ["CHANGE_REF_FROM_PREPARE"] }],
      "decisions": [{
        "summary": "Clear the form only after a successful save",
        "rationale": "Keeping entered values avoids making someone repeat their work.",
        "refs": ["CHANGE_REF_FROM_PREPARE"]
      }],
      "impact": [{
        "from": "settings-request",
        "to": "settings-screen",
        "level": "direct",
        "summary": "A failed request shows recovery feedback while preserving the form values.",
        "refs": ["CHANGE_REF_FROM_PREPARE"]
      }]
    }
  ]
}
```

## Optional MCP interface

If the agent has MCP tools but no shell or file access, use `prepare_review`, `publish_update`, and `check_review` with the same update contract. Use the source ID and expected revision returned by `prepare_review`, choose a new update ID for each changed publication, and publish the authored records as the `update` argument. The CLI workflow needs no MCP configuration. The current MCP adapter uses stdio alongside the agent; it does not expose a remote HTTP endpoint.

Do not invent rationale, rejected alternatives, test success, or effects that the code does not support. If intent is unknown, say so while accounting for the captured changes.
