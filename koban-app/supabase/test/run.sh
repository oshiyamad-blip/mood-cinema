#!/bin/sh
# 手元の PostgreSQL（16 以上）で schema.sql と権限のシナリオを流す。
#   PGHOST=/var/tmp/kobanpg PGPORT=54329 PGUSER=postgres sh supabase/test/run.sh
set -e
cd "$(dirname "$0")"
psql -q -c 'drop database if exists koban_test' -c 'create database koban_test'
psql -q -d koban_test -v ON_ERROR_STOP=1 -f shim.sql -f ../schema.sql -f ../schema.sql >/dev/null 2>&1
psql -q -d koban_test -v ON_ERROR_STOP=1 -f scenario.sql >/dev/null
echo 'schema.sql: ok'
