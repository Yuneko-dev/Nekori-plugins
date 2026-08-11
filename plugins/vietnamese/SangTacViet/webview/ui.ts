import { PROVIDER_ICONS } from './icons';
import type { ProviderName } from './providers';

export type CaptchaView = {
  widget: HTMLElement;
  selectProvider(provider: ProviderName): void;
  setBusy(busy: boolean): void;
  setStatus(message?: string, kind?: 'info' | 'error' | 'success'): void;
  onProviderChange(handler: (provider: ProviderName) => void): void;
};

const PROVIDERS: { name: ProviderName; label: string }[] = [
  { name: 'sangtacviet', label: 'Sáng Tác Việt' },
  { name: 'google', label: 'Google' },
  { name: 'cloudflare', label: 'Cloudflare' },
];

const styles = `
  body {
    padding-top: calc(var(--reader-margin-top, 0px) + var(--tsundoku-safe-top, 0px));
  }

  #captcha-placeholder {
    --captcha-accent: #6d5dfc;
    --captcha-accent-soft: rgba(109, 93, 252, 0.12);
    --captcha-card: rgba(255, 255, 255, 0.94);
    --captcha-surface: #f5f5fa;
    --captcha-border: rgba(27, 24, 50, 0.12);
    --captcha-text: #1b1832;
    --captcha-muted: #716e82;
    --captcha-error: #c9364f;
    --captcha-success: #188458;
    box-sizing: border-box;
    display: grid;
    min-height: 300px;
    padding: 24px 12px;
    place-items: start center;
    width: 100%;
  }

  #captcha-placeholder *,
  #captcha-placeholder *::before,
  #captcha-placeholder *::after {
    box-sizing: border-box;
  }

  .captcha-card {
    background:
      radial-gradient(circle at top right, rgba(109, 93, 252, 0.11), transparent 42%),
      var(--captcha-card);
    border: 1px solid var(--captcha-border);
    border-radius: 22px;
    box-shadow: 0 18px 50px rgba(25, 20, 62, 0.12);
    color: var(--captcha-text);
    font-family: inherit;
    max-width: 420px;
    overflow: hidden;
    width: 100%;
  }

  .captcha-card__header {
    padding: 22px 22px 14px;
  }

  .captcha-card__eyebrow {
    color: var(--captcha-accent);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.12em;
    margin: 0 0 7px;
    text-transform: uppercase;
  }

  .captcha-card__title {
    font-size: 21px;
    line-height: 1.25;
    margin: 0;
  }

  .captcha-card__description {
    color: var(--captcha-muted);
    font-size: 13px;
    line-height: 1.5;
    margin: 7px 0 0;
  }

  .captcha-tabs {
    background: var(--captcha-surface);
    border: 1px solid var(--captcha-border);
    border-radius: 16px;
    display: grid;
    gap: 5px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: 0 16px;
    padding: 5px;
  }

  .captcha-tab {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 12px;
    color: var(--captcha-muted);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    font: inherit;
    font-size: 11px;
    font-weight: 650;
    gap: 5px;
    justify-content: center;
    min-height: 62px;
    min-width: 0;
    padding: 7px 4px;
    transition:
      background 160ms ease,
      color 160ms ease,
      box-shadow 160ms ease,
      transform 160ms ease;
  }

  .captcha-tab:hover:not(:disabled) {
    color: var(--captcha-text);
    transform: translateY(-1px);
  }

  .captcha-tab.is-active {
    background: var(--captcha-card);
    box-shadow: 0 4px 14px rgba(36, 29, 87, 0.1);
    color: var(--captcha-text);
  }

  .captcha-tab:focus-visible,
  .stv-captcha button:focus-visible,
  .stv-captcha input:focus-visible {
    outline: 3px solid var(--captcha-accent-soft);
    outline-offset: 2px;
  }

  .captcha-tab:disabled {
    cursor: wait;
    opacity: 0.62;
  }

  .captcha-tab__icon {
    height: 27px;
    object-fit: contain;
    width: 27px;
  }

  .captcha-tab__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
  }

  .captcha-widget {
    align-items: center;
    display: flex;
    justify-content: center;
    min-height: 178px;
    overflow-x: auto;
    padding: 20px 16px 12px;
  }

  .captcha-sdk-widget {
    align-items: center;
    display: flex;
    justify-content: center;
    min-height: 78px;
    min-width: 300px;
  }

  .captcha-status {
    border-top: 1px solid transparent;
    color: var(--captcha-muted);
    font-size: 12px;
    line-height: 1.45;
    margin: 0 16px;
    min-height: 42px;
    padding: 11px 4px 14px;
    text-align: center;
  }

  .captcha-status:empty {
    min-height: 20px;
    padding-bottom: 7px;
    padding-top: 0;
  }

  .captcha-status[data-kind='error'] {
    color: var(--captcha-error);
  }

  .captcha-status[data-kind='success'] {
    color: var(--captcha-success);
  }

  .stv-captcha {
    display: grid;
    gap: 10px;
    max-width: 320px;
    width: 100%;
  }

  .stv-captcha__image-button {
    align-items: center;
    background: #fff;
    border: 1px solid var(--captcha-border);
    border-radius: 13px;
    cursor: pointer;
    display: flex;
    justify-content: center;
    min-height: 68px;
    overflow: hidden;
    padding: 0;
    width: 100%;
  }

  .stv-captcha__image {
    display: block;
    max-height: 90px;
    max-width: 100%;
    object-fit: contain;
  }

  .stv-captcha__label {
    color: var(--captcha-muted);
    font-size: 12px;
    font-weight: 650;
    margin-bottom: -4px;
  }

  .stv-captcha__input {
    background: var(--captcha-surface);
    border: 1px solid transparent;
    border-radius: 12px;
    color: var(--captcha-text);
    font: inherit;
    font-size: 15px;
    height: 44px;
    outline: 0;
    padding: 0 13px;
    text-align: center;
    width: 100%;
  }

  .stv-captcha__input:focus {
    border-color: var(--captcha-accent);
  }

  .stv-captcha__submit {
    background: linear-gradient(135deg, #7868ff, #5d4de8);
    border: 0;
    border-radius: 12px;
    box-shadow: 0 8px 20px rgba(93, 77, 232, 0.24);
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-size: 14px;
    font-weight: 750;
    height: 44px;
    width: 100%;
  }

  .stv-captcha__submit:disabled {
    cursor: wait;
    opacity: 0.62;
  }

  @media (prefers-color-scheme: dark) {
    #captcha-placeholder {
      --captcha-accent: #a99fff;
      --captcha-accent-soft: rgba(169, 159, 255, 0.2);
      --captcha-card: rgba(28, 27, 36, 0.96);
      --captcha-surface: #24232e;
      --captcha-border: rgba(255, 255, 255, 0.11);
      --captcha-text: #f5f3ff;
      --captcha-muted: #aaa6bb;
      --captcha-error: #ff8296;
      --captcha-success: #66d5a8;
    }

    .captcha-card {
      box-shadow: 0 20px 55px rgba(0, 0, 0, 0.34);
    }
  }

  @media (max-width: 360px) {
    #captcha-placeholder {
      padding-left: 8px;
      padding-right: 8px;
    }

    .captcha-card__header {
      padding-left: 17px;
      padding-right: 17px;
    }

    .captcha-tabs {
      margin-left: 10px;
      margin-right: 10px;
    }

    .captcha-tab {
      font-size: 10px;
    }
  }
`;

export function createCaptchaView(
  placeholder: HTMLElement,
  initialProvider: ProviderName,
): CaptchaView {
  placeholder.innerHTML = `
    <style>${styles}</style>
    <section class="captcha-card" aria-labelledby="captcha-title">
      <header class="captcha-card__header">
        <p class="captcha-card__eyebrow">Bảo vệ nội dung</p>
        <h2 class="captcha-card__title" id="captcha-title">Xác minh bạn là người đọc</h2>
        <p class="captcha-card__description">Chọn một phương thức xác thực để tiếp tục đọc chương.</p>
      </header>
      <div class="captcha-tabs" role="tablist" aria-label="Nhà cung cấp captcha">
        ${PROVIDERS.map(
          provider => `
            <button
              class="captcha-tab"
              data-provider="${provider.name}"
              type="button"
              role="tab"
              aria-selected="false"
            >
              <img class="captcha-tab__icon" src="${PROVIDER_ICONS[provider.name]}" alt="">
              <span class="captcha-tab__label">${provider.label}</span>
            </button>
          `,
        ).join('')}
      </div>
      <div class="captcha-widget" aria-busy="false"></div>
      <p class="captcha-status" aria-live="polite"></p>
    </section>
  `;

  const widget = placeholder.querySelector<HTMLElement>('.captcha-widget');
  const status = placeholder.querySelector<HTMLElement>('.captcha-status');
  const tabs = Array.from(
    placeholder.querySelectorAll<HTMLButtonElement>('.captcha-tab'),
  );

  if (!widget || !status || tabs.length !== PROVIDERS.length) {
    throw new Error('Không thể khởi tạo giao diện captcha.');
  }

  const selectProvider = (provider: ProviderName) => {
    tabs.forEach(tab => {
      const selected = tab.dataset.provider === provider;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-selected', String(selected));
    });
  };

  selectProvider(initialProvider);

  return {
    widget,
    selectProvider,
    setBusy(busy) {
      widget.setAttribute('aria-busy', String(busy));
      tabs.forEach(tab => {
        tab.disabled = busy;
      });
      placeholder
        .querySelectorAll<HTMLButtonElement>('[data-captcha-action]')
        .forEach(button => {
          button.disabled = busy;
        });
    },
    setStatus(message = '', kind = 'info') {
      status.textContent = message;
      status.dataset.kind = kind;
    },
    onProviderChange(handler) {
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const provider = tab.dataset.provider as ProviderName | undefined;
          if (provider) handler(provider);
        });
      });
    },
  };
}
