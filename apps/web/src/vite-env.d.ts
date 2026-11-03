/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** 'true' only in review/preview builds: shows unconfirmed content marked "Draft" (#12). */
  readonly VITE_SHOW_DRAFT_CONTENT?: string;
  /** 'api' on the live site: landing content comes from the public API (#21). Default 'bundled'. */
  readonly VITE_CONTENT_SOURCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
