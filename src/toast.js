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
        globalThis.Toast?.success?.(message);
    }
}

/**
 * @param {string | undefined} message
 * @returns {void}
 */
export function showErrorToast(message) {
    if (message) {
        globalThis.Toast?.error?.(message);
    }
}

/**
 * @template T
 * @param {PromiseLike<T>} promise
 * @param {PromiseToastMessages} messages
 * @returns {unknown}
 */
export function showPromiseToast(promise, messages) {
    const toast = globalThis.Toast;
    if (typeof toast?.promise === "function") {
        return toast.promise(promise, messages);
    }

    return promise;
}
