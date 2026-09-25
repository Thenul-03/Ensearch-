import axios from 'axios';
import { Prisma, PrismaClient } from '@prisma/client';
import { getValidAccessToken } from '../auth/zohoOAuth.js';

const prisma = new PrismaClient();

type ZohoItem = {
  item_id: string;
  name: string;
  sku?: string | null;
  description?: string | null;
  rate?: number | string | null;
  status?: string | null;
  last_modified_time?: string | null;
  [key: string]: unknown;
};

type ItemsResponse = {
  items?: ZohoItem[];
  page_context?: {
    has_more_page?: boolean;
  };
};

function getItemRate(rate: ZohoItem['rate']): number {
  const parsedRate = typeof rate === 'string' ? Number(rate) : rate;
  return typeof parsedRate === 'number' && Number.isFinite(parsedRate) ? parsedRate : 0;
}

function getLastModifiedAt(value: ZohoItem['last_modified_time']): Date {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export async function syncZohoItems(organizationId: string, isFullSync = false) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) throw new Error('Organization not found');

  const accessToken = await getValidAccessToken(organizationId);
  const baseUrl = `https://books.zoho.${org.domain}/api/v3/items`;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const params: Record<string, string | number> = {
      organization_id: org.zohoOrgId,
      page,
      per_page: 200
    };

    if (!isFullSync && org.lastSyncedAt) {
      params.last_modified_time = org.lastSyncedAt.toISOString();
    }

    const response = await axios.get<ItemsResponse>(baseUrl, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      params
    });

    for (const item of response.data.items ?? []) {
      if (!item.item_id || !item.name) {
        continue;
      }

      const itemData = {
        name: item.name,
        sku: item.sku || null,
        description: item.description || null,
        rate: getItemRate(item.rate),
        status: item.status || 'active',
        lastModifiedAt: getLastModifiedAt(item.last_modified_time),
        rawJson: item as unknown as Prisma.InputJsonObject
      };

      await prisma.zohoItem.upsert({
        where: {
          organizationId_zohoItemId: {
            organizationId: org.id,
            zohoItemId: item.item_id
          }
        },
        update: itemData,
        create: {
          organizationId: org.id,
          zohoItemId: item.item_id,
          ...itemData
        }
      });
    }

    hasMore = response.data.page_context?.has_more_page ?? false;
    page += 1;
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: { lastSyncedAt: new Date() }
  });
}
