import logoAsset from '@/assets/cos-logo.png.asset.json';

export const BRAND = {
  name: 'Circle of Success',
  short: 'Circle of Success',
  slogan: 'Investing together, prospering together.',
  logoUrl: logoAsset.url,
} as const;

let cachedLogoDataUrl: string | null = null;
let inflight: Promise<string> | null = null;

/** Load the brand logo as a base64 data URL (cached). Used for embedding in PDFs. */
export async function loadLogoDataUrl(): Promise<string> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  if (inflight) return inflight;
  inflight = (async () => {
    const res = await fetch(BRAND.logoUrl);
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    cachedLogoDataUrl = dataUrl;
    return dataUrl;
  })();
  return inflight;
}
