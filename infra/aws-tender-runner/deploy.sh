#!/bin/zsh
set -euo pipefail

runner_dir=${0:A:h}
local_dir="$runner_dir/.local"
region=${AWS_REGION:-ap-south-1}
key_name="jjty-tender-runner"
key_file="$local_dir/$key_name.pem"
state_file="$local_dir/terraform.tfstate"
plan_file="$local_dir/terraform.plan"

mkdir -p "$local_dir"
chmod 700 "$local_dir"

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  print -u2 "AWS sign-in is required. Run: aws login"
  exit 2
fi

public_ip=$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')
if [[ ! "$public_ip" =~ '^[0-9]+(\.[0-9]+){3}$' ]]; then
  print -u2 "Could not determine this Mac's public IPv4 address."
  exit 3
fi

if ! aws ec2 describe-key-pairs --region "$region" --key-names "$key_name" >/dev/null 2>&1; then
  aws ec2 create-key-pair \
    --region "$region" \
    --key-name "$key_name" \
    --query KeyMaterial \
    --output text > "$key_file"
  chmod 600 "$key_file"
elif [[ ! -s "$key_file" ]]; then
  print -u2 "AWS key pair $key_name exists, but its private key is missing from $key_file."
  print -u2 "Delete that unused AWS key pair or choose a new key name before deploying."
  exit 4
fi

export TF_DATA_DIR="$local_dir/terraform-data"
terraform -chdir="$runner_dir" init -input=false
terraform -chdir="$runner_dir" plan \
  -input=false \
  -state="$state_file" \
  -out="$plan_file" \
  -var="aws_region=$region" \
  -var="allowed_cidr=$public_ip/32" \
  -var="key_name=$key_name"
terraform -chdir="$runner_dir" apply -input=false -state="$state_file" "$plan_file"

instance_id=$(terraform -chdir="$runner_dir" output -state="$state_file" -raw instance_id)
runner_ip=$(terraform -chdir="$runner_dir" output -state="$state_file" -raw public_ip)

print "Windows is starting at $runner_ip. Waiting for its password to become available..."
admin_password=''
for attempt in {1..40}; do
  admin_password=$(aws ec2 get-password-data \
    --region "$region" \
    --instance-id "$instance_id" \
    --priv-launch-key "$key_file" \
    --query PasswordData \
    --output text 2>/dev/null || true)
  if [[ -n "$admin_password" && "$admin_password" != "None" ]]; then
    break
  fi
  sleep 15
done

if [[ -z "$admin_password" || "$admin_password" == "None" ]]; then
  print -u2 "The runner exists, but Windows has not released its password yet. Re-run ./save-password.sh in a few minutes."
  exit 5
fi

security add-generic-password -U -a Administrator -s "JJTY Tender Runner $instance_id" -w "$admin_password" >/dev/null
unset admin_password

print "Runner created: $instance_id"
print "DCV address: dcv://Administrator@$runner_ip:8443/#console"
print "Administrator password saved in macOS Keychain."
print "Next: ./install-client.sh && ./connect.sh"
