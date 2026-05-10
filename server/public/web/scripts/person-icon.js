/**
 * Returns an inline SVG string of a person silhouette icon.
 * @param {number} [size=36]
 * @param {string} [color='var(--color-ink-mute)']
 */
export function personIconSVG(size = 36, color = 'var(--color-ink-mute)') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" aria-hidden="true"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>`;
}
