import type { ClientInit } from "@sveltejs/kit/hooks";
import { initAnalytics } from "@reddoorla/maintenance/client";
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
  // GA4 (property 561288527, stream 16225448311) loads only on roalson.com, so a
  // netlify.app preview or a deploy preview collects nothing.
  initAnalytics({
    measurementId: "G-J59YY1H8FB",
    productionHost: "roalson.com",
  });
};
