#!/usr/bin/env bash
# Sube una función de supabase/functions/<nombre> al servidor (Supabase autoalojado en Coolify), con respaldo
# y reinicio del contenedor de funciones. Por defecto sube «correos» (certificado OTP y correos).
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador»: ssh, scp y sudo):
#   bash supabase/subir-funcion.sh              # correos
#   bash supabase/subir-funcion.sh feedback-otp # otra función
# Opcionales: SRV=usuario@host  CONTENEDOR=nombre  SIN_REINICIO=1
# Los respaldos quedan FUERA de la carpeta de funciones (backups-funciones/) para que el runtime no los sirva.
set -euo pipefail

FN="${1:-correos}"
SRV="${SRV:-administrador@planeacion.udes.edu.co}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
ORIGEN="$AQUI/functions/$FN"
[ -f "$ORIGEN/index.ts" ] || { echo "No existe $ORIGEN/index.ts"; exit 1; }
TMPR="$(mktemp)"
trap 'rm -f "$TMPR"' EXIT
STAMP="$(date +%Y%m%d-%H%M)"

echo "1/3 Copiando archivos al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/fn-nuevo && mkdir -p /tmp/fn-nuevo/$FN"
scp "$ORIGEN"/*.ts "$SRV:/tmp/fn-nuevo/$FN/"
[ -f "$ORIGEN/deno.json" ] && scp "$ORIGEN/deno.json" "$SRV:/tmp/fn-nuevo/$FN/"

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
FN="$1"; STAMP="$2"; CONT="$3"; SIN_REINICIO="$4"
NUEVO=/tmp/fn-nuevo

[ -n "$CONT" ] || CONT="$(docker ps --format '{{.Names}}' | grep '^supabase-edge-functions' | head -1)"
[ -n "$CONT" ] || { echo "No encontré el contenedor de funciones (pase CONTENEDOR=...)"; exit 1; }
BASE="$(docker inspect "$CONT" --format '{{range .Mounts}}{{if eq .Destination "/home/deno/functions"}}{{.Source}}{{end}}{{end}}')"
[ -n "$BASE" ] && [ -d "$BASE" ] || { echo "No encontré la carpeta de funciones de $CONT"; exit 1; }
RAIZ="$(dirname "$(dirname "$BASE")")"
RESP="$RAIZ/backups-funciones/$STAMP"
echo "2/3 Instalando en $BASE/$FN (contenedor $CONT)…"

mkdir -p "$BASE/$FN" "$RESP"
sed -i 's/\r$//' "$NUEVO/$FN"/*.ts
if [ -n "$(ls -A "$BASE/$FN")" ]; then cp -a "$BASE/$FN" "$RESP/$FN"; echo "  respaldo: $RESP/$FN"; fi
cp "$NUEVO/$FN"/* "$BASE/$FN/"
chown -R --reference="$BASE" "$BASE/$FN"
( cd "$NUEVO/$FN" && sha256sum * ) > /tmp/fn-hash-o.txt
( cd "$BASE/$FN" && sha256sum $(ls "$NUEVO/$FN") ) > /tmp/fn-hash-d.txt
diff -q /tmp/fn-hash-o.txt /tmp/fn-hash-d.txt >/dev/null && echo "  hashes iguales" || { echo "  LOS HASHES NO COINCIDEN"; exit 1; }

if [ -z "$SIN_REINICIO" ]; then
  echo "3/3 Reiniciando $CONT…"
  docker restart "$CONT" >/dev/null
  s=""; for i in $(seq 1 30); do s=$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null || echo ""); [ "$s" = "healthy" ] && break; sleep 2; done
  echo "  estado: $s"
fi
rm -rf "$NUEVO" /tmp/fn-hash-o.txt /tmp/fn-hash-d.txt
echo "Para volver atrás: copie $RESP/$FN sobre $BASE/$FN y reinicie el contenedor."
REMOTO

scp "$TMPR" "$SRV:/tmp/fn-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/fn-remoto.sh '$FN' '$STAMP' '${CONTENEDOR:-}' '${SIN_REINICIO:-}'; rm -f /tmp/fn-remoto.sh"
echo "Listo. Pruebe generar el certificado de seguimiento OTP en Correos → Firmas."
