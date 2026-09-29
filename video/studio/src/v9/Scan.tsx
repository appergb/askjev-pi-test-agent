import React from 'react';
import {AbsoluteFill,useCurrentFrame} from 'remotion';
import {Btn,Camera,Center,Chip,copy,CursorFlight,k,lin,Mark,P,Stage,Spectrum,Thermal,Wordmark} from './core';
import {Completed,MiniCode,NarrowIssue,RoutePanel,Workspace,ISSUE_TARGET} from './panels';

const Cell:React.FC<{x:number;y:number;w:number;h:number;children:React.ReactNode;dark?:boolean}>=({x,y,w,h,children,dark=false})=><div style={{position:'absolute',left:x,top:y,width:w,height:h,overflow:'hidden',background:dark?'#1b2319':'#f7f8ee',borderRadius:6,color:dark?P.paper:P.ink}}>{children}</div>;

export const Scan=()=>{const f=useCurrentFrame();return <Stage>
 {f<57&&<><Thermal f={f+49}/><Center><div style={{opacity:k(f,4,13),scale:k(f,4,14,.95,1)}}><Btn f={f} clickAt={29} target="replay" style={{width:224,height:72,padding:0}}>{copy.ui.launch}</Btn></div></Center><CursorFlight f={f} start={9} arrive={24} clickAt={29} from={[1280,800]} to={[960,540]}/></>}
 {f>=43&&f<104&&<Camera scale={lin(f,43,104,1.27,.98)} x={lin(f,43,104,132,-150)} y={lin(f,43,104,45,-28)} opacity={k(f,43,58)}>
 <Cell x={948} y={81} w={608} h={722}><Chip macro style={{filter:'grayscale(1) contrast(1.12)',objectPosition:'41% 50%',scale:1.32}}/></Cell>
 <Cell x={178} y={75} w={471} h={281}><div style={{scale:.34,transformOrigin:'0 0'}}><Completed f={55}/></div></Cell>
 <Cell x={682} y={75} w={239} h={171}><div style={{padding:'26px 20px'}}><Mark size={42}/><div style={{fontSize:49,fontWeight:500,letterSpacing:-2,marginTop:13}}>JEV</div></div></Cell>
 <Cell x={352} y={400} w={468} h={289} dark><div style={{scale:.337,transformOrigin:'0 0'}}><MiniCode/></div></Cell>
 <Cell x={40} y={615} w={267} h={185} dark><div style={{padding:22}}><Wordmark size={30} light/><svg width="250" height="104" viewBox="0 0 250 104">{Array.from({length:4},(_,i)=><path key={i} d={`M0 ${47+i*11}Q42 ${-5+i*9} 80 ${65-i*3}T165 ${27+i*9}T250 ${61+i*5}`} fill="none" stroke={i===1?P.lime:'#6b7b5c'} strokeWidth="1.4"/>)}</svg></div></Cell>
 <Cell x={842} y={838} w={359} h={99} dark><div style={{padding:'22px 26px',fontSize:31,color:P.lime}}>已修复 · 已复测</div></Cell>
 <Cell x={1528} y={452} w={473} h={283}><div style={{scale:.33,transformOrigin:'0 0'}}><Workspace fixed f={55}/></div></Cell>
 <Cell x={411} y={737} w={395} h={245}><div style={{scale:.284,transformOrigin:'0 0'}}><RoutePanel/></div></Cell>
 {f<66&&<AbsoluteFill style={{opacity:k(f,48,66,.9,0)}}><Spectrum f={f*1.4}/></AbsoluteFill>}
 </Camera>}
 {f>=42&&f<111&&<AbsoluteFill style={{opacity:k(f,42,55)*k(f,98,111,1,0),backgroundImage:'linear-gradient(#ffffff70 1px,transparent 1px),linear-gradient(90deg,#ffffff70 1px,transparent 1px)',backgroundSize:'137px 111px',backgroundPosition:`${lin(f,42,108,33,-13)}px ${lin(f,42,108,30,-15)}px`}}><svg width="1920" height="1080">{Array.from({length:150},(_,i)=><circle key={i} cx={i%15*137+lin(f,42,108,33,-13)} cy={Math.floor(i/15)*111+lin(f,42,108,30,-15)} r={i%9===0?5.2:2.7} fill="white"/>)}</svg></AbsoluteFill>}
 {f>=103&&<><Spectrum f={f+61} soft opacity={.64}/><AbsoluteFill style={{background:P.paper,opacity:.59}}/><Center><div style={{scale:k(f,103,115,.78,1),opacity:k(f,103,113)}}><NarrowIssue f={f-103}/></div></Center><CursorFlight f={f-103} start={5} arrive={20} clickAt={26} from={[1440,804]} to={ISSUE_TARGET}/></>}
 </Stage>};
