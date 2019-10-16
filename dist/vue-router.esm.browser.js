/*!
  * vue-router v3.0.5
  * (c) 2019 Evan You
  * @license MIT
  */
/*  */

function assert (condition, message) {
  if (!condition) {
    throw new Error(`[vue-router] ${message}`)
  }
}

function warn (condition, message) {
  if ("development" !== 'production' && !condition) {
    typeof console !== 'undefined' && console.warn(`[vue-router] ${message}`);
  }
}

function isError (err) {
  return Object.prototype.toString.call(err).indexOf('Error') > -1
}

function extend (a, b) {
  for (const key in b) {
    a[key] = b[key];
  }
  return a
}

var View = {
  name: 'RouterView',
  functional: true,
  props: {
    name: {
      type: String,
      default: 'default'
    }
  },
  render (_, { props, children, parent, data }) {
    // used by devtools to display a router-view badge
    data.routerView = true;

    // directly use parent context's createElement() function
    // so that components rendered by router-view can resolve named slots
    const h = parent.$createElement;
    const name = props.name;
    const route = parent.$route;
    const cache = parent._routerViewCache || (parent._routerViewCache = {});

    // determine current view depth, also check to see if the tree
    // has been toggled inactive but kept-alive.
    let depth = 0;
    let inactive = false;
    while (parent && parent._routerRoot !== parent) {
      const vnodeData = parent.$vnode && parent.$vnode.data;
      if (vnodeData) {
        if (vnodeData.routerView) {
          depth++;
        }
        if (vnodeData.keepAlive && parent._inactive) {
          inactive = true;
        }
      }
      parent = parent.$parent;
    }
    data.routerViewDepth = depth;

    // render previous view if the tree is inactive and kept-alive
    if (inactive) {
      return h(cache[name], data, children)
    }

    const matched = route.matched[depth];
    // render empty node if no matched route
    if (!matched) {
      cache[name] = null;
      return h()
    }

    const component = cache[name] = matched.components[name];

    // attach instance registration hook
    // this will be called in the instance's injected lifecycle hooks
    data.registerRouteInstance = (vm, val) => {
      // val could be undefined for unregistration
      const current = matched.instances[name];
      if (
        (val && current !== vm) ||
        (!val && current === vm)
      ) {
        matched.instances[name] = val;
      }
    }

    // also register instance in prepatch hook
    // in case the same component instance is reused across different routes
    ;(data.hook || (data.hook = {})).prepatch = (_, vnode) => {
      matched.instances[name] = vnode.componentInstance;
    };

    // register instance in init hook
    // in case kept-alive component be actived when routes changed
    data.hook.init = (vnode) => {
      if (vnode.data.keepAlive &&
        vnode.componentInstance &&
        vnode.componentInstance !== matched.instances[name]
      ) {
        matched.instances[name] = vnode.componentInstance;
      }
    };

    // resolve props
    let propsToPass = data.props = resolveProps(route, matched.props && matched.props[name]);
    if (propsToPass) {
      // clone to prevent mutation
      propsToPass = data.props = extend({}, propsToPass);
      // pass non-declared props as attrs
      const attrs = data.attrs = data.attrs || {};
      for (const key in propsToPass) {
        if (!component.props || !(key in component.props)) {
          attrs[key] = propsToPass[key];
          delete propsToPass[key];
        }
      }
    }

    return h(component, data, children)
  }
}

function resolveProps (route, config) {
  switch (typeof config) {
    case 'undefined':
      return
    case 'object':
      return config
    case 'function':
      return config(route)
    case 'boolean':
      return config ? route.params : undefined
    default:
      {
        warn(
          false,
          `props in "${route.path}" is a ${typeof config}, ` +
          `expecting an object, function or boolean.`
        );
      }
  }
}

/*  */

const encodeReserveRE = /[!'()*]/g;
const encodeReserveReplacer = c => '%' + c.charCodeAt(0).toString(16);
const commaRE = /%2C/g;

// fixed encodeURIComponent which is more conformant to RFC3986:
// - escapes [!'()*]
// - preserve commas
const encode = str => encodeURIComponent(str)
  .replace(encodeReserveRE, encodeReserveReplacer)
  .replace(commaRE, ',');

const decode = decodeURIComponent;

function resolveQuery (
  query,
  extraQuery = {},
  _parseQuery
) {
  const parse = _parseQuery || parseQuery;
  let parsedQuery;
  try {
    parsedQuery = parse(query || '');
  } catch (e) {
    "development" !== 'production' && warn(false, e.message);
    parsedQuery = {};
  }
  for (const key in extraQuery) {
    parsedQuery[key] = extraQuery[key];
  }
  return parsedQuery
}

function parseQuery (query) {
  const res = {};

  query = query.trim().replace(/^(\?|#|&)/, '');

  if (!query) {
    return res
  }

  query.split('&').forEach(param => {
    const parts = param.replace(/\+/g, ' ').split('=');
    const key = decode(parts.shift());
    const val = parts.length > 0
      ? decode(parts.join('='))
      : null;

    if (res[key] === undefined) {
      res[key] = val;
    } else if (Array.isArray(res[key])) {
      res[key].push(val);
    } else {
      res[key] = [res[key], val];
    }
  });

  return res
}

function stringifyQuery (obj) {
  const res = obj ? Object.keys(obj).map(key => {
    const val = obj[key];

    if (val === undefined) {
      return ''
    }

    if (val === null) {
      return encode(key)
    }

    if (Array.isArray(val)) {
      const result = [];
      val.forEach(val2 => {
        if (val2 === undefined) {
          return
        }
        if (val2 === null) {
          result.push(encode(key));
        } else {
          result.push(encode(key) + '=' + encode(val2));
        }
      });
      return result.join('&')
    }

    return encode(key) + '=' + encode(val)
  }).filter(x => x.length > 0).join('&') : null;
  return res ? `?${res}` : ''
}

/*  */

const trailingSlashRE = /\/?$/;

function createRoute (
  record,
  location,
  redirectedFrom,
  router
) {
  const stringifyQuery$$1 = router && router.options.stringifyQuery;

  let query = location.query || {};
  try {
    query = clone(query);
  } catch (e) {}

  const route = {
    name: location.name || (record && record.name),
    meta: (record && record.meta) || {},
    path: location.path || '/',
    hash: location.hash || '',
    query,
    params: location.params || {},
    fullPath: getFullPath(location, stringifyQuery$$1),
    matched: record ? formatMatch(record) : []
  };
  if (redirectedFrom) {
    route.redirectedFrom = getFullPath(redirectedFrom, stringifyQuery$$1);
  }
  return Object.freeze(route)
}

function clone (value) {
  if (Array.isArray(value)) {
    return value.map(clone)
  } else if (value && typeof value === 'object') {
    const res = {};
    for (const key in value) {
      res[key] = clone(value[key]);
    }
    return res
  } else {
    return value
  }
}

// the starting route that represents the initial state
const START = createRoute(null, {
  path: '/'
});

function formatMatch (record) {
  const res = [];
  while (record) {
    res.unshift(record);
    record = record.parent;
  }
  return res
}

function getFullPath (
  { path, query = {}, hash = '' },
  _stringifyQuery
) {
  const stringify = _stringifyQuery || stringifyQuery;
  return (path || '/') + stringify(query) + hash
}

function isSameRoute (a, b) {
  if (b === START) {
    return a === b
  } else if (!b) {
    return false
  } else if (a.path && b.path) {
    return (
      a.path.replace(trailingSlashRE, '') === b.path.replace(trailingSlashRE, '') &&
      a.hash === b.hash &&
      isObjectEqual(a.query, b.query)
    )
  } else if (a.name && b.name) {
    return (
      a.name === b.name &&
      a.hash === b.hash &&
      isObjectEqual(a.query, b.query) &&
      isObjectEqual(a.params, b.params)
    )
  } else {
    return false
  }
}

function isObjectEqual (a = {}, b = {}) {
  // handle null value #1566
  if (!a || !b) return a === b
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false
  }
  return aKeys.every(key => {
    const aVal = a[key];
    const bVal = b[key];
    // check nested equality
    if (typeof aVal === 'object' && typeof bVal === 'object') {
      return isObjectEqual(aVal, bVal)
    }
    return String(aVal) === String(bVal)
  })
}

function isIncludedRoute (current, target) {
  return (
    current.path.replace(trailingSlashRE, '/').indexOf(
      target.path.replace(trailingSlashRE, '/')
    ) === 0 &&
    (!target.hash || current.hash === target.hash) &&
    queryIncludes(current.query, target.query)
  )
}

function queryIncludes (current, target) {
  for (const key in target) {
    if (!(key in current)) {
      return false
    }
  }
  return true
}

/*  */

// work around weird flow bug
const toTypes = [String, Object];
const eventTypes = [String, Array];

var Link = {
  name: 'RouterLink',
  props: {
    to: {
      type: toTypes,
      required: true
    },
    tag: {
      type: String,
      default: 'a'
    },
    exact: Boolean,
    append: Boolean,
    replace: Boolean,
    activeClass: String,
    exactActiveClass: String,
    event: {
      type: eventTypes,
      default: 'click'
    }
  },
  render (h) {
    const router = this.$router;
    const current = this.$route;
    const { location, route, href } = router.resolve(this.to, current, this.append);

    const classes = {};
    const globalActiveClass = router.options.linkActiveClass;
    const globalExactActiveClass = router.options.linkExactActiveClass;
    // Support global empty active class
    const activeClassFallback = globalActiveClass == null
      ? 'router-link-active'
      : globalActiveClass;
    const exactActiveClassFallback = globalExactActiveClass == null
      ? 'router-link-exact-active'
      : globalExactActiveClass;
    const activeClass = this.activeClass == null
      ? activeClassFallback
      : this.activeClass;
    const exactActiveClass = this.exactActiveClass == null
      ? exactActiveClassFallback
      : this.exactActiveClass;
    const compareTarget = location.path
      ? createRoute(null, location, null, router)
      : route;

    classes[exactActiveClass] = isSameRoute(current, compareTarget);
    classes[activeClass] = this.exact
      ? classes[exactActiveClass]
      : isIncludedRoute(current, compareTarget);

    const handler = e => {
      if (guardEvent(e)) {
        if (this.replace) {
          router.replace(location);
        } else {
          router.push(location);
        }
      }
    };

    const on = { click: guardEvent };
    if (Array.isArray(this.event)) {
      this.event.forEach(e => { on[e] = handler; });
    } else {
      on[this.event] = handler;
    }

    const data = {
      class: classes
    };

    if (this.tag === 'a') {
      data.on = on;
      data.attrs = { href };
    } else {
      // find the first <a> child and apply listener and href
      const a = findAnchor(this.$slots.default);
      if (a) {
        // in case the <a> is a static node
        a.isStatic = false;
        const aData = a.data = extend({}, a.data);
        aData.on = on;
        const aAttrs = a.data.attrs = extend({}, a.data.attrs);
        aAttrs.href = href;
      } else {
        // doesn't have <a> child, apply listener to self
        data.on = on;
      }
    }

    return h(this.tag, data, this.$slots.default)
  }
}

function guardEvent (e) {
  // don't redirect with control keys
  if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return
  // don't redirect when preventDefault called
  if (e.defaultPrevented) return
  // don't redirect on right click
  if (e.button !== undefined && e.button !== 0) return
  // don't redirect if `target="_blank"`
  if (e.currentTarget && e.currentTarget.getAttribute) {
    const target = e.currentTarget.getAttribute('target');
    if (/\b_blank\b/i.test(target)) return
  }
  // this may be a Weex event which doesn't have this method
  if (e.preventDefault) {
    e.preventDefault();
  }
  return true
}

function findAnchor (children) {
  if (children) {
    let child;
    for (let i = 0; i < children.length; i++) {
      child = children[i];
      if (child.tag === 'a') {
        return child
      }
      if (child.children && (child = findAnchor(child.children))) {
        return child
      }
    }
  }
}

let _Vue;

function install (Vue) {
  console.log('src/install.js')
  // 若已调用过则直接返回
  if (install.installed && _Vue === Vue) return
  install.installed = true;
  // install 函数中将 Vue 赋值给 _Vue 
  // 可在其他模块中不用引入直接使用 Vue 对象
  
  _Vue = Vue;
  console.log('_Vue = Vue; 赋值私有 Vue 引用')
  // isDef 判断是否不为undefined
  const isDef = v => v !== undefined;

  const registerInstance = (vm, callVal) => {
    let i = vm.$options._parentVnode;
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      i(vm, callVal);
    }
  };
  // 每个组件混入 beforeCreate 钩子函数的实现
  Vue.mixin({
    beforeCreate () {
      console.log("src/install.js")
      console.log("beforeCreate()函数 被调用")
      // 判断是否存在 router 对象，若存在则为根实例
      if (isDef(this.$options.router)) {
        // 设置根路由
        debugger
        this._routerRoot = this;
        this._router = this.$options.router;
        // 路由初始化
        console.log('this._router = this.$options.router : 在Vue取出')
        console.log(this._router)
        console.log("this._router.init(app) start")
        this._router.init(this);
        console.log("this._router.init(app) end")
        // _router 属性双向绑定
        Vue.util.defineReactive(this, '_route', this._router.history.current);
      } else {
        // 非根实例则通过 $parent 指向父级的 _routerRoot 属性，最终指向根实例
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this;
      }
      registerInstance(this, this);
    },
    destroyed () {
      registerInstance(this);
    }
  });
  // 注入 $router $route
  Object.defineProperty(Vue.prototype, '$router', {
    get () { 
      console.log("Object.defineProperty 注入 $router")
      return this._routerRoot._router }
  });

  Object.defineProperty(Vue.prototype, '$route', {
    get () {
      console.log("Object.defineProperty 注入 $route")
       return this._routerRoot._route 
      }
  });
  
  // 全局注册 router-link router-view 组件
  Vue.component('RouterView', View);
  Vue.component('RouterLink', Link);

  const strats = Vue.config.optionMergeStrategies;
  // use the same hook merging strategy for route hooks
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created;
}

/*  */

const inBrowser = typeof window !== 'undefined';

/*  */

function resolvePath (
  relative,
  base,
  append
) {
  const firstChar = relative.charAt(0);
  if (firstChar === '/') {
    return relative
  }

  if (firstChar === '?' || firstChar === '#') {
    return base + relative
  }

  const stack = base.split('/');

  // remove trailing segment if:
  // - not appending
  // - appending to trailing slash (last segment is empty)
  if (!append || !stack[stack.length - 1]) {
    stack.pop();
  }

  // resolve relative path
  const segments = relative.replace(/^\//, '').split('/');
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment === '..') {
      stack.pop();
    } else if (segment !== '.') {
      stack.push(segment);
    }
  }

  // ensure leading slash
  if (stack[0] !== '') {
    stack.unshift('');
  }

  return stack.join('/')
}

function parsePath (path) {
  let hash = '';
  let query = '';

  const hashIndex = path.indexOf('#');
  if (hashIndex >= 0) {
    hash = path.slice(hashIndex);
    path = path.slice(0, hashIndex);
  }

  const queryIndex = path.indexOf('?');
  if (queryIndex >= 0) {
    query = path.slice(queryIndex + 1);
    path = path.slice(0, queryIndex);
  }

  return {
    path,
    query,
    hash
  }
}

function cleanPath (path) {
  return path.replace(/\/\//g, '/')
}

var isarray = Array.isArray || function (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]';
};

/**
 * Expose `pathToRegexp`.
 */
var pathToRegexp_1 = pathToRegexp;
var parse_1 = parse;
var compile_1 = compile;
var tokensToFunction_1 = tokensToFunction;
var tokensToRegExp_1 = tokensToRegExp;

/**
 * The main path matching regexp utility.
 *
 * @type {RegExp}
 */
var PATH_REGEXP = new RegExp([
  // Match escaped characters that would otherwise appear in future matches.
  // This allows the user to escape special characters that won't transform.
  '(\\\\.)',
  // Match Express-style parameters and un-named parameters with a prefix
  // and optional suffixes. Matches appear as:
  //
  // "/:test(\\d+)?" => ["/", "test", "\d+", undefined, "?", undefined]
  // "/route(\\d+)"  => [undefined, undefined, undefined, "\d+", undefined, undefined]
  // "/*"            => ["/", undefined, undefined, undefined, undefined, "*"]
  '([\\/.])?(?:(?:\\:(\\w+)(?:\\(((?:\\\\.|[^\\\\()])+)\\))?|\\(((?:\\\\.|[^\\\\()])+)\\))([+*?])?|(\\*))'
].join('|'), 'g');

/**
 * Parse a string for the raw tokens.
 *
 * @param  {string}  str
 * @param  {Object=} options
 * @return {!Array}
 */
function parse (str, options) {
  var tokens = [];
  var key = 0;
  var index = 0;
  var path = '';
  var defaultDelimiter = options && options.delimiter || '/';
  var res;

  while ((res = PATH_REGEXP.exec(str)) != null) {
    var m = res[0];
    var escaped = res[1];
    var offset = res.index;
    path += str.slice(index, offset);
    index = offset + m.length;

    // Ignore already escaped sequences.
    if (escaped) {
      path += escaped[1];
      continue
    }

    var next = str[index];
    var prefix = res[2];
    var name = res[3];
    var capture = res[4];
    var group = res[5];
    var modifier = res[6];
    var asterisk = res[7];

    // Push the current path onto the tokens.
    if (path) {
      tokens.push(path);
      path = '';
    }

    var partial = prefix != null && next != null && next !== prefix;
    var repeat = modifier === '+' || modifier === '*';
    var optional = modifier === '?' || modifier === '*';
    var delimiter = res[2] || defaultDelimiter;
    var pattern = capture || group;

    tokens.push({
      name: name || key++,
      prefix: prefix || '',
      delimiter: delimiter,
      optional: optional,
      repeat: repeat,
      partial: partial,
      asterisk: !!asterisk,
      pattern: pattern ? escapeGroup(pattern) : (asterisk ? '.*' : '[^' + escapeString(delimiter) + ']+?')
    });
  }

  // Match any characters still remaining.
  if (index < str.length) {
    path += str.substr(index);
  }

  // If the path exists, push it onto the end.
  if (path) {
    tokens.push(path);
  }

  return tokens
}

/**
 * Compile a string to a template function for the path.
 *
 * @param  {string}             str
 * @param  {Object=}            options
 * @return {!function(Object=, Object=)}
 */
function compile (str, options) {
  return tokensToFunction(parse(str, options))
}

/**
 * Prettier encoding of URI path segments.
 *
 * @param  {string}
 * @return {string}
 */
function encodeURIComponentPretty (str) {
  return encodeURI(str).replace(/[\/?#]/g, function (c) {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase()
  })
}

/**
 * Encode the asterisk parameter. Similar to `pretty`, but allows slashes.
 *
 * @param  {string}
 * @return {string}
 */
function encodeAsterisk (str) {
  return encodeURI(str).replace(/[?#]/g, function (c) {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase()
  })
}

/**
 * Expose a method for transforming tokens into the path function.
 */
function tokensToFunction (tokens) {
  // Compile all the tokens into regexps.
  var matches = new Array(tokens.length);

  // Compile all the patterns before compilation.
  for (var i = 0; i < tokens.length; i++) {
    if (typeof tokens[i] === 'object') {
      matches[i] = new RegExp('^(?:' + tokens[i].pattern + ')$');
    }
  }

  return function (obj, opts) {
    var path = '';
    var data = obj || {};
    var options = opts || {};
    var encode = options.pretty ? encodeURIComponentPretty : encodeURIComponent;

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];

      if (typeof token === 'string') {
        path += token;

        continue
      }

      var value = data[token.name];
      var segment;

      if (value == null) {
        if (token.optional) {
          // Prepend partial segment prefixes.
          if (token.partial) {
            path += token.prefix;
          }

          continue
        } else {
          throw new TypeError('Expected "' + token.name + '" to be defined')
        }
      }

      if (isarray(value)) {
        if (!token.repeat) {
          throw new TypeError('Expected "' + token.name + '" to not repeat, but received `' + JSON.stringify(value) + '`')
        }

        if (value.length === 0) {
          if (token.optional) {
            continue
          } else {
            throw new TypeError('Expected "' + token.name + '" to not be empty')
          }
        }

        for (var j = 0; j < value.length; j++) {
          segment = encode(value[j]);

          if (!matches[i].test(segment)) {
            throw new TypeError('Expected all "' + token.name + '" to match "' + token.pattern + '", but received `' + JSON.stringify(segment) + '`')
          }

          path += (j === 0 ? token.prefix : token.delimiter) + segment;
        }

        continue
      }

      segment = token.asterisk ? encodeAsterisk(value) : encode(value);

      if (!matches[i].test(segment)) {
        throw new TypeError('Expected "' + token.name + '" to match "' + token.pattern + '", but received "' + segment + '"')
      }

      path += token.prefix + segment;
    }

    return path
  }
}

/**
 * Escape a regular expression string.
 *
 * @param  {string} str
 * @return {string}
 */
function escapeString (str) {
  return str.replace(/([.+*?=^!:${}()[\]|\/\\])/g, '\\$1')
}

/**
 * Escape the capturing group by escaping special characters and meaning.
 *
 * @param  {string} group
 * @return {string}
 */
function escapeGroup (group) {
  return group.replace(/([=!:$\/()])/g, '\\$1')
}

/**
 * Attach the keys as a property of the regexp.
 *
 * @param  {!RegExp} re
 * @param  {Array}   keys
 * @return {!RegExp}
 */
function attachKeys (re, keys) {
  re.keys = keys;
  return re
}

/**
 * Get the flags for a regexp from the options.
 *
 * @param  {Object} options
 * @return {string}
 */
function flags (options) {
  return options.sensitive ? '' : 'i'
}

/**
 * Pull out keys from a regexp.
 *
 * @param  {!RegExp} path
 * @param  {!Array}  keys
 * @return {!RegExp}
 */
function regexpToRegexp (path, keys) {
  // Use a negative lookahead to match only capturing groups.
  var groups = path.source.match(/\((?!\?)/g);

  if (groups) {
    for (var i = 0; i < groups.length; i++) {
      keys.push({
        name: i,
        prefix: null,
        delimiter: null,
        optional: false,
        repeat: false,
        partial: false,
        asterisk: false,
        pattern: null
      });
    }
  }

  return attachKeys(path, keys)
}

/**
 * Transform an array into a regexp.
 *
 * @param  {!Array}  path
 * @param  {Array}   keys
 * @param  {!Object} options
 * @return {!RegExp}
 */
function arrayToRegexp (path, keys, options) {
  var parts = [];

  for (var i = 0; i < path.length; i++) {
    parts.push(pathToRegexp(path[i], keys, options).source);
  }

  var regexp = new RegExp('(?:' + parts.join('|') + ')', flags(options));

  return attachKeys(regexp, keys)
}

/**
 * Create a path regexp from string input.
 *
 * @param  {string}  path
 * @param  {!Array}  keys
 * @param  {!Object} options
 * @return {!RegExp}
 */
function stringToRegexp (path, keys, options) {
  return tokensToRegExp(parse(path, options), keys, options)
}

/**
 * Expose a function for taking tokens and returning a RegExp.
 *
 * @param  {!Array}          tokens
 * @param  {(Array|Object)=} keys
 * @param  {Object=}         options
 * @return {!RegExp}
 */
function tokensToRegExp (tokens, keys, options) {
  if (!isarray(keys)) {
    options = /** @type {!Object} */ (keys || options);
    keys = [];
  }

  options = options || {};

  var strict = options.strict;
  var end = options.end !== false;
  var route = '';

  // Iterate over the tokens and create our regexp string.
  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i];

    if (typeof token === 'string') {
      route += escapeString(token);
    } else {
      var prefix = escapeString(token.prefix);
      var capture = '(?:' + token.pattern + ')';

      keys.push(token);

      if (token.repeat) {
        capture += '(?:' + prefix + capture + ')*';
      }

      if (token.optional) {
        if (!token.partial) {
          capture = '(?:' + prefix + '(' + capture + '))?';
        } else {
          capture = prefix + '(' + capture + ')?';
        }
      } else {
        capture = prefix + '(' + capture + ')';
      }

      route += capture;
    }
  }

  var delimiter = escapeString(options.delimiter || '/');
  var endsWithDelimiter = route.slice(-delimiter.length) === delimiter;

  // In non-strict mode we allow a slash at the end of match. If the path to
  // match already ends with a slash, we remove it for consistency. The slash
  // is valid at the end of a path match, not in the middle. This is important
  // in non-ending mode, where "/test/" shouldn't match "/test//route".
  if (!strict) {
    route = (endsWithDelimiter ? route.slice(0, -delimiter.length) : route) + '(?:' + delimiter + '(?=$))?';
  }

  if (end) {
    route += '$';
  } else {
    // In non-ending mode, we need the capturing groups to match as much as
    // possible by using a positive lookahead to the end or next path segment.
    route += strict && endsWithDelimiter ? '' : '(?=' + delimiter + '|$)';
  }

  return attachKeys(new RegExp('^' + route, flags(options)), keys)
}

/**
 * Normalize the given path string, returning a regular expression.
 *
 * An empty array can be passed in for the keys, which will hold the
 * placeholder key descriptions. For example, using `/user/:id`, `keys` will
 * contain `[{ name: 'id', delimiter: '/', optional: false, repeat: false }]`.
 *
 * @param  {(string|RegExp|Array)} path
 * @param  {(Array|Object)=}       keys
 * @param  {Object=}               options
 * @return {!RegExp}
 */
function pathToRegexp (path, keys, options) {
  if (!isarray(keys)) {
    options = /** @type {!Object} */ (keys || options);
    keys = [];
  }

  options = options || {};

  if (path instanceof RegExp) {
    return regexpToRegexp(path, /** @type {!Array} */ (keys))
  }

  if (isarray(path)) {
    return arrayToRegexp(/** @type {!Array} */ (path), /** @type {!Array} */ (keys), options)
  }

  return stringToRegexp(/** @type {string} */ (path), /** @type {!Array} */ (keys), options)
}
pathToRegexp_1.parse = parse_1;
pathToRegexp_1.compile = compile_1;
pathToRegexp_1.tokensToFunction = tokensToFunction_1;
pathToRegexp_1.tokensToRegExp = tokensToRegExp_1;

/*  */

// $flow-disable-line
const regexpCompileCache = Object.create(null);

function fillParams (
  path,
  params,
  routeMsg
) {
  params = params || {};
  try {
    const filler =
      regexpCompileCache[path] ||
      (regexpCompileCache[path] = pathToRegexp_1.compile(path));

    // Fix #2505 resolving asterisk routes { name: 'not-found', params: { pathMatch: '/not-found' }}
    if (params.pathMatch) params[0] = params.pathMatch;

    return filler(params, { pretty: true })
  } catch (e) {
    {
      warn(false, `missing param for ${routeMsg}: ${e.message}`);
    }
    return ''
  } finally {
    // delete the 0 if it was added
    delete params[0];
  }
}

/*  */
// 创建路由 map
function createRouteMap (
  routes,
  oldPathList,
  oldPathMap,
  oldNameMap
) {
  console.log("------ ------src/create-route-map.js")
  console.log("------ ------createRouteMap: 根据路由配置，创建 path 和 name 的映射表")
  // pathList 用于控制路径匹配优先级
  const pathList = oldPathList || [];
  // 根据 path 的路由映射表
  const pathMap = oldPathMap || Object.create(null);
  // 根据 name 的路由映射表
  const nameMap = oldNameMap || Object.create(null);
  // 遍历路由配置添加到 pathList pathMap nameMap 中
  routes.forEach(route => {
    console.log("------ ------createRouteMap 根据 route 调用 addRouteRecord: 拿到 pathList,pathMap,nameMap")
    addRouteRecord(pathList, pathMap, nameMap, route);
  });

  // 将通配符路由 * 取出插到末尾，确保通配符路由始终在尾部
  for (let i = 0, l = pathList.length; i < l; i++) {
    if (pathList[i] === '*') {
      pathList.push(pathList.splice(i, 1)[0]);
      l--;
      i--;
    }
  }

  return {
    pathList,
    pathMap,
    nameMap
  }
}
// 增加 路由记录 函数
function addRouteRecord (
  pathList,
  pathMap,
  nameMap,
  route,
  parent,
  matchAs
) {
  // 获取 path, name
  const { path, name } = route;
  {
    assert(path != null, `"path" is required in a route configuration.`);
    assert(
      typeof route.component !== 'string',
      `route config "component" for path: ${String(path || name)} cannot be a ` +
      `string id. Use an actual component instead.`
    );
  }
  // 编译正则的选项
  const pathToRegexpOptions = route.pathToRegexpOptions || {};
  // 格式化 path
  // 根据 pathToRegexpOptions.strict 判断是否删除末尾斜杠 /
  // 根据是否以斜杠 / 开头判断是否需要拼接父级路由的路径
  const normalizedPath = normalizePath(
    path,
    parent,
    pathToRegexpOptions.strict // 末尾斜杠是否精确匹配 (default: false)
  );

  // 匹配规则是否大小写敏感？(默认值：false)
  // 路由配置中 caseSensitive 和 pathToRegexpOptions.sensitive 作用相同
  if (typeof route.caseSensitive === 'boolean') {
    pathToRegexpOptions.sensitive = route.caseSensitive;
  }
  // 路由记录 对象
  const record = {
    path: normalizedPath,
    regex: compileRouteRegex(normalizedPath, pathToRegexpOptions),
    // 若非命名视图组件，则设为默认视图组件
    components: route.components || { default: route.component },
    instances: {},
    name,
    parent,
    matchAs, // alias 匹配的路由记录 path 为别名，需根据 matchAs 匹配
    redirect: route.redirect,
    beforeEnter: route.beforeEnter,
    meta: route.meta || {},
    props: route.props == null
      ? {}
      : route.components
        ? route.props
        : { default: route.props }
  };

  if (route.children) {
    // 如果是命名路由，没有重定向，并且有默认子路由，则发出警告。
    // 如果用户通过 name 导航路由跳转则默认子路由将不会渲染
    // https://github.com/vuejs/vue-router/issues/629
    {
      if (route.name && !route.redirect && route.children.some(child => /^\/?$/.test(child.path))) {
        warn(
          false,
          `Named Route '${route.name}' has a default child route. ` +
          `When navigating to this named route (:to="{name: '${route.name}'"), ` +
          `the default child route will not be rendered. Remove the name from ` +
          `this route and use the name of the default child route for named ` +
          `links instead.`
        );
      }
    }
    // 递归路由配置的 children 属性，添加路由记录
    route.children.forEach(child => {
      // 别名匹配时真正的 path 为 matchAs
      const childMatchAs = matchAs
        ? cleanPath(`${matchAs}/${child.path}`)
        : undefined;
      addRouteRecord(pathList, pathMap, nameMap, child, record, childMatchAs)
    });
  }

  // 处理别名 alias 逻辑 增加对应的 记录
  if (route.alias !== undefined) {
    const aliases = Array.isArray(route.alias)
      ? route.alias
      : [route.alias];

    aliases.forEach(alias => {
      const aliasRoute = {
        path: alias,
        children: route.children
      };
      addRouteRecord(
        pathList,
        pathMap,
        nameMap,
        aliasRoute,
        parent,
        record.path || '/' // matchAs
      );
    });
  }
  // 更新 path map
  if (!pathMap[record.path]) {
    pathList.push(record.path);
    pathMap[record.path] = record;
  }
  // 命名路由添加记录
  if (name) {
    if (!nameMap[name]) {
      nameMap[name] = record;
    } else if ("development" !== 'production' && !matchAs) {
      warn(
        false,
        `Duplicate named routes definition: ` +
        `{ name: "${name}", path: "${record.path}" }`
      );
    }
  }
}

function compileRouteRegex (path, pathToRegexpOptions) {
  const regex = pathToRegexp_1(path, [], pathToRegexpOptions);
  {
    const keys = Object.create(null);
    regex.keys.forEach(key => {
      warn(!keys[key.name], `Duplicate param keys in route with path: "${path}"`);
      keys[key.name] = true;
    });
  }
  return regex
}

function normalizePath (path, parent, strict) {
  if (!strict) path = path.replace(/\/$/, '');
  if (path[0] === '/') return path
  if (parent == null) return path
  return cleanPath(`${parent.path}/${path}`)
}

/*  */

function normalizeLocation (
  raw,
  current,
  append,
  router
) {
  let next = typeof raw === 'string' ? { path: raw } : raw;
  // named target
  if (next._normalized) {
    return next
  } else if (next.name) {
    return extend({}, raw)
  }

  // relative params
  if (!next.path && next.params && current) {
    next = extend({}, next);
    next._normalized = true;
    const params = extend(extend({}, current.params), next.params);
    if (current.name) {
      next.name = current.name;
      next.params = params;
    } else if (current.matched.length) {
      const rawPath = current.matched[current.matched.length - 1].path;
      next.path = fillParams(rawPath, params, `path ${current.path}`);
    } else {
      warn(false, `relative params navigation requires a current route.`);
    }
    return next
  }

  const parsedPath = parsePath(next.path || '');
  const basePath = (current && current.path) || '/';
  const path = parsedPath.path
    ? resolvePath(parsedPath.path, basePath, append || next.append)
    : basePath;

  const query = resolveQuery(
    parsedPath.query,
    next.query,
    router && router.options.parseQuery
  );

  let hash = next.hash || parsedPath.hash;
  if (hash && hash.charAt(0) !== '#') {
    hash = `#${hash}`;
  }

  return {
    _normalized: true,
    path,
    query,
    hash
  }
}

/*  */

function createMatcher (
  routes,
  router
) {
  console.log("------src/create-matcher.js")
  console.log("------createMatcher ：根据路由配置调用 createRouteMap 方法建立映射表，并return了 匹配路由记录 match 及 添加路由记录 addRoutes 两个方法")
  // 创建路由映射表
  console.log("------createMatcher 调用 createRouteMap 【start】------")
  const { pathList, pathMap, nameMap } = createRouteMap(routes);
  console.log("------ createMatcher 调用 createRouteMap 【end】------")

  // 添加路由记录
  function addRoutes (routes) {
    console.log("addRoutes start!!!")
    createRouteMap(routes, pathList, pathMap, nameMap);
    console.log("addRoutes end!!!")
  }

  // 路由匹配
  function match (
    raw,
    currentRoute,
    redirectedFrom
  ) {
    // 序列化 url
    // 比如 /abc?foo=bar&baz=qux#hello 序列化后
    // path: '/abc'
    // hash: '#hello'
    // params: { foo: 'bar', baz: 'qux' }
    console.log('match start!!!')
    const location = normalizeLocation(raw, currentRoute, false, router);
    const { name } = location;

    if (name) {
      // 命名路由处理
      const record = nameMap[name];
      {
        warn(record, `Route with name '${name}' does not exist`);
      }
      if (!record) return _createRoute(null, location)
      const paramNames = record.regex.keys
        .filter(key => !key.optional)
        .map(key => key.name);

      if (typeof location.params !== 'object') {
        location.params = {};
      }

      if (currentRoute && typeof currentRoute.params === 'object') {
        for (const key in currentRoute.params) {
          if (!(key in location.params) && paramNames.indexOf(key) > -1) {
            location.params[key] = currentRoute.params[key];
          }
        }
      }
      // 合并 location 及 record 的数据并返回一个新的路由对象
      if (record) {
        location.path = fillParams(record.path, location.params, `named route "${name}"`);
        return _createRoute(record, location, redirectedFrom)
      }
    } else if (location.path) {
      location.params = {};
      for (let i = 0; i < pathList.length; i++) {
        const path = pathList[i];
        const record = pathMap[path];
        // 合并 location 及 record 的数据并返回一个新的路由对象
        if (matchRoute(record.regex, location.path, location.params)) {
          return _createRoute(record, location, redirectedFrom)
        }
      }
    }
    // 没有匹配到路由记录则返回一个空的路由对象
    console.log('match end!!!')
    return _createRoute(null, location)
  }

  function redirect (
    record,
    location
  ) {
    const originalRedirect = record.redirect;
    let redirect = typeof originalRedirect === 'function'
      ? originalRedirect(createRoute(record, location, null, router))
      : originalRedirect;

    if (typeof redirect === 'string') {
      redirect = { path: redirect };
    }

    if (!redirect || typeof redirect !== 'object') {
      {
        warn(
          false, `invalid redirect option: ${JSON.stringify(redirect)}`
        );
      }
      return _createRoute(null, location)
    }

    const re = redirect;
    const { name, path } = re;
    let { query, hash, params } = location;
    query = re.hasOwnProperty('query') ? re.query : query;
    hash = re.hasOwnProperty('hash') ? re.hash : hash;
    params = re.hasOwnProperty('params') ? re.params : params;

    if (name) {
      // resolved named direct
      const targetRecord = nameMap[name];
      {
        assert(targetRecord, `redirect failed: named route "${name}" not found.`);
      }
      return match({
        _normalized: true,
        name,
        query,
        hash,
        params
      }, undefined, location)
    } else if (path) {
      // 1. resolve relative redirect
      const rawPath = resolveRecordPath(path, record);
      // 2. resolve params
      const resolvedPath = fillParams(rawPath, params, `redirect route with path "${rawPath}"`);
      // 3. rematch with existing query and hash
      return match({
        _normalized: true,
        path: resolvedPath,
        query,
        hash
      }, undefined, location)
    } else {
      {
        warn(false, `invalid redirect option: ${JSON.stringify(redirect)}`);
      }
      return _createRoute(null, location)
    }
  }

  function alias (
    record,
    location,
    matchAs
  ) {
    const aliasedPath = fillParams(matchAs, location.params, `aliased route with path "${matchAs}"`);
    const aliasedMatch = match({
      _normalized: true,
      path: aliasedPath
    });
    if (aliasedMatch) {
      const matched = aliasedMatch.matched;
      const aliasedRecord = matched[matched.length - 1];
      location.params = aliasedMatch.params;
      return _createRoute(aliasedRecord, location)
    }
    return _createRoute(null, location)
  }
  // 根据条件创建不同的路由
  function _createRoute (
    record,
    location,
    redirectedFrom
  ) {
    if (record && record.redirect) {
      return redirect(record, redirectedFrom || location)
    }
    if (record && record.matchAs) {
      return alias(record, location, record.matchAs)
    }
    return createRoute(record, location, redirectedFrom, router)
  }

  return {
    match,
    addRoutes
  }
}

function matchRoute (
  regex,
  path,
  params
) {
  const m = path.match(regex);

  if (!m) {
    return false
  } else if (!params) {
    return true
  }

  for (let i = 1, len = m.length; i < len; ++i) {
    const key = regex.keys[i - 1];
    const val = typeof m[i] === 'string' ? decodeURIComponent(m[i]) : m[i];
    if (key) {
      // Fix #1994: using * with props: true generates a param named 0
      params[key.name || 'pathMatch'] = val;
    }
  }

  return true
}

function resolveRecordPath (path, record) {
  return resolvePath(path, record.parent ? record.parent.path : '/', true)
}

/*  */

const positionStore = Object.create(null);

function setupScroll () {
  // Fix for #1585 for Firefox
  // Fix for #2195 Add optional third attribute to workaround a bug in safari https://bugs.webkit.org/show_bug.cgi?id=182678
  window.history.replaceState({ key: getStateKey() }, '', window.location.href.replace(window.location.origin, ''));
  window.addEventListener('popstate', e => {
    saveScrollPosition();
    if (e.state && e.state.key) {
      setStateKey(e.state.key);
    }
  });
}

function handleScroll (
  router,
  to,
  from,
  isPop
) {
  if (!router.app) {
    return
  }

  const behavior = router.options.scrollBehavior;
  if (!behavior) {
    return
  }

  {
    assert(typeof behavior === 'function', `scrollBehavior must be a function`);
  }

  // wait until re-render finishes before scrolling
  router.app.$nextTick(() => {
    const position = getScrollPosition();
    const shouldScroll = behavior.call(router, to, from, isPop ? position : null);

    if (!shouldScroll) {
      return
    }

    if (typeof shouldScroll.then === 'function') {
      shouldScroll.then(shouldScroll => {
        scrollToPosition((shouldScroll), position);
      }).catch(err => {
        {
          assert(false, err.toString());
        }
      });
    } else {
      scrollToPosition(shouldScroll, position);
    }
  });
}

function saveScrollPosition () {
  const key = getStateKey();
  if (key) {
    positionStore[key] = {
      x: window.pageXOffset,
      y: window.pageYOffset
    };
  }
}

function getScrollPosition () {
  const key = getStateKey();
  if (key) {
    return positionStore[key]
  }
}

function getElementPosition (el, offset) {
  const docEl = document.documentElement;
  const docRect = docEl.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return {
    x: elRect.left - docRect.left - offset.x,
    y: elRect.top - docRect.top - offset.y
  }
}

function isValidPosition (obj) {
  return isNumber(obj.x) || isNumber(obj.y)
}

function normalizePosition (obj) {
  return {
    x: isNumber(obj.x) ? obj.x : window.pageXOffset,
    y: isNumber(obj.y) ? obj.y : window.pageYOffset
  }
}

function normalizeOffset (obj) {
  return {
    x: isNumber(obj.x) ? obj.x : 0,
    y: isNumber(obj.y) ? obj.y : 0
  }
}

function isNumber (v) {
  return typeof v === 'number'
}

function scrollToPosition (shouldScroll, position) {
  const isObject = typeof shouldScroll === 'object';
  if (isObject && typeof shouldScroll.selector === 'string') {
    const el = document.querySelector(shouldScroll.selector);
    if (el) {
      let offset = shouldScroll.offset && typeof shouldScroll.offset === 'object' ? shouldScroll.offset : {};
      offset = normalizeOffset(offset);
      position = getElementPosition(el, offset);
    } else if (isValidPosition(shouldScroll)) {
      position = normalizePosition(shouldScroll);
    }
  } else if (isObject && isValidPosition(shouldScroll)) {
    position = normalizePosition(shouldScroll);
  }

  if (position) {
    window.scrollTo(position.x, position.y);
  }
}

/*  */

const supportsPushState = inBrowser && (function () {
  const ua = window.navigator.userAgent;

  if (
    (ua.indexOf('Android 2.') !== -1 || ua.indexOf('Android 4.0') !== -1) &&
    ua.indexOf('Mobile Safari') !== -1 &&
    ua.indexOf('Chrome') === -1 &&
    ua.indexOf('Windows Phone') === -1
  ) {
    return false
  }

  return window.history && 'pushState' in window.history
})();

// use User Timing api (if present) for more accurate key precision
const Time = inBrowser && window.performance && window.performance.now
  ? window.performance
  : Date;

let _key = genKey();

function genKey () {
  return Time.now().toFixed(3)
}

function getStateKey () {
  return _key
}

function setStateKey (key) {
  _key = key;
}

function pushState (url, replace) {
  saveScrollPosition();
  // try...catch the pushState call to get around Safari
  // DOM Exception 18 where it limits to 100 pushState calls
  const history = window.history;
  try {
    if (replace) {
      history.replaceState({ key: _key }, '', url);
    } else {
      _key = genKey();
      history.pushState({ key: _key }, '', url);
    }
  } catch (e) {
    window.location[replace ? 'replace' : 'assign'](url);
  }
}

function replaceState (url) {
  pushState(url, true);
}

/*  */

function runQueue (queue, fn, cb) {
  const step = index => {
    if (index >= queue.length) {
      cb();
    } else {
      if (queue[index]) {
        fn(queue[index], () => {
          step(index + 1);
        });
      } else {
        step(index + 1);
      }
    }
  };
  step(0);
}

/*  */

function resolveAsyncComponents (matched) {
  return (to, from, next) => {
    let hasAsync = false;
    let pending = 0;
    let error = null;

    flatMapComponents(matched, (def, _, match, key) => {
      // if it's a function and doesn't have cid attached,
      // assume it's an async component resolve function.
      // we are not using Vue's default async resolving mechanism because
      // we want to halt the navigation until the incoming component has been
      // resolved.
      if (typeof def === 'function' && def.cid === undefined) {
        hasAsync = true;
        pending++;

        const resolve = once(resolvedDef => {
          if (isESModule(resolvedDef)) {
            resolvedDef = resolvedDef.default;
          }
          // save resolved on async factory in case it's used elsewhere
          def.resolved = typeof resolvedDef === 'function'
            ? resolvedDef
            : _Vue.extend(resolvedDef);
          match.components[key] = resolvedDef;
          pending--;
          if (pending <= 0) {
            next(to);
          }
        });

        const reject = once(reason => {
          const msg = `Failed to resolve async component ${key}: ${reason}`;
          "development" !== 'production' && warn(false, msg);
          if (!error) {
            error = isError(reason)
              ? reason
              : new Error(msg);
            next(error);
          }
        });

        let res;
        try {
          res = def(resolve, reject);
        } catch (e) {
          reject(e);
        }
        if (res) {
          if (typeof res.then === 'function') {
            res.then(resolve, reject);
          } else {
            // new syntax in Vue 2.3
            const comp = res.component;
            if (comp && typeof comp.then === 'function') {
              comp.then(resolve, reject);
            }
          }
        }
      }
    });

    if (!hasAsync) next();
  }
}

function flatMapComponents (
  matched,
  fn
) {
  return flatten(matched.map(m => {
    return Object.keys(m.components).map(key => fn(
      m.components[key],
      m.instances[key],
      m, key
    ))
  }))
}

function flatten (arr) {
  return Array.prototype.concat.apply([], arr)
}

const hasSymbol =
  typeof Symbol === 'function' &&
  typeof Symbol.toStringTag === 'symbol';

function isESModule (obj) {
  return obj.__esModule || (hasSymbol && obj[Symbol.toStringTag] === 'Module')
}

// in Webpack 2, require.ensure now also returns a Promise
// so the resolve/reject functions may get called an extra time
// if the user uses an arrow function shorthand that happens to
// return that Promise.
function once (fn) {
  let called = false;
  return function (...args) {
    if (called) return
    called = true;
    return fn.apply(this, args)
  }
}

/*  */

class History {
  // implemented by sub-classes
  constructor (router, base) {
    debugger
    this.router = router;
    this.base = normalizeBase(base);
    // start with a route object that stands for "nowhere"
    this.current = START;
    this.pending = null;
    this.ready = false;
    this.readyCbs = [];
    this.readyErrorCbs = [];
    this.errorCbs = [];
  }

  listen (cb) {
    this.cb = cb;
  }

  onReady (cb, errorCb) {
    if (this.ready) {
      cb();
    } else {
      this.readyCbs.push(cb);
      if (errorCb) {
        this.readyErrorCbs.push(errorCb);
      }
    }
  }

  onError (errorCb) {
    this.errorCbs.push(errorCb);
  }

  // 切换路由，在 VueRouter 初始化及监听路由改变时会触发
  transitionTo (location, onComplete, onAbort) {
    // 获取匹配的路由信息
    const route = this.router.match(location, this.current);
    // 确认切换路由
    this.confirmTransition(route, () => {
      // 以下为切换路由成功或失败的回调
      // 更新路由信息，对组件的 _route 属性进行赋值，触发组件渲染
      // 调用 afterHooks 中的钩子函数
      this.updateRoute(route);
      // 添加 hashchange 监听
      onComplete && onComplete(route);
      // 更新 URL
      this.ensureURL();

      // 只执行一次 ready 回调
      if (!this.ready) {
        this.ready = true;
        this.readyCbs.forEach(cb => { cb(route); });
      }
    }, err => {
      if (onAbort) {
        onAbort(err);
      }
      if (err && !this.ready) {
        this.ready = true;
        this.readyErrorCbs.forEach(cb => { cb(err); });
      }
    });
  }


  // 确认切换路由
  confirmTransition (route, onComplete, onAbort) {
    const current = this.current;
    // 中断跳转路由函数
    const abort = err => {
      if (isError(err)) {
        if (this.errorCbs.length) {
          this.errorCbs.forEach(cb => { cb(err); });
        } else {
          warn(false, 'uncaught error during route navigation:');
          console.error(err);
        }
      }
      onAbort && onAbort(err);
    };
    // 如果是相同的路由就不跳转
    if (
      isSameRoute(route, current) &&
      // in the case the route map has been dynamically appended to
      route.matched.length === current.matched.length
    ) {
      this.ensureURL();
      return abort()
    }

    // 通过对比路由解析出可复用的组件，需要渲染的组件，失活的组件
    const {
      updated,
      deactivated,
      activated
    } = resolveQueue(this.current.matched, route.matched);

    // 导航守卫数组
    const queue = [].concat(
      // 失活的组件钩子
      extractLeaveGuards(deactivated),
      // 全局 beforeEach 钩子
      this.router.beforeHooks,
      // 在当前路由改变，但是该组件被复用时调用
      extractUpdateHooks(updated),
      // 需要渲染组件 enter 守卫钩子
      activated.map(m => m.beforeEnter),
      // 解析异步路由组件
      resolveAsyncComponents(activated)
    );

    // 保存路由
    this.pending = route;
    // 迭代器，用于执行 queue 中的导航守卫钩子
    const iterator = (hook, next) => {
      // 路由不相等就不跳转路由
      if (this.pending !== route) {
        return abort()
      }
      try {
        // 执行钩子
        hook(route, current, (to) => {
          // 只有执行了钩子函数中的 next，才会继续执行下一个钩子函数
          // 否则会暂停跳转
          // 以下逻辑是在判断 next() 中的传参
          if (to === false || isError(to)) {
            // next(false) -> abort navigation, ensure current URL
            this.ensureURL(true);
            abort(to);
          } else if (
            typeof to === 'string' ||
            (typeof to === 'object' && (
              typeof to.path === 'string' ||
              typeof to.name === 'string'
            ))
          ) {
            // next('/') 或者 next({ path: '/' }) -> 重定向
            abort();
            if (typeof to === 'object' && to.replace) {
              this.replace(to);
            } else {
              this.push(to);
            }
          } else {
            // 这里执行 next
            // 也就是执行下面函数 runQueue 中的 step(index + 1)
            // confirm transition and pass on the value
            next(to);
          }
        });
      } catch (e) {
        abort(e);
      }
    };

    // 同步执行异步函数
    runQueue(queue, iterator, () => {
      const postEnterCbs = [];
      const isValid = () => this.current === route;
      // 当所有异步组件加载完成后，会执行这里的回调，也就是 runQueue 中的 cb()
      // 接下来执行 需要渲染组件的导航守卫钩子
      const enterGuards = extractEnterGuards(activated, postEnterCbs, isValid);
      const queue = enterGuards.concat(this.router.resolveHooks);
      // 队列中的函数都执行完毕，就执行回调函数
      runQueue(queue, iterator, () => {
        // 跳转完成
        if (this.pending !== route) {
          return abort()
        }
        this.pending = null;
        onComplete(route);
        if (this.router.app) {
          this.router.app.$nextTick(() => {
            postEnterCbs.forEach(cb => { cb(); });
          });
        }
      });
    });
  }

  updateRoute (route) {
    const prev = this.current;
    this.current = route;
    this.cb && this.cb(route);
    this.router.afterHooks.forEach(hook => {
      hook && hook(route, prev);
    });
  }
}

function normalizeBase (base) {
  if (!base) {
    if (inBrowser) {
      // respect <base> tag
      const baseEl = document.querySelector('base');
      base = (baseEl && baseEl.getAttribute('href')) || '/';
      // strip full URL origin
      base = base.replace(/^https?:\/\/[^\/]+/, '');
    } else {
      base = '/';
    }
  }
  // make sure there's the starting slash
  if (base.charAt(0) !== '/') {
    base = '/' + base;
  }
  // remove trailing slash
  return base.replace(/\/$/, '')
}


function resolveQueue (
  current,
  next
) {
  let i;
  const max = Math.max(current.length, next.length);
  for (i = 0; i < max; i++) {
    if (current[i] !== next[i]) {
      break
    }
  }
  return {
    updated: next.slice(0, i),
    activated: next.slice(i),
    deactivated: current.slice(i)
  }
}

function extractGuards (
  records,
  name,
  bind,
  reverse
) {
  const guards = flatMapComponents(records, (def, instance, match, key) => {
    const guard = extractGuard(def, name);
    if (guard) {
      return Array.isArray(guard)
        ? guard.map(guard => bind(guard, instance, match, key))
        : bind(guard, instance, match, key)
    }
  });
  return flatten(reverse ? guards.reverse() : guards)
}

function extractGuard (
  def,
  key
) {
  if (typeof def !== 'function') {
    // extend now so that global mixins are applied.
    def = _Vue.extend(def);
  }
  return def.options[key]
}

function extractLeaveGuards (deactivated) {
  return extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true)
}

function extractUpdateHooks (updated) {
  return extractGuards(updated, 'beforeRouteUpdate', bindGuard)
}

function bindGuard (guard, instance) {
  if (instance) {
    return function boundRouteGuard () {
      return guard.apply(instance, arguments)
    }
  }
}

function extractEnterGuards (
  activated,
  cbs,
  isValid
) {
  return extractGuards(activated, 'beforeRouteEnter', (guard, _, match, key) => {
    return bindEnterGuard(guard, match, key, cbs, isValid)
  })
}

function bindEnterGuard (
  guard,
  match,
  key,
  cbs,
  isValid
) {
  return function routeEnterGuard (to, from, next) {
    return guard(to, from, cb => {
      next(cb);
      if (typeof cb === 'function') {
        cbs.push(() => {
          // #750
          // if a router-view is wrapped with an out-in transition,
          // the instance may not have been registered at this time.
          // we will need to poll for registration until current route
          // is no longer valid.
          poll(cb, match.instances, key, isValid);
        });
      }
    })
  }
}

function poll (
  cb, // somehow flow cannot infer this is a function
  instances,
  key,
  isValid
) {
  if (
    instances[key] &&
    !instances[key]._isBeingDestroyed // do not reuse being destroyed instance
  ) {
    cb(instances[key]);
  } else if (isValid()) {
    setTimeout(() => {
      poll(cb, instances, key, isValid);
    }, 16);
  }
}

/*  */

class HTML5History extends History {
  constructor (router, base) {
    super(router, base);

    const expectScroll = router.options.scrollBehavior;
    const supportsScroll = supportsPushState && expectScroll;

    if (supportsScroll) {
      setupScroll();
    }

    const initLocation = getLocation(this.base);
    window.addEventListener('popstate', e => {
      const current = this.current;

      // Avoiding first `popstate` event dispatched in some browsers but first
      // history route not updated since async guard at the same time.
      const location = getLocation(this.base);
      if (this.current === START && location === initLocation) {
        return
      }

      this.transitionTo(location, route => {
        if (supportsScroll) {
          handleScroll(router, route, current, true);
        }
      });
    });
  }

  go (n) {
    window.history.go(n);
  }

  push (location, onComplete, onAbort) {
    const { current: fromRoute } = this;
    this.transitionTo(location, route => {
      pushState(cleanPath(this.base + route.fullPath));
      handleScroll(this.router, route, fromRoute, false);
      onComplete && onComplete(route);
    }, onAbort);
  }

  replace (location, onComplete, onAbort) {
    const { current: fromRoute } = this;
    this.transitionTo(location, route => {
      replaceState(cleanPath(this.base + route.fullPath));
      handleScroll(this.router, route, fromRoute, false);
      onComplete && onComplete(route);
    }, onAbort);
  }

  ensureURL (push) {
    if (getLocation(this.base) !== this.current.fullPath) {
      const current = cleanPath(this.base + this.current.fullPath);
      push ? pushState(current) : replaceState(current);
    }
  }

  getCurrentLocation () {
    return getLocation(this.base)
  }
}

function getLocation (base) {
  let path = decodeURI(window.location.pathname);
  if (base && path.indexOf(base) === 0) {
    path = path.slice(base.length);
  }
  return (path || '/') + window.location.search + window.location.hash
}

/*  */

class HashHistory extends History {
  constructor (router, base, fallback) {
    super(router, base);
    // check history fallback deeplinking
    if (fallback && checkFallback(this.base)) {
      return
    }
    ensureSlash();
  }

  // this is delayed until the app mounts
  // to avoid the hashchange listener being fired too early
  setupListeners () {
    const router = this.router;
    const expectScroll = router.options.scrollBehavior;
    const supportsScroll = supportsPushState && expectScroll;

    if (supportsScroll) {
      setupScroll();
    }

    window.addEventListener(supportsPushState ? 'popstate' : 'hashchange', () => {
      const current = this.current;
      if (!ensureSlash()) {
        return
      }
      this.transitionTo(getHash(), route => {
        if (supportsScroll) {
          handleScroll(this.router, route, current, true);
        }
        if (!supportsPushState) {
          replaceHash(route.fullPath);
        }
      });
    });
  }

  push (location, onComplete, onAbort) {
    const { current: fromRoute } = this;
    this.transitionTo(location, route => {
      pushHash(route.fullPath);
      handleScroll(this.router, route, fromRoute, false);
      onComplete && onComplete(route);
    }, onAbort);
  }

  replace (location, onComplete, onAbort) {
    const { current: fromRoute } = this;
    this.transitionTo(location, route => {
      replaceHash(route.fullPath);
      handleScroll(this.router, route, fromRoute, false);
      onComplete && onComplete(route);
    }, onAbort);
  }

  go (n) {
    window.history.go(n);
  }

  ensureURL (push) {
    const current = this.current.fullPath;
    if (getHash() !== current) {
      push ? pushHash(current) : replaceHash(current);
    }
  }

  getCurrentLocation () {
    return getHash()
  }
}

function checkFallback (base) {
  const location = getLocation(base);
  if (!/^\/#/.test(location)) {
    window.location.replace(
      cleanPath(base + '/#' + location)
    );
    return true
  }
}

function ensureSlash () {
  const path = getHash();
  if (path.charAt(0) === '/') {
    return true
  }
  replaceHash('/' + path);
  return false
}

function getHash () {
  // We can't use window.location.hash here because it's not
  // consistent across browsers - Firefox will pre-decode it!
  let href = window.location.href;
  const index = href.indexOf('#');
  // empty path
  if (index < 0) return ''

  href = href.slice(index + 1);
  // decode the hash but not the search or hash
  // as search(query) is already decoded
  // https://github.com/vuejs/vue-router/issues/2708
  const searchIndex = href.indexOf('?');
  if (searchIndex < 0) {
    const hashIndex = href.indexOf('#');
    if (hashIndex > -1) href = decodeURI(href.slice(0, hashIndex)) + href.slice(hashIndex);
    else href = decodeURI(href);
  } else {
    if (searchIndex > -1) href = decodeURI(href.slice(0, searchIndex)) + href.slice(searchIndex);
  }

  return href
}

function getUrl (path) {
  const href = window.location.href;
  const i = href.indexOf('#');
  const base = i >= 0 ? href.slice(0, i) : href;
  return `${base}#${path}`
}

function pushHash (path) {
  if (supportsPushState) {
    pushState(getUrl(path));
  } else {
    window.location.hash = path;
  }
}

function replaceHash (path) {
  if (supportsPushState) {
    replaceState(getUrl(path));
  } else {
    window.location.replace(getUrl(path));
  }
}

/*  */

class AbstractHistory extends History {
  
  

  constructor (router, base) {
    super(router, base);
    this.stack = [];
    this.index = -1;
  }

  push (location, onComplete, onAbort) {
    this.transitionTo(location, route => {
      this.stack = this.stack.slice(0, this.index + 1).concat(route);
      this.index++;
      onComplete && onComplete(route);
    }, onAbort);
  }

  replace (location, onComplete, onAbort) {
    this.transitionTo(location, route => {
      this.stack = this.stack.slice(0, this.index).concat(route);
      onComplete && onComplete(route);
    }, onAbort);
  }

  go (n) {
    const targetIndex = this.index + n;
    if (targetIndex < 0 || targetIndex >= this.stack.length) {
      return
    }
    const route = this.stack[targetIndex];
    this.confirmTransition(route, () => {
      this.index = targetIndex;
      this.updateRoute(route);
    });
  }

  getCurrentLocation () {
    const current = this.stack[this.stack.length - 1];
    return current ? current.fullPath : '/'
  }

  ensureURL () {
    // noop
  }
}

/*  */



class VueRouter {
  // 构造函数 用于处理实例化时传入的参数
  constructor (options = {}) {
    this.app = null; // 根据组件实例，在 init 中获取并赋值
    this.apps = []; // 保存多个根组件实例，在 init 中被添加
    this.options = options; // 传入配置项参数
    this.beforeHooks = []; // 初始化全局前置守卫
    this.resolveHooks = []; // 初始化全局解析守卫
    this.afterHooks = []; // 初始化全局后置钩子
    // 创建 match 匹配函数
    console.log("src/index.js")
    console.log("VueRouter constructor: 定义类的静态属性及方法")
    console.log("1、【start】constructor 中定义 静态方法 this.matcher：this.matcher = createMatcher(routes)")
    this.matcher = createMatcher(options.routes || [], this);
    console.log("1、【end】constructor 中定义 静态方法 this.matcher：this.matcher = createMatcher(routes)")
    console.log('this.matcher')
    console.log(this.matcher)

    let mode = options.mode || 'hash'; // 默认 hash 模式
    // history 浏览器环境不支持时向下兼容使用 hash 模式
    this.fallback = mode === 'history' && !supportsPushState && options.fallback !== false;
    if (this.fallback) {
      mode = 'hash';
    }
    // 非浏览器环境强制使用 abstract 模式
    if (!inBrowser) {
      mode = 'abstract';
    }
    this.mode = mode;
    // 根据不同模式生成 history 实例
    switch (mode) {
      case 'history':
        this.history = new HTML5History(this, options.base);
        break
      case 'hash':
        this.history = new HashHistory(this, options.base, this.fallback);
        break
      case 'abstract':
        this.history = new AbstractHistory(this, options.base);
        break
      default:
        {
          assert(false, `invalid mode: ${mode}`);
        }
    }
  }

  // 获取到路由路径对应的组件实例
  match (
    raw,
    current,
    redirectedFrom
  ) {
    console.log("src/index.js")
    console.log("VueRouter 类里的 match函数: 获取到路由路径对应的组件实例，return this.matcher.match(…) ")
    return this.matcher.match(raw, current, redirectedFrom)
  }

  // 返回 history.current 当前路由路径
  get currentRoute () {
    return this.history && this.history.current
  }

  // 传入根组件实例
  init (app /* Vue component instance */) {
    // 非生产环境进行未安装路由的断言报错提示
    "development" !== 'production' && assert(
      install.installed,
      `not installed. Make sure to call \`Vue.use(VueRouter)\` ` +
      `before creating root instance.`
    );
    debugger
    console.log("src/index.js")
    console.log('VueRouter 类里的 init 函数: 初始化路由相关逻辑')
    // 保存该根组件实例
    this.apps.push(app);

    // 设置 app 销毁程序
    // https://github.com/vuejs/vue-router/issues/2639
    app.$once('hook:destroyed', () => {
      // 当销毁时，将 app 从 this.apps 数组中清除，防止内存溢出
      const index = this.apps.indexOf(app);
      if (index > -1) this.apps.splice(index, 1);
      // ensure we still have a main app or null if no apps
      // we do not release the router so it can be reused
      if (this.app === app) this.app = this.apps[0] || null
    });

    // app 已初始化则直接返回
    if (this.app) {
      return
    }

    this.app = app;

    // 跳转到当前路由
    const history = this.history;

    if (history instanceof HTML5History) {
      history.transitionTo(history.getCurrentLocation());
    } else if (history instanceof HashHistory) {
      const setupHashListener = () => {
        history.setupListeners();
      };
      history.transitionTo(
        history.getCurrentLocation(),
        setupHashListener,
        setupHashListener
      );
    }
    // 设置路由监听，路由改变时改变 _route 属性，表示当前路由
    // 该属性在 install.js 中与 history.current 定义为响应式属性

    history.listen(route => {
      console.log('history.listen: 设置路由监听')
      this.apps.forEach((app) => {
        console.log('定义响应式的 _route 对象')
        app._route = route;
      });
    });
  }

  // 注册一些全局钩子函数
  // 全局前置守卫
  beforeEach (fn) {
    return registerHook(this.beforeHooks, fn)
  }
  // 全局解析守卫
  beforeResolve (fn) {
    return registerHook(this.resolveHooks, fn)
  }
  // 全局后置钩子
  afterEach (fn) {
    return registerHook(this.afterHooks, fn)
  }
  // 路由完成初始导航时调用
  onReady (cb, errorCb) {
    this.history.onReady(cb, errorCb);
  }
  // 路由导航过程中出错时被调用
  onError (errorCb) {
    this.history.onError(errorCb);
  }
  // 注册一些 history 导航函数
  push (location, onComplete, onAbort) {
    this.history.push(location, onComplete, onAbort);
  }

  replace (location, onComplete, onAbort) {
    this.history.replace(location, onComplete, onAbort);
  }

  go (n) {
    this.history.go(n);
  }

  back () {
    this.go(-1);
  }

  forward () {
    this.go(1);
  }
  // 获取路由对应的组件
  getMatchedComponents (to) {
    const route = to
      ? to.matched
        ? to
        : this.resolve(to).route
      : this.currentRoute;
    if (!route) {
      return []
    }
    return [].concat.apply([], route.matched.map(m => {
      return Object.keys(m.components).map(key => {
        return m.components[key]
      })
    }))
  }
  // 解析路由表
  resolve (
    to,
    current,
    append
  ) {
    current = current || this.history.current;
    const location = normalizeLocation(
      to,
      current,
      append,
      this
    );
    const route = this.match(location, current);
    const fullPath = route.redirectedFrom || route.fullPath;
    const base = this.history.base;
    const href = createHref(base, fullPath, this.mode);
    return {
      location,
      route,
      href,
      // for backwards compat
      normalizedTo: location,
      resolved: route
    }
  }
  // 添加路由表  并自动跳转到首页
  addRoutes (routes) {
    this.matcher.addRoutes(routes);
    if (this.history.current !== START) {
      this.history.transitionTo(this.history.getCurrentLocation());
    }
  }
}

// 注册钩子函数，push 存入数组
function registerHook (list, fn) {
  list.push(fn);
  return () => {
    const i = list.indexOf(fn);
    if (i > -1) list.splice(i, 1);
  }
}
// 根据模式（hash / history）拼接 location.href
function createHref (base, fullPath, mode) {
  var path = mode === 'hash' ? '#' + fullPath : fullPath;
  return base ? cleanPath(base + '/' + path) : path
}
// 挂载静态属性及方法
VueRouter.install = install;
console.log('src/index.js')
console.log('VueRouter.install = install ： 为插件对象增加 install 方法用来安装插件具体逻辑')
VueRouter.version = '3.0.5';
// 浏览器环境下且 window.Vue 存在则自动调用 Vue.use 注册该路由插件
if (inBrowser && window.Vue) {
  window.Vue.use(VueRouter);
}

export default VueRouter;
