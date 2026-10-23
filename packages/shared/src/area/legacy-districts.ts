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

export const LEGACY_DISTRICTS: Record<LegacyDistrict, { label: string; fullName: string }> = {
  q1: { label: 'Q1', fullName: 'Quận 1' },
  q2: { label: 'Q2', fullName: 'Quận 2' },
  q3: { label: 'Q3', fullName: 'Quận 3' },
  q4: { label: 'Q4', fullName: 'Quận 4' },
  q5: { label: 'Q5', fullName: 'Quận 5' },
  q6: { label: 'Q6', fullName: 'Quận 6' },
  q7: { label: 'Q7', fullName: 'Quận 7' },
  q8: { label: 'Q8', fullName: 'Quận 8' },
  q9: { label: 'Q9', fullName: 'Quận 9' },
  q10: { label: 'Q10', fullName: 'Quận 10' },
  q11: { label: 'Q11', fullName: 'Quận 11' },
  q12: { label: 'Q12', fullName: 'Quận 12' },
  binh_tan: { label: 'Bình Tân', fullName: 'Quận Bình Tân' },
  binh_thanh: { label: 'Bình Thạnh', fullName: 'Quận Bình Thạnh' },
  go_vap: { label: 'Gò Vấp', fullName: 'Quận Gò Vấp' },
  phu_nhuan: { label: 'Phú Nhuận', fullName: 'Quận Phú Nhuận' },
  tan_binh: { label: 'Tân Bình', fullName: 'Quận Tân Bình' },
  tan_phu: { label: 'Tân Phú', fullName: 'Quận Tân Phú' },
  thu_duc: { label: 'Thủ Đức', fullName: 'Quận Thủ Đức' },
  binh_chanh: { label: 'Bình Chánh', fullName: 'Huyện Bình Chánh' },
  can_gio: { label: 'Cần Giờ', fullName: 'Huyện Cần Giờ' },
  cu_chi: { label: 'Củ Chi', fullName: 'Huyện Củ Chi' },
  hoc_mon: { label: 'Hóc Môn', fullName: 'Huyện Hóc Môn' },
  nha_be: { label: 'Nhà Bè', fullName: 'Huyện Nhà Bè' },
};

/** `ward` / `city` come from reverse geocoding, `legacyDistrict` from the polygons (ADR-0013, ADR-0018). */
export const areaSchema = z.object({
  city: z.string().min(1).nullable(),
  ward: z.string().min(1).nullable(),
  legacyDistrict: legacyDistrictSchema.nullable(),
});

export type Area = z.infer<typeof areaSchema>;

export const EMPTY_AREA: Area = { city: null, ward: null, legacyDistrict: null };

/** Short label for cards and bot replies: "Q3 · Phường Xuân Hòa", or "ward · city" outside the old districts. */
export function formatAreaLabel(area: Area): string | null {
  const parts = area.legacyDistrict ? [LEGACY_DISTRICTS[area.legacyDistrict].label, area.ward] : [area.ward, area.city];
  const label = parts.filter((part) => part !== null).join(' · ');
  return label === '' ? null : label;
}
