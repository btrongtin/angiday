import { z } from 'zod';

/** Pre-2025 HCMC districts (ADR-0013, ADR-0018). `q2`, `q9` and `thu_duc` stay separate: the data is from 2020. */
export const LEGACY_DISTRICT_KEYS = [
  'q1',
  'q2',
  'q3',
  'q4',
  'q5',
  'q6',
  'q7',
  'q8',
  'q9',
  'q10',
  'q11',
  'q12',
  'binh_chanh',
  'binh_tan',
  'binh_thanh',
  'can_gio',
  'cu_chi',
  'go_vap',
  'hoc_mon',
  'nha_be',
  'phu_nhuan',
  'tan_binh',
  'tan_phu',
  'thu_duc',
] as const;

export const legacyDistrictSchema = z.enum(LEGACY_DISTRICT_KEYS);

export type LegacyDistrict = z.infer<typeof legacyDistrictSchema>;
