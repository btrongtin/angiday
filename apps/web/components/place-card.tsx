import { CUISINE_LABELS, DISH_TYPE_LABELS, LEGACY_DISTRICTS, PRICE_RANGE_LABELS, type Place } from '@angiday/shared';
import { Badge } from '@/components/ui/badge';

/** One saved place. Rows with no data are not rendered; ids of deleted tags no longer resolve and are skipped (ADR-0006). */
export function PlaceCard({ place, tagNames }: { place: Place; tagNames: ReadonlyMap<string, string> }) {
  const district = place.area.legacyDistrict === null ? null : LEGACY_DISTRICTS[place.area.legacyDistrict].label;
  const placeTags = place.tagIds.flatMap((id) => tagNames.get(id) ?? []);
  const classification = [
    ...place.cuisine.filter((key) => key !== 'other').map((key) => CUISINE_LABELS[key]),
    ...place.dishType.filter((key) => key !== 'other').map((key) => DISH_TYPE_LABELS[key]),
    ...(place.priceRange === null ? [] : [PRICE_RANGE_LABELS[place.priceRange]]),
  ];
  const where = [district, place.area.ward].filter((part) => part !== null);

  return (
    <article className="label-well flex flex-col gap-3 p-5 text-card-foreground">
      <h2 className="font-heading text-2xl">
        <a href={place.mapsUrl} target="_blank" rel="noreferrer" className="underline decoration-transparent underline-offset-4 outline-none hover:decoration-primary focus-visible:ring-3 focus-visible:ring-ring/50">
          {place.name}
        </a>
      </h2>
      {(where.length > 0 || place.visitStatus === 'visited') && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-small text-[0.9375rem] text-muted-foreground">
          {where.map((part) => (
            <span key={part}>{part}</span>
          ))}
          {place.visitStatus === 'visited' && <Badge variant="default">Đã ăn</Badge>}
        </div>
      )}
      {place.address !== null && <p className="text-[0.9375rem] text-muted-foreground">{place.address}</p>}
      {classification.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {classification.map((label) => (
            <Badge key={label} variant="secondary">
              {label}
            </Badge>
          ))}
        </div>
      )}
      {place.highlights.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.9375rem] text-secondary-foreground">
          {place.highlights.map((highlight) => (
            <span key={highlight}>{highlight}</span>
          ))}
        </div>
      )}
      {placeTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {placeTags.map((name) => (
            <Badge key={name} variant="outline">
              {name}
            </Badge>
          ))}
        </div>
      )}
    </article>
  );
}
