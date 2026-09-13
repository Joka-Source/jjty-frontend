terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Application = "JJTY Tender Runner"
      ManagedBy   = "Terraform"
      Tender      = "2026_PWR_1337988_1"
    }
  }
}
