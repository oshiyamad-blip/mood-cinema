/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TMDB_TOKEN?: string;
  readonly VITE_AMAZON_TAG?: string;
  readonly VITE_UNEXT_REDIRECT_PREFIX?: string;
  readonly VITE_ADSENSE_CLIENT?: string;
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
