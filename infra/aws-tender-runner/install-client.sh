#!/bin/zsh
set -euo pipefail

runner_dir=${0:A:h}
local_dir="$runner_dir/.local"
dmg="$local_dir/amazon-dcv-viewer.arm64.dmg"
checksum="$dmg.sha256sum"
url='https://d1uj6qtbmh3dt5.cloudfront.net/nice-dcv-viewer.arm64.dmg'

mkdir -p "$local_dir" "$HOME/Applications"
curl -fL "$url" -o "$dmg"
curl -fL "$url.sha256sum" -o "$checksum"

expected=$(awk '{print $1}' "$checksum")
actual=$(shasum -a 256 "$dmg" | awk '{print $1}')
if [[ "$expected" != "$actual" ]]; then
  print -u2 "Amazon DCV download checksum did not match."
  exit 1
fi

mount_point=$(hdiutil attach -nobrowse -readonly "$dmg" | awk '/\/Volumes\// {sub(/^.*\/Volumes\//, "/Volumes/"); print; exit}')
if [[ -z "$mount_point" ]]; then
  print -u2 "Could not mount the Amazon DCV installer."
  exit 1
fi
trap 'hdiutil detach "$mount_point" >/dev/null 2>&1 || true' EXIT

app_path=$(find "$mount_point" -maxdepth 2 -name '*.app' -print -quit)
if [[ -z "$app_path" ]]; then
  print -u2 "Amazon DCV application was not found in the installer."
  exit 1
fi
ditto "$app_path" "$HOME/Applications/${app_path:t}"
print "Amazon DCV installed in $HOME/Applications."
