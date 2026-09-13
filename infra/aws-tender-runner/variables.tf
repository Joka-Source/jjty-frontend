variable "aws_region" {
  description = "AWS region for the Windows tender runner."
  type        = string
  default     = "ap-south-1"
}

variable "allowed_cidr" {
  description = "Single trusted public IPv4 address in CIDR form, normally this Mac's current address with /32."
  type        = string

  validation {
    condition     = can(cidrhost(var.allowed_cidr, 0)) && can(regex("^[0-9]+(\\.[0-9]+){3}/32$", var.allowed_cidr))
    error_message = "allowed_cidr must be a single IPv4 address ending in /32."
  }
}

variable "key_name" {
  description = "Existing EC2 key pair used only to decrypt the initial Windows password."
  type        = string
}

variable "instance_type" {
  description = "EC2 size for the Windows desktop. t3.large is the practical default for browser and DSC middleware."
  type        = string
  default     = "t3.large"
}

variable "allow_rdp" {
  description = "Temporarily allow RDP from allowed_cidr for recovery. Amazon DCV is the normal connection path."
  type        = bool
  default     = false
}
