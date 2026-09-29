import {AbsoluteFill,useCurrentFrame} from 'remotion';
import {Camera,Center,k,keys,lin,P,Stage} from './core';
import {QUICK_COMMAND,QuickCheck} from './QuickCheck';
export const Terminal=()=>{const f=useCurrentFrame();const typed=QUICK_COMMAND.slice(0,Math.max(1,Math.floor(lin(f,0,45,1,QUICK_COMMAND.length))));return <Stage dark>
 {f<77&&<Center><div style={{display:'flex',alignItems:'center',gap:25,fontFamily:'Menlo, monospace',fontSize:65,fontWeight:430,letterSpacing:-2,scale:keys(f,[0,16,63,77],[1.12,1,1,.61]),translate:`0 ${k(f,63,77,0,-70)}px`,opacity:k(f,69,78,1,0)}}><span style={{color:'#5fd7af',fontWeight:300}}>❯</span><span>{typed.split(' ').map((s,i)=><span key={i} style={{color:i===0?'#5fd7af':i===2?'#899383':P.paper,background:i===3?'#38584b':undefined,padding:i===3?'2px 5px':undefined}}>{i?' ':''}{s}</span>)}<span style={{display:'inline-block',verticalAlign:'middle',height:70,width:4,background:'#8fe5c1',marginLeft:7,opacity:f<57||Math.floor(f/9)%2===0?1:0}}/></span></div></Center>}
 {f>=45&&f<73&&<div style={{position:'absolute',left:0,right:0,top:645,textAlign:'center',fontSize:24,color:'#7b8b76',opacity:k(f,45,54)*k(f,64,73,1,0)}}>一条指令，检查关键场景。</div>}
 {f>=66&&<Camera scale={k(f,66,85,.62,1)} opacity={k(f,66,77)}><Center><QuickCheck f={f-66}/></Center></Camera>}
 <AbsoluteFill style={{background:'#070707',opacity:k(f,176,184)}}/>
 </Stage>};
