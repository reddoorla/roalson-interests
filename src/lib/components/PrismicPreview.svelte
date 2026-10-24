<script lang="ts">
  import { beforeNavigate, goto, refreshAll } from "$app/navigation";
  import { getToolbarSrc } from "@prismicio/client";
  import { onMount } from "svelte";

  type Props = {
    repositoryName: string;
    routePrefix?: string;
    routePrefixName?: string;
  };

  const {
    repositoryName,
    routePrefix = "preview",
    routePrefixName = routePrefix,
  }: Props = $props();

  const toolbarSrc = $derived(getToolbarSrc(repositoryName));

  let endingPreview = $state(false);

  onMount(() => {
    const controller = new AbortController();

    window.addEventListener(
      "prismicPreviewUpdate",
      (event) => {
        event.preventDefault();
        refreshAll();
      },
      { signal: controller.signal },
    );
    window.addEventListener(
      "prismicPreviewEnd",
      (event) => {
        event.preventDefault();
        endingPreview = true;
        goto(
          new URL(
            window.location.pathname.replace(
              new RegExp(`^(/${routePrefix}/?$|/${routePrefix}/)`),
              "/",
            ),
            window.location.origin,
          ),
          { refreshAll: true, reset: false },
        );
      },
      { signal: controller.signal },
    );

    return () => controller.abort();
  });

  beforeNavigate((navigation) => {
    const fromParams: Record<string, string | undefined> = navigation.from?.params ?? {};
    if (
      navigation.to &&
      fromParams[routePrefixName] === routePrefix &&
      !(routePrefixName in (navigation.to.params || {}))
    ) {
      if (endingPreview) {
        endingPreview = false;
        return;
      }

      navigation.cancel();
      goto(new URL(routePrefix + navigation.to.url.pathname, navigation.to.url.origin));
    }
  });
</script>

<svelte:head>
  <script defer src={toolbarSrc}></script>
</svelte:head>
