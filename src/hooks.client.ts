import type { ClientInit } from "@sveltejs/kit/hooks";
import {
  holdAnchoringForRestore,
  letBrowserRestoreWithoutStorage,
} from "$lib/utils/instantNavScroll";

// Runs before kit 3's startup restore of a reload's saved scroll position;
// see holdAnchoringForRestore for why anchoring is held off for that load, and
// letBrowserRestoreWithoutStorage for the restore when sessionStorage is blocked.
export const init: ClientInit = () => {
  holdAnchoringForRestore();
  letBrowserRestoreWithoutStorage();
};
