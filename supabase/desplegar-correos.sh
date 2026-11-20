#!/usr/bin/env bash
# Despliega la función «correos» (copia en PDF, certificado OTP y envíos) en el Supabase de EvalPro y comprueba
# que el correo siga funcionando. Usa subir-funcion.sh, pero FIJA el contenedor: el servidor tiene varias instancias
# de Supabase y, sin fijarlo, subir-funcion.sh toma la primera que encuentra.
#
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador» varias veces: ssh, scp y sudo):
#   bash supabase/desplegar-correos.sh
# Opcionales (variables de entorno):
#   SRV=usuario@host            servidor (por defecto administrador@planeacion.udes.edu.co)
#   CONTENEDOR=nombre           contenedor de funciones de ESTE proyecto
#   MAILPIT=nombre              contenedor de Mailpit
#   SIN_REINICIO=1              copia la función sin reiniciar el contenedor
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
export SRV="${SRV:-administrador@planeacion.udes.edu.co}"
export CONTENEDOR="${CONTENEDOR:-supabase-edge-functions-igzwb7zrr2rv7r9etq0hah43}"
MAILPIT="${MAILPIT:-mailpit-9ymivnn1x7foyrxwj9twl5nm}"

echo "Servidor:   $SRV"
echo "Contenedor: $CONTENEDOR"
echo "Mailpit:    $MAILPIT"
echo

# 1. Subir la función (respaldo, copia, comprobación de hashes y reinicio).
bash "$AQUI/subir-funcion.sh" correos

# 2. Comprobar que el contenedor de funciones sigue viendo a Mailpit; si no, conectar su red (es idempotente).
echo
echo "Comprobando que las funciones alcanzan a Mailpit…"
ssh -t "$SRV" "sudo bash -s" <<REMOTO
set -u
FN='$CONTENEDOR'
MP='$MAILPIT'
if ! docker ps --format '{{.Names}}' | grep -qx "\$FN"; then echo "  ✗ No encuentro el contenedor \$FN"; exit 1; fi
if ! docker ps --format '{{.Names}}' | grep -qx "\$MP"; then echo "  ✗ Mailpit (\$MP) no está en ejecución"; exit 1; fi
if docker exec "\$FN" getent hosts "\$MP" >/dev/null 2>&1; then
  echo "  ✓ Las funciones resuelven a Mailpit."
else
  RED="\$(docker inspect "\$FN" --format '{{range \$k,\$v := .NetworkSettings.Networks}}{{\$k}} {{end}}' | awk '{print \$1}')"
  echo "  ! No resuelven. Conectando Mailpit a la red \$RED…"
  docker network connect "\$RED" "\$MP" 2>&1 || true
  if docker exec "\$FN" getent hosts "\$MP" >/dev/null 2>&1; then echo "  ✓ Ahora sí resuelven a Mailpit."; else echo "  ✗ Siguen sin resolver: revise las redes a mano."; exit 1; fi
fi
REMOTO

# 3. Prueba externa: la función debe responder con su validación (no 502).
echo
echo "Probando la función desde aquí…"
codigo=$(curl -s -o /dev/null -m 20 -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d '{"action":"cert_verify","code":"PRUEBA"}' "https://planeacion.udes.edu.co/3/functions/v1/correos" || true)
if [ "$codigo" = "400" ]; then echo "  ✓ Responde (400 esperado por el código de prueba)."; else echo "  ✗ Respuesta inesperada: HTTP $codigo"; exit 1; fi

echo
echo "Listo. Falta (si no lo hizo): ejecutar la migración 20261120000000_copia_evaluaciones.sql en el SQL Editor"
echo "y publicar el front con un nuevo build en Coolify. Después pruebe completando una evaluación con su usuario."
