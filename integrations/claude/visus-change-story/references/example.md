# Synthetic story

Merge these records into the generated draft, preserving its metadata. Replace `CHANGE_REF_FROM_PREPARE` with actual captured refs. Optional decisions and impact should be included only when supported.

```json
{
  "entities": [
    { "id": "save-request", "label": "Save request", "refs": ["CHANGE_REF_FROM_PREPARE"] },
    { "id": "settings-form", "label": "Settings form", "refs": ["CHANGE_REF_FROM_PREPARE"] }
  ],
  "stories": [{
    "id": "retain-settings",
    "title": "Keep entered settings when saving fails",
    "summary": "A failed save leaves entered values visible for another attempt.",
    "groups": [{ "kind": "implementation", "refs": ["CHANGE_REF_FROM_PREPARE"] }],
    "decisions": [{
      "summary": "Clear the form after a successful save",
      "rationale": "Preserving values avoids repeated input.",
      "refs": ["CHANGE_REF_FROM_PREPARE"]
    }],
    "impact": [{
      "from": "save-request", "to": "settings-form", "level": "direct",
      "summary": "A failed request preserves the form values.",
      "refs": ["CHANGE_REF_FROM_PREPARE"]
    }]
  }]
}
```
