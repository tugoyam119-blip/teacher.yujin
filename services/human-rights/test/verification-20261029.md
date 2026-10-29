# Human-rights assessment verification — 2026-10-29

Baseline: c5bb132506ca4eb771e7482f30aed34d44c7adbb (PR #64; includes #63).

## Production evidence (read-only)
Railway yt-human-rights / production: deployment c9916f5b-3756-4ff4-a411-b160fb3cecf8, SUCCESS, commit c5bb132, created 2026-10-27T04:22:06.268Z. Thus #63 and #64 were deployed. No deployment/configuration changes were made during this investigation. The public student login and no-save teacher preview loaded in the cloud browser. No actual student identity was used.

## Code review correction
The revision card is rendered by the shared shell() in student_2.js. An initial assumption that the two student_3.js views omitted the control was incorrect. The attempted UI additions were reverted before review completion. No product code change remains in this PR.

## Validation
node --test services/human-rights/test/*.test.js: 21/21 passed.
- Real local HTTP server with temporary fixture roster, progress and time directories: unsubmitted eligible student login, short reflection draft, reconnect/read-back, 400-character completion, policy/submission status preservation.
- Local HTTP server: active makeup revision with regular time exhausted, manual save and resubmit, old submission archive retained, expired makeup blocked. Regular time, closed/paused sessions, identity mismatch, validation and manual-save protections retained.
- VM with DOM stubs: ten alternating polling/heartbeat responses preserve the unsubmitted reflection screen; failed draft save restores editable controls and retains text.
- Existing reopen test still expected makeup rejection from before #64. Updated expectation and added positive makeup and expiry cases.

## Unresolved input-blocking report
User confirms multiple students cannot type, rather than merely seeing the red minimum-length indicator. That symptom has NOT been reproduced or fixed. Red styling below 400 characters does not itself disable the textarea. Paste/drop is intentionally blocked by existing code; ordinary typing and IME input types are not explicitly blocked. No claim is made about the affected devices or actual cause.
Full browser student E2E is incomplete: local Playwright package is present but browser executable is absent. HTTP integration and VM tests do not validate mobile keyboards, Korean IME, actual focus or browser-specific behavior. Production cloud browser inspection completed the no-save teacher preview through submission and reflection. The red field accepted sequential Korean input (21 characters); the shared revision button was visible. This preview bypasses actual student session polling, so it does not reproduce the reported student condition. No actual student records were modified.
Manual reflection drafts restore from server. Unsaved reflection text is only held in memory; reload before explicit draft save is not guaranteed to restore it.

## Release boundary
This PR is review-only. Do not merge or deploy without separate approval: Railway watches main and services/human-rights/**, so merging can automatically deploy. Outstanding evidence needed for the typing symptom: exact affected student/URL/device/browser or a short recording showing the field and red message; inspect read-only student state before any production student interaction.

