---
name: metonia-interview
description: Clarify a consequential plan or feature through a short, adaptive Metonia decision interview with selectable options; do not use for routine confirmations or facts discoverable from files.
---

# Metonia Interview

Use the bundled `metonia_interview` tool for structured Pi TUI questions. Ask
only when an answer changes scope, architecture, risk, cost, ownership, or
acceptance. Inspect files and documentation first; never ask the user to repeat
facts that can be discovered safely.

Choose a depth from the request:

- **quick:** only decisions that block useful progress;
- **deep:** goals, assumptions, boundaries, tradeoffs, and success criteria;
- **adversarial:** contradictions, failure modes, reversibility, and hidden
  operational cost.

Ask one dependent decision at a time; batch only independent questions. Offer
two to four clear choices with one defensible recommendation and a one-line
consequence for each. Preserve the tool's free-form option. Carry accepted
answers forward and do not ask them again.

Stop when remaining uncertainty can be handled by a stated, reversible
assumption. Summarize the confirmed goal, decisions, non-goals, acceptance
criteria, risks, and open questions before acting. If interactive UI is not
available, fall back to one concise chat question at a time.
