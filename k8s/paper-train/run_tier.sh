#!/usr/bin/env bash
# Run one paper-training Job and wait for completion, streaming the summary.
# Usage: ./run_tier.sh vip
set -euo pipefail
TIER="${1:?usage: run_tier.sh <basic|standard|pro|premium|vip>}"
DIR="$(cd "$(dirname "$0")" && pwd)"
# Default to the AWS paper cluster unless the caller overrides KUBECONFIG.
export KUBECONFIG="${KUBECONFIG:-/home/administrator/.kube/nt114-aws.yaml}"

LOGDIR="${DIR}/logs"
mkdir -p "${LOGDIR}"
LOGFILE="${LOGDIR}/train_${TIER}.log"

kubectl delete job "paper-train-${TIER}" -n mlops-sentiment --ignore-not-found
sed "s/__TIER__/${TIER}/" "${DIR}/train-job.template.yaml" | kubectl apply -f -
echo "Job paper-train-${TIER} created. Waiting for pod..."
kubectl wait --for=condition=ready pod -l job-name="paper-train-${TIER}" \
  -n mlops-sentiment --timeout=600s || true
{
  echo "===== paper-train-${TIER} | started $(date -u +%Y-%m-%dT%H:%M:%SZ) ====="
  kubectl logs -f "job/paper-train-${TIER}" -n mlops-sentiment
  echo "===== finished $(date -u +%Y-%m-%dT%H:%M:%SZ) ====="
  kubectl get job "paper-train-${TIER}" -n mlops-sentiment
} 2>&1 | tee "${LOGFILE}"
echo "Log saved to ${LOGFILE}"
