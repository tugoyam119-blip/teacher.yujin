# Stage 2 file-reference bridge test — 2026-10-19

## Ground truth
- Source ZIP: moonpath_v411_github_binary_connector_next_chat_handoff(1).zip
- Approved main logo size: 1,653,077 bytes, SHA-256: 2709003daaf25fd6124469d996fd78351b4f292a125d5f964f62733265c20094
- Approved slogan size: 578,942 bytes, SHA-256: 33444040bc68b92094a0a15375cdaf8b42926bd11dd746fa0c9f2b3aabfc35d7

## Live test
1. Extracted approved logo source bytes locally and calculated SHA-256.
2. files.manage_library uploaded **the full 1,653,077-byte PNG** via container_path to a temporary Library folder, no Base64 manually pasted.
3. files.materialize with the returned file_id produced a 1,653,077-byte file again.
4. Computed retrieved SHA-256: 2709003daaf25fd6124469d996fd78351b4f292a125d5f964f62733265c20094 — exact match.
5. Removed the temporary Library folder after testing; deletion succeeded.

## Boundary assessment
- LOCAL_FILE_TO_LIBRARY_FILE_REF: PASS (full PNG, byte-identical).
- LIBRARY_FILE_REF_TO_GITHUB: NOT IMPLEMENTED / NOT VERIFIED. GitHub create_blob requires content:string with encoding:utf-8|base64; create_file/update_file require full UTF-8 string; no file_id, local path, Library pointer or file URI upload argument available in the GitHub connector. Vercel upload_file and session-file tools similarly accept Base64 strings rather than native file refs.
- GitHub remote PNG present / REMOTE_BYTES_VERIFIED: NO.
- HTML_RENDER_PASS: NO.
- This is not evidence of any end-to-end GitHub binary upload.

Next: stage 3 remote execution environment with a verified file ingress and GitHub network; test ingress before setting up credentials. Do not modify main, Railway, student data or moonpath-dev.
