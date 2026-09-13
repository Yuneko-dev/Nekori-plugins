/**
 * Bypass Cloudflare
 * @param url URL
 * @param type `interstitial` (Interstitial Challenge Pages) | `turnstile` (Cloudflare's smart CAPTCHA alternative)
 * @returns Always false; this API is not implemented.
 * @deprecated Reserved stub in Electron and Android; no challenge UI is opened.
 */
export const solveCloudflare = async (
  url: string,
  type: 'interstitial' | 'turnstile',
): Promise<boolean> => false;

/**
 * Solve Cloudflare Turnstile CAPTCHA and return the token
 * @param url URL (used as origin)
 * @param sitekey The sitekey of the CAPTCHA widget
 * @returns Rejects with an unsupported-operation error; no token is returned.
 * @deprecated Test only
 */
export const solveCloudflareTurnstile = async (
  url: string,
  sitekey: string,
): Promise<string> => {
  throw new Error('solveCloudflareTurnstile not implemented');
};
