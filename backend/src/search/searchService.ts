import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
const MAX_RESULTS = 10;

const itemSelect = {
  id: true,
  zohoItemId: true,
  name: true,
  sku: true,
  description: true,
  rate: true,
  status: true,
} satisfies Prisma.ZohoItemSelect;

type SearchItem = Prisma.ZohoItemGetPayload<{ select: typeof itemSelect }>;

export type SearchMatch = {
  item: SearchItem;
  score: number;
  matchType: 'exact' | 'alias' | 'partial' | 'fuzzy';
};

const ALIAS_MAP: Record<string, string[]> = {
  computer: ['laptop', 'desktop', 'pc', 'system', 'workstation'],
  laptop: ['computer', 'notebook', 'macbook'],
  display: ['monitor', 'screen'],
  mouse: ['pointing device'],
  memory: ['ram', 'ddr'],
};

function getAliasTerms(query: string): string[] {
  const cleanQuery = query.trim().toLocaleLowerCase();
  const terms = new Set<string>();

  for (const [key, synonyms] of Object.entries(ALIAS_MAP)) {
    const group = [key, ...synonyms];
    if (group.some((term) => cleanQuery.includes(term))) {
      group.forEach((term) => {
        if (term !== cleanQuery) {
          terms.add(term);
        }
      });
    }
  }

  return [...terms];
}

export async function searchItems(organizationId: string, query: string): Promise<SearchMatch[]> {
  const exactItems = await prisma.zohoItem.findMany({
    where: {
      organizationId,
      status: 'active',
      OR: [
        { name: { equals: query, mode: 'insensitive' } },
        { sku: { equals: query, mode: 'insensitive' } },
      ],
    },
    select: itemSelect,
    orderBy: { name: 'asc' },
    take: MAX_RESULTS,
  });

  if (exactItems.length > 0) {
    return exactItems.map((item) => ({ item, score: 1, matchType: 'exact' }));
  }

  const aliases = await prisma.alias.findMany({
    where: {
      organizationId,
      status: 'approved',
      term: { equals: query, mode: 'insensitive' },
    },
    select: { itemId: true, confidence: true },
    orderBy: { confidence: 'desc' },
    take: MAX_RESULTS,
  });

  if (aliases.length > 0) {
    const itemsById = new Map(
      (await prisma.zohoItem.findMany({
        where: {
          id: { in: aliases.map(({ itemId }) => itemId) },
          organizationId,
          status: 'active',
        },
        select: itemSelect,
      })).map((item) => [item.id, item])
    );
    const matchedItemIds = new Set<string>();
    const aliasMatches: SearchMatch[] = [];

    for (const { itemId, confidence } of aliases) {
      const item = itemsById.get(itemId);
      if (!item || matchedItemIds.has(itemId)) {
        continue;
      }

      matchedItemIds.add(itemId);
      aliasMatches.push({
        item,
        score: Math.min(1, Math.max(0, confidence)),
        matchType: 'alias',
      });
    }

    if (aliasMatches.length > 0) {
      return aliasMatches;
    }
  }

  const aliasTerms = getAliasTerms(query);
  if (aliasTerms.length > 0) {
    const aliasItems = await prisma.zohoItem.findMany({
      where: {
        organizationId,
        status: 'active',
        OR: aliasTerms.flatMap((term) => [
          { name: { contains: term, mode: 'insensitive' as const } },
          { sku: { contains: term, mode: 'insensitive' as const } },
          { description: { contains: term, mode: 'insensitive' as const } },
        ]),
      },
      select: itemSelect,
      orderBy: { name: 'asc' },
      take: MAX_RESULTS,
    });

    if (aliasItems.length > 0) {
      return aliasItems.map((item) => ({ item, score: 0.88, matchType: 'alias' }));
    }
  }

  const partialItems = await prisma.zohoItem.findMany({
    where: {
      organizationId,
      status: 'active',
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { sku: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: itemSelect,
    orderBy: { name: 'asc' },
    take: MAX_RESULTS,
  });

  if (partialItems.length > 0) {
    const normalizedQuery = query.toLocaleLowerCase();
    return partialItems.map((item) => ({
      item,
      score: item.name.toLocaleLowerCase().includes(normalizedQuery) ? 0.85 : 0.8,
      matchType: 'partial',
    }));
  }

  const fuzzyItems = await prisma.$queryRaw<Array<{ id: string; score: number }>>(Prisma.sql`
    SELECT
      item."id",
      GREATEST(
        similarity(lower(item."name"), lower(${query})),
        similarity(lower(COALESCE(item."sku", '')), lower(${query}))
      ) AS "score"
    FROM "ZohoItem" AS item
    WHERE item."organizationId" = ${organizationId}
      AND item."status" = 'active'
      AND GREATEST(
        similarity(lower(item."name"), lower(${query})),
        similarity(lower(COALESCE(item."sku", '')), lower(${query}))
      ) >= 0.2
    ORDER BY "score" DESC, item."name" ASC
    LIMIT ${MAX_RESULTS}
  `);

  if (fuzzyItems.length === 0) {
    return [];
  }

  const itemsById = new Map(
    (await prisma.zohoItem.findMany({
      where: { id: { in: fuzzyItems.map(({ id }) => id) }, organizationId, status: 'active' },
      select: itemSelect,
    })).map((item) => [item.id, item])
  );

  return fuzzyItems.flatMap(({ id, score }) => {
    const item = itemsById.get(id);
    return item ? [{ item, score, matchType: 'fuzzy' as const }] : [];
  });
}