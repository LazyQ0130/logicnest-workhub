import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import DefaultAgentIcon from './DefaultAgentIcon';

describe('DefaultAgentIcon', () => {
  test('renders a theme-aware monochrome Work Hub mark', () => {
    const markup = renderToStaticMarkup(React.createElement(DefaultAgentIcon, {
      className: 'h-4 w-4',
    }));

    expect(markup).toContain('stroke="currentColor"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toMatch(/linearGradient|url\(|#[0-9a-f]{3,8}|white/i);
  });
});
