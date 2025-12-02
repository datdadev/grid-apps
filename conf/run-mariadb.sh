#!/bin/bash
set -e

DATADIR="/var/lib/mysql"
MARKER="$DATADIR/.kiri_inited"

if [ ! -d "$DATADIR/mysql" ]; then
  echo "Initializing MariaDB data dir..."
  chown -R mysql:mysql "$DATADIR"
  mariadb-install-db --user=mysql --datadir="$DATADIR"
fi

chown -R mysql:mysql "$DATADIR"

# one-time database/user setup
if [ ! -f "$MARKER" ]; then
  echo "Bootstrapping MariaDB users/databases..."
  /usr/sbin/mysqld --user=mysql --datadir="$DATADIR" --skip-networking --socket=/run/mysqld/mysqld.sock &
  PID=$!
  for i in {1..30}; do
    if mariadb --protocol=socket -uroot --socket=/run/mysqld/mysqld.sock -e "SELECT 1" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  mariadb --protocol=socket -uroot --socket=/run/mysqld/mysqld.sock <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`;
CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'%';
FLUSH PRIVILEGES;
SQL
  kill "$PID"
  wait "$PID" || true
  touch "$MARKER"
  echo "MariaDB bootstrap complete."
fi

exec /usr/sbin/mysqld --user=mysql --datadir="$DATADIR" --bind-address=0.0.0.0
