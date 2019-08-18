import View from './components/view'
import Link from './components/link'

export let _Vue

export function install (Vue) {
  // 若已调用过则直接返回
  if (install.installed && _Vue === Vue) return
  install.installed = true
  // install 函数中将 Vue 赋值给 _Vue 
  // 可在其他模块中不用引入直接使用 Vue 对象
  _Vue = Vue

  const isDef = v => v !== undefined

  const registerInstance = (vm, callVal) => {
    let i = vm.$options._parentVnode
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      i(vm, callVal)
    }
  }
  // 每个组件混入 beforeCreate 钩子函数的实现
  Vue.mixin({
    beforeCreate () {
      // 判断是否存在 router 对象，若存在则为根实例
      if (isDef(this.$options.router)) {
        // 设置根路由
        this._routerRoot = this
        this._router = this.$options.router
        // 路由初始化
        this._router.init(this)
        // _router 属性双向绑定
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else {
        // 非根实例则通过 $parent 指向父级的 _routerRoot 属性，最终指向根实例
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      registerInstance(this, this)
    },
    destroyed () {
      registerInstance(this)
    }
  })
  // 注入 $router $route
  Object.defineProperty(Vue.prototype, '$router', {
    get () { return this._routerRoot._router }
  })

  Object.defineProperty(Vue.prototype, '$route', {
    get () { return this._routerRoot._route }
  })
  // 全局注册 router-link router-view 组件
  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
