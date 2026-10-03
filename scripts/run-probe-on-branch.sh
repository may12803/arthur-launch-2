#!/bin/sh
# Runs the tenant-isolation probe against the bar7-isolation Supabase BRANCH (never production). Usage: run-probe-on-branch.sh [portal-base]
# Fixture users all use password Probe-Pass-2026-xyz and TOTP secret JBSWY3DPEHPK3PXP (see scripts/tenant-isolation-fixture.sql).
cd "$(dirname "$0")/.." || exit 2
export PROBE_URL=https://okaisjfkcvljggiabpkj.supabase.co
export PROBE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rYWlzamZrY3ZsamdnaWFicGtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNjMzNzEsImV4cCI6MjEwNjYzOTM3MX0.fGYHATIdtF55jOApgFiEPOTDWDcNy25LO72q-cL5V6Q
export PROBE_A_EMAIL=a@probe.test PROBE_A_PASSWORD=Probe-Pass-2026-xyz PROBE_A_TOTP=JBSWY3DPEHPK3PXP
export PROBE_STAFF_EMAIL=s@probe.test PROBE_STAFF_PASSWORD=Probe-Pass-2026-xyz PROBE_STAFF_TOTP=JBSWY3DPEHPK3PXP
export PROBE_A_TENANT=aaaaaaaa-1111-4000-8000-00000000000a PROBE_B_TENANT=bbbbbbbb-1111-4000-8000-00000000000b
export PROBE_B_DOC=bbbbbbbb-4444-4000-8000-00000000000b PROBE_B_SHARE=bbbbbbbb-5555-4000-8000-00000000000b PROBE_B_TASK=bbbbbbbb-3333-4000-8000-00000000000b
export PROBE_BASE="${1:-http://localhost:3917}"
exec node scripts/tenant-isolation-probe.mjs
