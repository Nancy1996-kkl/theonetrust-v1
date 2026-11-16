import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LogoSpinner } from './LogoSpinner.tsx';
import { StateBlock } from './StateBlock.tsx';

describe('LogoSpinner', () => {
  it('is decorative: hidden from screen readers, emblem has empty alt', () => {
    render(<LogoSpinner />);
    const spinner = screen.getByTestId('logo-spinner');
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
    expect(spinner.querySelector('img')).toHaveAttribute('alt', '');
  });

  it('StateBlock loading shows the logo spinner inside a polite status with the words', () => {
    render(<StateBlock state="loading" title="Loading receipt" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading receipt');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status.querySelector('[data-testid="logo-spinner"]')).not.toBeNull();
  });

  it('other states keep their status icon, not the spinner', () => {
    render(<StateBlock state="error" title="Could not load" />);
    expect(screen.queryByTestId('logo-spinner')).toBeNull();
  });
});

describe('first-load splash (index.html)', () => {
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

  it('sits outside #root, is hidden from screen readers and shown once per visit', () => {
    expect(html.indexOf('id="boot-splash"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="boot-splash"')).toBeLessThan(html.indexOf('id="root"'));
    expect(html).toMatch(/id="boot-splash"[^>]*aria-hidden="true"/);
    expect(html).toContain("sessionStorage.getItem('boot-seen')");
  });

  it('hides itself without JavaScript and never blocks taps', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/components.css'), 'utf8');
    const block = css.slice(css.indexOf('.boot-splash {'), css.indexOf('.boot-splash--done'));
    expect(block).toContain('var(--duration-splash-max)');
    expect(block).toContain('forwards');
    expect(block).toContain('pointer-events: none');
  });
});
