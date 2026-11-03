# UI error writing guide

Applies to every user-facing error, validation message, warning, loading state, empty state, unavailable state, and success statement across the system. Uses the Copy Editing skill's clarity, plain-language, specificity, and clear-next-step checks alongside the approved UI/UX What / Why / Next Action pattern.

## Write each error this way

- Give the outcome in the title: “Pick list was not created.”
- Name the problem using the visible field label: “Customer PN must be 100 characters or fewer.”
- Give one useful next step: “Shorten it or leave it blank, then try again.”
- Keep each sentence short. Prefer familiar words and a neutral tone.
- State a cause only when it is known. An unknown failure needs an honest retry message.
- Keep internal property names, validation paths, SQL, stack traces, and raw exception text out of the interface.
- Combine repeated errors caused by split allocations. Do not label allocation indexes as visible item-line numbers.
- Match the action to the cause. Field errors need a review/edit action; changed stock may need an inventory refresh.
- Show field errors beside the field when possible, and preserve the draft while the user corrects it.
- Check both what failed and whether the field should fail at all. Optional blank fields must not produce required-field errors.

## Examples

| Situation | Message |
|---|---|
| Customer PN too long | Customer PN must be 100 characters or fewer. Shorten it or leave it blank. |
| Invalid boxes | Enter a whole number of boxes greater than zero. |
| Missing allocation | Some boxes have no location. Select a location and enter the remaining boxes. |
| Stock changed | The stock changed while you were working. Refresh inventory and review your selection. |
| Missing permission | You do not have permission to create pick lists. Ask an administrator for access. |
| Unreadable DRA file | The DRA file could not be read. Check that it is a valid Excel, CSV, or PDF file, then upload it again. |
| Unknown failure | The request could not be completed. Try again. If it happens again, contact an administrator. |

## State accuracy

- Loading: say what is loading. Do not display success before the operation completes.
- Empty: distinguish no records from no search results. Offer only actions supported by that screen and the user's access.
- Unavailable: a failed or timed-out read is not an empty list or a zero total. Explain what could not load and offer a retry.
- Offline: distinguish saved on this device, waiting to sync, and confirmed by the server. Explain which action needs a connection.
- Success: describe only the confirmed result. A refused request, partial save, or unconfirmed clipboard operation must not announce success.
- Partial success: name what was saved and what still needs attention. Avoid asking users to repeat an operation that already completed.
- Unknown errors: give an honest, specific workflow fallback. Do not invent a stock, network, permission, or validation cause.

## Shared implementation

`lib/ui/user-messages.ts` provides the common display boundary for stable error codes, validator arrays, and technical failures. Pass an accurate, workflow-specific fallback. It preserves clear authored wording, translates known field names/codes, deduplicates repeated messages, and suppresses internal diagnostic details. Shared alerts, form fields, table empty states, and feature error displays use this boundary. Keep diagnostic details in server logs and keep machine-readable API codes unchanged.

Pick-list generation also uses `lib/withdrawal/error-messages.ts` for its specific recovery links. Review every new or changed message against this guide. Do not treat the formatter as a substitute for reviewing the actual cause, field label, action, and state.
