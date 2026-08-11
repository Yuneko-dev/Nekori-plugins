const captchaHTML = `<div>
  <div class="captcha-container">
    <div class="captcha-header">Captcha</div>
    <div class="captcha-body">
      <input
        type="text"
        id="captcha-input"
        class="captcha-input"
        placeholder="Nhập mã xác thực"
      />
      <div class="captcha-image-wrapper">
        <img
          id="captcha-image"
          src=""
          alt="Captcha Image"
          style="cursor: pointer"
          title="Nhấn để đổi ảnh mới"
        />
      </div>
      <button id="captcha-btn" class="captcha-btn">Xác thực</button>
      <div
        id="captcha-error"
        style="color: red; font-size: 13px; text-align: center; display: none"
      ></div>
    </div>
  </div>

  <style>
    body {
      padding-top: calc(var(--reader-margin-top) + var(--tsundoku-safe-top, 0px));
    }

    .captcha-container {
      width: 320px;
      border: 1px solid #d1d1d1;
      border-radius: 5px;
      overflow: hidden;
      font-family: inherit;
      background-color: #ffffff;
    }

    .captcha-header {
      background-color: #f0f0f0;
      padding: 10px 15px;
      font-weight: bold;
      color: #111111;
      font-size: 15px;
    }

    .captcha-body {
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .captcha-input {
      width: 100%;
      padding: 10px;
      border: 1px solid transparent;
      background-color: #f5f5f5;
      border-radius: 4px;
      text-align: center;
      font-size: 14px;
      color: #111111;
      box-sizing: border-box;
      outline: none;
    }

    .captcha-input::placeholder {
      color: #888888;
    }

    .captcha-input:focus {
      border-color: #ccc;
    }

    .captcha-image-wrapper {
      width: 100%;
      border-radius: 4px;
      overflow: hidden;
      background-color: #f8f9fa;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .captcha-image-wrapper img {
      width: 100%;
      height: auto;
      display: block;
    }

    .captcha-btn {
      width: 100%;
      padding: 8px;
      background-color: #f2f2f2;
      border: 1px solid #d1d1d1;
      border-radius: 4px;
      font-weight: bold;
      color: #555555;
      cursor: pointer;
      font-size: 14px;
      transition: background-color 0.2s;
    }

    .captcha-btn:hover {
      background-color: #e5e5e5;
    }
  </style>
</div>`;

function refreshCaptcha() {
  const captchaImage = document.getElementById('captcha-image');
  const captchaInput = document.getElementById('captcha-input');
  captchaImage.src = '/generate_captcha.php?random=' + Math.random();
  captchaInput.value = '';
}

async function captchaBtnClick() {
  const captchaInput = document.getElementById('captcha-input');
  const captchaBtn = document.getElementById('captcha-btn');
  const captchaError = document.getElementById('captcha-error');
  const token = captchaInput.value.trim();

  if (!token) {
    captchaError.textContent = 'Vui lòng nhập mã xác thực!';
    captchaError.style.display = 'block';
    return;
  }

  if (token.length < 4) {
    captchaError.textContent = 'Mã xác thực phải có ít nhất 4 ký tự!';
    captchaError.style.display = 'block';
    return;
  }

  captchaBtn.disabled = true;
  captchaBtn.textContent = 'Đang kiểm tra...';
  captchaError.style.display = 'none';

  try {
    const urlSearchParams = new URLSearchParams();
    urlSearchParams.append('ajax', 'verifycaptcha');
    urlSearchParams.append('token', token);
    urlSearchParams.append('purpose', 'read');
    urlSearchParams.append('provider', 'sangtacviet');
    const response = await fetch('/index.php?ngmar=verifyca', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: urlSearchParams.toString(),
    });

    const text = await response.text();

    if (text.trim() === 'success') {
      try {
        if (
          typeof window.reader !== 'undefined' &&
          typeof window.reader.refetch === 'function'
        ) {
          window.reader.refetch();
        } else {
          console.warn('[Captcha] window.reader.refetch không tồn tại.');
        }
      } catch (e) {
        console.error('[Captcha] Lỗi khi thực thi window.reader.refetch:', e);
      }
    } else {
      captchaError.textContent =
        'Mã xác thực không chính xác, vui lòng thử lại.';
      captchaError.style.display = 'block';
      refreshCaptcha();
    }
  } catch (error) {
    console.error('[Captcha] Lỗi kết nối mạng:', error);
    captchaError.textContent = 'Đã có lỗi xảy ra khi kết nối tới máy chủ.';
    captchaError.style.display = 'block';
  } finally {
    captchaBtn.disabled = false;
    captchaBtn.textContent = 'Xác thực';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const captchaPlaceholder = document.getElementById('captcha-placeholder');
  if (captchaPlaceholder) {
    console.log('Detected captcha placeholder, injecting captcha HTML.');
    captchaPlaceholder.innerHTML = captchaHTML;
    document
      .getElementById('captcha-image')
      .addEventListener('click', refreshCaptcha);
    document
      .getElementById('captcha-btn')
      .addEventListener('click', captchaBtnClick);
    refreshCaptcha();
  }
});
