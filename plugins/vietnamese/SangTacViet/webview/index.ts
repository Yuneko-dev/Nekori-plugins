import { createProviders } from './providers';
import type { ProviderName } from './providers';
import { createCaptchaView } from './ui';

const DEFAULT_PROVIDER: ProviderName = 'sangtacviet';
const VERIFY_ENDPOINT = '/index.php?ngmar=verifyca';

type ReaderWindow = Window & {
  reader?: {
    refetch?: () => void;
  };
};

function buildVerificationBody(token: string, provider: ProviderName): string {
  return new URLSearchParams({
    ajax: 'verifycaptcha',
    token,
    purpose: 'read',
    provider,
  }).toString();
}

function initializeCaptcha(placeholder: HTMLElement) {
  const providers = createProviders();
  const view = createCaptchaView(placeholder, DEFAULT_PROVIDER);
  let activeProvider: ProviderName | undefined;
  let renderGeneration = 0;
  let submitting = false;

  const verify = async (
    token: string,
    provider: ProviderName,
    generation: number,
  ) => {
    if (
      submitting ||
      generation !== renderGeneration ||
      provider !== activeProvider
    ) {
      return;
    }

    submitting = true;
    view.setBusy(true);
    view.setStatus('Đang kiểm tra...', 'info');

    try {
      const response = await fetch(VERIFY_ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: buildVerificationBody(token, provider),
      });
      const result = (await response.text()).trim();

      if (result === 'success') {
        view.setStatus('Xác thực thành công.', 'success');
        const reader = (window as ReaderWindow).reader;
        if (typeof reader?.refetch === 'function') {
          reader.refetch();
        } else {
          console.warn('[Captcha] window.reader.refetch không tồn tại.');
        }
        return;
      }

      view.setStatus(
        result || 'Xác thực không thành công, vui lòng thử lại.',
        'error',
      );
      providers[provider].reset();
    } catch (error) {
      console.error('[Captcha] Lỗi kết nối máy chủ:', error);
      view.setStatus('Không thể kết nối tới máy chủ.', 'error');
      providers[provider].reset();
    } finally {
      submitting = false;
      if (generation === renderGeneration && provider === activeProvider) {
        view.setBusy(false);
      }
    }
  };

  const selectProvider = async (provider: ProviderName) => {
    const generation = ++renderGeneration;
    if (activeProvider) providers[activeProvider].remove();

    activeProvider = provider;
    view.widget.replaceChildren();
    view.selectProvider(provider);
    view.setBusy(false);
    view.setStatus(
      provider === 'sangtacviet' ? '' : 'Đang tải captcha...',
      'info',
    );

    try {
      await providers[provider].render(
        view.widget,
        token => {
          if (generation === renderGeneration && provider === activeProvider) {
            void verify(token, provider, generation);
          }
        },
        message => {
          if (generation === renderGeneration && provider === activeProvider) {
            view.setBusy(false);
            view.setStatus(message, 'error');
            providers[provider].reset();
          }
        },
      );

      if (generation === renderGeneration && provider === activeProvider) {
        view.setStatus();
      }
    } catch (error) {
      if (generation !== renderGeneration || provider !== activeProvider) {
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'Không thể tải nhà cung cấp captcha.';
      console.error('[Captcha] Lỗi khởi tạo provider:', error);
      view.setBusy(false);
      view.setStatus(message, 'error');
    }
  };

  view.onProviderChange(provider => {
    void selectProvider(provider);
  });
  void selectProvider(DEFAULT_PROVIDER);
}

function bootstrap() {
  const placeholder = document.getElementById('captcha-placeholder');
  if (placeholder) {
    document.getElementById('removed')?.remove();
    initializeCaptcha(placeholder);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
