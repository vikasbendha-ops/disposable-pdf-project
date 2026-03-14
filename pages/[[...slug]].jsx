import dynamic from "next/dynamic";
import Head from "next/head";
import { buildSeoMetadata, normalizeSeoConfig } from "../lib/seo";
import { getStore } from "../lib/store";

const LegacyApp = dynamic(() => import("../frontend/src/App"), {
  ssr: false,
});
const SEO_CONFIG_CACHE_TTL_MS = Number(process.env.SEO_CONFIG_CACHE_TTL_MS || "60000");
let cachedSeoConfig = {
  expiresAt: 0,
  value: null,
};

function getPathFromParams(params) {
  const slug = Array.isArray(params?.slug) ? params.slug : [];
  if (slug.length === 0) return "/";
  return `/${slug.join("/")}`;
}

async function getCachedSeoConfig() {
  if (cachedSeoConfig.value && cachedSeoConfig.expiresAt > Date.now()) {
    return cachedSeoConfig.value;
  }

  const db = getStore();
  const [seoDoc, brandingDoc] = await Promise.all([
    db.platform_settings.findOne({ key: "seo" }, { _id: 0 }),
    db.platform_settings.findOne({ key: "branding" }, { _id: 0 }),
  ]);
  const next = normalizeSeoConfig(seoDoc || {}, brandingDoc || {});
  cachedSeoConfig = {
    value: next,
    expiresAt: Date.now() + Math.max(1000, SEO_CONFIG_CACHE_TTL_MS),
  };
  return next;
}

export default function CatchAllPage({ initialSeo }) {
  const seo = initialSeo || {};

  return (
    <>
      <Head>
        <title>{seo.title}</title>
        <meta name="description" content={seo.description || ""} />
        <meta name="keywords" content={seo.keywords || ""} />
        <meta name="robots" content={seo.robots || "index, follow"} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={seo.siteName || ""} />
        <meta property="og:title" content={seo.title || ""} />
        <meta property="og:description" content={seo.description || ""} />
        <meta property="og:image" content={seo.ogImageUrl || ""} />
        {seo.ogUrl ? <meta property="og:url" content={seo.ogUrl} /> : null}
        <meta name="twitter:card" content={seo.twitterCard || "summary_large_image"} />
        <meta name="twitter:title" content={seo.title || ""} />
        <meta name="twitter:description" content={seo.description || ""} />
        <meta name="twitter:image" content={seo.ogImageUrl || ""} />
        {seo.twitterHandle ? <meta name="twitter:site" content={seo.twitterHandle} /> : null}
        {seo.canonicalUrl ? <link rel="canonical" href={seo.canonicalUrl} /> : null}
        {seo.faviconUrl ? <link rel="icon" href={seo.faviconUrl} /> : null}
        {seo.faviconUrl ? <link rel="shortcut icon" href={seo.faviconUrl} /> : null}
        {seo.faviconUrl ? <link rel="apple-touch-icon" href={seo.faviconUrl} /> : null}
      </Head>
      <LegacyApp />
    </>
  );
}

export async function getServerSideProps(context) {
  const pathname = getPathFromParams(context.params);

  try {
    const seoConfig = await getCachedSeoConfig();
    const initialSeo = buildSeoMetadata(pathname, seoConfig);
    return {
      props: {
        initialSeo,
      },
    };
  } catch {
    const initialSeo = buildSeoMetadata(pathname, normalizeSeoConfig({}, {}));
    return {
      props: {
        initialSeo,
      },
    };
  }
}
