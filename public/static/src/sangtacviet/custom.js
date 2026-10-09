(()=>{var E="6LePXXgpAAAAAI6Z-0FWdSCkrknINfR1LvfY1MwK",C="0x4AAAAAABVjME7NHipdnj-c",p=window,h,u;function k(){return p.grecaptcha?Promise.resolve():h||(h=new Promise((t,a)=>{let e=document.createElement("script");e.id="stv-google-recaptcha-sdk",e.async=!0,e.defer=!0,e.src="https://www.google.com/recaptcha/api.js?onload=__stvGoogleCaptchaReady&render=explicit",p.__stvGoogleCaptchaReady=()=>t(),e.onerror=()=>{e.remove(),h=void 0,a(new Error("Không thể tải Google reCAPTCHA."))},document.head.appendChild(e)}),h)}function P(){return p.turnstile?Promise.resolve():u||(u=new Promise((t,a)=>{let e=document.createElement("script");e.id="stv-cloudflare-turnstile-sdk",e.async=!0,e.defer=!0,e.src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__stvTurnstileCaptchaReady&render=explicit",p.__stvTurnstileCaptchaReady=()=>t(),e.onerror=()=>{e.remove(),u=void 0,a(new Error("Không thể tải Cloudflare Turnstile."))},document.head.appendChild(e)}),u)}function N(){let t=null,a=null,e=null,n=()=>{!a||!e||(a.src=`/generate_captcha.php?random=${Math.random()}`,e.value="")};return{async render(i,c,s){this.remove(),t=document.createElement("div"),t.className="stv-captcha",t.innerHTML=`
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
      `,a=t.querySelector(".stv-captcha__image"),e=t.querySelector(".stv-captcha__input");let o=t.querySelector(".stv-captcha__image-button"),r=t.querySelector(".stv-captcha__submit");if(!a||!e||!o||!r)throw new Error("Không thể khởi tạo captcha Sáng Tác Việt.");let d=()=>{let l=e?.value.trim()||"";if(l.length<4){s("Mã xác thực phải có ít nhất 4 ký tự."),e?.focus();return}c(l)};o.addEventListener("click",n),r.addEventListener("click",d),e.addEventListener("keydown",l=>{l.key==="Enter"&&(l.preventDefault(),d())}),i.appendChild(t),n()},reset:n,remove(){t?.remove(),t=null,a=null,e=null}}}function S(){let t=null,a=null;return{async render(e,n,i){this.remove();let c=document.createElement("div");if(c.className="captcha-sdk-widget",t=c,e.appendChild(c),await k(),!(t!==c||!c.isConnected)){if(!p.grecaptcha)throw new Error("Không thể khởi tạo Google reCAPTCHA.");a=p.grecaptcha.render(c,{sitekey:E,callback:n,"expired-callback":()=>i("Google reCAPTCHA đã hết hạn."),"error-callback":()=>i("Google reCAPTCHA gặp lỗi.")})}},reset(){a!==null&&p.grecaptcha?.reset(a)},remove(){a!==null&&p.grecaptcha?.reset(a),t?.remove(),t=null,a=null}}}function M(){let t=null,a=null;return{async render(e,n,i){this.remove();let c=document.createElement("div");if(c.className="captcha-sdk-widget",t=c,e.appendChild(c),await P(),!(t!==c||!c.isConnected)){if(!p.turnstile)throw new Error("Không thể khởi tạo Cloudflare Turnstile.");a=p.turnstile.render(c,{sitekey:C,callback:n,"expired-callback":()=>i("Cloudflare Turnstile đã hết hạn."),"error-callback":()=>i("Cloudflare Turnstile gặp lỗi.")})}},reset(){a!==null&&p.turnstile?.reset(a)},remove(){a!==null&&p.turnstile?.remove(a),t?.remove(),t=null,a=null}}}function v(){return{sangtacviet:N(),google:S(),cloudflare:M()}}var A={sangtacviet:"data:image/png;base64,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",google:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAADMklEQVR4nO2W60tTYRzHn3N2Ob3QXpQIJhhoWmameckUTcvUtNSprELUhIaS0kyxber0TEMrNHOh5i0sQsnLmms3S+y49GUXFfEf8HUEQs1K+8UZGV7O5s7cCKIvfN/snGefz/k9D5yD0P84ECD5AVCGF0A5poBKnAQZR0j/5lqojHMOivFpSMdWIA4BY7Owr5Z7JNwY54HlvCAoxBfhtBUoUxMQgAif2/VUQIyXQQq2Zjd4a9OwVZDyRI7By7E2y5PE7bKXsc9AIpwdvJJ73SlwIbYM1cibHbyBHwjJyPrYszAziPERqOVcABJ5AIk8QcrJhFJcBYINB9QROB0Q4fOM4DMIQMwZBBJxkZXQ1ywi9NgdglPEIdDyv0Mhvhl+FgFIuDdZ/yFrARNRDyYCgCIAGrgA8b8FxJxBl8PpwBQxaxFY7zMeQAG+DMOIg1wdoNw8NsHXO8Uvs7Uu517/EpvmNnctNreXHNwuMM0LYRR4yz9qS8BLMg9sW98tE24XmOKnMgpQyM3ZAlXtNXKGLSDOMwrMIHdnC0g7a+V/dQuqOuVXtgtMuO9nElh6s6/aloCtAxelMH7bCj8gnQOyp4L5LQkm4uM6eNW0Bx4bQ6DoZZL5XXc4D7EMSZHcGIVuZatAtEJvtroITISChn+i9oJMGw8X1QJL7+tPDrEVuKG8O8o0/vyWjhnrApOE39yE1498TeofON0sdQZ0G0Ir7YVXd8qlPtL32+Deklmo774Vb3NxnTZ2YSN8o8QDQ8SQre2gqHhuizZ26JRC95Pp6bPv9C/uaD88GXw4dyxtjUmCbrEmydxqiFQ9NQZnql75eg5QAR59r4MzWvSRI6KxpBX6HuHoJUhser4JHlgzvSbpaQiya4RdhrAigTqDUcDeClTZIGx9aIH7yD5AhfJ2KWKTDsOJlt1KpL/IgquPFGtiZaMSORKlPqw0byzV6nbs1EJNymqvPtyxj9L19I+HH6nVxS5kqjPtBtMHtl4XMzugDfVHzkqvMSShUR9luqZJNqczjVstgBJN4pcmXdTUgPFYNHJlBib8fdt0EXntujCywxBa1zd+POeJIcjPpVD0r+YXKOMAnG5a4XYAAAAASUVORK5CYII=",cloudflare:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAB2klEQVR4nO2UzUtUURjGj2C00KUiob7nujFXbQJdpPcM+VUIJYjQPhj3ZkThOedfiDYqKH6AnoO0HugvmMB9VMsUJe55B7rnWmnIjes0OtMM41y9toj7wLM9z+/9OoSkSpUq1RVkXnV1InfGPe48NrKnP5SkmfwLeZJOIqc7KGhYYQ7fkNPXvrzVdi3BYfbuDRSwUhVcDXIQdSRxAOR0+cLwsm54kvYlFl7gMNFw+JnhfUhIU+ywkJAm5JBFDu+MgBwKZwY55OMD0NBIGIkNYAQsXCas9ijom1jh3rxzO7Hw4i5kA80+WM2+BJptW5UZrguA8/RJgtXbw6WBgUCzsNxWsbUw9+Bm5dyjE+P0YUNn1jjA7OGW++hvgFMI7a6ehRdkzx0U8DHJyqPw6G1/k7VZ5e7VhFCZYWJkZ5fh1Kszw08o4EXRzowR8BQFTJdspDMWbXrJyOHewbOOloruboy2+Mod8nVmKtDspdXs5BRCuW+J4bB41YoNpydG0EJk5HQXBTwvhUehVrl5q92gegxsn6Cge4lufRHo11fZ3hooNler9WV78CO6+ePkAeDo5/pgr1XsqB5AoNnnP1/s+UyTsCfh/nc11G01m65nf5sNxvqkUqVK9V/qN1zaYIwGh+sdAAAAAElFTkSuQmCC"};var b=[{name:"sangtacviet",label:"Sáng Tác Việt"},{name:"google",label:"Google"},{name:"cloudflare",label:"Cloudflare"}],B=`
  body {
    padding-top: 110px;
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
    height: auto;
    width: 100%;
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
`;function x(t,a){t.innerHTML=`
    <style>${B}</style>
    <section class="captcha-card" aria-labelledby="captcha-title">
      <header class="captcha-card__header">
        <p class="captcha-card__eyebrow">Sáng Tác Việt</p>
        <h2 class="captcha-card__title" id="captcha-title">Xác minh captcha</h2>
        <p class="captcha-card__description">Sáng Tác Việt cần bạn xác minh captcha để tiếp tục đọc chương.</p>
      </header>
      <div class="captcha-tabs" role="tablist" aria-label="Nhà cung cấp captcha">
        ${b.map(s=>`
            <button
              class="captcha-tab"
              data-provider="${s.name}"
              type="button"
              role="tab"
              aria-selected="false"
            >
              <img class="captcha-tab__icon" src="${A[s.name]}" alt="">
              <span class="captcha-tab__label">${s.label}</span>
            </button>
          `).join("")}
      </div>
      <div class="captcha-widget" aria-busy="false"></div>
      <p class="captcha-status" aria-live="polite"></p>
    </section>
  `;let e=t.querySelector(".captcha-widget"),n=t.querySelector(".captcha-status"),i=Array.from(t.querySelectorAll(".captcha-tab"));if(!e||!n||i.length!==b.length)throw new Error("Không thể khởi tạo giao diện captcha.");let c=s=>{i.forEach(o=>{let r=o.dataset.provider===s;o.classList.toggle("is-active",r),o.setAttribute("aria-selected",String(r))})};return c(a),{widget:e,selectProvider:c,setBusy(s){e.setAttribute("aria-busy",String(s)),i.forEach(o=>{o.disabled=s}),t.querySelectorAll("[data-captcha-action]").forEach(o=>{o.disabled=s})},setStatus(s="",o="info"){n.textContent=s,n.dataset.kind=o},onProviderChange(s){i.forEach(o=>{o.addEventListener("click",()=>{let r=o.dataset.provider;r&&s(r)})})}}}var w="sangtacviet",I="/index.php?ngmar=verifyca";function T(t,a){return new URLSearchParams({ajax:"verifycaptcha",token:t,purpose:"read",provider:a}).toString()}function L(t){let a=v(),e=x(t,w),n,i=0,c=!1,s=async(r,d,l)=>{if(!(c||l!==i||d!==n)){c=!0,e.setBusy(!0),e.setStatus("Đang kiểm tra...","info");try{let g=(await(await fetch(I,{method:"POST",credentials:"include",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:T(r,d)})).text()).trim();if(g==="success"){e.setStatus("Xác thực thành công.","success");let f=window.reader;typeof f?.refetch=="function"?f.refetch():console.warn("[Captcha] window.reader.refetch không tồn tại.");return}e.setStatus(g||"Xác thực không thành công, vui lòng thử lại.","error"),a[d].reset()}catch(m){console.error("[Captcha] Lỗi kết nối máy chủ:",m),e.setStatus("Không thể kết nối tới máy chủ.","error"),a[d].reset()}finally{c=!1,l===i&&d===n&&e.setBusy(!1)}}},o=async r=>{let d=++i;n&&a[n].remove(),n=r,e.widget.replaceChildren(),e.selectProvider(r),e.setBusy(!1),e.setStatus(r==="sangtacviet"?"":"Đang tải captcha...","info");try{await a[r].render(e.widget,l=>{d===i&&r===n&&s(l,r,d)},l=>{d===i&&r===n&&(e.setBusy(!1),e.setStatus(l,"error"),a[r].reset())}),d===i&&r===n&&e.setStatus()}catch(l){if(d!==i||r!==n)return;let m=l instanceof Error?l.message:"Không thể tải nhà cung cấp captcha.";console.error("[Captcha] Lỗi khởi tạo provider:",l),e.setBusy(!1),e.setStatus(m,"error")}};e.onProviderChange(r=>{o(r)}),o(w)}function y(){let t=document.getElementById("captcha-placeholder");t&&(document.getElementById("removed")?.remove(),L(t))}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",y,{once:!0}):y();})();
