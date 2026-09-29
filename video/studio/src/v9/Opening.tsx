import {useCurrentFrame} from 'remotion';
import {Camera,Center,copy,k,keys,lin,LogoBeat,P,q,Stage} from './core';
import {OpeningGlyphs} from './OpeningGlyphs';
import {Completed,Dashboard,RoutePanel,Workspace} from './panels';

export const Opening=()=>{
 const f=useCurrentFrame();
 const phrase=f<34?copy.opening_beats[0]:f<51?copy.opening_beats[1]:copy.opening_beats[2];
 return <Stage>
 {f<52&&<>{f<13?<Center><div style={{fontFamily:'Menlo',fontSize:43,letterSpacing:9,translate:`${q(f,0,13,0,-12)}px 0`}}>{f<6?'/':'//'}</div></Center>:<OpeningGlyphs f={f}/>}{f>=14&&<Center><div style={{fontSize:53,fontWeight:450,letterSpacing:-1.8,background:P.paper,padding:'6px 20px',zIndex:3}}>{phrase.slice(0,Math.ceil(k(f,f<34?14:34,f<34?21:39,0,phrase.length)))}</div></Center>}</>}
 {f>=51&&f<104&&<>
 <Camera x={keys(f,[79,88,97,104],[0,-110,-95,0])} y={keys(f,[79,88,97,104],[0,-35,-20,0])} scale={f<79?keys(f,[51,59,79],[1.2,1.05,.97]):f<88?lin(f,79,88,.97,.74):f<97?lin(f,88,97,.74,.48):q(f,97,104,.48,.04)} blur={k(f,101,104,0,22)} opacity={k(f,102,105,1,0)}>
 <div style={{position:'absolute',left:keys(f,[51,75,88],[-340,-210,370]),top:keys(f,[51,75,88],[-340,-257,100]),scale:.76,transformOrigin:'0 0',zIndex:4}}><Workspace f={90}/></div>
 <div style={{position:'absolute',left:keys(f,[51,75,88],[1160,1120,850]),top:keys(f,[51,75,88],[-320,-140,165]),scale:.78,transformOrigin:'0 0',zIndex:2}}><Completed f={50}/></div>
 <div style={{position:'absolute',left:keys(f,[51,75,88],[-470,-315,245]),top:keys(f,[51,75,88],[750,717,576]),scale:.7,transformOrigin:'0 0',zIndex:3}}><RoutePanel/></div>
 <div style={{position:'absolute',left:keys(f,[51,75,88],[1190,1145,960]),top:keys(f,[51,75,88],[770,720,558]),scale:.78,transformOrigin:'0 0',zIndex:5}}><Dashboard complete f={70}/></div>
 </Camera>
 {f<81&&<Center><div style={{fontSize:52,letterSpacing:-2,color:f>72?P.orange:P.ink,opacity:k(f,76,82,1,0)}}>{f<65?phrase:f<73?'多远？':'远？'}</div></Center>}
 {f>=101&&<Center><div style={{position:'relative',width:keys(f,[96,104],[130,80]),height:keys(f,[96,104],[130,80]),borderRadius:'50%',overflow:'hidden',opacity:k(f,101,104)}}><div style={{position:'absolute',inset:0,background:`conic-gradient(from ${f*7}deg,#ffa651,#e090e4,#8de4f2,#ffa651)`,filter:'blur(5px)',scale:1.3}}/></div></Center>}
 </>}
 {f>=104&&<><LogoBeat f={f-104}/>{f>=127&&<div style={{position:'absolute',top:621,left:0,right:0,textAlign:'center',fontSize:31,color:'#667460',opacity:k(f,127,137)}}>{copy.brand_line}</div>}</>}
 </Stage>;
};
