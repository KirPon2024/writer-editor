#!/usr/bin/env bash
set -uo pipefail

# ops-vector-close.sh
# Safe-by-default vector close runner (no commits, optional deletes with explicit confirmation).

if [[ -z "${BASH_VERSION:-}" ]]; then
  echo "FAIL_REASON: NOT_BASH"
  echo "RESULT: FAIL"
  exit 1
fi

BASE_BRANCH_WAS_SET=0
if [[ -n "${BASE_BRANCH+x}" ]]; then
  BASE_BRANCH_WAS_SET=1
fi

REPO="${REPO:-}"
PR_URLS="${PR_URLS:-}"
TARGET_FILE="${TARGET_FILE:--}"
ANCHOR_REGEX="${ANCHOR_REGEX:--}"
BASE_BRANCH="${BASE_BRANCH:-main}"
DRY_RUN="${DRY_RUN:-1}"
CONFIRM_DELETE_REMOTE="${CONFIRM_DELETE_REMOTE:-}"
CLEAN_LOCAL="${CLEAN_LOCAL:-0}"
PRINT_ARM_CMD="${PRINT_ARM_CMD:-1}"

SCRIPT_FAILED=0
FAIL_REASONS=()

CHECK_LINES=()
STATUS_LINES=()
OUT_LINES=()

PR_LINES=()
MERGE_REACHABILITY_LINES=()
DELETE_REMOTE_LINES=()
CLEAN_LOCAL_LINES=()

HEAD_BRANCHES=()
MERGE_COMMITS=()
MERGED_PRS_OK=-1
ANCHOR_RESULT="SKIP"
VERIFY_MAIN_RESULT="SKIP"
DELETE_REMOTE_RESULT="SKIP"
CLEAN_LOCAL_RESULT="SKIP"
GH_AUTH_RESULT="FAIL"
GH_AUTH_OK=0
DELETIONS_NEEDED=0
EXISTING_REMOTE_DELETE_BRANCHES=()

append_fail_reason() {
  local reason="$1"
  FAIL_REASONS+=("$reason")
  SCRIPT_FAILED=1
}

contains_item() {
  local needle="$1"
  shift
  local item
  for item in "$@"; do
    if [[ "$item" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

append_unique_array_item() {
  local value="$1"
  local arr_name="$2"
  local existing=()
  local item
  eval "existing=(\"\${${arr_name}[@]-}\")"
  if ! contains_item "$value" "${existing[@]}"; then
    eval "${arr_name}+=(\"\$value\")"
  fi
}

run_cmd_capture() {
  local cmd="$1"
  local out
  out="$(eval "$cmd" 2>&1)"
  local code=$?
  printf "%s\n__EXIT_CODE__=%s\n" "$out" "$code"
}

sanitize_gh_output() {
  local input="$1"
  printf "%s" "$input" | awk '
    {
      line=tolower($0)
      if (line ~ /token:/) next
      if (line ~ /gho_/) next
      if (line ~ /^ *token /) next
      if (line ~ /token in /) next
      print
    }
  '
}

check_dependency() {
  local bin="$1"
  if ! command -v "$bin" >/dev/null 2>&1; then
    append_fail_reason "MISSING_DEPENDENCY:$bin"
  fi
}

validate_inputs() {
  if [[ -z "$REPO" ]]; then
    append_fail_reason "MISSING_INPUT:REPO"
  fi
  if [[ -z "$PR_URLS" ]]; then
    append_fail_reason "MISSING_INPUT:PR_URLS"
  fi
}

parse_pr_number() {
  local url="$1"
  local regex="^https://github.com/([^/]+/[^/]+)/pull/([0-9]+)$"
  if [[ "$url" =~ $regex ]]; then
    local repo_from_url="${BASH_REMATCH[1]}"
    local pr_number="${BASH_REMATCH[2]}"
    if [[ "$repo_from_url" != "$REPO" ]]; then
      echo "ERR:REPO_MISMATCH:$url"
      return 1
    fi
    echo "$pr_number"
    return 0
  fi
  echo "ERR:INVALID_PR_URL:$url"
  return 1
}

check_gh_auth() {
  local out
  out="$(run_cmd_capture "gh auth status -h github.com")"
  local code
  code="$(printf "%s" "$out" | rg -n "__EXIT_CODE__=" -N | sed -E 's/.*=//')"
  local body sanitized
  body="$(printf "%s" "$out" | sed '/__EXIT_CODE__=/d')"
  sanitized="$(sanitize_gh_output "$body")"

  CHECK_LINES+=("- GH_AUTH")
  CHECK_LINES+=("  - OUT: $(printf "%s" "$sanitized" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//')")
  if [[ "$code" == "0" ]] && printf "%s" "$body" | rg -q "Logged in to github.com"; then
    CHECK_LINES+=("  - PASS")
    GH_AUTH_RESULT="PASS"
    GH_AUTH_OK=1
  else
    CHECK_LINES+=("  - FAIL")
    GH_AUTH_RESULT="FAIL"
    GH_AUTH_OK=0
    SCRIPT_FAILED=1
    append_fail_reason "GH_AUTH_INVALID"
  fi
}

fetch_pr_metadata() {
  MERGED_PRS_OK=1
  local url
  for url in $PR_URLS; do
    local pr_number
    pr_number="$(parse_pr_number "$url")"
    if [[ "$pr_number" == ERR:* ]]; then
      PR_LINES+=("- PR: $url")
      PR_LINES+=("  - PASS: FAIL")
      append_fail_reason "$pr_number"
      MERGED_PRS_OK=0
      continue
    fi

    local cmd
    cmd="gh pr view \"$pr_number\" -R \"$REPO\" --json url,number,state,mergedAt,mergeCommit,baseRefName,headRefName,title --jq '[.url,.number,.state,(.mergedAt // \"\"),(.mergeCommit.oid // \"\"),.baseRefName,.headRefName,.title] | @tsv'"
    local out
    out="$(run_cmd_capture "$cmd")"
    local code
    code="$(printf "%s" "$out" | rg -n "__EXIT_CODE__=" -N | sed -E 's/.*=//')"
    local body
    body="$(printf "%s" "$out" | sed '/__EXIT_CODE__=/d')"

    if [[ "$code" != "0" ]]; then
      PR_LINES+=("- PR: $url")
      PR_LINES+=("  - OUT: $(printf "%s" "$body" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//')")
      PR_LINES+=("  - PASS: FAIL")
      append_fail_reason "PR_META_FETCH_FAILED:PR_$pr_number"
      MERGED_PRS_OK=0
      continue
    fi

    local pr_url number state merged_at merge_oid base_ref head_ref title
    IFS=$'\t' read -r pr_url number state merged_at merge_oid base_ref head_ref title <<< "$body"

    local pr_pass=1
    if [[ -z "$merged_at" ]]; then
      pr_pass=0
      append_fail_reason "PR_NOT_MERGED:PR_$pr_number"
    fi
    if [[ "$base_ref" != "$BASE_BRANCH" ]]; then
      pr_pass=0
      append_fail_reason "PR_BASE_MISMATCH:PR_$pr_number:base=$base_ref"
    fi
    if [[ -z "$head_ref" ]]; then
      pr_pass=0
      append_fail_reason "PR_HEADREF_EMPTY:PR_$pr_number"
    fi

    PR_LINES+=("- PR: $pr_url")
    PR_LINES+=("  - mergedAt: ${merged_at:--}")
    PR_LINES+=("  - mergeCommit: ${merge_oid:--}")
    PR_LINES+=("  - base: $base_ref")
    PR_LINES+=("  - head: $head_ref")
    if [[ "$pr_pass" -eq 1 ]]; then
      PR_LINES+=("  - PASS: PASS")
      append_unique_array_item "$head_ref" HEAD_BRANCHES
      if [[ -n "$merge_oid" ]]; then
        append_unique_array_item "$merge_oid" MERGE_COMMITS
      fi
    else
      PR_LINES+=("  - PASS: FAIL")
      MERGED_PRS_OK=0
    fi
  done
}

run_main_verify() {
  local out_fetch out_checkout out_status out_reset
  out_fetch="$(run_cmd_capture "git fetch origin --prune")"
  out_checkout="$(run_cmd_capture "git checkout \"$BASE_BRANCH\"")"
  out_status="$(run_cmd_capture "git status --porcelain --untracked-files=all")"

  local status_code
  status_code="$(printf "%s" "$out_status" | rg -n "__EXIT_CODE__=" -N | sed -E 's/.*=//')"
  local status_body
  status_body="$(printf "%s" "$out_status" | sed '/__EXIT_CODE__=/d')"
  status_body="$(printf "%s" "$status_body" | sed '/^[[:space:]]*$/d')"

  CHECK_LINES+=("- MAIN_SYNC")
  CHECK_LINES+=("  - OUT: fetch exit $(printf "%s" "$out_fetch" | rg -n "__EXIT_CODE__=" -N | sed -E 's/.*=//')")
  CHECK_LINES+=("  - OUT: checkout exit $(printf "%s" "$out_checkout" | rg -n "__EXIT_CODE__=" -N | sed -E 's/.*=//')")

  if [[ "$status_code" != "0" ]]; then
    CHECK_LINES+=("  - OUT: status command failed")
    CHECK_LINES+=("  - PASS: FAIL")
    append_fail_reason "STATUS_COMMAND_FAILED"
    VERIFY_MAIN_RESULT="FAIL"
    return
  fi

  if [[ -n "$status_body" ]]; then
    if [[ "$status_body" == "?? ops-vector-close.sh" ]]; then
      CHECK_LINES+=("  - OUT: status before reset has only self untracked (allowed): ?? ops-vector-close.sh")
    else
      CHECK_LINES+=("  - OUT: status before reset is non-empty: $(printf "%s" "$status_body" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//')")
      CHECK_LINES+=("  - PASS: FAIL")
      append_fail_reason "WORKTREE_NOT_CLEAN_BEFORE_RESET"
      VERIFY_MAIN_RESULT="FAIL"
      return
    fi
  fi

  out_reset="$(run_cmd_capture "git reset --hard \"origin/$BASE_BRANCH\"")"
  CHECK_LINES+=("  - OUT: reset exit $(printf "%s" "$out_reset" | rg -n "__EXIT_CODE__=" -N | sed -E 's/.*=//')")
  CHECK_LINES+=("  - PASS: PASS")
  VERIFY_MAIN_RESULT="PASS"
}

run_anchor_verify() {
  if [[ "$TARGET_FILE" == "-" || "$ANCHOR_REGEX" == "-" ]]; then
    CHECK_LINES+=("- ANCHOR_GREP")
    CHECK_LINES+=("  - OUT: skipped (TARGET_FILE or ANCHOR_REGEX is '-')")
    CHECK_LINES+=("  - PASS: SKIP")
    ANCHOR_RESULT="SKIP"
    return
  fi

  local cmd out code body
  cmd="git show \"origin/$BASE_BRANCH:$TARGET_FILE\" | rg -n \"$ANCHOR_REGEX\" || true"
  out="$(run_cmd_capture "$cmd")"
  code="$(printf "%s" "$out" | rg -n "__EXIT_CODE__=" -N | sed -E 's/.*=//')"
  body="$(printf "%s" "$out" | sed '/__EXIT_CODE__=/d')"
  body="$(printf "%s" "$body" | sed '/^[[:space:]]*$/d')"

  CHECK_LINES+=("- ANCHOR_GREP")
  if [[ -n "$body" ]]; then
    CHECK_LINES+=("  - OUT: $(printf "%s" "$body" | tr '\n' ' | ' | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//')")
    CHECK_LINES+=("  - PASS: PASS")
    ANCHOR_RESULT="PASS"
  else
    CHECK_LINES+=("  - OUT: (empty)")
    CHECK_LINES+=("  - PASS: FAIL")
    ANCHOR_RESULT="FAIL"
    append_fail_reason "ANCHOR_NOT_FOUND"
  fi

  if [[ "$code" != "0" ]]; then
    :
  fi
}

run_merge_commit_verify() {
  local oid
  if [[ "${#MERGE_COMMITS[@]}" -eq 0 ]]; then
    MERGE_REACHABILITY_LINES+=("- mergeCommit: (none from PR metadata)")
    MERGE_REACHABILITY_LINES+=("  - PASS: SKIP")
    return
  fi

  for oid in "${MERGE_COMMITS[@]}"; do
    local cmd out body
    cmd="git merge-base --is-ancestor \"$oid\" \"origin/$BASE_BRANCH\"; echo \$?"
    out="$(run_cmd_capture "$cmd")"
    body="$(printf "%s" "$out" | sed '/__EXIT_CODE__=/d' | sed '/^[[:space:]]*$/d')"
    local rc_line
    rc_line="$(printf "%s" "$body" | tail -n 1)"
    MERGE_REACHABILITY_LINES+=("- mergeCommit: $oid")
    MERGE_REACHABILITY_LINES+=("  - OUT: $rc_line")
    if [[ "$rc_line" == "0" ]]; then
      MERGE_REACHABILITY_LINES+=("  - PASS: PASS")
    else
      MERGE_REACHABILITY_LINES+=("  - PASS: FAIL")
      append_fail_reason "MERGECOMMIT_NOT_REACHABLE:$oid"
    fi
  done
}

run_remote_delete() {
  local branch
  CHECK_LINES+=("- DELETE_REMOTE")
  CHECK_LINES+=("  - OUT: planned branches: ${HEAD_BRANCHES[*]:-(none)}")

  if [[ "${#HEAD_BRANCHES[@]}" -eq 0 ]]; then
    CHECK_LINES+=("  - OUT: no branches to delete")
    CHECK_LINES+=("  - PASS: SKIP")
    DELETE_REMOTE_RESULT="SKIP"
    return
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    for branch in "${HEAD_BRANCHES[@]}"; do
      DELETE_REMOTE_LINES+=("- branch: $branch")
      DELETE_REMOTE_LINES+=("  - CMD: git ls-remote --heads origin \"$branch\"")
      local check_out
      check_out="$(run_cmd_capture "git ls-remote --heads origin \"$branch\"")"
      local check_body
      check_body="$(printf "%s" "$check_out" | sed '/__EXIT_CODE__=/d' | sed '/^[[:space:]]*$/d')"
      if [[ -n "$check_body" ]]; then
        DELETE_REMOTE_LINES+=("  - OUT: present on origin")
        DELETIONS_NEEDED=1
        append_unique_array_item "$branch" EXISTING_REMOTE_DELETE_BRANCHES
      else
        DELETE_REMOTE_LINES+=("  - OUT: not present on origin")
      fi
      DELETE_REMOTE_LINES+=("  - PASS: SKIP (DRY_RUN=1)")
    done
    CHECK_LINES+=("  - PASS: SKIP")
    DELETE_REMOTE_RESULT="SKIP"
    return
  fi

  if [[ "$CONFIRM_DELETE_REMOTE" != "YES" ]]; then
    CHECK_LINES+=("  - OUT: DRY_RUN=0 but CONFIRM_DELETE_REMOTE!=YES")
    CHECK_LINES+=("  - PASS: FAIL")
    DELETE_REMOTE_RESULT="FAIL"
    append_fail_reason "DELETE_NOT_CONFIRMED"
    return
  fi

  local any_fail=0
  for branch in "${HEAD_BRANCHES[@]}"; do
    DELETE_REMOTE_LINES+=("- branch: $branch")
    local check_out
    check_out="$(run_cmd_capture "git ls-remote --heads origin \"$branch\"")"
    local check_body
    check_body="$(printf "%s" "$check_out" | sed '/__EXIT_CODE__=/d' | sed '/^[[:space:]]*$/d')"
    if [[ -z "$check_body" ]]; then
      DELETE_REMOTE_LINES+=("  - OUT: branch not present; skip delete")
      DELETE_REMOTE_LINES+=("  - PASS: SKIP")
      continue
    fi
    DELETIONS_NEEDED=1
    append_unique_array_item "$branch" EXISTING_REMOTE_DELETE_BRANCHES
    local del_out
    del_out="$(run_cmd_capture "git push origin --delete \"$branch\"")"
    local del_code
    del_code="$(printf "%s" "$del_out" | rg -n "__EXIT_CODE__=" -N | sed -E 's/.*=//')"
    local del_body
    del_body="$(printf "%s" "$del_out" | sed '/__EXIT_CODE__=/d' | sed '/^[[:space:]]*$/d')"
    DELETE_REMOTE_LINES+=("  - CMD: git push origin --delete \"$branch\"")
    if [[ -n "$del_body" ]]; then
      DELETE_REMOTE_LINES+=("  - OUT: $(printf "%s" "$del_body" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//')")
    else
      DELETE_REMOTE_LINES+=("  - OUT: (empty)")
    fi
    if [[ "$del_code" == "0" ]]; then
      DELETE_REMOTE_LINES+=("  - PASS: PASS")
    else
      DELETE_REMOTE_LINES+=("  - PASS: FAIL")
      any_fail=1
      append_fail_reason "DELETE_REMOTE_FAILED:$branch"
    fi
  done

  if [[ "$any_fail" -eq 0 ]]; then
    CHECK_LINES+=("  - PASS: PASS")
    DELETE_REMOTE_RESULT="PASS"
  else
    CHECK_LINES+=("  - PASS: FAIL")
    DELETE_REMOTE_RESULT="FAIL"
  fi
}

run_local_cleanup() {
  CHECK_LINES+=("- CLEAN_LOCAL")
  if [[ "$CLEAN_LOCAL" != "1" ]]; then
    CHECK_LINES+=("  - OUT: skipped (CLEAN_LOCAL!=1)")
    CHECK_LINES+=("  - PASS: SKIP")
    CLEAN_LOCAL_RESULT="SKIP"
    return
  fi

  local branch any_fail=0
  for branch in "${HEAD_BRANCHES[@]}"; do
    CLEAN_LOCAL_LINES+=("- branch: $branch")
    if git show-ref --verify --quiet "refs/heads/$branch"; then
      local del_out
      del_out="$(run_cmd_capture "git branch -D \"$branch\"")"
      local del_code
      del_code="$(printf "%s" "$del_out" | rg -n "__EXIT_CODE__=" -N | sed -E 's/.*=//')"
      local del_body
      del_body="$(printf "%s" "$del_out" | sed '/__EXIT_CODE__=/d' | sed '/^[[:space:]]*$/d')"
      CLEAN_LOCAL_LINES+=("  - OUT: $(printf "%s" "$del_body" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//')")
      if [[ "$del_code" == "0" ]]; then
        CLEAN_LOCAL_LINES+=("  - PASS: PASS")
      else
        CLEAN_LOCAL_LINES+=("  - PASS: FAIL")
        any_fail=1
        append_fail_reason "CLEAN_LOCAL_FAILED:$branch"
      fi
    else
      CLEAN_LOCAL_LINES+=("  - OUT: local branch not found")
      CLEAN_LOCAL_LINES+=("  - PASS: SKIP")
    fi
  done

  if [[ "$any_fail" -eq 0 ]]; then
    CHECK_LINES+=("  - PASS: PASS")
    CLEAN_LOCAL_RESULT="PASS"
  else
    CHECK_LINES+=("  - PASS: FAIL")
    CLEAN_LOCAL_RESULT="FAIL"
  fi
}

print_report() {
  local merged_state verify_state anchor_state deletion_plan delete_state clean_state
  if [[ "$GH_AUTH_OK" -ne 1 ]]; then
    merged_state="SKIP"
    verify_state="SKIP"
    anchor_state="SKIP"
    deletion_plan="(none)"
    delete_state="SKIP"
    clean_state="SKIP"
  else
    if [[ "$MERGED_PRS_OK" -eq 1 ]]; then
      merged_state="PASS"
    elif [[ "$MERGED_PRS_OK" -eq 0 ]]; then
      merged_state="FAIL"
    else
      merged_state="SKIP"
    fi
    verify_state="$VERIFY_MAIN_RESULT"
    anchor_state="$ANCHOR_RESULT"
    deletion_plan="${HEAD_BRANCHES[*]:-(none)}"
    delete_state="$DELETE_REMOTE_RESULT"
    clean_state="$CLEAN_LOCAL_RESULT"
  fi

  echo "# STATUS"
  echo "- repo: $REPO"
  echo "- base: $BASE_BRANCH"
  echo "- merged PRs: $merged_state"
  echo "- verify main: $verify_state"
  echo "- anchors: $anchor_state"
  echo "- deletion plan: $deletion_plan"
  echo "- delete remote: $delete_state"
  echo "- clean local: $clean_state"
  echo
  echo "# CHECK"
  local line
  for line in "${CHECK_LINES[@]}"; do
    echo "$line"
  done
  if [[ "$GH_AUTH_OK" -eq 1 ]]; then
    echo "- PR_META (per PR)"
    if [[ "${#PR_LINES[@]}" -eq 0 ]]; then
      echo "  - OUT: (none)"
    else
      for line in "${PR_LINES[@]}"; do
        echo "  $line"
      done
    fi
    echo "- MERGECOMMIT_REACHABLE (per mergeCommit)"
    if [[ "${#MERGE_REACHABILITY_LINES[@]}" -eq 0 ]]; then
      echo "  - OUT: (none)"
    else
      for line in "${MERGE_REACHABILITY_LINES[@]}"; do
        echo "  $line"
      done
    fi
    echo "- DELETE_REMOTE (per branch)"
    if [[ "${#DELETE_REMOTE_LINES[@]}" -eq 0 ]]; then
      echo "  - OUT: (none)"
    else
      for line in "${DELETE_REMOTE_LINES[@]}"; do
        echo "  $line"
      done
    fi
    echo "- CLEAN_LOCAL (per branch)"
    if [[ "${#CLEAN_LOCAL_LINES[@]}" -eq 0 ]]; then
      echo "  - OUT: (none)"
    else
      for line in "${CLEAN_LOCAL_LINES[@]}"; do
        echo "  $line"
      done
    fi
  fi
  echo
  echo "# FAIL_REASON"
  if [[ "${#FAIL_REASONS[@]}" -eq 0 ]]; then
    echo "- (empty)"
  else
    local reason
    for reason in "${FAIL_REASONS[@]}"; do
      echo "- $reason"
    done
  fi
  echo
  echo "# REQUIRED_INPUT"
  echo "- (empty)"
}

build_arm_command() {
  local cmd=""
  cmd+="REPO=$(printf '%q' "$REPO") "
  cmd+="PR_URLS=$(printf '%q' "$PR_URLS") "
  cmd+="TARGET_FILE=$(printf '%q' "$TARGET_FILE") "
  cmd+="ANCHOR_REGEX=$(printf '%q' "$ANCHOR_REGEX") "
  if [[ "$BASE_BRANCH_WAS_SET" -eq 1 || "$BASE_BRANCH" != "main" ]]; then
    cmd+="BASE_BRANCH=$(printf '%q' "$BASE_BRANCH") "
  fi
  cmd+="DRY_RUN=0 CONFIRM_DELETE_REMOTE=YES CLEAN_LOCAL=1 ./ops-vector-close.sh"
  printf "%s" "$cmd"
}

print_next_or_arm() {
  if [[ "$SCRIPT_FAILED" -ne 0 ]]; then
    return
  fi

  if [[ "$DELETIONS_NEEDED" -eq 1 && "$PRINT_ARM_CMD" == "1" ]]; then
    echo "# NEXT (ARMED DELETE)"
    build_arm_command
    echo
    return
  fi

  if [[ "$DELETIONS_NEEDED" -eq 0 ]]; then
    echo "NEXT: nothing to delete (all planned branches absent on origin)"
    return
  fi

  if [[ "$PRINT_ARM_CMD" != "1" ]]; then
    echo "NEXT: arm command suppressed (PRINT_ARM_CMD=0)"
  fi
}

print_result_line() {
  if [[ "$SCRIPT_FAILED" -eq 0 ]]; then
    echo "RESULT: PASS"
  else
    echo "RESULT: FAIL"
  fi
}

main() {
  check_dependency "git"
  check_dependency "gh"
  check_dependency "rg"
  validate_inputs

  if [[ "$SCRIPT_FAILED" -eq 1 ]]; then
    print_report
    print_result_line
    exit 1
  fi

  check_gh_auth
  if [[ "$GH_AUTH_OK" -ne 1 ]]; then
    print_report
    print_result_line
    exit 1
  fi

  fetch_pr_metadata
  run_main_verify
  run_anchor_verify
  run_merge_commit_verify
  run_remote_delete
  run_local_cleanup

  print_report
  print_next_or_arm
  print_result_line
  if [[ "$SCRIPT_FAILED" -eq 1 ]]; then
    exit 1
  fi
  exit 0
}

main "$@"

# EXAMPLE RUNS
# 1) Plan/verify only (no deletion):
# REPO=KirPon2024/writer-editor PR_URLS="https://github.com/KirPon2024/writer-editor/pull/37 https://github.com/KirPon2024/writer-editor/pull/38" TARGET_FILE=docs/OPS/OPS-REPORT-FORMAT.md ANCHOR_REGEX='^## REPORT TEMPLATE$|^### PR_MERGE_DUMP_BLOCK$|^## RAW_OUT semantics|CHECK_06_TIGHTEN_EVIDENCE' DRY_RUN=1 ./ops-vector-close.sh
#
# 2) Real remote delete + local cleanup:
# REPO=KirPon2024/writer-editor PR_URLS="https://github.com/KirPon2024/writer-editor/pull/37 https://github.com/KirPon2024/writer-editor/pull/38" TARGET_FILE=docs/OPS/OPS-REPORT-FORMAT.md ANCHOR_REGEX='^## REPORT TEMPLATE$|^### PR_MERGE_DUMP_BLOCK$|^## RAW_OUT semantics|CHECK_06_TIGHTEN_EVIDENCE' DRY_RUN=0 CONFIRM_DELETE_REMOTE=YES CLEAN_LOCAL=1 ./ops-vector-close.sh
