# Lambda execution role.
#
# The DynamoDB statement is EXACTLY the block from CLAUDE.md: full CRUD on
# the shared control-plane tables (tad-mcp-aws-*) and the marketplace-only
# tables (tad-marketplace-*), including their GSIs.

resource "aws_iam_role" "lambda_exec" {
  name = "tad-marketplace-lambda-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

# CloudWatch Logs (CreateLogStream/PutLogEvents).
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_app" {
  name = "tad-marketplace-lambda-app"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoControlPlane"
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem"
        ]
        Resource = [
          "arn:aws:dynamodb:${var.aws_region}:${local.account_id}:table/tad-mcp-aws-*",
          "arn:aws:dynamodb:${var.aws_region}:${local.account_id}:table/tad-mcp-aws-*/index/*",
          "arn:aws:dynamodb:${var.aws_region}:${local.account_id}:table/tad-marketplace-*",
          "arn:aws:dynamodb:${var.aws_region}:${local.account_id}:table/tad-marketplace-*/index/*"
        ]
      },
      {
        Sid    = "SesSendMagicLinksAndInvites"
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = "arn:aws:ses:${var.aws_region}:${local.account_id}:identity/*"
      },
      {
        # installer-download does HeadObject (covered by s3:GetObject) and
        # presigns GetObject URLs on the private installer bucket.
        Sid      = "InstallerBucketRead"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "arn:aws:s3:::${var.installer_bucket}/*"
      },
      {
        Sid    = "ReadOwnSecrets"
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = [
          aws_secretsmanager_secret.jwt.arn,
          aws_secretsmanager_secret.paypal.arn
        ]
      }
    ]
  })
}
