import { Router } from 'express';
import { AuthenticatedRequest, enforceOrgIsolation } from '../middleware/orgAuth.js';
import { searchItems } from '../search/searchService.js';

const router = Router();
const AUTO_SELECT_CONFIDENCE = 0.9;

router.get('/search', enforceOrgIsolation, async (req: AuthenticatedRequest, res) => {
  const query = req.query.q;

  if (typeof query !== 'string' || query.trim().length === 0 || query.length > 200) {
    return res.status(400).json({ error: 'A search query between 1 and 200 characters is required' });
  }

  if (!req.orgId) {
    return res.status(403).json({ error: 'Organization context is missing' });
  }

  try {
    const matches = await searchItems(req.orgId, query.trim());
    const selected = matches[0] && matches[0].score >= AUTO_SELECT_CONFIDENCE
      ? matches[0]
      : null;

    return res.json({
      query: query.trim(),
      matches,
      selected,
      autoSelect: selected !== null,
    });
  } catch (error) {
    console.error('Search failed:', error);
    return res.status(500).json({ error: 'Search failed' });
  }
});

export default router;