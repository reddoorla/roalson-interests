import { env } from "$env/dynamic/public";
import buildServices from "virtual:privacy-services";
import { loadSiteConfig } from "$lib/site-config";
import { withRuntime } from "$lib/privacy/services";
import { PRIVACY_POLICY_DRAFT } from "$lib/privacy/policy";
import type { PageServerLoad } from "./$types";

export const prerender = false;

export const load: PageServerLoad = () => {
  const values = loadSiteConfig().privacy ?? {};
  return {
    title: "Privacy Policy",
    noindex: PRIVACY_POLICY_DRAFT,
    privacy: {
      legalName: values.legalName,
      contactEmail: values.contactEmail,
      effectiveDate: values.effectiveDate,
      draft: PRIVACY_POLICY_DRAFT,
      services: withRuntime(buildServices, { turnstileSiteKey: env.PUBLIC_TURNSTILE_SITE_KEY }),
    },
  };
};
