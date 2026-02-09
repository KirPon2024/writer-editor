# DELIVERY_FALLBACK_NETWORK_DNS

## WHEN_TO_SWITCH
- Use AUTO delivery first.
- Run NETWORK GATE before push/PR:
  - `git ls-remote origin -h refs/heads/main`
  - `node scripts/ops/network-gate.mjs`
- If gate fails, do not start delivery.
- If `git push` or `gh` commands fail after gate passed, retry once and switch immediately.
- `RETRY_MAX=1`. After that: STOP and move to manual protocol.

## NETWORK_GATE
- PASS when both checks are green:
  - `NETWORK_GATE_GIT_OK=1`
  - `NETWORK_GATE_HTTP_OK=1`
- FAIL when any check is red:
  - `STOP_REQUIRED=1`
  - `FAIL_REASON=NETWORK_GATE_FAIL`

## MANUAL_PROTOCOL
Run these commands in order when network is available:

```bash
git push -u origin <branch>
```

Then in GitHub UI:
1. Create PR (`base=main`, `head=<branch>`).
2. Wait until required checks are green.
3. Add HO comment: `GO:<TAG>`.
4. Merge with **Create a merge commit** (regular merge, no squash/rebase).

## STOP_CONDITION
- If GitHub DNS/API is unavailable after retry limit, stop retries.
- If there is no access to GitHub UI, STOP and escalate to infrastructure/network fix.
- Do not change repository files to workaround delivery issues.
- Do not run repeated blind retries. Keep `RETRY_MAX=1`.

## NOTES
- Use `/tmp/**` artifact overrides when sandbox/worktree permissions are constrained:
  - `SECTOR_M_ARTIFACTS_ROOT=/tmp/<task-id>/sector-m-run`
  - `SECTOR_U_ARTIFACTS_ROOT=/tmp/<task-id>/sector-u-run`
- This runbook is delivery-only and does not replace phase checklists.
