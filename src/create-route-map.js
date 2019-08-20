/* @flow */

import Regexp from 'path-to-regexp'
import { cleanPath } from './util/path'
import { assert, warn } from './util/warn'

// 创建路由 map
export function createRouteMap (
  routes: Array<RouteConfig>,
  oldPathList?: Array<string>,
  oldPathMap?: Dictionary<RouteRecord>,
  oldNameMap?: Dictionary<RouteRecord>
): {
  pathList: Array<string>;
  pathMap: Dictionary<RouteRecord>;
  nameMap: Dictionary<RouteRecord>;
} {
  // pathList 用于控制路径匹配优先级
  const pathList: Array<string> = oldPathList || []
  // 根据 path 的路由映射表
  const pathMap: Dictionary<RouteRecord> = oldPathMap || Object.create(null)
  // 根据 name 的路由映射表
  const nameMap: Dictionary<RouteRecord> = oldNameMap || Object.create(null)
  // 遍历路由配置添加到 pathList pathMap nameMap 中
  routes.forEach(route => {
    addRouteRecord(pathList, pathMap, nameMap, route)
  })

  // 将通配符路由 * 取出插到末尾，确保通配符路由始终在尾部
  for (let i = 0, l = pathList.length; i < l; i++) {
    if (pathList[i] === '*') {
      pathList.push(pathList.splice(i, 1)[0])
      l--
      i--
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
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>,
  route: RouteConfig,
  parent?: RouteRecord,
  matchAs?: string
) {
  // 获取 path, name
  const { path, name } = route
  if (process.env.NODE_ENV !== 'production') {
    assert(path != null, `"path" is required in a route configuration.`)
    assert(
      typeof route.component !== 'string',
      `route config "component" for path: ${String(path || name)} cannot be a ` +
      `string id. Use an actual component instead.`
    )
  }
  // 编译正则的选项
  const pathToRegexpOptions: PathToRegexpOptions = route.pathToRegexpOptions || {}
  // 格式化 path
  // 根据 pathToRegexpOptions.strict 判断是否删除末尾斜杠 /
  // 根据是否以斜杠 / 开头判断是否需要拼接父级路由的路径
  const normalizedPath = normalizePath(
    path,
    parent,
    pathToRegexpOptions.strict // 末尾斜杠是否精确匹配 (default: false)
  )

  // 匹配规则是否大小写敏感？(默认值：false)
  // 路由配置中 caseSensitive 和 pathToRegexpOptions.sensitive 作用相同
  if (typeof route.caseSensitive === 'boolean') {
    pathToRegexpOptions.sensitive = route.caseSensitive
  }
  // 路由记录 对象
  const record: RouteRecord = {
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
  }

  if (route.children) {
    // 如果是命名路由，没有重定向，并且有默认子路由，则发出警告。
    // 如果用户通过 name 导航路由跳转则默认子路由将不会渲染
    // https://github.com/vuejs/vue-router/issues/629
    if (process.env.NODE_ENV !== 'production') {
      if (route.name && !route.redirect && route.children.some(child => /^\/?$/.test(child.path))) {
        warn(
          false,
          `Named Route '${route.name}' has a default child route. ` +
          `When navigating to this named route (:to="{name: '${route.name}'"), ` +
          `the default child route will not be rendered. Remove the name from ` +
          `this route and use the name of the default child route for named ` +
          `links instead.`
        )
      }
    }
    // 递归路由配置的 children 属性，添加路由记录
    route.children.forEach(child => {
      // 别名匹配时真正的 path 为 matchAs
      const childMatchAs = matchAs
        ? cleanPath(`${matchAs}/${child.path}`)
        : undefined
      addRouteRecord(pathList, pathMap, nameMap, child, record, childMatchAs)
    })
  }

  // 处理别名 alias 逻辑 增加对应的 记录
  if (route.alias !== undefined) {
    const aliases = Array.isArray(route.alias)
      ? route.alias
      : [route.alias]

    aliases.forEach(alias => {
      const aliasRoute = {
        path: alias,
        children: route.children
      }
      addRouteRecord(
        pathList,
        pathMap,
        nameMap,
        aliasRoute,
        parent,
        record.path || '/' // matchAs
      )
    })
  }
  // 更新 path map
  if (!pathMap[record.path]) {
    pathList.push(record.path)
    pathMap[record.path] = record
  }
  // 命名路由添加记录
  if (name) {
    if (!nameMap[name]) {
      nameMap[name] = record
    } else if (process.env.NODE_ENV !== 'production' && !matchAs) {
      warn(
        false,
        `Duplicate named routes definition: ` +
        `{ name: "${name}", path: "${record.path}" }`
      )
    }
  }
}

function compileRouteRegex (path: string, pathToRegexpOptions: PathToRegexpOptions): RouteRegExp {
  const regex = Regexp(path, [], pathToRegexpOptions)
  if (process.env.NODE_ENV !== 'production') {
    const keys: any = Object.create(null)
    regex.keys.forEach(key => {
      warn(!keys[key.name], `Duplicate param keys in route with path: "${path}"`)
      keys[key.name] = true
    })
  }
  return regex
}

function normalizePath (path: string, parent?: RouteRecord, strict?: boolean): string {
  if (!strict) path = path.replace(/\/$/, '')
  if (path[0] === '/') return path
  if (parent == null) return path
  return cleanPath(`${parent.path}/${path}`)
}
