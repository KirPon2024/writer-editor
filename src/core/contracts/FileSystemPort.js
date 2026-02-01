/**
 * FileSystemPort contract.
 *
 * @param {string} path
 * @returns {Promise<string|Uint8Array>}
 */
async function read(path) {}

/**
 * @param {string} path
 * @param {string|Uint8Array} data
 * @returns {Promise<void>}
 */
async function write(path, data) {}

/**
 * @param {string} path
 * @returns {Promise<boolean>}
 */
async function exists(path) {}

module.exports = {
  read,
  write,
  exists,
};
