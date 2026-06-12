/**
 * Local dev server for the marketplace backend.
 *
 * Why this file exists:
 *   API Gateway HTTP API + Lambda is the prod target. Spinning that up via
 *   Terraform takes time; meanwhile we want to exercise the auth flow end-to-
 *   end against the real DynamoDB tables. This server impersonates API Gateway
 *   on `localhost:8080`:
 *     - Express receives the HTTP request from the Next.js dev FE
 *       (`localhost:3000`) with CORS + credentials.
 *     - We synthesize an `APIGatewayProxyEventV2` and invoke the same handler
 *       function the Lambda would invoke.
 *     - We translate the handler's structured response (statusCode, headers,
 *       cookies, body) back into Express response calls.
 *
 * Routes:
 *   POST /auth/magic-link
 *   POST /auth/verify
 *   GET  /health
 *
 * Env (read via dotenv from `<repo>/.env.local`):
 *   PORT                       default 8080
 *   FRONTEND_URL               default http://localhost:3000 (CORS allowed origin)
 *   AWS_REGION                 default us-east-1
 *   AWS_PROFILE / creds        from CLI profile
 *   JWT_SECRET                 REQUIRED (>=32 chars) for /auth/verify
 *   SES_FROM_ADDRESS           default noreply@tad.com.mx
 *   MAGIC_LINK_DEV_MODE=true   log magic link to stdout instead of calling SES
 *   SESSION_COOKIE_INSECURE=true  drop the `Secure` cookie flag so Chrome will
 *                              accept the session cookie over plain HTTP
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from 'aws-lambda';
import type { Request, Response } from 'express';

// Load env BEFORE importing handlers — ddb.ts and ses.ts read process.env at
// module init time, so the dotenv call must run first. We also keep handler
// imports dynamic (below) so they observe the populated env.
const ENV_PATHS = [
  resolve(process.cwd(), '..', '.env.local'),
  resolve(process.cwd(), '.env.local'),
];
const ENV_LOAD_RESULTS = ENV_PATHS.map((p) => ({ path: p, result: dotenvConfig({ path: p }) }));

const { handler: authMagicLink } = await import('../handlers/auth-magic-link.js');
const { handler: authVerify } = await import('../handlers/auth-verify.js');
const { handler: authLogout } = await import('../handlers/auth-logout.js');
const { handler: meHandler } = await import('../handlers/me.js');
const { handler: meLicensesHandler } = await import('../handlers/me-licenses.js');
const { handler: checkoutSession } = await import('../handlers/checkout-session.js');
const { handler: checkoutConfirm } = await import('../handlers/checkout-confirm.js');
const { handler: installerDownload } = await import('../handlers/installer-download.js');
const { handler: seatActivate } = await import('../handlers/seat-activate.js');
const { handler: seatRevoke } = await import('../handlers/seat-revoke.js');
const { handler: meSeats } = await import('../handlers/me-seats.js');
const { handler: teamInvite } = await import('../handlers/team-invite.js');
const { handler: licenseCancel } = await import('../handlers/license-cancel.js');
const { handler: webhookPaypal } = await import('../handlers/webhook-paypal.js');

type LambdaHandler = typeof authMagicLink;

const PORT = Number(process.env['PORT'] ?? '8080');
const FRONTEND_ORIGIN = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';

const app = express();
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: '64kb' }));

function toLambdaEvent(req: Request): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    headers[k] = Array.isArray(v) ? v.join(',') : (v ?? '');
  }

  const cookieHeader = req.headers.cookie ?? '';
  const cookies = cookieHeader.length > 0
    ? cookieHeader.split('; ').filter((c) => c.length > 0)
    : [];

  const queryIdx = req.originalUrl.indexOf('?');
  const rawQueryString = queryIdx >= 0 ? req.originalUrl.slice(queryIdx + 1) : '';

  let bodyStr = '';
  if (req.body !== undefined && req.body !== null) {
    bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  const event = {
    version: '2.0',
    routeKey: `${req.method} ${req.path}`,
    rawPath: req.path,
    rawQueryString,
    headers,
    cookies,
    body: bodyStr,
    isBase64Encoded: false,
    pathParameters: req.params,
    requestContext: {
      accountId: 'local',
      apiId: 'local',
      domainName: 'localhost',
      domainPrefix: 'localhost',
      http: {
        method: req.method,
        path: req.path,
        protocol: 'HTTP/1.1',
        sourceIp: req.ip ?? '127.0.0.1',
        userAgent: req.headers['user-agent'] ?? '',
      },
      requestId: randomUUID(),
      routeKey: `${req.method} ${req.path}`,
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
  };

  return event as unknown as APIGatewayProxyEventV2;
}

const STUB_CONTEXT = {} as unknown as Context;
const STUB_CALLBACK = (): void => {
  /* no-op */
};

function sendLambdaResult(
  res: Response,
  result: APIGatewayProxyStructuredResultV2 | string,
): void {
  if (typeof result === 'string') {
    res.status(200).send(result);
    return;
  }
  if (result.headers) {
    for (const [k, v] of Object.entries(result.headers)) {
      res.setHeader(k, String(v));
    }
  }
  if (result.cookies && result.cookies.length > 0) {
    res.setHeader('Set-Cookie', result.cookies);
  }
  res.status(result.statusCode ?? 200).send(result.body ?? '');
}

function mount(method: 'GET' | 'POST', path: string, handler: LambdaHandler): void {
  const register = method === 'GET' ? app.get.bind(app) : app.post.bind(app);
  register(path, (req: Request, res: Response) => {
    let invocation: ReturnType<LambdaHandler>;
    try {
      invocation = handler(toLambdaEvent(req), STUB_CONTEXT, STUB_CALLBACK);
    } catch (err) {
      console.error(`[dev-server] sync error at ${method} ${path}`, err);
      res.status(500).json({ error: 'internal_error' });
      return;
    }

    if (!(invocation instanceof Promise)) {
      res.status(500).json({ error: 'handler_did_not_return_promise' });
      return;
    }

    invocation
      .then((r) => {
        if (r === undefined) {
          res.status(204).end();
          return;
        }
        sendLambdaResult(res, r);
      })
      .catch((err: unknown) => {
        console.error(`[dev-server] handler error at ${method} ${path}`, err);
        res.status(500).json({ error: 'internal_error' });
      });
  });
}

mount('POST', '/auth/magic-link', authMagicLink);
mount('POST', '/auth/verify', authVerify);
mount('POST', '/auth/logout', authLogout);
mount('GET', '/me', meHandler);
mount('GET', '/me/licenses', meLicensesHandler);
mount('POST', '/checkout/session', checkoutSession);
mount('POST', '/checkout/confirm', checkoutConfirm);
mount('GET', '/installers/:product_id/download', installerDownload);
mount('POST', '/seats/activate', seatActivate);
mount('POST', '/seats/:seat_id/revoke', seatRevoke);
mount('GET', '/me/seats', meSeats);
mount('POST', '/team/invite', teamInvite);
mount('POST', '/licenses/:license_id/cancel', licenseCancel);
mount('POST', '/webhooks/paypal', webhookPaypal);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, ts: Math.floor(Date.now() / 1000) });
});

function reportEnv(): void {
  for (const { path, result } of ENV_LOAD_RESULTS) {
    if (result.error) {
      console.warn(`[dev-server] dotenv: skipped ${path} (${result.error.message})`);
    } else {
      const count = Object.keys(result.parsed ?? {}).length;
      console.warn(`[dev-server] dotenv: loaded ${count.toString()} vars from ${path}`);
    }
  }
  const jwt = process.env['JWT_SECRET'];
  const jwtStatus = jwt
    ? jwt.length >= 32
      ? `OK (${jwt.length.toString()} chars)`
      : `TOO SHORT (${jwt.length.toString()} chars, need >=32)`
    : 'MISSING';
  console.warn(`[dev-server] JWT_SECRET: ${jwtStatus}`);
  console.warn(`[dev-server] AWS_REGION: ${process.env['AWS_REGION'] ?? '(unset, will default to us-east-1)'}`);
  console.warn(`[dev-server] AWS_PROFILE: ${process.env['AWS_PROFILE'] ?? '(unset, using default credential chain)'}`);
}

app.listen(PORT, () => {
  console.warn(`[dev-server] listening on http://localhost:${PORT.toString()}`);
  console.warn(`[dev-server] CORS origin allowed: ${FRONTEND_ORIGIN}`);
  reportEnv();
  if (process.env['MAGIC_LINK_DEV_MODE'] === 'true') {
    console.warn(
      '[dev-server] MAGIC_LINK_DEV_MODE=true — magic links will be logged to this console',
    );
  }
  if (process.env['SESSION_COOKIE_INSECURE'] === 'true') {
    console.warn(
      '[dev-server] SESSION_COOKIE_INSECURE=true — session cookie will NOT carry the Secure flag',
    );
  }
});
