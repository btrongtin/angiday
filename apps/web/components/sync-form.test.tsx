// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SyncForm } from './sync-form';

function Fixture({ value, syncKey }: { value: string; syncKey: string }) {
  return (
    <form>
      <SyncForm syncKey={syncKey} />
      <input aria-label="q" name="q" defaultValue={value} />
    </form>
  );
}

describe('SyncForm', () => {
  it('shows the new defaults when the key changes, without remounting the inputs', () => {
    const { rerender } = render(<Fixture value="bun bo" syncKey="q=bun+bo" />);
    const input = screen.getByLabelText('q') as HTMLInputElement;
    input.value = 'typed by hand';

    rerender(<Fixture value="" syncKey="" />);

    expect(screen.getByLabelText('q')).toBe(input);
    expect(input.value).toBe('');
  });

  it('leaves what the user typed alone while the key stays the same', () => {
    const { rerender } = render(<Fixture value="bun bo" syncKey="q=bun+bo" />);
    const input = screen.getByLabelText('q') as HTMLInputElement;
    input.value = 'typed by hand';

    rerender(<Fixture value="bun bo" syncKey="q=bun+bo" />);

    expect(input.value).toBe('typed by hand');
  });

  it('does not reset on the first render', () => {
    render(
      <form>
        <SyncForm syncKey="x" />
        <input aria-label="q" defaultValue="a" ref={(node) => { if (node) node.value = 'set before the effect'; }} />
      </form>,
    );

    expect((screen.getByLabelText('q') as HTMLInputElement).value).toBe('set before the effect');
  });
});
