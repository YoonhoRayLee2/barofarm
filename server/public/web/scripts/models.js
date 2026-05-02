/**
 * Domain Models — Barofarm
 * JSDoc typedefs only. No runtime exports.
 *
 * @module models
 */

/**
 * @typedef {'pending'|'live'|'ended'} AuctionStatus
 */

/**
 * @typedef {Object} Auction
 * @property {string}        id
 * @property {string}        liveId
 * @property {string}        productName
 * @property {number}        startPrice
 * @property {number}        currentPrice
 * @property {string|null}   currentBidder    User id of the highest bidder.
 * @property {AuctionStatus} status
 * @property {number}        remainingTime    Seconds remaining for the active auction.
 * @property {string}        sellerId
 */

/**
 * @typedef {'scheduled'|'live'|'ended'} LiveStatus
 */

/**
 * @typedef {Object} Live
 * @property {string}        id
 * @property {string}        sellerId
 * @property {string}        title
 * @property {LiveStatus}    status
 * @property {string|null}   currentAuctionId
 * @property {number}        viewerCount
 */

/**
 * @typedef {'buyer'|'seller'} UserRole
 */

/**
 * @typedef {Object} User
 * @property {string}   id
 * @property {string}   name
 * @property {string}   phone
 * @property {UserRole} role
 */

/**
 * @typedef {Object} ChatMessage
 * @property {string} userId
 * @property {string} userName
 * @property {string} message
 * @property {number} timestamp   Unix ms.
 */

export {}; // make this a module
