import {useCurrentFrame} from 'remotion';
import {Center,CursorFlight,k,keys,lin,P,Pill,q,Stage} from './core';
import {TERM,TerminalWindow,timelineBlocks,TimelinePanel} from './panels';

export const Connect=()=>{
 const f=useCurrentFrame();
 const detail=q(f,84,96);
 // The stripes and the output share a single camera and native row coordinates.
 // This keeps the transition registered while the window fades into view.
 return <Stage>
  {f<45&&<Center><div style={{display:'flex',gap:k(f,20,32,35,11),alignItems:'center',opacity:k(f,34,45,1,0)}}><div style={{opacity:k(f,0,8),translate:`${k(f,0,12,-28,0)}px 0`}}><Pill>测试场景</Pill></div><div style={{fontSize:29,width:58,height:58,lineHeight:'54px',textAlign:'center',border:'2px solid',borderRadius:'50%',color:f>=25?P.paper:P.ink,background:f>=25?P.ink:'transparent',rotate:`${k(f,0,25,-40,0)}deg`}}>{f>=25?'✓':'↗'}</div><div style={{opacity:k(f,6,15),translate:`${k(f,6,19,28,0)}px 0`}}><Pill>{f>=28?'评分完成':'JEV 评分'}</Pill></div></div></Center>}
  {f>=33&&<div style={{position:'absolute',left:TERM.x,top:TERM.y,width:TERM.w,height:TERM.h,scale:keys(f,[33,67,90,108,115],[.9,.9,.9,1.161,1.224]),translate:`${keys(f,[33,90,115],[0,0,95])}px ${keys(f,[33,90,115],[0,0,54])}px`}}>
   <div style={{position:'absolute',inset:0,opacity:k(f,59,70)}}><TerminalWindow title="askJEV — askjev-cli — checkout" height={TERM.h+detail*190} footer="" displayScale={1}><div style={{opacity:k(f,63,73)}}><TimelinePanel frame={false} f={f-54} details={detail}/></div><div data-ui-target="test-expand" style={{position:'absolute',top:346,left:1210,width:150,height:45,lineHeight:'45px',color:'#dba170',textAlign:'center',fontFamily:'Menlo',fontSize:17.25,background:'#35261c',borderRadius:4,scale:1-.06*Math.sin(Math.PI*lin(f,81,87))}}>{detail>.5?'▾ 收起':'▸ 展开'}</div></TerminalWindow></div>
   {timelineBlocks.map((b,i)=>{const p=q(f,35+i*.7,59+i*.3);return <div key={b.s} data-rainbow-row={i} style={{position:'absolute',left:740+(b.x-740)*p,top:360+(b.y-360)*p,width:k(f,35,59,180,b.w),height:50,borderRadius:5,background:'linear-gradient(93deg,#d3b8ef 0%,#f2bbd1 18%,#ff932b 39%,#f5d080 51%,#b6e7e5 72%,#bcd3f4 88%,#e5d6ef 100%)',backgroundSize:'110% 100%',backgroundPosition:`${100-lin(f,38,77,0,100)}% 50%`,filter:`blur(${k(f,35,65,18,3)}px)`,opacity:k(f,33+i*.65,40+i*.65)*k(f,65+i*.8,75+i*.8,1,0),translate:`0 ${i>2?detail*165:0}px`}}/>})}
  </div>}
  {f>=66&&f<90&&<CursorFlight f={f} start={66} arrive={77} clickAt={81} from={[1700,831]} to={[1451.4,522]}/>}
 </Stage>;
};
