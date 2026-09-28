import jwt from 'jsonwebtoken';

const ACCESS_TOKEN_TTL = '12h';
const OAUTH_STATE_TTL = '10m';

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT secret is not configured');
  }
  return secret;
}

/** Token the extension sends as `Authorization: Bearer <token>`. */
export function signAccessToken(userId: string, orgId: string): string {
  return jwt.sign({ userId, orgId }, getSecret(), { expiresIn: ACCESS_TOKEN_TTL });
}

export type OAuthState = {
  domain: string;
  zohoOrgId?: string;
};

/** Short-lived signed `state` value that protects the Zoho OAuth round trip against CSRF. */
export function signOAuthState({ domain, zohoOrgId }: OAuthState): string {
  return jwt.sign(
    { purpose: 'zoho-oauth', domain, ...(zohoOrgId ? { zohoOrgId } : {}) },
    getSecret(),
    { expiresIn: OAUTH_STATE_TTL }
  );
}

export function verifyOAuthState(state: string): OAuthState {
  const payload = jwt.verify(state, getSecret());

  if (
    typeof payload === 'string' ||
    payload.purpose !== 'zoho-oauth' ||
    typeof payload.domain !== 'string'
  ) {
    throw new Error('Invalid OAuth state');
  }

  return {
    domain: payload.domain,
    ...(typeof payload.zohoOrgId === 'string' ? { zohoOrgId: payload.zohoOrgId } : {}),
  };
}
