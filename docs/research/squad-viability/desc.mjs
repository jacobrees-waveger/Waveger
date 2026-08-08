import fs from 'node:fs'
const d = JSON.parse(fs.readFileSync(new URL('./data.json', import.meta.url).pathname, 'utf8'))['singles-chart']
const weeks = Object.keys(d).sort()
const all = weeks.flatMap(w => d[w].map(e => ({ ...e, w })))
console.log(`weeks=${weeks.length}  ${weeks[0]} .. ${weeks.at(-1)}  entries=${all.length}`)

// data quality
const noAid = all.filter(e => !e.aid).length
console.log(`\n-- identity --`)
console.log(`entries missing an artist id : ${noAid} (${(100*noAid/all.length).toFixed(2)}%)`)
console.log(`distinct artist ids          : ${new Set(all.map(e=>e.aid)).size}`)
console.log(`distinct full credit strings : ${new Set(all.map(e=>e.a.toUpperCase())).size}`)
console.log(`distinct song nids           : ${new Set(all.map(e=>e.nid)).size}`)
// does one aid map to many credit strings? (that's the compiler merging collabs for us)
const byAid = new Map()
for (const e of all) { if(!e.aid) continue; (byAid.get(e.aid) ?? byAid.set(e.aid, new Set()).get(e.aid)).add(e.a.toUpperCase()) }
const merged = [...byAid.values()].filter(s => s.size > 1).length
console.log(`artist ids covering >1 credit: ${merged} of ${byAid.size}  (compiler resolving collabs)`)

// per-week variety
const perWeek = weeks.map(w => new Set(d[w].filter(e=>e.aid).map(e=>e.aid)).size)
const mean = a => a.reduce((x,y)=>x+y,0)/a.length
console.log(`\n-- variety --`)
console.log(`distinct lead artists per week: min ${Math.min(...perWeek)}  mean ${mean(perWeek).toFixed(1)}  max ${Math.max(...perWeek)}`)
for (const n of [13, 26, 52, 104]) {
  const slice = weeks.slice(-n)
  console.log(`distinct lead artists over ${String(n).padStart(3)} weeks: ${new Set(slice.flatMap(w=>d[w].map(e=>e.aid)).filter(Boolean)).size}`)
}

// portfolio effect
console.log(`\n-- portfolio (entries held simultaneously by one lead artist) --`)
const dist = {}
let capBreach = 0
for (const w of weeks) {
  const c = {}
  for (const e of d[w]) if (e.aid) c[e.aid] = (c[e.aid]||0)+1
  for (const n of Object.values(c)) { dist[n] = (dist[n]||0)+1; if (n>3) capBreach++ }
}
const totArtistWeeks = Object.values(dist).reduce((a,b)=>a+b,0)
for (const k of Object.keys(dist).sort((a,b)=>a-b)) console.log(`  ${k} entr${k==1?'y':'ies'}: ${String(dist[k]).padStart(5)} artist-weeks (${(100*dist[k]/totArtistWeeks).toFixed(1)}%)`)
console.log(`  lead artists over the 3-cap : ${capBreach} artist-weeks`)
