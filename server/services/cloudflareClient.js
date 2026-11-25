/* Backward-compatible alias.
 *
 * The Workers AI implementation now lives in cloudflareAiService.js. Older
 * imports of cloudflareClient.js keep working, but new code should depend on
 * the canonical service name.
 */

module.exports = require('./cloudflareAiService');
