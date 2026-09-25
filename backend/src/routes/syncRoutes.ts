import { Router } from 'express';
import { enforceOrgIsolation, AuthenticatedRequest } from '../middleware/orgAuth.js';
import { syncZohoItems } from '../sync/zohoItemSync.js';

const router = Router();

router.post('/sync-now', enforceOrgIsolation, async (req: AuthenticatedRequest, res) => {
  try {
    const fullSync = req.query.full === 'true';
    if (!req.orgId) {
      return res.status(403).json({ status: 'error', message: 'Organization context is missing' });
    }

    await syncZohoItems(req.orgId, fullSync);
    return res.json({ status: 'success', message: 'Item synchronization completed.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Item synchronization failed';
    return res.status(500).json({ status: 'error', message });
  }
});

export default router;
