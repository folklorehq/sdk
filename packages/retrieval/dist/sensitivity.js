const SENSITIVITY_ORDER = {
    public: 0,
    team_scoped: 1,
    restricted: 2,
    confidential: 3,
};
export function isSensitivityWithin(level, max) {
    return SENSITIVITY_ORDER[level] <= SENSITIVITY_ORDER[max];
}
//# sourceMappingURL=sensitivity.js.map