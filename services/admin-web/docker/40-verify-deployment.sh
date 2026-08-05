#!/bin/sh
set -eu

root=/usr/share/nginx/html
index_file="$root/index.html"

if ! grep -Fq '<title>逻栖工枢 · 运营中心</title>' "$index_file"; then
  echo '[admin-web] deployment verification failed: page title mismatch' >&2
  exit 1
fi

for phrase in '运营中心登录' '登录运营中心' '关键操作将记录审计日志'; do
  if ! find "$root/assets" -type f -name '*.js' -exec grep -Fq "$phrase" {} +; then
    echo '[admin-web] deployment verification failed: required operations-center copy is missing' >&2
    exit 1
  fi
done

echo '[admin-web] deployment verification passed'
