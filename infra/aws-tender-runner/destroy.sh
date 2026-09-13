#!/bin/zsh
set -euo pipefail

runner_dir=${0:A:h}
local_dir="$runner_dir/.local"
region=${AWS_REGION:-ap-south-1}
state_file="$local_dir/terraform.tfstate"
key_name="jjty-tender-runner"

export TF_DATA_DIR="$local_dir/terraform-data"
public_ip=$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')
terraform -chdir="$runner_dir" destroy \
  -state="$state_file" \
  -var="aws_region=$region" \
  -var="allowed_cidr=$public_ip/32" \
  -var="key_name=$key_name"
aws ec2 delete-key-pair --region "$region" --key-name "$key_name" >/dev/null 2>&1 || true
rm -f "$local_dir/$key_name.pem"
print "AWS runner and its EC2 key pair were removed."
