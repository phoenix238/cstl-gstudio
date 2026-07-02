/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SEED_SAMPLE_CLIENTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}