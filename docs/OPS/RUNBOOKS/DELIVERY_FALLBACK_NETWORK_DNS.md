# DELIVERY_FALLBACK_NETWORK_DNS

## WHEN_TO_SWITCH
- Run delivery in AUTO mode first.
- Always run network gate before `push/PR/merge`:
  - `node scripts/ops/network-gate.mjs --mode delivery`
- If gate fails: `STOP_REQUIRED=1`.
- Retry policy is strict: `RETRY_MAX=1`.

## NETWORK_GATE
- Required blocking probe:
  - `git ls-remote origin -h refs/heads/main`
- Delivery continues only if gate and probe are both green.

## MACOS QUICK CHECKLIST (COPY-PASTE)
1. `node scripts/ops/network-gate.mjs --mode delivery`
2. `scutil --dns | sed -n '1,160p'`
3. `dscacheutil -q host -a name $(git remote get-url origin | sed -E 's#(https?://|git@)([^/:]+).*#\2#') || true`
4. `nslookup github.com || true`
5. `dig github.com +short || true`
6. `curl -I https://github.com -m 5 || true`
7. `git ls-remote origin -h refs/heads/main`
8. If step 7 PASS: continue delivery pipeline once.

## FAIL_REASON MAP
- `NETWORK_GATE_FAIL_DNS`:
  - DNS cannot resolve origin host.
  - Action: fix DNS/VPN/proxy first, then rerun gate once.
- `NETWORK_GATE_FAIL_CONNECT`:
  - host resolved but network path blocked/timed out/refused.
  - Action: check VPN/firewall/proxy route, rerun gate once.
- `NETWORK_GATE_FAIL_TLS`:
  - TLS/certificate handshake issue.
  - Action: inspect corporate TLS interception/certs.
- `NETWORK_GATE_FAIL_AUTH`:
  - auth/permissions/repo access issue.
  - Action: re-auth (`gh auth`, SSH key, PAT), rerun gate once.
- `NETWORK_GATE_FAIL_ORIGIN_MISCONFIG`:
  - invalid/missing `origin` URL.
  - Action: fix `git remote set-url origin ...`, rerun gate once.

## DELIVERY CONTINUE CRITERIA
- Continue ONLY when both are true:
  - `NETWORK_GATE_OK=1`
  - `NETWORK_GATE_GIT_OK=1`

## MANUAL_PROTOCOL (MINIMUM CLICKS)
Command path:
```bash
git push -u origin <branch>
```

Then GitHub UI:
1. Create PR (`base=main`, `head=<branch>`).
2. Wait required checks.
3. Add HO comment `GO:<TAG>`.
4. Merge with repo policy default (prefer merge commit where available).

## STOP_CONDITION
- If gate still fails after one retry: STOP.
- If GitHub UI/API unreachable: STOP and escalate infra.
- Do not modify repo files as a network workaround.

## NOTES
- Use `/tmp/**` artifact overrides under sandbox constraints:
  - `SECTOR_M_ARTIFACTS_ROOT=/tmp/<task-id>/sector-m-run`
  - `SECTOR_U_ARTIFACTS_ROOT=/tmp/<task-id>/sector-u-run`
