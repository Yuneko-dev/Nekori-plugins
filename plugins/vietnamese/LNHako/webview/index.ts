const chapterComments = document.querySelector('#chapter-comments');
const host = document.querySelector('#shadow-host');
if (chapterComments && host) {
  const shadow = host.attachShadow({ mode: 'open' });
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => {
    shadow.appendChild(node.cloneNode(true));
  });
  shadow.appendChild(chapterComments);
  shadow.addEventListener('click', event => {
    const target = event.target;
    if (
      !(target instanceof HTMLElement) ||
      !target.matches('.comment-spoiler-reveal')
    ) {
      return;
    }

    const spoiler = target.closest('[data-comment-spoiler]');
    const content = spoiler?.querySelector('[data-comment-content]');
    if (!spoiler || !content) {
      return;
    }

    content.removeAttribute('aria-hidden');
    target.setAttribute('aria-expanded', 'true');
    target.remove();
  });
  host.setAttribute('id', 'chapter-comments');
}
