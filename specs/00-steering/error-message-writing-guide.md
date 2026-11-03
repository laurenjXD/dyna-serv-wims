# User-Facing Message and State Guide

Status: Canonical cross-system writing and behavior guide
Scope: Every message or visible state presented to a user in Dyna-Serv WIMS

This guide applies across warehouse, office, administration, organization portal, background processing, documents, notifications, and offline workflows. Use it with the local `/ui-ux-pro-max` skill whenever designing, implementing, or reviewing UI feedback and state presentation. Approved feature specifications define workflow outcomes; this guide defines how those outcomes are communicated.

## Shared message contract

Every message must be accurate, plain, and useful. Name the relevant record or action when known, explain what happened or what is needed, and provide a concrete next step when one exists. Use the visible field and record names shown in the interface. Keep messages close to the affected control or result, and make important status information available to assistive technology.

Do not show raw exception text, validator paths, SQL, internal capability codes, or implementation details. Route dynamic failures through `lib/ui/user-messages.ts` with a workflow-specific fallback. A failed read must remain visibly unavailable rather than appearing as an empty result. A partial or failed write must never be described as fully successful.

## Success states and statements

Success copy reports a completed, confirmed outcome. Use a specific action and record where available, such as “Receiving confirmed for WRR-1042.” Avoid vague statements such as “Success,” “Done,” or “Everything is complete” when the user needs to know what changed.

Show success only after the owning operation confirms completion. Physical operations—including receiving, picking, putaway, dispatch, transfer, and inspection disposition—must wait for explicit server confirmation. A queued, syncing, pending, or partially completed operation must use that exact state and must not be presented as completed.

For multi-part workflows, name the part that succeeded and any part that remains. For example, if dispatch succeeded but PDF generation failed, report the dispatch as confirmed and the document as needing retry. Never let a secondary failure erase or overstate the primary operation's actual outcome.

Where useful, pair confirmation with the next action: open or print the confirmed record, continue to the next line, return to the work queue, or retry a failed secondary task. Do not add a next step when none is relevant. Success feedback should be brief, visible long enough to understand, and should not interrupt the next operational action.

## State wording

| State | Message behavior |
|---|---|
| Success | State exactly what completed and identify the record or result where possible. Include the next action when useful. |
| Partial success | Separate completed work from incomplete work; name the remaining action. |
| Pending or queued | Say what is waiting and what will happen next. Do not imply completion. |
| Loading or syncing | Say what is being checked or synchronized; retain context and show progress where practical. |
| Empty | Say that no matching work or records were found, include relevant filter/date context, and offer a useful action. |
| Validation | Identify the visible field and correction needed; preserve valid entered values. |
| Warning | Explain the condition and consequence, then the decision or action available. |
| Unavailable or failed read | Name the unavailable data or service and offer retry or another safe path. Never substitute zero or an empty state. |
| Conflict or stale record | Explain that the record changed or is no longer current; direct the user to refresh and review. |
| Forbidden | Explain that access is unavailable without revealing protected data; offer safe navigation or an access path. |
| Offline | State whether work is blocked, queued, or available locally and how to recover. Never imply server confirmation. |

## Review checklist

- Does the message describe the actual confirmed outcome and its scope?
- Could a user mistake queued, pending, partial, or failed work for completed work?
- Does the wording use names visible in the interface and avoid internal details?
- Is the next action concrete and available to this user?
- Can users distinguish unavailable data from an empty result?
- For UI feedback, does the presentation follow the local `/ui-ux-pro-max` skill and the shared edge-case contract in `ui-ux-edge-case-state-matrix.md`?
