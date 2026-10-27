output "aws_region" {
  value = var.aws_region
}

output "cluster_name" {
  value = module.eks.cluster_name
}

output "ecr_repository_urls" {
  value = { for name, repository in aws_ecr_repository.service : name => repository.repository_url }
}

output "github_deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}

output "database_secret_arn" {
  value = module.db.db_instance_master_user_secret_arn
}

output "database_endpoint" {
  value = module.db.db_instance_endpoint
}
