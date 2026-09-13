#!/bin/zsh
set -euo pipefail

runner_dir=${0:A:h}
local_dir="$runner_dir/.local"
state_file="$local_dir/terraform.tfstate"
export TF_DATA_DIR="$local_dir/terraform-data"

dcv_url=$(terraform -chdir="$runner_dir" output -state="$state_file" -raw dcv_url)
instance_id=$(terraform -chdir="$runner_dir" output -state="$state_file" -raw instance_id)

if ! security find-generic-password -a Administrator -s "JJTY Tender Runner $instance_id" >/dev/null 2>&1; then
  print -u2 "Administrator password is not in macOS Keychain. Run ./save-password.sh first."
  exit 1
fi

open "$dcv_url"
print "Amazon DCV opened. Use Administrator and retrieve its password from the matching JJTY Tender Runner item in Passwords/Keychain."
print "In DCV settings, enable Redirect smartcard devices before connecting."
