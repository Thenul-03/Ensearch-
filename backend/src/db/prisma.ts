import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not configured');
}

const configuredDatabaseUrl: string = databaseUrl;

function getLocalPrismaDevDatabaseUrl(url: string): string | undefined {
  const proxyUrl = new URL(url);
  const isLoopbackHost = ['localhost', '127.0.0.1', '::1'].includes(proxyUrl.hostname);

  if (proxyUrl.protocol !== 'prisma+postgres:' || !isLoopbackHost) {
    return undefined;
  }

  const apiKeyPayload = proxyUrl.searchParams.get('api_key')?.split('.')[0];
  if (!apiKeyPayload) {
    return undefined;
  }

  try {
    const decodedPayload: unknown = JSON.parse(Buffer.from(apiKeyPayload, 'base64url').toString('utf8'));
    if (typeof decodedPayload !== 'object' || decodedPayload === null || !('databaseUrl' in decodedPayload)) {
      return undefined;
    }

    const directUrl = decodedPayload.databaseUrl;
    if (typeof directUrl !== 'string') {
      return undefined;
    }

    const directConnection = new URL(directUrl);
    if (
      !['postgres:', 'postgresql:'].includes(directConnection.protocol) ||
      !['localhost', '127.0.0.1', '::1'].includes(directConnection.hostname)
    ) {
      return undefined;
    }

    return directUrl;
  } catch {
    return undefined;
  }
}

const localDatabaseUrl = getLocalPrismaDevDatabaseUrl(configuredDatabaseUrl);

function createPrismaClient(): PrismaClient {
  if (localDatabaseUrl) {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: localDatabaseUrl }) });
  }

  return new PrismaClient({ accelerateUrl: configuredDatabaseUrl })
    .$extends(withAccelerate()) as unknown as PrismaClient;
}

export const prisma = createPrismaClient();