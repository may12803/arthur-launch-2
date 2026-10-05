#!/bin/sh
# Triggers one connector cron endpoint with the server secret from the environment (run under arthur-cred).
# Usage: arthur-cred run --use loveleeday-connectors-server -- scripts/cron-probe.sh <sync|webhooks> [base-url]
base="${2:-https://portal.loveleedaystudios.com}"
curl -s -m 200 -w ' [HTTP %{http_code}]\n' -X POST -H "x-connectors-secret: ${LOVELEEDAY_CONNECTORS_SERVER_SECRET}" "$base/api/cron/$1" | cut -c1-300
