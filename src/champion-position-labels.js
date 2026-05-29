import { getPositionMetadata } from "./champion-positions.js";
import { t } from "./i18n/index.js";

/**
 * @param {{value: string, label: string}} position
 * @returns {string}
 */
export function getPositionLabel(position) {
    const key = `positions.${position.value}`;
    const label = t(key);
    return label === key ? position.label : label;
}

/**
 * @param {unknown} position
 * @returns {string}
 */
export function getPositionLabelByValue(position) {
    const positionMetadata = getPositionMetadata(position);
    return positionMetadata ? getPositionLabel(positionMetadata) : "";
}
