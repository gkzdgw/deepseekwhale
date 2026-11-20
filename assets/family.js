/** Adapt the shared dashboard template before it is mounted. */
export function prepareFamilyPage(page) {
  page.querySelector('.badge').innerHTML = '<i class="school-icon icon-heart" aria-hidden="true"></i>'
  const words = [
    ['次元生殖腔体','家庭档案'],['次元子宫','次元之家'],['DIMENSIONAL BIO-STATUS ARCHIVE','DIMENSIONAL HOME'],
    ['精液储存量','爱情值'],['子宫正面投影','爱心投影'],['腔体投影','爱心投影'],['生理状态','家庭状态'],
    ['腔体轮廓','爱心轮廓'],['腔体热度','家庭温度'],['欲望','想念'],['渴求','思念'],
    ['储存越满越胀','爱情值越高'],['距上次满足','距上次互动'],['上次满足','上次互动']
  ]
  const rewrite = value => words.reduce((text,[from,to]) => text.replaceAll(from,to),value)
  const nodes = page.createTreeWalker(page.body, NodeFilter.SHOW_TEXT)
  while (nodes.nextNode()) nodes.currentNode.nodeValue = rewrite(nodes.currentNode.nodeValue)
  for (const el of page.querySelectorAll('[data-tip],[aria-label],[title]')) {
    for (const attr of ['data-tip','aria-label','title']) {
      if (el.hasAttribute(attr)) el.setAttribute(attr,rewrite(el.getAttribute(attr)))
    }
  }
}
