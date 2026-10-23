import { formatAreaLabel, formatClassificationLine, type Place } from '@angiday/shared';

/**
 * The bot's confirmation: one line per fact, empty ones left out.
 *   Đã lưu: <name> — <area>
 *   <cuisine> · <dish type> · <price>
 *   Món nổi bật: <highlights>
 *   Tag: <tags>
 */
export function formatSavedReply(
  place: Pick<Place, 'name' | 'area' | 'cuisine' | 'dishType' | 'priceRange' | 'highlights'>,
  tagNames: readonly string[],
): string {
  const areaLabel = formatAreaLabel(place.area);
  return [
    areaLabel === null ? `Đã lưu: ${place.name}` : `Đã lưu: ${place.name} — ${areaLabel}`,
    formatClassificationLine(place),
    place.highlights.length > 0 ? `Món nổi bật: ${place.highlights.join(', ')}` : null,
    tagNames.length > 0 ? `Tag: ${tagNames.join(', ')}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n');
}
