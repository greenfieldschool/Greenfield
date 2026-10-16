// Name used to spot duplicate classes: "JSS 1", "jss1" and "JSS-1 " all give "jss1".
export function classNameKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
