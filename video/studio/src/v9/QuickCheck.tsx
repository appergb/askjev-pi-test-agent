import {k} from './core';
import {INK,Line,TerminalWindow,Trace} from './panels';

export const QUICK_COMMAND='askjev run --request task.json';
const checks=[
 ['PASS','qty=1  ship    coupon=none','subtotal 20.00 / shipping 5.00'],
 ['PASS','qty=3  ship    coupon=none','subtotal 60.00 / shipping 5.00'],
 ['FAIL','qty=5  ship    coupon=none','#shipping: expected 0.00, received 5.00'],
 ['PASS','qty=6  ship    coupon=none','subtotal 120.00 / shipping 0.00'],
 ['FAIL','qty=2  ship    coupon=SAVE10','#discount: expected 4.00, received 2.00'],
 ['PASS','qty=1  pickup  coupon=none','shipping 0.00 / total 20.00'],
];

export const QuickCheck=({f}:{f:number})=><TerminalWindow title="askJEV — 场景检查 — checkout" height={790}>
 <Line top={78} color={INK.green} size={29}>❯ {QUICK_COMMAND}</Line>
 <Trace top={132} f={f} at={0} size={15} lines={[
  'reading     task.json → ./checkout',
  'scope       index.html  app.js  styles.css  requirements.md',
  'planning    free-shipping threshold / SAVE10 / delivery mode',
  'generating  tests/acc-01 … acc-06.browser.json',
  'scoring     JEV · candidate-support-v1 · selection: all',
  'executing   Chrome · local project snapshot',
 ]}/>
 <div style={{position:'absolute',left:53,top:298,right:42,fontSize:21,lineHeight:'35px'}}>
  {checks.map(([status,scenario,result],i)=><div key={scenario} style={{display:'flex',gap:22,opacity:k(f,10+i*4,15+i*4)}}><span style={{width:61,color:status==='FAIL'?INK.red:INK.green}}>{status}</span><span style={{width:385,color:'#cbd0c5'}}>{scenario}</span><span style={{color:status==='FAIL'?'#f0b59c':'#9aa991',fontSize:18}}>{result}</span></div>)}
 </div>
 <Line top={516} size={26} color={INK.orange} opacity={k(f,35,44)}>发现两处问题，交回 coding agent。</Line>
 <div style={{position:'absolute',left:54,right:54,top:571,fontSize:20,lineHeight:'29px',whiteSpace:'pre',opacity:k(f,49,62)}}>
  <div style={{color:'#7f8b78',marginBottom:9}}>app.js  ·  两处修改</div>
  <div style={{color:INK.red,background:'#52242122'}}>- const shipping = pickup || subtotal &gt; 100 ? 0 : 5;</div>
  <div style={{color:INK.green,background:'#38512826'}}>+ const shipping = pickup || subtotal &gt;= 100 ? 0 : 5;</div>
  <div style={{color:INK.red,background:'#52242122'}}>- const discount = coupon === 'SAVE10' ? subtotal * 0.05 : 0;</div>
  <div style={{color:INK.green,background:'#38512826'}}>+ const discount = coupon === 'SAVE10' ? subtotal * 0.10 : 0;</div>
 </div>
</TerminalWindow>;
