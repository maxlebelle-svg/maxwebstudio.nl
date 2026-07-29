#!/bin/zsh
set -euo pipefail

readonly runner_dir=${0:A:h}
readonly expected_ref='xlxpuuycigeqhgxqtzni'
readonly canonical_workdir=$runner_dir

fail() {
  print -u2 -- "governed staging migration root: $1"
  exit 64
}

verify_target_lock() {
  local workdir=$1
  local declared_ref
  local linked_ref
  [[ ${MWS_STAGING_PROJECT_REF:-} == $expected_ref ]] || fail "MWS_STAGING_PROJECT_REF must equal $expected_ref"
  [[ -f $workdir/target-project-ref ]] || fail "missing permanent target-project-ref"
  declared_ref=$(< $workdir/target-project-ref)
  [[ $declared_ref == $expected_ref ]] || fail "permanent target lock mismatch"
  [[ -f $workdir/supabase/.temp/project-ref ]] || fail "workdir is not linked; run the documented staging-only link command"
  linked_ref=$(< $workdir/supabase/.temp/project-ref)
  [[ $linked_ref == $expected_ref ]] || fail "linked project is not maxwebstudio-test"
}

for argument in "$@"; do
  case $argument in
    *--include-all*|*repair*|*reset*|*db-push*|*db_push*) fail "forbidden migration operation: $argument" ;;
  esac
done

readonly action=${1:-}
case $action in
  list)
    [[ $# -eq 1 ]] || fail "list accepts no extra arguments"
    verify_target_lock $canonical_workdir
    exec supabase --workdir $canonical_workdir migration list --linked
    ;;
  dry-run)
    [[ $# -eq 1 ]] || fail "dry-run accepts no extra arguments"
    verify_target_lock $canonical_workdir
    exec supabase --workdir $canonical_workdir db push --linked --dry-run
    ;;
  apply-production-gate)
    [[ $# -eq 1 ]] || fail "apply-production-gate accepts no extra arguments"
    verify_target_lock $canonical_workdir
    exec supabase --workdir $canonical_workdir migration up --linked
    ;;
  *)
    fail "allowed actions: list, dry-run, apply-production-gate"
    ;;
esac
