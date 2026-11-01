// @vitest-environment happy-dom
import {
  CUISINE_KEYS,
  CUISINE_LABELS,
  DISH_TYPE_KEYS,
  EMPTY_PLACE_FILTERS,
  parsePlaceFilters,
  type PlaceFilters,
  type Tag,
} from '@angiday/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlaceFilterForm } from './place-filter-form';

const tag: Tag = { id: 'a'.repeat(24), groupId: 'b'.repeat(24), name: 'hẹn hò', normalized: 'hen ho', createdAt: new Date() };

const ACTIVE: PlaceFilters = {
  q: 'bun bo',
  area: 'q3',
  cuisine: ['korean'],
  dishType: ['grill'],
  maxPrice: '100k_200k',
  tagIds: [tag.id],
  visitStatus: 'visited',
};

const formOf = (container: HTMLElement) => container.querySelector('form') as HTMLFormElement;
const submitted = (form: HTMLFormElement) => parsePlaceFilters(new URLSearchParams(new FormData(form) as unknown as Record<string, string>));

describe('PlaceFilterForm', () => {
  it('reflects the current filters', () => {
    render(<PlaceFilterForm filters={ACTIVE} tags={[tag]} />);

    expect(screen.getByRole('searchbox', { name: /Tìm quán/ })).toHaveValue('bun bo');
    expect(screen.getByRole('checkbox', { name: CUISINE_LABELS.korean })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: CUISINE_LABELS.japanese })).not.toBeChecked();
    expect(screen.getByRole('combobox', { name: /Giá/ })).toHaveValue('100k_200k');
    expect(screen.getByRole('checkbox', { name: tag.name })).toBeChecked();
  });

  it('submits back to the same filters', () => {
    const { container } = render(<PlaceFilterForm filters={ACTIVE} tags={[tag]} />);

    expect(submitted(formOf(container))).toEqual(ACTIVE);
  });

  it('submits nothing for an empty form', () => {
    const { container } = render(<PlaceFilterForm filters={EMPTY_PLACE_FILTERS} tags={[tag]} />);

    expect(submitted(formOf(container))).toEqual(EMPTY_PLACE_FILTERS);
  });

  it('has one checkbox per cuisine and dish type key', () => {
    const { container } = render(<PlaceFilterForm filters={EMPTY_PLACE_FILTERS} tags={[]} />);

    expect(container.querySelectorAll('input[name="cuisine"]')).toHaveLength(CUISINE_KEYS.length);
    expect(container.querySelectorAll('input[name="dish"]')).toHaveLength(DISH_TYPE_KEYS.length);
  });

  it('shows no tag fieldset without tags', () => {
    const { container } = render(<PlaceFilterForm filters={EMPTY_PLACE_FILTERS} tags={[]} />);

    expect(container.querySelectorAll('input[name="tag"]')).toHaveLength(0);
  });

  it('is a GET form to / with a clear link only while a filter is active', () => {
    const active = render(<PlaceFilterForm filters={ACTIVE} tags={[]} />);
    const form = formOf(active.container);

    expect(form.method).toBe('get');
    expect(form.getAttribute('action')).toBe('/');
    expect(screen.getByRole('link', { name: 'Xóa lọc' })).toHaveAttribute('href', '/');
    active.unmount();

    render(<PlaceFilterForm filters={EMPTY_PLACE_FILTERS} tags={[]} />);
    expect(screen.queryByRole('link', { name: 'Xóa lọc' })).toBeNull();
  });
});
