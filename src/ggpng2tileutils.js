export function denull(value, defaultValue) {
  return value == null ? defaultValue : value;
}

export function cloneObject(object) {
  let clone = object == null ? null : Object.assign(Object.create(Object.getPrototypeOf(object)), object);
  return clone;
}