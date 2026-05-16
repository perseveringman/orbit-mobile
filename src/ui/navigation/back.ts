import type { Href, Router } from 'expo-router';

type BackRouter = Pick<Router, 'back' | 'canGoBack' | 'dismissTo' | 'replace'>;

export function backOrReplace(router: BackRouter, fallback: Href): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}

export function returnTo(router: BackRouter, href: Href): void {
  router.dismissTo(href);
}
