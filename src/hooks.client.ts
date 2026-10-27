import type { ClientInit } from "@sveltejs/kit/hooks";
import {
  holdAnchoringForRestore,
  letBrowserRestoreWhenKitCannot,
} from "$lib/utils/instantNavScroll";

// Runs before kit 3's startup restore of a reload's saved scroll position;
// see holdAnchoringForRestore for why anchoring is held off for that load, and
// letBrowserRestoreWhenKitCannot for the restore when kit could not save the position.
export const init: ClientInit = () => {
  holdAnchoringForRestore();
  letBrowserRestoreWhenKitCannot();
};
