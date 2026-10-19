# GitHub connector authentication/network proof — 2026-10-19

This harmless text probe verifies the already-connected GitHub app can WRITE to the isolated development branch through its own authenticated GitHub network connection. It does NOT prove that the local Python container can reach github.com or that source PNG bytes can cross into the connector.

Protected: main, Railway, moonpath-dev, students' data. No binary/HTML changes here.

## First real approved PNG chunk — 2026-10-19
- Source: `logo_main_approved.png`, original SHA-256 `2709003daaf25fd6124469d996fd78351b4f292a125d5f964f62733265c20094`.
- First **96 bytes** were read locally, encoded as 128 Base64 characters, explicitly passed to the authenticated GitHub connector `create_file` and read back using `fetch_file` with exact string equality.
- Development branch commit: `474154e9d85a45686c8cc6575524e6ce6d94b2cd`. Remote path: `classroom-hub/apps/moonpath-v41/test-assets/binary-bridge/chunk-0000.b64`.
- **PASS:** one manually transported short chunk, authenticated remote write and readback. **NOT PASS:** automatic transport of all generated chunks, 2 complete PNG reconstructions, remote SHA-256, HTML browser QA.
- Python container DNS `api.github.com` and `github.com` still fails and no GitHub PAT env var is configured; do not attempt to recover by asking user to paste a secret into chat.
