/* @flow */

import { install } from './install'
import { START } from './util/route'
import { assert } from './util/warn'
import { inBrowser } from './util/dom'
import { cleanPath } from './util/path'
import { createMatcher } from './create-matcher'
import { normalizeLocation } from './util/location'
import { supportsPushState } from './util/push-state'

import { HashHistory } from './history/hash'
import { HTML5History } from './history/html5'
import { AbstractHistory } from './history/abstract'

import type { Matcher } from './create-matcher'

// 导出 VueRouter 类
export default class VueRouter {
  // 定义类的静态属性及方法
  // install 用于 vue 的插件机制，Vue.use 时会自动调用 install 方法
  static install: () => void;
  static version: string;

  // flow 类型定义
  app: any;
  apps: Array<any>;
  ready: boolean;
  readyCbs: Array<Function>;
  options: RouterOptions;
  mode: string;
  history: HashHistory | HTML5History | AbstractHistory;
  matcher: Matcher;
  fallback: boolean;
  beforeHooks: Array<?NavigationGuard>;
  resolveHooks: Array<?NavigationGuard>;
  afterHooks: Array<?AfterNavigationHook>;

  // 构造函数 用于处理实例化时传入的参数
  constructor (options: RouterOptions = {}) {
    this.app = null // 根组件实例，在 init 中获取并赋值
    this.apps = [] // 保存多个根组件实例，在 init 中被添加
    this.options = options // 传入配置项参数
    this.beforeHooks = [] // 初始化全局前置守卫
    this.resolveHooks = [] // 初始化全局解析守卫
    this.afterHooks = [] // 初始化全局后置钩子
    // 创建 match 匹配函数
    this.matcher = createMatcher(options.routes || [], this)

    let mode = options.mode || 'hash' // 默认 hash 模式
    // history 浏览器环境不支持时向下兼容使用 hash 模式
    this.fallback = mode === 'history' && !supportsPushState && options.fallback !== false
    if (this.fallback) {
      mode = 'hash'
    }
    // 非浏览器环境强制使用 abstract 模式
    if (!inBrowser) {
      mode = 'abstract'
    }
    this.mode = mode
    // 根据不同模式生成 history 实例
    switch (mode) {
      case 'history':
        this.history = new HTML5History(this, options.base)
        break
      case 'hash':
        this.history = new HashHistory(this, options.base, this.fallback)
        break
      case 'abstract':
        this.history = new AbstractHistory(this, options.base)
        break
      default:
        if (process.env.NODE_ENV !== 'production') {
          assert(false, `invalid mode: ${mode}`)
        }
    }
  }

  // 获取到路由路径对应的组件实例
  match (
    raw: RawLocation,
    current?: Route,
    redirectedFrom?: Location
  ): Route {
    return this.matcher.match(raw, current, redirectedFrom)
  }

  // 返回 history.current 当前路由路径
  get currentRoute (): ?Route {
    return this.history && this.history.current
  }

  // 传入根组件实例
  init (app: any /* Vue component instance */) {
    // 非生产环境进行未安装路由的断言报错提示
    process.env.NODE_ENV !== 'production' && assert(
      install.installed,
      `not installed. Make sure to call \`Vue.use(VueRouter)\` ` +
      `before creating root instance.`
    )
    // 保存该根组件实例
    this.apps.push(app)

    // 设置 app 销毁程序
    // https://github.com/vuejs/vue-router/issues/2639
    app.$once('hook:destroyed', () => {
      // 当销毁时，将 app 从 this.apps 数组中清除，防止内存溢出
      const index = this.apps.indexOf(app)
      if (index > -1) this.apps.splice(index, 1)
      // ensure we still have a main app or null if no apps
      // we do not release the router so it can be reused
      if (this.app === app) this.app = this.apps[0] || null
    })

    // app 已初始化则直接返回
    if (this.app) {
      return
    }

    this.app = app

    // 跳转到当前路由
    const history = this.history

    if (history instanceof HTML5History) {
      history.transitionTo(history.getCurrentLocation())
    } else if (history instanceof HashHistory) {
      const setupHashListener = () => {
        history.setupListeners()
      }
      history.transitionTo(
        history.getCurrentLocation(),
        setupHashListener,
        setupHashListener
      )
    }
    // 设置路由监听，路由改变时改变 _route 属性，表示当前路由
    // 该属性在 install.js 中与 history.current 定义为响应式属性
    history.listen(route => {
      this.apps.forEach((app) => {
        app._route = route
      })
    })
  }

  // 注册一些全局钩子函数
  // 全局前置守卫
  beforeEach (fn: Function): Function {
    return registerHook(this.beforeHooks, fn)
  }
  // 全局解析守卫
  beforeResolve (fn: Function): Function {
    return registerHook(this.resolveHooks, fn)
  }
  // 全局后置钩子
  afterEach (fn: Function): Function {
    return registerHook(this.afterHooks, fn)
  }
  // 路由完成初始导航时调用
  onReady (cb: Function, errorCb?: Function) {
    this.history.onReady(cb, errorCb)
  }
  // 路由导航过程中出错时被调用
  onError (errorCb: Function) {
    this.history.onError(errorCb)
  }
  // 注册一些 history 导航函数
  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    this.history.push(location, onComplete, onAbort)
  }

  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    this.history.replace(location, onComplete, onAbort)
  }

  go (n: number) {
    this.history.go(n)
  }

  back () {
    this.go(-1)
  }

  forward () {
    this.go(1)
  }
  // 获取路由对应的组件
  getMatchedComponents (to?: RawLocation | Route): Array<any> {
    const route: any = to
      ? to.matched
        ? to
        : this.resolve(to).route
      : this.currentRoute
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
    to: RawLocation,
    current?: Route,
    append?: boolean
  ): {
    location: Location,
    route: Route,
    href: string,
    // for backwards compat
    normalizedTo: Location,
    resolved: Route
  } {
    current = current || this.history.current
    const location = normalizeLocation(
      to,
      current,
      append,
      this
    )
    const route = this.match(location, current)
    const fullPath = route.redirectedFrom || route.fullPath
    const base = this.history.base
    const href = createHref(base, fullPath, this.mode)
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
  addRoutes (routes: Array<RouteConfig>) {
    this.matcher.addRoutes(routes)
    if (this.history.current !== START) {
      this.history.transitionTo(this.history.getCurrentLocation())
    }
  }
}
// 注册钩子函数，push 存入数组
function registerHook (list: Array<any>, fn: Function): Function {
  list.push(fn)
  return () => {
    const i = list.indexOf(fn)
    if (i > -1) list.splice(i, 1)
  }
}
// 根据模式（hash / history）拼接 location.href
function createHref (base: string, fullPath: string, mode) {
  var path = mode === 'hash' ? '#' + fullPath : fullPath
  return base ? cleanPath(base + '/' + path) : path
}
// 挂载静态属性及方法
VueRouter.install = install
VueRouter.version = '__VERSION__'
// 浏览器环境下且 window.Vue 存在则自动调用 Vue.use 注册该路由插件
if (inBrowser && window.Vue) {
  window.Vue.use(VueRouter)
}
