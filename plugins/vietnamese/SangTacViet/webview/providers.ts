export type ProviderName = 'sangtacviet' | 'google' | 'cloudflare';

export type TokenHandler = (token: string) => void;
export type ErrorHandler = (message: string) => void;

export type CaptchaProvider = {
  render(
    container: HTMLElement,
    onToken: TokenHandler,
    onError: ErrorHandler,
  ): Promise<void>;
  reset(): void;
  remove(): void;
};

type GoogleRecaptcha = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: TokenHandler;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ): number;
  reset(widgetId?: number): void;
};

type CloudflareTurnstile = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: TokenHandler;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ): string;
  reset(widgetId?: string): void;
  remove(widgetId: string): void;
};

type CaptchaWindow = Window & {
  grecaptcha?: GoogleRecaptcha;
  turnstile?: CloudflareTurnstile;
  __stvGoogleCaptchaReady?: () => void;
  __stvTurnstileCaptchaReady?: () => void;
};

const GOOGLE_SITEKEY = '6LePXXgpAAAAAI6Z-0FWdSCkrknINfR1LvfY1MwK';
const CLOUDFLARE_SITEKEY = '0x4AAAAAABVjME7NHipdnj-c';
const captchaWindow = window as CaptchaWindow;

let googleLoader: Promise<void> | undefined;
let turnstileLoader: Promise<void> | undefined;

function loadGoogle(): Promise<void> {
  if (captchaWindow.grecaptcha) return Promise.resolve();
  if (googleLoader) return googleLoader;

  googleLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'stv-google-recaptcha-sdk';
    script.async = true;
    script.defer = true;
    script.src =
      'https://www.google.com/recaptcha/api.js?onload=__stvGoogleCaptchaReady&render=explicit';

    captchaWindow.__stvGoogleCaptchaReady = () => resolve();
    script.onerror = () => {
      script.remove();
      googleLoader = undefined;
      reject(new Error('Không thể tải Google reCAPTCHA.'));
    };
    document.head.appendChild(script);
  });

  return googleLoader;
}

function loadTurnstile(): Promise<void> {
  if (captchaWindow.turnstile) return Promise.resolve();
  if (turnstileLoader) return turnstileLoader;

  turnstileLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'stv-cloudflare-turnstile-sdk';
    script.async = true;
    script.defer = true;
    script.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__stvTurnstileCaptchaReady&render=explicit';

    captchaWindow.__stvTurnstileCaptchaReady = () => resolve();
    script.onerror = () => {
      script.remove();
      turnstileLoader = undefined;
      reject(new Error('Không thể tải Cloudflare Turnstile.'));
    };
    document.head.appendChild(script);
  });

  return turnstileLoader;
}

function createSangTacVietProvider(): CaptchaProvider {
  let widget: HTMLElement | null = null;
  let image: HTMLImageElement | null = null;
  let input: HTMLInputElement | null = null;

  const refresh = () => {
    if (!image || !input) return;
    image.src = `/generate_captcha.php?random=${Math.random()}`;
    input.value = '';
    input.focus();
  };

  return {
    async render(container, onToken, onError) {
      this.remove();

      widget = document.createElement('div');
      widget.className = 'stv-captcha';
      widget.innerHTML = `
        <button class="stv-captcha__image-button" type="button" title="Nhấn để đổi ảnh mới">
          <img class="stv-captcha__image" alt="Mã xác thực Sáng Tác Việt">
        </button>
        <label class="stv-captcha__label" for="stv-captcha-input">Nhập mã trong ảnh</label>
        <input
          class="stv-captcha__input"
          id="stv-captcha-input"
          type="text"
          inputmode="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="Nhập mã xác thực"
        >
        <button class="stv-captcha__submit" data-captcha-action type="button">Xác thực</button>
      `;

      image = widget.querySelector<HTMLImageElement>('.stv-captcha__image');
      input = widget.querySelector<HTMLInputElement>('.stv-captcha__input');
      const imageButton = widget.querySelector<HTMLButtonElement>(
        '.stv-captcha__image-button',
      );
      const submit = widget.querySelector<HTMLButtonElement>(
        '.stv-captcha__submit',
      );

      if (!image || !input || !imageButton || !submit) {
        throw new Error('Không thể khởi tạo captcha Sáng Tác Việt.');
      }

      const submitToken = () => {
        const token = input?.value.trim() || '';
        if (token.length < 4) {
          onError('Mã xác thực phải có ít nhất 4 ký tự.');
          input?.focus();
          return;
        }
        onToken(token);
      };

      imageButton.addEventListener('click', refresh);
      submit.addEventListener('click', submitToken);
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitToken();
        }
      });

      container.appendChild(widget);
      refresh();
    },
    reset: refresh,
    remove() {
      widget?.remove();
      widget = null;
      image = null;
      input = null;
    },
  };
}

function createGoogleProvider(): CaptchaProvider {
  let mount: HTMLElement | null = null;
  let widgetId: number | null = null;

  return {
    async render(container, onToken, onError) {
      this.remove();
      const currentMount = document.createElement('div');
      currentMount.className = 'captcha-sdk-widget';
      mount = currentMount;
      container.appendChild(currentMount);

      await loadGoogle();
      if (mount !== currentMount || !currentMount.isConnected) return;
      if (!captchaWindow.grecaptcha) {
        throw new Error('Không thể khởi tạo Google reCAPTCHA.');
      }

      widgetId = captchaWindow.grecaptcha.render(currentMount, {
        sitekey: GOOGLE_SITEKEY,
        callback: onToken,
        'expired-callback': () => onError('Google reCAPTCHA đã hết hạn.'),
        'error-callback': () => onError('Google reCAPTCHA gặp lỗi.'),
      });
    },
    reset() {
      if (widgetId !== null) captchaWindow.grecaptcha?.reset(widgetId);
    },
    remove() {
      if (widgetId !== null) captchaWindow.grecaptcha?.reset(widgetId);
      mount?.remove();
      mount = null;
      widgetId = null;
    },
  };
}

function createCloudflareProvider(): CaptchaProvider {
  let mount: HTMLElement | null = null;
  let widgetId: string | null = null;

  return {
    async render(container, onToken, onError) {
      this.remove();
      const currentMount = document.createElement('div');
      currentMount.className = 'captcha-sdk-widget';
      mount = currentMount;
      container.appendChild(currentMount);

      await loadTurnstile();
      if (mount !== currentMount || !currentMount.isConnected) return;
      if (!captchaWindow.turnstile) {
        throw new Error('Không thể khởi tạo Cloudflare Turnstile.');
      }

      widgetId = captchaWindow.turnstile.render(currentMount, {
        sitekey: CLOUDFLARE_SITEKEY,
        callback: onToken,
        'expired-callback': () => onError('Cloudflare Turnstile đã hết hạn.'),
        'error-callback': () => onError('Cloudflare Turnstile gặp lỗi.'),
      });
    },
    reset() {
      if (widgetId !== null) captchaWindow.turnstile?.reset(widgetId);
    },
    remove() {
      if (widgetId !== null) captchaWindow.turnstile?.remove(widgetId);
      mount?.remove();
      mount = null;
      widgetId = null;
    },
  };
}

export function createProviders(): Record<ProviderName, CaptchaProvider> {
  return {
    sangtacviet: createSangTacVietProvider(),
    google: createGoogleProvider(),
    cloudflare: createCloudflareProvider(),
  };
}
