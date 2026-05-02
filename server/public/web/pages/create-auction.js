/**
 * Create Auction Page — 4-1b-B
 * Immediately redirects to live-create.
 * Route kept for any external links that may point here.
 *
 * @module pages/create-auction
 */

import { replace } from '/app/scripts/router.js';

/**
 * @param {object} [params]
 * @returns {Promise<HTMLElement>}
 */
export default async function load(params) {
  await replace('/app/live-create');
  return document.createElement('div');
}
