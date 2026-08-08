import fs from 'node:fs'
const D = JSON.parse(fs.readFileSync(new URL('./data.json', import.meta.url).pathname,'utf8'))
const sum=a=>a.reduce((x,y)=>x+y,0), mean=a=>sum(a)/a.length
const corr=(x,y)=>{const mx=mean(x),my=mean(y);return sum(x.map((v,i)=>(v-mx)*(y[i]-my)))/(Math.sqrt(sum(x.map(v=>(v-mx)**2)))*Math.sqrt(sum(y.map(v=>(v-my)**2))))}
const top = D['singles-chart']
const topWeeks = Object.keys(top).sort().slice(-52)
const topArtists = new Set(topWeeks.flatMap(w=>top[w].map(e=>e.aid)))
const topSongs = new Set(topWeeks.flatMap(w=>top[w].map(e=>e.nid)))
console.log(`Top 100 reference: 52 weeks, ${topArtists.size} artists, ${topSongs.size} songs\n`)
const rows = []
for (const slug of Object.keys(D)) {
  if (slug === 'singles-chart') continue
  const g = D[slug]; const ws = Object.keys(g).sort().filter(w=>g[w].length)
  if (!ws.length) { console.log(`${slug}: NO DATA`); continue }
  const all = ws.flatMap(w=>g[w])
  const depths = [...new Set(ws.map(w=>g[w].length))].sort((a,b)=>a-b)
  const noAid = all.filter(e=>!e.aid).length
  const gArtists = new Set(all.map(e=>e.aid))
  const gSongs = new Set(all.map(e=>e.nid))
  const newArtists = [...gArtists].filter(a=>!topArtists.has(a)).length
  const newSongs = [...gSongs].filter(s=>!topSongs.has(s)).length
  const perWeek = mean(ws.map(w=>new Set(g[w].map(e=>e.aid)).size))
  // skill signal within the genre
  const AW = new Map(ws.map(w=>{const m=new Map();for(const e of g[w]) if(e.aid) m.set(e.aid,(m.get(e.aid)||0)+(g[w].length+1-e.p));return [w,m]}))
  const win = a => { const m=new Map(); for(const w of a) for(const [k,v] of AW.get(w)) m.set(k,(m.get(k)||0)+v); return m }
  const cs=[]
  for (let i=0;i+26<=ws.length;i+=13){const P=win(ws.slice(i,i+13)),N=win(ws.slice(i+13,i+26));const ks=[...P.keys()];if(ks.length>5)cs.push(corr(ks.map(a=>P.get(a)),ks.map(a=>N.get(a)||0)))}
  rows.push({slug, weeks: ws.length, depths: depths.join('/'), noAid, artists: gArtists.size, perWeek: perWeek.toFixed(0), newArtistPct: (100*newArtists/gArtists.size).toFixed(0), newSongPct: (100*newSongs/gSongs.size).toFixed(0), r: cs.length?mean(cs).toFixed(2):'n/a'})
}
console.log('chart'.padEnd(36), 'wks', 'depth', 'noAid', 'artists', '/wk', 'artists NOT in Top100', 'songs NOT in Top100', 'r')
for (const r of rows) console.log(r.slug.padEnd(36), String(r.weeks).padStart(3), String(r.depths).padStart(5), String(r.noAid).padStart(5), String(r.artists).padStart(7), String(r.perWeek).padStart(3), (r.newArtistPct+'%').padStart(22), (r.newSongPct+'%').padStart(19), String(r.r).padStart(5))
// combined pick pool
const allG = new Set(rows.flatMap(r=>[]))
const pool = new Set([...topArtists])
for (const slug of Object.keys(D)) { if(slug==='singles-chart') continue; for(const w of Object.keys(D[slug])) for(const e of D[slug][w]) if(e.aid) pool.add(e.aid) }
console.log(`\nCombined pick pool across all five charts (52wk): ${pool.size} artists vs ${topArtists.size} on the Top 100 alone -> ${((pool.size/topArtists.size-1)*100).toFixed(0)}% wider`)
