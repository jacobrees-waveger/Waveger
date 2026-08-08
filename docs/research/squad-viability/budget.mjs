import fs from 'node:fs'
const d = JSON.parse(fs.readFileSync(new URL('./data.json', import.meta.url).pathname,'utf8'))['singles-chart']
const weeks = Object.keys(d).sort()
const AW = new Map(weeks.map(w => { const m=new Map(); for(const e of d[w]) if(e.aid) m.set(e.aid,(m.get(e.aid)||0)+(101-e.p)); return [w,m] }))
const windowPts = ws => { const m=new Map(); for(const w of ws) for(const [a,v] of AW.get(w)) m.set(a,(m.get(a)||0)+v); return m }
const sum=a=>a.reduce((x,y)=>x+y,0), mean=a=>sum(a)/a.length
console.log('-- does the 100-coin budget actually bind? --')
for (let i=0;i+26<=weeks.length;i+=13) {
  const prior = weeks.slice(i,i+13)
  const P = windowPts(prior), max = Math.max(...P.values())
  const price = a => Math.max(4, Math.min(15, +(4+11*Math.sqrt(P.get(a)/max)).toFixed(1)))
  const top15 = [...P.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15).map(r=>r[0])
  const cost = sum(top15.map(price))
  console.log(`  ${prior[0]}: unconstrained top-15 costs ${cost.toFixed(1)} coins (budget 100) -> ${cost>100?'BINDS, over by '+(cost-100).toFixed(1):'does NOT bind'}`)
}
// price distribution + affordability
const prior = weeks.slice(-26,-13), P = windowPts(prior), max = Math.max(...P.values())
const price = a => Math.max(4, Math.min(15, +(4+11*Math.sqrt(P.get(a)/max)).toFixed(1)))
const prices = [...P.keys()].map(price).sort((a,b)=>a-b)
console.log(`\n-- price book, one window (${prior[0]}) --`)
console.log(`  pickable artists: ${prices.length}  min ${prices[0]}  median ${prices[Math.floor(prices.length/2)]}  max ${prices.at(-1)}  mean ${mean(prices).toFixed(1)}`)
console.log(`  artists at the 4.0 floor: ${prices.filter(p=>p===4).length} (${(100*prices.filter(p=>p===4).length/prices.length).toFixed(0)}%)`)
console.log(`  artists over 10.0: ${prices.filter(p=>p>10).length}`)
