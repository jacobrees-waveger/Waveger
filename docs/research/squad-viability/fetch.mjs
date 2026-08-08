import fs from 'node:fs'
const OUT = new URL('./data.json', import.meta.url).pathname
const CHARTS = { 'singles-chart': 7501, 'dance-singles-chart': 104, 'rock-and-metal-singles-chart': 111, 'official-hip-hop-and-r-and-b-singles-chart': 114 }
const sleep = ms => new Promise(r => setTimeout(r, ms))

function fridays(endISO, n) {
  const out = []; const d = new Date(endISO + 'T00:00:00Z')
  for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 7) }
  return out.reverse()
}
function extract(j) {
  const stack = [j]
  while (stack.length) {
    const o = stack.pop()
    if (Array.isArray(o)) { if (o.length > 5 && o.some(x => x && x.element === 'track-info')) return o; o.forEach(v => stack.push(v)) }
    else if (o && typeof o === 'object') Object.values(o).forEach(v => stack.push(v))
  }
  return null
}
const store = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {}
const weeks = fridays(process.argv[2] || '2026-07-31', +(process.argv[3] || 104))
const charts = (process.argv[4] || 'singles-chart').split(',')
let got = 0, empty = 0, fail = 0
for (const slug of charts) {
  store[slug] ??= {}
  for (const w of weeks) {
    if (store[slug][w]) continue
    const url = `https://backstage.officialcharts.com/ce-api/charts/${slug}/${w.replaceAll('-', '')}/${CHARTS[slug]}/`
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Waveger-research/0.1 (design validation)' } })
      if (!r.ok) { fail++; continue }
      const rows = extract(await r.json())
      if (!rows?.length) { empty++; store[slug][w] = []; continue }
      store[slug][w] = rows.map(e => ({ p: e.position, nid: e.nid, t: e.title, a: e.artist, aid: (e.artistUrl || '').split('/')[2] || null, aslug: (e.artistUrl || '').split('/')[3] || null, lw: e.lastWeek, pk: e.peak, wk: e.weeks, nu: !!e.new, re: !!e.reentry }))
      got++
    } catch { fail++ }
    await sleep(250)
  }
  fs.writeFileSync(OUT, JSON.stringify(store))
  console.log(`${slug}: ${Object.keys(store[slug]).length} weeks cached`)
}
console.log(`fetched=${got} empty=${empty} failed=${fail}`)
