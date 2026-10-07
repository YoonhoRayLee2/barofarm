import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import * as deliveryAddressService from '../services/delivery-addresses';

const router = Router();
router.use(requireAuth);

// GET /api/delivery-addresses
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const addresses = await deliveryAddressService.listAddresses(userId);
    res.json(addresses);
  } catch (err) {
    console.error('[delivery-addresses] GET /', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/delivery-addresses
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { name, phone, zipcode, address, detail } = req.body;
  if (!name || !phone || !zipcode || !address) {
    return res.status(400).json({ error: 'required fields missing' });
  }

  try {
    const result = await deliveryAddressService.createAddress(userId, { name, phone, zipcode, address, detail });
    res.status(201).json(result);
  } catch (err) {
    console.error('[delivery-addresses] POST /', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// PATCH /api/delivery-addresses/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const userId = req.user!.userId;
  const { name, phone, zipcode, address, detail } = req.body;
  if (!name || !phone || !zipcode || !address) {
    return res.status(400).json({ error: 'required fields missing' });
  }

  try {
    const result = await deliveryAddressService.updateAddress(userId, id, { name, phone, zipcode, address, detail });
    if (!result) return res.status(404).json({ error: 'not_found' });
    res.json(result);
  } catch (err) {
    console.error('[delivery-addresses] PATCH /:id', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// DELETE /api/delivery-addresses/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const userId = req.user!.userId;

  try {
    const result = await deliveryAddressService.deleteAddress(userId, id);
    if (!result) return res.status(404).json({ error: 'not_found' });
    res.json(result);
  } catch (err) {
    console.error('[delivery-addresses] DELETE /:id', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// PATCH /api/delivery-addresses/:id/set-default
router.patch('/:id/set-default', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const userId = req.user!.userId;

  try {
    const result = await deliveryAddressService.setDefaultAddress(userId, id);
    if (!result) return res.status(404).json({ error: 'not_found' });
    res.json(result);
  } catch (err) {
    console.error('[delivery-addresses] PATCH /:id/set-default', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
