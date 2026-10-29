/** Land ID aerial maps, by listing uid: Matt Howard's "Aerial Map Links -
 *  Roalson" email (2026-10-12), re-forwarded by Erik on 2026-10-29 with the
 *  ask that every Aerial Map button open these. The same links are the
 *  listing packages' `landid_url` in `tools/listing-packages/build/heroes.json`. */
export const LANDID_MAPS: Readonly<Record<string, string>> = {
  "101-w-commerce-street": "3e6369887039dec22cefd72b17ed3d4b",
  "116-old-san-antonio-road": "a802ebfe2fbe2ac5f35e02f49837a326",
  "11714-perrin-beitel-road": "72ee1ff1cb1324a8a1997b0677f90737",
  "13810-lookout-road": "2a9597bcde031f0369e88de5d5a87bd3",
  "25331-ih-10-west": "fb13b61e0279b421a419bd8e3ed516aa",
  "402-w-nueva-street": "5542dcccd8a7dfefbda9761163f77319",
  "5001-walzem-road": "2ce704de2800a15e7a3291d906d14016",
  "urban-loop-road": "f5f73a589bc8649c563608af344d31e5",
  "5930-bandera-road": "303dec2bf919544ca4d3e57f3875836a",
  "cascade-caverns-at-old-san-antonio-road": "f072759fcc09e0b94b713e253f73b01d",
  "highway-77-at-general-cavazos-kingsville": "ba5cdeac303abbdda507c47f9e376211",
  "hwy-46-at-spencer-ranch-blvd": "9be28fa9b17381e7c97a812a935d47f5",
  "ih-10-at-fm-725-seguin": "7990069e512759487da5ea3347c2b2b7",
  "ih-10-at-highway-46": "1bb36cc03e621d013b087023ae42e3e0",
  "ih-10-at-highway-87-comfort": "44c0981a81ddcafbd808baa2ba71dfe3",
  "ih-10-at-menger-springs": "54102f5af605797a0b36bc13aedad0d7",
  "ih-10-at-scenic-loop": "bd8a3c05be007f8540a474337915bf74",
  "ih-10-east-at-loop-1604": "d7b9b6f2312df961bc1d64632713ac94",
  "ih-35-at-wonderworld-san-marcos": "8efe3c9351aa92caf762f0ec643eb0de",
  "loop-1604-at-dove-canyon": "8e5bf473833c8fd80a0d26bb5fcbb26b",
  "loop-1604-at-highway-181": "eec71ef853150c738392bfb2d0a1b836",
  "menger-springs-road": "cdea5b54757b7a27427a95e38f1cfeee",
  "st-marys-at-martin-river-walk": "be9d6d036d4b9fe325d43f9bb972aa13",
};

export function landIdUrl(uid: string): string | null {
  const id = LANDID_MAPS[uid];
  return id ? `https://id.land/maps/${id}/share` : null;
}
