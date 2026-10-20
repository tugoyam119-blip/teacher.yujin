# F5 Work validation — 2026-10-20
## Status
Signed file reference → Railway pull → authenticated multipart upload → test branch → full GitHub download has been implemented and verified. This is agent-orchestrated, not an automatic ImageGen event subscription.

## Original
file_00000000059c8211a3c1859cc4ee4cb9; fixture_20MB.png
Bytes: 20979389
SHA-256: 5a81cabb99e6369d0fdc0e62789aa3d8e411c5bcbd1f7b88a55c8b59b4402432

## Implementation and operational procedure
receiver-with-import.ts is the complete receiver plus import worker.
import-worker.ts is appended to the existing Bun receiver.
A supported file materialization call supplies a temporary signed download reference.
F5_IMPORT_JOB carries JSON {run,download_url,bytes,sha256,branch,path}.
The agent sets this job on the existing test service with skipDeploys=true, then deploys the receiver with worker. Runtime reads existing UPLOAD_TOKEN/GITHUB_TOKEN internally; no secret is read, logged, regenerated, or copied to Work.
Worker downloads the original from an allowed HTTPS oaiusercontent.com host, checks size/hash/PNG, performs commit=false three times, tests auth/hash rejection, then commit=true three times with server-side full-byte redownload.
After completion the agent clears F5_IMPORT_JOB and redeploys without the regression runner. Expiring URLs are not committed.
The agent independently downloads GitHub bytes in Work and compares them against the materialized original.
All writes stay in test/f5-work-ref-20261020 and tools/png-transport-lab/work-ref-20261020/. No merge is authorized or performed.

## Results
| Test | Result |
|---|---|
| File ID resolution | Supported materialization returned signed reference |
| Local original download/hash | Passed via official transfer helper launched by Node with system CA |
| Railway source download/hash | Passed |
| 20MB commit=false | 3/3 HTTP 200, exact size/hash |
| 20MB commit=true and full redownload | 3/3 HTTP 200, exact size/hash |
| Work independent GitHub download | HTTP 200, 20979389 bytes, SHA and byte-for-byte equality |
| Duplicate upload same branch/path | 3 uploads preserve identical blob; creates separate commits (not commit-idempotent) |
| Invalid auth | HTTP 401 |
| Invalid SHA | HTTP 422 |
| 1/5/10 MiB receiver regression | Each 3/3 HTTP 200, exact size/hash; synthetic valid 1px PNGs with ancillary padding; no GitHub commit |
| Interrupted request | TCP closed after 65536 body bytes; following health HTTP 200; commit=false; recovery/retry not tested |

20MB commits: cf87d0e040048bbe78d19e0061e74090b306ff3a, 7cee71692d3d6f3b49b44a777e80c0c304b9acb1, 324cb0519e90fd1f211474c3571103b44a9214a9.
Import deployment b3ccd167-25fd-4931-9659-5ce979e6e9d2 SUCCESS.
Regression deployment c26f355c-7759-489a-9b07-f98a4836e3c0 SUCCESS.
Final idle deployment must be read back separately.

## Route findings and limitations
1. Direct host MCP installation: no callable host registration tool was exposed. This is unavailable in this session, not a proven platform-wide impossibility.
2. Work direct transfer: shell DNS failed. Node DNS succeeded; default TLS failed UNABLE_TO_VERIFY_LEAF_SIGNATURE. System trust store fixed HTTPS. Original bytes and HTTPS can coexist in Node, but Railway OAuth intentionally withholds upload-token values, so direct authenticated Work upload was not attempted.
3. Authenticated download URL: actual original download passed in Work and Railway. Used successfully.
4. External executor: existing Railway Bun runtime executed authenticated multipart and GitHub operations using server-held secrets. Passed.

A1 ZIP prototype and validation ZIP were discovered but not extracted: bundled Library download helper could not find authenticated prepare_materialize in its hosted tool inventory. Library read returned no readable ZIP content. Therefore ZIP code review, MCP installation and its earlier unit tests were not reverified.
No newly generated ImageGen output was created in this run; the exact user-specified existing PNG fixture was used. Arbitrary future generated-image references and a persistent generation-complete event trigger remain unverified/unimplemented.
Local-library helper failure is not generalized to all Library access: the explicitly supplied file ID materialization route did work.
The source/worker is a validated test executor, not a production automatic event service. Restart replay can create duplicate commits if a nonempty job is retained; clear the job promptly.
No official game master specification was changed because full completion conditions (new ImageGen output + event automation) are not all met. This document is the verified engineering addendum.
