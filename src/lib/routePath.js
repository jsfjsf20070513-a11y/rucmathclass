// 与路由匹配保持一致：忽略大小写和末尾斜线。
export const normalizeRoutePath = (pathname) => pathname.toLowerCase().replace(/\/+$/, '') || '/'
