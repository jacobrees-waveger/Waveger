import fs from 'node:fs'
const d = JSON.parse(fs.readFileSync(new URL('./data.json', import.meta.url).pathname,'utf8'))['singles-chart']
const weeks = Object.keys(d).sort()
const pts = (p) => 101 - p                       // simple: 101 minus position
const artistWeek = (w) => { const m = new Map(); for (const e of d[w]) if (e.aid) m.set(e.aid, (m.get(e.aid)||0) + pts(e.p)); return m }
const AW = new Map(weeks.map(w => [w, artistWeek(w)]))
const windowPts = (ws) => { const m = new Map(); for (const w of ws) for (const [a,v] of AW.get(w)) m.set(a,(m.get(a)||0)+v); return m }
const sum = a => a.reduce((x,y)=>x+y,0), mean = a => sum(a)/a.length
const sd = a => Math.sqrt(mean(a.map(x=>(x-mean(a))**2)))
const corr = (x,y) => { const mx=mean(x),my=mean(y); return sum(x.map((v,i)=>(v-mx)*(y[i]-my))) / (Math.sqrt(sum(x.map(v=>(v-mx)**2)))*Math.sqrt(sum(y.map(v=>(v-my)**2)))) }

// ---- concentration
console.log('-- concentration (share of all artist points, 104wk) --')
const total = windowPts(weeks)
const ranked = [...total.entries()].sort((a,b)=>b[1]-a[1])
const grand = sum(ranked.map(r=>r[1]))
for (const n of [5,10,15,30,60]) console.log(`  top ${String(n).padStart(3)} artists hold ${(100*sum(ranked.slice(0,n).map(r=>r[1]))/grand).toFixed(1)}% of points`)

// ---- windows
const SEASON = 13
const wins = []
for (let i = 0; i + 2*SEASON <= weeks.length; i += SEASON) wins.push([weeks.slice(i,i+SEASON), weeks.slice(i+SEASON,i+2*SEASON)])
console.log(`\n-- ${wins.length} back-to-back ${SEASON}-week window pairs --`)

// ---- does past predict future? (the skill signal)
const cs = []
for (const [prior, next] of wins) {
  const P = windowPts(prior), N = windowPts(next)
  const keys = [...P.keys()]                          // artists pickable at draft time
  const x = keys.map(a=>P.get(a)), y = keys.map(a=>N.get(a)||0)
  cs.push(corr(x,y))
}
console.log(`  artist points, prior vs next window: r = ${cs.map(c=>c.toFixed(2)).join(', ')}  (mean ${mean(cs).toFixed(2)})`)

// ---- turnover
const tos = wins.map(([prior,next]) => {
  const top = [...windowPts(prior).entries()].sort((a,b)=>b[1]-a[1]).slice(0,15).map(r=>r[0])
  const N = windowPts(next)
  return top.filter(a=>(N.get(a)||0)>0).length
})
console.log(`  of the prior window's top 15, still scoring next window: ${tos.join(', ')} /15`)

// ---- pricing + squad sim
function priceBook(prior) {
  const P = windowPts(prior), max = Math.max(...P.values())
  const b = new Map()
  for (const [a,v] of P) b.set(a, Math.max(4, Math.min(15, +(4 + 11*Math.sqrt(v/max)).toFixed(1))))
  return b
}
function knap(cands, book, score, budget, slots) { // DP over 0.1-coin units
  const B = Math.round(budget*10)
  let dp = Array.from({length: slots+1}, () => new Float64Array(B+1).fill(-1)); dp[0][0]=0
  const pick = Array.from({length: slots+1}, () => Array(B+1).fill(null))
  for (const a of cands) { const c = Math.round(book.get(a)*10), v = score(a)
    for (let s = slots-1; s >= 0; s--) for (let b = 0; b + c <= B; b++) {
      if (dp[s][b] < 0) continue
      if (dp[s][b] + v > dp[s+1][b+c]) { dp[s+1][b+c] = dp[s][b]+v; pick[s+1][b+c] = [a,s,b] } } }
  let best = -1, at = 0; for (let b=0;b<=B;b++) if (dp[slots][b] > best) { best = dp[slots][b]; at = b }
  const out = []; let s = slots, b = at
  while (s > 0 && pick[s][b]) { const [a,ps,pb] = pick[s][b]; out.push(a); s = ps; b = pb }
  return { total: best, squad: out }
}
const SLOTS = 15, BUDGET = 100
console.log(`\n-- squad sim: ${SLOTS} artists, ${BUDGET} coins, priced off the prior window --`)
const gaps = []
for (const [prior, next] of wins) {
  const book = priceBook(prior), P = windowPts(prior), N = windowPts(next)
  const cands = [...book.keys()]
  const naive = knap(cands, book, a=>P.get(a)||0, BUDGET, SLOTS)        // best on past form
  const hind  = knap(cands, book, a=>N.get(a)||0, BUDGET, SLOTS)        // best in hindsight
  const naiveActual = sum(naive.squad.map(a=>N.get(a)||0))
  // random affordable squads
  const rnd = []
  for (let t=0;t<4000;t++) { const pool=[...cands]; let spend=0, sq=[]
    while (sq.length<SLOTS && pool.length) { const i=Math.floor(Math.random()*pool.length); const a=pool.splice(i,1)[0]
      const left = SLOTS-sq.length-1
      if (spend+book.get(a)+left*4 <= BUDGET) { sq.push(a); spend+=book.get(a) } }
    if (sq.length===SLOTS) rnd.push(sum(sq.map(a=>N.get(a)||0))) }
  rnd.sort((a,b)=>a-b)
  const pctile = 100*rnd.filter(v=>v<naiveActual).length/rnd.length
  gaps.push({top: hind.total, form: naiveActual, rndMed: rnd[Math.floor(rnd.length/2)], rndP5: rnd[Math.floor(rnd.length*0.05)], rndP95: rnd[Math.floor(rnd.length*0.95)], pctile})
  console.log(`  ${prior[0]}: ceiling ${hind.total.toFixed(0)} | form-picked ${naiveActual.toFixed(0)} (pctile ${pctile.toFixed(0)}) | random p5/med/p95 ${rnd[Math.floor(rnd.length*0.05)].toFixed(0)}/${rnd[Math.floor(rnd.length/2)].toFixed(0)}/${rnd[Math.floor(rnd.length*0.95)].toFixed(0)}`)
}
console.log(`\n  form-picked squad beats this % of random squads: mean ${mean(gaps.map(g=>g.pctile)).toFixed(0)}%`)
console.log(`  form-picked as % of hindsight ceiling: ${gaps.map(g=>(100*g.form/g.top).toFixed(0)+'%').join(', ')}`)
console.log(`  random spread (p95/p5): ${gaps.map(g=>(g.rndP95/Math.max(g.rndP5,1)).toFixed(2)+'x').join(', ')}`)

// ---- solvability: is the hindsight-optimal squad stable across windows?
const hs = wins.map(([prior,next]) => { const book=priceBook(prior); return new Set(knap([...book.keys()], book, a=>(windowPts(next).get(a)||0), BUDGET, SLOTS).squad) })
console.log(`\n-- solvability: overlap between consecutive hindsight-optimal squads --`)
for (let i=1;i<hs.length;i++) console.log(`  window ${i} vs ${i+1}: ${[...hs[i]].filter(a=>hs[i-1].has(a)).length}/15 shared`)
