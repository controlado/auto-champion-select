/**
 * @typedef {Object} PromiseToastMessages
 * @property {string} [loading]
 * @property {string} [success]
 * @property {string} error
 */

/**
 * @param {string | undefined} message
 * @returns {void}
 */
export function showSuccessToast(message) {
    if (message) {
        Toast.success(message);
    }
}

/**
 * @param {string | undefined} message
 * @returns {void}
 */
export function showErrorToast(message) {
    if (message) {
        Toast.error(message);
    }
}

/**
 * @template T
 * @param {PromiseLike<T>} promise
 * @param {PromiseToastMessages} messages
 * @returns {unknown}
 */
export function showPromiseToast(promise, messages) {
    if (typeof Toast.promise === "function") {
        return Toast.promise(promise, messages);
    }

    return promise;
}
