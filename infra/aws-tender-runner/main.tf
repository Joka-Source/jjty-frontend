data "aws_ssm_parameter" "windows_ami" {
  name = "/aws/service/ami-windows-latest/Windows_Server-2025-English-Full-Base"
}

resource "aws_vpc" "runner" {
  cidr_block           = "10.83.0.0/24"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "jjty-tender-runner" }
}

resource "aws_internet_gateway" "runner" {
  vpc_id = aws_vpc.runner.id
  tags   = { Name = "jjty-tender-runner" }
}

resource "aws_subnet" "runner" {
  vpc_id                  = aws_vpc.runner.id
  cidr_block              = "10.83.0.0/26"
  map_public_ip_on_launch = true

  tags = { Name = "jjty-tender-runner" }
}

resource "aws_route_table" "runner" {
  vpc_id = aws_vpc.runner.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.runner.id
  }

  tags = { Name = "jjty-tender-runner" }
}

resource "aws_route_table_association" "runner" {
  subnet_id      = aws_subnet.runner.id
  route_table_id = aws_route_table.runner.id
}

resource "aws_security_group" "runner" {
  name        = "jjty-tender-runner"
  description = "Amazon DCV access from the operator current address"
  vpc_id      = aws_vpc.runner.id

  ingress {
    description = "Amazon DCV"
    from_port   = 8443
    to_port     = 8443
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }

  dynamic "ingress" {
    for_each = var.allow_rdp ? [1] : []
    content {
      description = "Temporary RDP recovery"
      from_port   = 3389
      to_port     = 3389
      protocol    = "tcp"
      cidr_blocks = [var.allowed_cidr]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "jjty-tender-runner" }
}

resource "aws_iam_role" "runner" {
  name_prefix = "jjty-tender-runner-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.runner.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "runner" {
  name_prefix = "jjty-tender-runner-"
  role        = aws_iam_role.runner.name
}

resource "aws_instance" "runner" {
  ami                         = data.aws_ssm_parameter.windows_ami.value
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.runner.id
  vpc_security_group_ids      = [aws_security_group.runner.id]
  associate_public_ip_address = true
  key_name                    = var.key_name
  iam_instance_profile        = aws_iam_instance_profile.runner.name
  get_password_data           = true
  user_data_replace_on_change = true
  user_data                   = <<-EOT
    <powershell>
    ${file("${path.module}/windows/bootstrap.ps1")}
    </powershell>
  EOT

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    encrypted   = true
    volume_type = "gp3"
    volume_size = 60
  }

  tags = { Name = "JJTY Kothali Tender Runner" }

  depends_on = [aws_iam_role_policy_attachment.ssm]
}
