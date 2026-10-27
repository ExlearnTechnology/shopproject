variable "aws_region" {
  description = "AWS region for the cluster and database."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short project identifier used in resource names."
  type        = string
  default     = "shop"
}

variable "eks_version" {
  description = "Kubernetes version for the EKS cluster."
  type        = string
  default     = "1.34"
}

variable "github_owner" {
  description = "GitHub user or organization that owns the repository."
  type        = string
}

variable "github_repository" {
  description = "Repository name, without the owner."
  type        = string
}

variable "github_branch" {
  description = "Branch allowed to assume the deployment role."
  type        = string
  default     = "main"
}

variable "github_oidc_thumbprint" {
  description = "Current root CA thumbprint for token.actions.githubusercontent.com; verify before applying."
  type        = string
  default     = "6938fd4d98bab03faadb97b34396831e3780aea1"
}

variable "cluster_endpoint_public_access_cidrs" {
  description = "CIDR ranges allowed to reach the EKS Kubernetes API endpoint."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
