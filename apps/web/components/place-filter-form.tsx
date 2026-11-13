import Form from 'next/form';
import Link from 'next/link';
import {
  CUISINE_KEYS,
  CUISINE_LABELS,
  DISH_TYPE_KEYS,
  DISH_TYPE_LABELS,
  hasActiveFilters,
  LEGACY_DISTRICT_KEYS,
  LEGACY_DISTRICTS,
  PRICE_RANGE_KEYS,
  PRICE_RANGE_LABELS,
  placeFiltersToSearchParams,
  type PlaceFilters,
  type Tag,
} from '@angiday/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SyncForm } from '@/components/sync-form';

const AREA_LIST_ID = 'area-suggestions';
const control =
  'h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function CheckboxGroup({
  legend,
  name,
  options,
  selected,
}: {
  legend: string;
  name: string;
  options: readonly { value: string; label: string }[];
  selected: readonly string[];
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-small text-[0.9375rem] text-muted-foreground">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 cursor-pointer items-center gap-2 border border-border bg-card px-3 text-[0.9375rem] has-[:checked]:border-foreground has-[:checked]:bg-secondary has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
          >
            <input type="checkbox" name={name} value={option.value} defaultChecked={selected.includes(option.value)} className="size-4 accent-primary" />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A GET form (next/form): the filters live in the URL, it navigates client-side without a page reload, and still works without JavaScript. */
export function PlaceFilterForm({ filters, tags }: { filters: PlaceFilters; tags: readonly Tag[] }) {
  const active = hasActiveFilters(filters);
  const advanced = hasActiveFilters({ ...filters, q: null });

  return (
    <Form action="/" className="flex flex-col gap-4">
      <SyncForm syncKey={placeFiltersToSearchParams(filters).toString()} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="q">Tìm quán, món, địa chỉ</Label>
        <Input id="q" name="q" type="search" defaultValue={filters.q ?? ''} className="h-11 bg-card" placeholder="bún bò, Xuân Hòa…" />
      </div>

      <details open={advanced} className="group border border-border bg-card/50">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 font-small text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          Bộ lọc
        </summary>
        <div className="flex flex-col gap-5 border-t border-border p-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="area">Khu vực</Label>
            <Input id="area" name="area" list={AREA_LIST_ID} defaultValue={filters.area ?? ''} className="h-11 bg-card" placeholder="q3, Bình Thạnh, Xuân Hòa…" />
            <datalist id={AREA_LIST_ID}>
              {LEGACY_DISTRICT_KEYS.map((key) => (
                <option key={key} value={LEGACY_DISTRICTS[key].label} />
              ))}
            </datalist>
          </div>

          <CheckboxGroup legend="Ẩm thực" name="cuisine" options={CUISINE_KEYS.map((key) => ({ value: key, label: CUISINE_LABELS[key] }))} selected={filters.cuisine} />
          <CheckboxGroup legend="Kiểu món" name="dish" options={DISH_TYPE_KEYS.map((key) => ({ value: key, label: DISH_TYPE_LABELS[key] }))} selected={filters.dishType} />
          {tags.length > 0 && (
            <CheckboxGroup legend="Tag" name="tag" options={tags.map((tag) => ({ value: tag.id, label: tag.name }))} selected={filters.tagIds} />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="price">Giá</Label>
              <select key={filters.maxPrice ?? ''} id="price" name="price" defaultValue={filters.maxPrice ?? ''} className={control}>
                <option value="">Mọi mức giá</option>
                {PRICE_RANGE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    Tối đa {PRICE_RANGE_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="visit">Đã ăn chưa</Label>
              <select key={filters.visitStatus ?? ''} id="visit" name="visit" defaultValue={filters.visitStatus ?? ''} className={control}>
                <option value="">Tất cả</option>
                <option value="want_to_try">Muốn thử</option>
                <option value="visited">Đã ăn</option>
              </select>
            </div>
          </div>
        </div>
      </details>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg">
          Lọc
        </Button>
        {active && (
          <Link href="/" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:decoration-primary">
            Xóa lọc
          </Link>
        )}
      </div>
    </Form>
  );
}
