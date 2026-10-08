// https://github.com/estree/estree/blob/master/es5.md#binary-operations
export const BINARY_OPERATOR_METHODS: {
  [operator: string]: (left: any, right: any) => unknown
} = {
  // BinaryExpression
  '==': (left, right) => left == right,
  '!=': (left, right) => left != right,
  '===': (left, right) => left === right,
  '!==': (left, right) => left !== right,
  '<': (left, right) => left < right,
  '<=': (left, right) => left <= right,
  '>': (left, right) => left > right,
  '>=': (left, right) => left >= right,
  '<<': (left, right) => left << right,
  '>>': (left, right) => left >> right,
  '>>>': (left, right) => left >>> right,
  '+': (left, right) => left + right,
  '-': (left, right) => left - right,
  '*': (left, right) => left * right,
  '/': (left, right) => left / right,
  '%': (left, right) => left % right,
  '|': (left, right) => left | right,
  '^': (left, right) => left ^ right,
  '&': (left, right) => left & right,
  // `in` is handled in binaryExpression so the left key can be normalized once.
  instanceof: (left, right) => (left as object) instanceof right,

  // LogicalExpression
  '||': (left, right) => left || right,
  '&&': (left, right) => left && right,
  '??': (left, right) => left ?? right,
}

// https://github.com/estree/estree/blob/master/es5.md#unary-operations
export const UNARY_OPERATOR_METHODS: {
  [operator: string]: (value: any, prefix: any) => unknown
} = {
  // UnaryExpression
  '-': (value, prefix) => (prefix ? -value : value),
  '+': (value, prefix) => (prefix ? +value : value),
  '!': (value, _) => !value,
  '~': (value, _) => ~value,
  typeof: (value, _) => typeof value,
  void: (value, _) => void value,
}

// Property keys that expose the prototype chain / the Function constructor and must never be
// reachable from template expressions, for reads or writes, computed or not.
export const BLOCKED_MEMBER_KEYS = new Set([
  'constructor',
  '__proto__',
  'prototype',
])

/**
 * Normalize a computed member key to a string exactly once. Primitives (string, number,
 * boolean, bigint, null, undefined) are converted with String() a single time and that
 * value is reused for the blocked-key check, the real property read/write, and the
 * callable check. Objects (including arrays), functions and symbols are rejected so a
 * key cannot coerce to different names between the guard and the lookup.
 * typeof null === "object", so null is converted before the object rejection.
 */
export function normalizeMemberKey(key: unknown): string | undefined {
  if (key === null || key === undefined) return String(key)
  const type = typeof key
  if (
    type === 'string' ||
    type === 'number' ||
    type === 'boolean' ||
    type === 'bigint'
  ) {
    return String(key)
  }
  // objects (incl. arrays), functions, symbols, and anything else
  return undefined
}

export function isBlockedMemberKey(key: string): boolean {
  return BLOCKED_MEMBER_KEYS.has(key)
}

// Built-in prototype methods that templates are allowed to call on values (strings, arrays,
// numbers, dates, plain objects). Anything not listed here, and not an own property coming from
// the provided scope, cannot be invoked. Reflective / function-manipulation methods
// (constructor, call, apply, bind, __defineGetter__, ...) are intentionally excluded.
export const ALLOWED_BUILTIN_METHODS = new Set<string>([
  // Object (instance)
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  'toString',
  'valueOf',
  // String
  'at',
  'charAt',
  'charCodeAt',
  'codePointAt',
  'concat',
  'endsWith',
  'includes',
  'indexOf',
  'lastIndexOf',
  'localeCompare',
  'match',
  'matchAll',
  'normalize',
  'padEnd',
  'padStart',
  'repeat',
  'replace',
  'replaceAll',
  'search',
  'slice',
  'split',
  'startsWith',
  'substr',
  'substring',
  'toLowerCase',
  'toUpperCase',
  'toLocaleLowerCase',
  'toLocaleUpperCase',
  'trim',
  'trimEnd',
  'trimStart',
  // Number
  'toExponential',
  'toFixed',
  'toPrecision',
  // Array (incl. mutating helpers, which are not a safety concern)
  'copyWithin',
  'entries',
  'every',
  'fill',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'flat',
  'flatMap',
  'forEach',
  'join',
  'keys',
  'map',
  'pop',
  'push',
  'reduce',
  'reduceRight',
  'reverse',
  'shift',
  'some',
  'sort',
  'splice',
  'unshift',
  'values',
  'with',
  'toReversed',
  'toSorted',
  'toSpliced',
  // Date (read-only accessors + formatting)
  'getDate',
  'getDay',
  'getFullYear',
  'getHours',
  'getMilliseconds',
  'getMinutes',
  'getMonth',
  'getSeconds',
  'getTime',
  'getTimezoneOffset',
  'getUTCDate',
  'getUTCDay',
  'getUTCFullYear',
  'getUTCHours',
  'getUTCMilliseconds',
  'getUTCMinutes',
  'getUTCMonth',
  'getUTCSeconds',
  'toDateString',
  'toISOString',
  'toJSON',
  'toLocaleDateString',
  'toLocaleTimeString',
  'toTimeString',
  'toUTCString',
])

// Globals that must never be invoked even if somehow reached (defence in depth).
const BLOCKED_CALLABLES = new Set<unknown>([
  Function,
  async function () {}.constructor,
  function* () {}.constructor,
  async function* () {}.constructor,
  eval,
])

export function isBlockedCallable(fn: unknown): boolean {
  return typeof fn === 'function' && BLOCKED_CALLABLES.has(fn)
}

export function hasOwn(object: unknown, key: PropertyKey): boolean {
  return object != null && Object.prototype.hasOwnProperty.call(object, key)
}

// Built-in prototypes whose methods are only reachable through ALLOWED_BUILTIN_METHODS.
const INTRINSIC_PROTOTYPES = new Set<unknown>([
  Object.prototype,
  Function.prototype,
  Array.prototype,
  String.prototype,
  Number.prototype,
  Boolean.prototype,
  Symbol.prototype,
  BigInt.prototype,
  Date.prototype,
  RegExp.prototype,
  Error.prototype,
  Map.prototype,
  Set.prototype,
  WeakMap.prototype,
  WeakSet.prototype,
  Promise.prototype,
  ArrayBuffer.prototype,
  Object.getPrototypeOf(Uint8Array.prototype),
  Object.getPrototypeOf(async function () {}),
  Object.getPrototypeOf(function* () {}),
  Object.getPrototypeOf(async function* () {}),
])

/**
 * Whether `object[key]` may be invoked from a template: own properties of values from the
 * scope, methods defined by non built-in prototypes (e.g. class instances passed in the
 * scope), and allowlisted methods of built-in prototypes.
 *
 * `key` must already be a normalized string (see normalizeMemberKey).
 */
export function isCallableMember(object: unknown, key: string): boolean {
  if (object == null || isBlockedMemberKey(key)) return false
  const target = Object(object)
  let owner = target
  while (owner != null && !Object.prototype.hasOwnProperty.call(owner, key)) {
    owner = Object.getPrototypeOf(owner)
  }
  if (owner == null) return false
  if (owner === target) return true
  if (INTRINSIC_PROTOTYPES.has(owner)) {
    return ALLOWED_BUILTIN_METHODS.has(key)
  }
  return true
}

/**
 * Read `object[property]` using an already-normalized string key. Functions are checked
 * against BLOCKED_CALLABLES *before* binding so a bound Function constructor cannot slip
 * past the identity check.
 */
export const MEMBER_EXPRESSION_METHOD = (
  object: any,
  property: string,
): unknown => {
  // Last-resort guard; callers raise a clean compile error before this.
  if (isBlockedMemberKey(property)) {
    throw new Error(`Access to "${property}" is not allowed`)
  }
  const value = object[property]
  if (typeof value === 'function') {
    if (isBlockedCallable(value)) {
      throw new Error(`Calling "${property}" is not allowed`)
    }
    return value.bind(object)
  }
  return value
}

// https://github.com/estree/estree/blob/master/es5.md#assignmentexpression
export const ASSIGNMENT_OPERATOR_METHODS: {
  [operator: string]: (left: any, right: any) => unknown
} = {
  '=': (_, right) => right,
  '+=': (left, right) => left + right,
  '-=': (left, right) => left - right,
  '*=': (left, right) => left * right,
  '/=': (left, right) => left / right,
  '%=': (left, right) => left % right,
  '<<=': (left, right) => left << right,
  '>>=': (left, right) => left >> right,
  '>>>=': (left, right) => left >>> right,
  '|=': (left, right) => left | right,
  '^=': (left, right) => left ^ right,
  '&=': (left, right) => left & right,
}
