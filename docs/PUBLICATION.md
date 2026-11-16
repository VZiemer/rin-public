# Publication policy

## Allowed content

Code, contracts, schemas, synthetic tests, technical documentation and parameterized infrastructure. Seeds in this edition are fictional examples. Asset processing modules are code; actual images and catalog data remain private.

## Prohibited content

- Keys, tokens, service accounts, `.env` files, certificates and keystores.
- Real personal data, conversations, memories, profiles, relationships, locations or financial statements.
- Frontend or backend assets: images, audio, video, fonts, vectors, operational catalogs and media embedded in text.
- Real Firebase settings, deployment endpoints, cloud account IDs and signed production URLs.
- Terraform state/plans, logs, caches, captures, builds, binaries, archives, LFS and submodules.
- History, unreviewed patches, branches and tags from private repositories.

## Before pushing

Install Gitleaks 8.30.1 on PATH and enable local hooks after cloning:

```sh
git config core.hooksPath .githooks
```

Hooks block commits/pushes if the scanner is missing or detects violations. Git does not install local hooks automatically in other clones, and they can be disabled. This sample has no CI; review and local checks must take place before pushing.

Alternatively, configure the local executable path with `git config rin.gitleaksPath PATH_TO_EXECUTABLE`. This value stays in the local Git configuration.

1. Work in this public clone, selecting technical changes individually.
2. Review the full diff, including new files and fixtures; use fictional data.
3. Run tests and `npm run test:publication`.
4. Stage the files and run `npm run check:publication` and Gitleaks with redacted results.
5. Review the PR title, body and comments too: the file scanner does not check this text automatically.

The guard inspects the index and every version reachable in local history. Gitleaks complements it with credential rules. No scanner can prove the complete absence of personal data; human review is still necessary.

Rejecting a PR does not undo exposure of content already pushed to a public branch. Never use a public PR to triage private material. If a leak occurs, revoke credentials, contain access and handle history, forks and caches separately.

## Protections

There are no CI workflows or required remote checks. Local publication checks, branch protection and GitHub secret checks remain in place. Changes to these protections require maintainer review. Branch protection and push protection are server settings; repository files alone do not enable them.
