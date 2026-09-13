output "instance_id" {
  value = aws_instance.runner.id
}

output "public_ip" {
  value = aws_eip.runner.public_ip
}

output "dcv_url" {
  value = "dcv://Administrator@${aws_eip.runner.public_ip}:8443/#console"
}

output "aws_console_url" {
  value = "https://${var.aws_region}.console.aws.amazon.com/ec2/home?region=${var.aws_region}#InstanceDetails:instanceId=${aws_instance.runner.id}"
}
