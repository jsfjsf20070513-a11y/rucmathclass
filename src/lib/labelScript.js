// 书架标签和署名都可能是中西文混排。含中文时整条按中文标注排。
export function labelScript(...parts) {
  return /^[\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]+$/u.test(parts.join(' ')) ? 'latin' : undefined
}
