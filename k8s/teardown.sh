#!/usr/bin/env bash
# Delete the local kind cluster for the marketplace demo.
set -euo pipefail
kind delete cluster --name marketplace
