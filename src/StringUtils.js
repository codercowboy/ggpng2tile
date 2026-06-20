export default class StringUtils {
    static removePrefix(value, prefix) {
        if (value == null || prefix == null) {
            return value;
        }

        return value.startsWith(prefix) ? value.slice(prefix.length) : value;
    }

    static removeSuffix(value, suffix) {
        if (value == null || suffix == null) {
            return value;
        }

        return value.endsWith(suffix) ? value.slice(0, value.length - suffix.length) : value;
    }
}