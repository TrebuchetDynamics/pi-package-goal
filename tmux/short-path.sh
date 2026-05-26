#!/usr/bin/env sh
# Print only the last two path components, with a leading slash.
# Example: /home/xel/git/gormes/gormes-agent -> /gormes/gormes-agent

path=${1:-}
[ -n "$path" ] || exit 0

# Drop trailing slashes except for root.
while [ "$path" != "/" ] && [ "${path%/}" != "$path" ]; do
  path=${path%/}
done

[ "$path" = "/" ] && { printf '/'; exit 0; }

base=${path##*/}
parent=${path%/*}
parent_base=${parent##*/}

if [ -z "$parent_base" ] || [ "$parent" = "$path" ]; then
  printf '/%s' "$base"
else
  printf '/%s/%s' "$parent_base" "$base"
fi
