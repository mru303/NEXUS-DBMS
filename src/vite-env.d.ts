declare global {
  interface ImportMeta {
    env?: {
      readonly VITE_API_BASE_URL?: string;
    };
  }
}

export {};
