// Squelch warnings of image imports from your assets dir
declare module "$lib/assets/*" {
  var meta;
  export default meta;
}

declare module "virtual:privacy-services" {
  const services: import("$lib/privacy/services").BuildServices;
  export default services;
}
