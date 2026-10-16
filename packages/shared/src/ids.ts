import { z } from 'zod';

/** A MongoDB ObjectId as a 24-character hex string: the id format at every package boundary. */
export const objectIdSchema = z.string().regex(/^[0-9a-f]{24}$/i, 'must be a 24-character hex ObjectId');
