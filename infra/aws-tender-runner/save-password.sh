#!/bin/zsh
set -euo pipefail

runner_dir=${0:A:h}
local_dir="$runner_dir/.local"
region=${AWS_REGION:-ap-south-1}
state_file="$local_dir/terraform.tfstate"
key_file="$local_dir/jjty-tender-runner.pem"

export TF_DATA_DIR="$local_dir/terraform-data"
instance_id=$(terraform -chdir="$runner_dir" output -state="$state_file" -raw instance_id)
admin_password=$(aws ec2 get-password-data --region "$region" --instance-id "$instance_id" --priv-launch-key "$key_file" --query PasswordData --output text)
if [[ -z "$admin_password" || "$admin_password" == "None" ]]; then
  print -u2 "Windows password is not available yet. Try again in a few minutes."
  exit 1
fi
security add-generic-password -U -a Administrator -s "JJTY Tender Runner $instance_id" -w "$admin_password" >/dev/null
unset admin_password
print "Administrator password saved in macOS Keychain."
