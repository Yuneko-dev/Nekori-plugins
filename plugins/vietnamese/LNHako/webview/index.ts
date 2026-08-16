const chapterComments = document.querySelector('#chapter-comments');
const host = document.querySelector('#shadow-host');
if (chapterComments && host) {
  const shadow = host.attachShadow({ mode: 'open' });
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => {
    shadow.appendChild(node.cloneNode(true));
  });
  shadow.appendChild(chapterComments);
  host.setAttribute('id', 'chapter-comments');
}
