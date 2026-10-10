/**
 * Renders an avatar image into `el`, falling back to the name's first letter
 * when no URL is given or the image fails to load.
 * @param {HTMLElement} el
 * @param {{ url?: string, name?: string }} opts
 */
export function renderAvatar(el, { url, name }) {
  el.replaceChildren();
  el.classList.remove('has-img');

  const renderFallback = () => {
    const text = (name || '').trim() || '판';
    el.textContent = text[0].toUpperCase();
  };

  if (!url) {
    renderFallback();
    return;
  }

  const img = document.createElement('img');
  img.className = 'avatar-img';
  img.alt = '';
  img.addEventListener('error', () => {
    img.remove();
    el.classList.remove('has-img');
    renderFallback();
  });
  img.src = url;
  el.appendChild(img);
  el.classList.add('has-img');
}
