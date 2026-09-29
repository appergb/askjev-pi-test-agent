import {AbsoluteFill,spring,useCurrentFrame} from 'remotion';
import {k,lin,Stage,Tick} from './core';
export const Verified=()=>{const f=useCurrentFrame();const settle=spring({fps:25,frame:f-2,config:{damping:20,stiffness:180,mass:.8},durationInFrames:23});return <Stage dark>
 <AbsoluteFill style={{opacity:k(f,0,8)*k(f,19,35,1,0)*.17,backgroundImage:'radial-gradient(#b2e1c3 1.4px,transparent 1.4px)',backgroundSize:'96px 96px',transform:`scale(${1.03-lin(f,0,35,0,.03)})`}}/>
 <div style={{position:'absolute',left:140,top:185,fontSize:26,color:'#8b9d92',letterSpacing:3,opacity:k(f,4,14),translate:`${k(f,4,17,-40,0)}px 0`}}>REGRESSION / 修复回归</div>
 <div style={{position:'absolute',left:130,top:284,display:'flex',gap:66,alignItems:'center',opacity:k(f,0,8),transform:`translateY(${(1-settle)*65}px) scale(${.9+.1*settle})`,transformOrigin:'0 50%'}}>
  <div style={{fontSize:240,lineHeight:1,fontWeight:520,letterSpacing:-14,color:'#b2e1c3',overflow:'hidden'}}>6 <span style={{color:'#687e6d',fontWeight:300}}>/</span> 6</div>
  <div style={{paddingTop:18}}><div style={{fontSize:52,letterSpacing:-1,clipPath:`inset(0 ${100-k(f,7,18,0,100)}% 0 0)`}}>修复版</div><div style={{fontSize:52,marginTop:14,clipPath:`inset(0 ${100-k(f,10,23,0,100)}% 0 0)`}}>原测试全部通过</div></div>
 </div>
 {Array.from({length:6},(_,i)=>{const p=k(f,2+i*1.6,20+i*1.6),x=144+i*79,y=641;const startX=300+i*255,startY=190+(i%3)*185;return <div key={i} style={{position:'absolute',left:startX+(x-startX)*p,top:startY+(y-startY)*p,opacity:k(f,2+i*1.6,7+i*1.6),transform:`rotate(${(1-p)*(i%2?14:-14)}deg) scale(${.65+.35*p})`}}><Tick size={50} color="#b2e1c3" progress={k(f,8+i*2,18+i*2)}/></div>})}
 <div style={{position:'absolute',left:143,top:771,fontSize:30,color:'#9caf9e',opacity:k(f,18,29),translate:`0 ${k(f,18,31,18,0)}px`}}>同一批浏览器测试 · 本地受控样例</div>
 <div style={{position:'absolute',left:143,bottom:110,fontSize:25,color:'#819085',opacity:k(f,23,33)}}>历史验收 2026-09-22 · 全量执行 · 回归测试内容不变</div>
 </Stage>};
