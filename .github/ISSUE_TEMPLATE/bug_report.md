---
name: Bug
about: Report something that is broken or behaving incorrectly
title: "fix: [brief description]"
labels: "bug"
assignees: ""
---

## Summary

_One sentence: what is broken and where._

---

## Steps to Reproduce

1. [First step]
2. [Second step]
3. [...]

**Expected behaviour:** [What should happen]
**Actual behaviour:** [What actually happens]

---

## Environment

- **Branch / commit:** <!-- git log --oneline -1 -->
- **Python version:** <!-- python --version -->
- **Running via:** <!-- Docker Compose / local venv / CI -->
- **Relevant config:** <!-- any non-default settings -->

---

## Logs / Error Output

```
paste stack trace or relevant log lines here
```

---

## Possible Cause _(optional)_

_If you have a hypothesis about the root cause, note it here._

---

## Definition of Done

- [ ] Root cause identified and documented in this issue
- [ ] Fix implemented and does not introduce regressions
- [ ] Regression test added (test that would have caught this bug)
- [ ] Code reviewed and approved

---

## Metadata

- **Severity:** <!-- Critical / High / Medium / Low -->
- **Affects:** <!-- API / Worker / DB / Ingest / other -->
