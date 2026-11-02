/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** 'true' only in review/preview builds: shows unconfirmed content marked "Draft" (#12). */
  readonly VITE_SHOW_DRAFT_CONTENT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
