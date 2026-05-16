import { describe, expect, it, vi } from 'vitest';

import { backOrReplace, returnTo } from '@/ui/navigation/back';

describe('navigation back helpers', () => {
  it('uses the existing stack when a previous screen exists', () => {
    const router = mockRouter(true);

    backOrReplace(router, '/');

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('replaces with a fallback when there is no previous screen', () => {
    const router = mockRouter(false);

    backOrReplace(router, '/recording');

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/recording');
  });

  it('dismisses to a known parent route without pushing a new page', () => {
    const router = mockRouter(true);

    returnTo(router, '/recent');

    expect(router.dismissTo).toHaveBeenCalledWith('/recent');
    expect(router.push).not.toHaveBeenCalled();
  });
});

function mockRouter(canGoBack: boolean) {
  return {
    back: vi.fn(),
    canGoBack: vi.fn(() => canGoBack),
    dismissTo: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  };
}
