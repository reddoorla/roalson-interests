import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/** Every spec's axe. `preload: false` because axe's preload fetches the Google
 *  Fonts sheet, which `connect-src` refuses, on every run (#52); the two rules
 *  that read it cannot fail under the tags these specs use. `options()`
 *  replaces the whole options object, so nothing may call it again after this. */
export const axe = (page: Page) => new AxeBuilder({ page }).options({ preload: false });
