import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://portal.loveleedaystudios.com";
  return [
    { url: base, lastModified: new Date(), priority: 1 },
  ];
}
