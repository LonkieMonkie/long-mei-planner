export const CATEGORIES = [
  {key:'needs',name:'Everyday essentials',short:'Essentials',color:'#8eaa91',pct:50},
  {key:'personal',name:'Personal savings',short:'Personal savings',color:'#b6a0bf',pct:15},
  {key:'joint',name:'Our joint savings',short:'Joint savings',color:'#d4939c',pct:10},
  {key:'debt',name:'Debt payments',short:'Debt',color:'#d8b580',pct:15},
  {key:'fun',name:'Little joys',short:'Little joys',color:'#92b7bf',pct:10}
];
export function localDate(date=new Date()) {return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function addDays(date,n){const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return localDate(d);}
export function monday(date=localDate()){const d=new Date(date+'T12:00:00');return addDays(date,-((d.getDay()+6)%7));}
export function cents(value){const n=Number(value);if(!Number.isFinite(n)||n<0||n>1e9)throw new Error('Enter an amount between $0 and $1 billion.');return Math.round(n*100);}
export function allocate(income,percentages){
 const total=cents(income);const p=CATEGORIES.map(c=>Number(percentages[c.key]));
 if(p.some(x=>!Number.isFinite(x)||x<0||x>100)||Math.abs(p.reduce((a,b)=>a+b,0)-100)>0.000001)throw new Error('Your percentages must add up to 100%.');
 const exact=p.map(x=>total*x/100),parts=exact.map(Math.floor);let remainder=total-parts.reduce((a,b)=>a+b,0);
 const order=exact.map((x,i)=>({i,f:x-parts[i]})).sort((a,b)=>b.f-a.f);
 for(let j=0;j<remainder;j++)parts[order[j%order.length].i]++;
 return Object.fromEntries(CATEGORIES.map((c,i)=>[c.key,parts[i]]));
}
export function initialState(){return {schema:1,budgets:[],reflections:[],habits:[{id:'h1',name:'A little movement',owner:'Long',archived:false},{id:'h2',name:'A little movement',owner:'Mei',archived:false},{id:'h3',name:'No-spend day',owner:'Together',archived:false},{id:'h4',name:'Time for us',owner:'Together',archived:false}],checks:{},goals:{Long:{opening:0,target:200000},Mei:{opening:0,target:200000},Together:{opening:0,target:3000000}},updatedAt:null};}
export function savingsTotals(s){let sums={Long:s.goals.Long.opening,Mei:s.goals.Mei.opening,Together:s.goals.Together.opening};for(const b of s.budgets){for(const person of ['Long','Mei']){const a=allocate(b.people[person].income,b.people[person].percentages);sums[person]+=a.personal;sums.Together+=a.joint;}}return sums;}
export function upsertBudget(s,b){const i=s.budgets.findIndex(x=>x.start===b.start);const overlapping=s.budgets.some((x,k)=>k!==i&&x.start<=addDays(b.start,13)&&addDays(x.start,13)>=b.start);if(overlapping)throw new Error('This period overlaps a saved period. Edit that period or choose a start at least 14 days away.');if(i<0)s.budgets.push(b);else s.budgets[i]=b;s.budgets.sort((a,b)=>b.start.localeCompare(a.start));}
export function validateState(s){
 const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&localDate(new Date(x+'T12:00:00'))===x;
 const str=(x,n)=>typeof x==='string'&&x.length<=n;const money=x=>Number.isSafeInteger(x)&&x>=0&&x<=1e11;
 if(!s||s.schema!==1||!Array.isArray(s.budgets)||!Array.isArray(s.habits)||!Array.isArray(s.reflections)||!s.checks||!s.goals)throw new Error('This is not a supported planner backup.');
 if(s.budgets.length>10000||s.habits.length>500||s.reflections.length>10000)throw new Error('Backup exceeds planner limits.');
 for(const p of ['Long','Mei','Together'])if(!s.goals[p]||!money(s.goals[p].opening)||!money(s.goals[p].target))throw new Error('Invalid savings goal.');
 const dates=new Set();for(const b of s.budgets){if(!date(b.start)||dates.has(b.start)||!str(b.savedAt,50))throw new Error('Invalid budget period.');dates.add(b.start);for(const p of ['Long','Mei']){if(!b.people?.[p]||!b.people[p].percentages)throw new Error('Invalid budget.');allocate(b.people[p].income,b.people[p].percentages);}}
 const sorted=[...dates].sort();for(let i=1;i<sorted.length;i++)if(sorted[i]<=addDays(sorted[i-1],13))throw new Error('Overlapping budget periods.');
 const ids=new Set();for(const h of s.habits){if(!str(h.id,100)||ids.has(h.id)||!str(h.name,100)||!['Long','Mei','Together'].includes(h.owner)||typeof h.archived!=='boolean')throw new Error('Invalid habit.');ids.add(h.id);}
 for(const [key,value] of Object.entries(s.checks))if(!str(key,150)||typeof value!=='boolean')throw new Error('Invalid habit check.');
 for(const r of s.reflections)if(!str(r.id,100)||!str(r.text,10000)||!str(r.savedAt,50)||!date(r.date)||!['Long','Mei','Together'].includes(r.owner)||!str(r.mood,20))throw new Error('Invalid reflection.');
 return s;
}
