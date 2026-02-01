/**
 * CommandRegistry contract.
 *
 * @param {string} id
 * @param {Function} handler
 */
function register(id, handler) {}

/**
 * @param {string} id
 * @param {...unknown} args
 * @returns {Promise<unknown>}
 */
async function execute(id, ...args) {}

module.exports = {
  register,
  execute,
};
