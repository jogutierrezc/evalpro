#!/usr/bin/env bash
set -euo pipefail

# Script to create an auth user via Supabase Admin API and insert a row into public.users
# Usage:
#   export SERVICE_ROLE_KEY="your_service_role_key"
#   bash scripts/create_admin.sh

PROJECT_URL="https://abchjsydqtfbwivygpet.supabase.co"
EMAIL="1065822939@evaluation.local"
PASSWORD="1065822939"

if [ -z "${SERVICE_ROLE_KEY:-}" ]; then
  echo "ERROR: SERVICE_ROLE_KEY environment variable is not set."
  echo "Set it with: export SERVICE_ROLE_KEY='your_service_role_key'"
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl is required. Install it and retry."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required to parse JSON. Install it (brew install jq) and retry."
  exit 1
fi

echo "Creating auth user (email=$EMAIL) via Supabase Admin API..."
resp=$(curl -s -X POST "$PROJECT_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"email_confirm\":true}")

user_id=$(echo "$resp" | jq -r '.id // empty')

if [ -z "$user_id" ]; then
  echo "Failed to create auth user. Response:"
  echo "$resp" | jq '.' || echo "$resp"
  exit 1
fi

echo "Auth user created: $user_id"

echo "Inserting application user into public.users..."
insert_resp=$(curl -s -X POST "$PROJECT_URL/rest/v1/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"id\":\"$user_id\",\"identification\":\"1065822939\",\"full_name\":\"Administrador Forzado\",\"email\":\"$EMAIL\",\"role\":\"admin\"}")

echo "Insert response:"
echo "$insert_resp" | jq '.' || echo "$insert_resp"

echo "Done. IMPORTANT: If you pasted the service_role key anywhere public, rotate/revoke it in the Supabase Dashboard immediately." 
