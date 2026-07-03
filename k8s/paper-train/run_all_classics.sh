#!/usr/bin/env bash
# Run the four classic tiers SEQUENTIALLY (anti-affinity in the template keeps
# them off the VIP node), saving one log file per tier.
set -uo pipefail
export KUBECONFIG="${KUBECONFIG:-/home/administrator/.kube/nt114-aws.yaml}"
DIR="$(cd "$(dirname "$0")" && pwd)"
LOGDIR="${DIR}/logs"
mkdir -p "${LOGDIR}"

for TIER in basic standard pro premium; do
  echo "=== [$(date -u +%H:%M:%S)] launching ${TIER} ==="
  kubectl delete job "paper-train-${TIER}" -n mlops-sentiment --ignore-not-found
  sed "s/__TIER__/${TIER}/" "${DIR}/train-job.template.yaml" | kubectl apply -f -
  # wait for terminal state (complete or failed)
  for i in $(seq 1 240); do
    SUCC=$(kubectl get job "paper-train-${TIER}" -n mlops-sentiment -o jsonpath='{.status.succeeded}' 2>/dev/null)
    FAIL=$(kubectl get job "paper-train-${TIER}" -n mlops-sentiment -o jsonpath='{.status.failed}' 2>/dev/null)
    [ "${SUCC:-0}" = "1" ] && break
    [ "${FAIL:-0}" = "2" ] && break
    sleep 15
  done
  {
    echo "===== paper-train-${TIER} | $(date -u +%Y-%m-%dT%H:%M:%SZ) ====="
    kubectl logs "job/paper-train-${TIER}" -n mlops-sentiment 2>&1
    echo "===== job status ====="
    kubectl get job "paper-train-${TIER}" -n mlops-sentiment 2>&1
  } > "${LOGDIR}/train_${TIER}.log"
  echo "=== ${TIER} done (succeeded=${SUCC:-0} failed=${FAIL:-0}), log: ${LOGDIR}/train_${TIER}.log ==="
done
echo "ALL CLASSIC TIERS FINISHED"
