import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from '../utils/crypto.js';

const prisma = new PrismaClient();
const SUPPORTED_DOMAINS = new Set(['com', 'in', 'eu']);
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

type ZohoTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

function validateDomain(locationDomain: string): string {
  if (!SUPPORTED_DOMAINS.has(locationDomain)) {
    throw new Error('Unsupported Zoho datacenter domain');
  }

  return locationDomain;
}

function getTokenUrl(domain: string): string {
  return `https://accounts.zoho.${validateDomain(domain)}/oauth/v2/token`;
}

function getZohoCredentials() {
  const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET } = process.env;

  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET) {
    throw new Error('Zoho OAuth credentials are not configured');
  }

  return { client_id: ZOHO_CLIENT_ID, client_secret: ZOHO_CLIENT_SECRET };
}

export async function exchangeCodeForTokens(code: string, locationDomain = 'com') {
  const tokenUrl = getTokenUrl(locationDomain);
  const credentials = getZohoCredentials();

  const response = await axios.post<ZohoTokenResponse>(tokenUrl, null, {
    params: {
      code,
      ...credentials,
      redirect_uri: process.env.ZOHO_REDIRECT_URI,
      grant_type: 'authorization_code'
    }
  });

  const { access_token, refresh_token, expires_in } = response.data;
  if (!access_token || !refresh_token || !Number.isFinite(expires_in)) {
    throw new Error('Zoho returned an incomplete token response');
  }

  return {
    accessToken: encrypt(access_token),
    refreshToken: encrypt(refresh_token),
    expiresAt: new Date(Date.now() + expires_in * 1000),
    domain: validateDomain(locationDomain)
  };
}

export async function getValidAccessToken(organizationId: string): Promise<string> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) throw new Error('Organization not found');

  if (
    org.accessToken &&
    org.tokenExpiresAt &&
    org.tokenExpiresAt.getTime() - Date.now() > TOKEN_REFRESH_BUFFER_MS
  ) {
    return decrypt(org.accessToken);
  }

  if (!org.refreshToken) {
    throw new Error('Organization has no Zoho refresh token');
  }

  const refreshToken = decrypt(org.refreshToken);
  const tokenUrl = getTokenUrl(org.domain);
  const credentials = getZohoCredentials();
  const response = await axios.post<ZohoTokenResponse>(tokenUrl, null, {
    params: {
      refresh_token: refreshToken,
      ...credentials,
      grant_type: 'refresh_token'
    }
  });

  const { access_token, expires_in } = response.data;
  if (!access_token || !Number.isFinite(expires_in)) {
    throw new Error('Zoho returned an incomplete refresh response');
  }

  const expiresAt = new Date(Date.now() + expires_in * 1000);
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      accessToken: encrypt(access_token),
      tokenExpiresAt: expiresAt
    }
  });

  return access_token;
}
