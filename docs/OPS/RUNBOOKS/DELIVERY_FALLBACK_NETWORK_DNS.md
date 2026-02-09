# DELIVERY_FALLBACK_NETWORK_DNS

## WHEN_TO_SWITCH
- Start in AUTO delivery mode.
- Run gate before any `push/PR/merge`:
  - `node scripts/ops/network-gate.mjs --mode delivery --json`
- If gate fails: `STOP_REQUIRED=1`.
- Retry policy is strict: `RETRY_MAX=1` (one retry only).

## NETWORK_GATE
- Required blocking probe:
  - `git ls-remote origin -h refs/heads/main`
- Gate is PASS only when:
  - `NETWORK_GATE_OK=1`
  - `NETWORK_GATE_GIT_OK=1`

## MACOS QUICK CHECKLIST (COPY-PASTE, 7 COMMANDS)
1. `git remote get-url origin`
2. `node scripts/ops/network-gate.mjs --mode delivery --json`
3. `dscacheutil -q host -a name github.com | head || true`
4. `nslookup github.com 1.1.1.1 || true`
5. `nslookup github.com 8.8.8.8 || true`
6. `curl -I https://github.com -m 5 || true`
7. `git ls-remote origin -h refs/heads/main`

## FAIL_REASON MAP
| FAIL_REASON | Meaning | Next command |
|---|---|---|
| `NETWORK_GATE_FAIL_ORIGIN_MISCONFIG` | origin remote missing/invalid | `git remote get-url origin` then fix with `git remote set-url origin ...` |
| `NETWORK_GATE_FAIL_DNS` | host cannot be resolved | `nslookup github.com 1.1.1.1` and `nslookup github.com 8.8.8.8` |
| `NETWORK_GATE_FAIL_CONNECT` | host resolved, but transport is blocked/timed out | `curl -I https://github.com -m 5` |
| `NETWORK_GATE_FAIL_TLS` | TLS handshake/certificate failure | inspect proxy/VPN/TLS interception, then rerun gate once |
| `NETWORK_GATE_FAIL_AUTH` | remote access/auth failed | re-auth (`gh auth login` / SSH key), then `git ls-remote origin -h refs/heads/main` |
| `NETWORK_GATE_FAIL_UNKNOWN` | non-classified transport failure | rerun command 2 once, then STOP if unchanged |

## DELIVERY CONTINUE CRITERIA
- Continue ONLY when:
  - `NETWORK_GATE_OK=1`
  - `NETWORK_GATE_GIT_OK=1`

## MINIMAL MANUAL RECOVERY (MACOS)
1. `sudo dscacheutil -flushcache`
2. `sudo killall -HUP mDNSResponder || true`
3. Toggle Wi-Fi OFF/ON (UI)
4. If needed set temporary DNS: `1.1.1.1`, `8.8.8.8`
5. Toggle VPN/Proxy OFF/ON
6. Rerun command 2 from checklist exactly once

## MANUAL_PROTOCOL (MINIMUM CLICKS)
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
