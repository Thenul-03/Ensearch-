import { timingSafeEqual } from 'node:crypto';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import { Router, type Response } from 'express';
import { exchangeCodeForTokens } from '../auth/zohoOAuth.js';
import { signAccessToken, signOAuthState, verifyOAuthState } from '../auth/jwt.js';
import { prisma } from '../db/prisma.js';
import { enforceOrgIsolation, type AuthenticatedRequest } from '../middleware/orgAuth.js';
import { syncZohoItems } from '../sync/zohoItemSync.js';
import { decrypt } from '../utils/crypto.js';

const router = Router();

const SUPPORTED_DOMAINS = new Set(['com', 'in', 'eu']);
// items.READ -> item sync, settings.READ -> list the organizations the token can access
const ZOHO_SCOPES = 'ZohoBooks.items.READ,ZohoBooks.settings.READ';

/* ------------------------------------------------------------------ */
/* Login (used by the extension popup)                                 */
/* ------------------------------------------------------------------ */

const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
// Compared against when the email is unknown so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('ensearch-dummy-password', 12);

function isLoginBlocked(key: string): boolean {
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (entry.resetAt <= Date.now()) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= MAX_LOGIN_ATTEMPTS;
}

function recordLoginFailure(key: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

router.post('/auth/login', async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };

  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    email.length === 0 ||
    email.length > 254 ||
    password.length === 0 ||
    password.length > 200
  ) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const attemptKey = `${req.ip ?? 'unknown'}:${normalizedEmail}`;

  if (isLoginBlocked(attemptKey)) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again in a few minutes.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        organizationId: true,
        organization: { select: { id: true, name: true } },
      },
    });

    const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !passwordMatches) {
      recordLoginFailure(attemptKey);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    loginAttempts.delete(attemptKey);

    return res.json({
      token: signAccessToken(user.id, user.organizationId),
      user: { email: user.email },
      organization: user.organization,
    });
  } catch (error) {
    console.error('Login failed:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/auth/me', enforceOrgIsolation, async (req: AuthenticatedRequest, res) => {
  if (!req.userId || !req.orgId) {
    return res.status(403).json({ error: 'Organization context is missing' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        email: true,
        organizationId: true,
        organization: {
          select: { id: true, name: true, lastSyncedAt: true, _count: { select: { items: true } } },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }
    if (user.organizationId !== req.orgId) {
      return res.status(403).json({ error: 'Token does not match this user' });
    }

    return res.json({
      user: { email: user.email },
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        lastSyncedAt: user.organization.lastSyncedAt,
        itemCount: user.organization._count.items,
      },
    });
  } catch (error) {
    console.error('Loading profile failed:', error);
    return res.status(500).json({ error: 'Could not load profile' });
  }
});

/* ------------------------------------------------------------------ */
/* Zoho connect flow (run once per organization, from a browser tab)   */
/* ------------------------------------------------------------------ */

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sendPage(res: Response, status: number, title: string, bodyHtml: string) {
  res
    .status(status)
    .type('html')
    .send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
        `<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 16px;color:#182522}` +
        `code{background:#eef3f0;padding:2px 6px;border-radius:4px}</style></head>` +
        `<body><h1>${escapeHtml(title)}</h1>${bodyHtml}</body></html>`
    );
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

router.get('/auth/zoho/start', (req, res) => {
  // Optional guard: when SETUP_KEY is set, connecting an org requires ?key=<SETUP_KEY>.
  const setupKey = process.env.SETUP_KEY;
  if (setupKey && !(typeof req.query.key === 'string' && safeEqual(req.query.key, setupKey))) {
    return sendPage(res, 403, 'Not allowed', '<p>A valid setup key is required.</p>');
  }

  const domain = typeof req.query.domain === 'string' ? req.query.domain : 'com';
  if (!SUPPORTED_DOMAINS.has(domain)) {
    return sendPage(res, 400, 'Unsupported data center', '<p>Use domain=com, in or eu.</p>');
  }

  const zohoOrgId = typeof req.query.zohoOrgId === 'string' ? req.query.zohoOrgId : undefined;
  if (zohoOrgId !== undefined && !/^\d{1,32}$/.test(zohoOrgId)) {
    return sendPage(res, 400, 'Invalid organization id', '<p>zohoOrgId must be numeric.</p>');
  }

  const { ZOHO_CLIENT_ID, ZOHO_REDIRECT_URI } = process.env;
  if (!ZOHO_CLIENT_ID || !ZOHO_REDIRECT_URI) {
    return sendPage(res, 500, 'Not configured', '<p>ZOHO_CLIENT_ID / ZOHO_REDIRECT_URI are missing.</p>');
  }

  const authUrl = new URL(`https://accounts.zoho.${domain}/oauth/v2/auth`);
  authUrl.search = new URLSearchParams({
    scope: ZOHO_SCOPES,
    client_id: ZOHO_CLIENT_ID,
    response_type: 'code',
    access_type: 'offline', // ask for a refresh token
    prompt: 'consent', // Zoho only returns a refresh token when consent is shown
    redirect_uri: ZOHO_REDIRECT_URI,
    state: signOAuthState({ domain, ...(zohoOrgId ? { zohoOrgId } : {}) }),
  }).toString();

  return res.redirect(authUrl.toString());
});

type ZohoOrganization = { organization_id: string; name: string };

router.get('/auth/zoho/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (typeof error === 'string') {
    return sendPage(res, 400, 'Authorization cancelled', '<p>Zoho did not grant access. Start again when ready.</p>');
  }
  if (typeof code !== 'string' || typeof state !== 'string') {
    return sendPage(res, 400, 'Invalid request', '<p>Missing code or state.</p>');
  }

  let oauthState;
  try {
    oauthState = verifyOAuthState(state);
  } catch {
    return sendPage(res, 400, 'Link expired', '<p>Start the connection again from <code>/api/auth/zoho/start</code>.</p>');
  }

  try {
    const tokens = await exchangeCodeForTokens(code, oauthState.domain);
    const plainAccessToken = decrypt(tokens.accessToken);

    const orgResponse = await axios.get<{ organizations?: ZohoOrganization[] }>(
      `https://books.zoho.${tokens.domain}/api/v3/organizations`,
      { headers: { Authorization: `Zoho-oauthtoken ${plainAccessToken}` } }
    );
    const organizations = orgResponse.data.organizations ?? [];

    const selected = oauthState.zohoOrgId
      ? organizations.find((org) => org.organization_id === oauthState.zohoOrgId)
      : organizations.length === 1
        ? organizations[0]
        : undefined;

    if (!selected) {
      const list = organizations
        .map((org) => `<li>${escapeHtml(org.name)} — <code>${escapeHtml(org.organization_id)}</code></li>`)
        .join('');
      return sendPage(
        res,
        400,
        'Choose an organization',
        `<p>This Zoho account has access to several organizations (or the requested one was not found). ` +
          `Restart with <code>/api/auth/zoho/start?domain=${escapeHtml(tokens.domain)}&amp;zohoOrgId=&lt;id&gt;</code>.</p><ul>${list}</ul>`
      );
    }

    const organization = await prisma.organization.upsert({
      where: { zohoOrgId: selected.organization_id },
      update: {
        name: selected.name,
        domain: tokens.domain,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
      },
      create: {
        zohoOrgId: selected.organization_id,
        name: selected.name,
        domain: tokens.domain,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
      },
    });

    // Initial full item sync runs in the background so this page returns immediately.
    void syncZohoItems(organization.id, true).catch((syncError) => {
      console.error('Initial sync failed:', syncError);
    });

    return sendPage(
      res,
      200,
      'Zoho Books connected',
      `<p><strong>${escapeHtml(selected.name)}</strong> is connected and the first item sync has started.</p>` +
        `<p>Next, create a login for this organization:</p>` +
        `<p><code>npm run create-user -- you@example.com "a-strong-password" ${escapeHtml(selected.organization_id)}</code></p>`
    );
  } catch (callbackError) {
    console.error('Zoho callback failed:', callbackError);
    return sendPage(
      res,
      500,
      'Connection failed',
      '<p>Could not complete the Zoho connection. Check that the data center (com / in / eu) matches your Zoho account and try again.</p>'
    );
  }
});

export default router;
