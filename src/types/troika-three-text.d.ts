declare module "troika-three-text" {
  interface PreloadFontOptions {
    font?: string;
    characters?: string;
    sdfGlyphSize?: number;
  }
  export function preloadFont(
    options: PreloadFontOptions,
    callback?: () => void
  ): void;
}
