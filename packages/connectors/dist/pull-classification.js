// SPDX-License-Identifier: Apache-2.0
function toEpoch(value) {
    return value instanceof Date ? value.getTime() : Date.parse(value);
}
/** A pulled record is a create when it was born inside the pull window, or when no lower bound applies. */
export function isCreateEvent(createdAt, since) {
    if (since === undefined)
        return true;
    if (createdAt === undefined)
        return false;
    return toEpoch(createdAt) >= toEpoch(since);
}
//# sourceMappingURL=pull-classification.js.map