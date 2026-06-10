import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * Singleton DynamoDB Document Client.
 *
 * Lambda containers reuse the same module instance across warm invocations,
 * so we instantiate once at cold start and share. The AWS credential chain
 * picks up the Lambda execution role (or the local profile via
 * `AWS_PROFILE` / `AWS_REGION` during dev).
 */

const REGION = process.env['AWS_REGION'] ?? 'us-east-1';

const baseClient = new DynamoDBClient({ region: REGION });

export const ddb = DynamoDBDocumentClient.from(baseClient, {
  marshallOptions: {
    // Skip undefined fields instead of erroring — handlers can pass partial items.
    removeUndefinedValues: true,
    // Convert empty strings / sets pragmatically; we'll opt-in per-call when needed.
    convertEmptyValues: false,
    convertClassInstanceToMap: true,
  },
  unmarshallOptions: {
    // Return native JS numbers rather than wrapped BigNumber-ish objects.
    wrapNumbers: false,
  },
});

/**
 * Resolved table names. Env vars come from Lambda environment via Terraform;
 * defaults match CONTROL_PLANE.md so local scripts work out of the box.
 */
export const TABLE_NAMES = {
  tenants: process.env['DDB_TABLE_TENANTS'] ?? 'tad-mcp-aws-tenants',
  licenses: process.env['DDB_TABLE_LICENSES'] ?? 'tad-mcp-aws-licenses',
  seats: process.env['DDB_TABLE_SEATS'] ?? 'tad-mcp-aws-seats',
  usage: process.env['DDB_TABLE_USAGE'] ?? 'tad-mcp-aws-usage-events',
  products: process.env['DDB_TABLE_PRODUCTS'] ?? 'tad-mcp-aws-products',
  users: process.env['DDB_TABLE_USERS'] ?? 'tad-marketplace-users',
  authTokens: process.env['DDB_TABLE_AUTH_TOKENS'] ?? 'tad-marketplace-auth-tokens',
} as const;

export type TableNameKey = keyof typeof TABLE_NAMES;

export const SEATS_TOKEN_HASH_INDEX = 'token_hash_idx';
export const LICENSES_PRODUCT_INDEX = 'product_idx';
