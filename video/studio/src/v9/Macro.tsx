import {AbsoluteFill,staticFile,useCurrentFrame} from 'remotion';
import {Video} from '@remotion/media';
import {Camera,k,Stage} from './core';
export const Macro=()=>{const f=useCurrentFrame();return <Stage dark>
 <Camera scale={k(f,0,55,1.1,1)}><Video src={staticFile('official-brand/shield-turn.mp4')} muted objectFit="cover" style={{width:'100%',height:'100%',filter:'saturate(1.12) contrast(1.08) brightness(.82)'}}/></Camera>
 <AbsoluteFill style={{background:'linear-gradient(0deg,#020205 0%,#020205dd 24%,transparent 70%)'}}/>
 <div style={{position:'absolute',left:92,bottom:92,opacity:k(f,3,11),translate:`0 ${k(f,3,17,25,0)}px`}}>
  <div style={{fontSize:26,letterSpacing:2,color:'#b7c8b9',marginBottom:18}}>GPU INFERENCE / CUDA 推理</div>
  <div style={{fontSize:66,letterSpacing:-2,color:'#f3f3f5',fontWeight:570}}>NVIDIA DGX Spark</div>
  <div style={{fontSize:35,color:'#c4cfca',marginTop:18}}>JEV GPU 评分 <span style={{color:'#68776d',margin:'0 17px'}}>·</span> 可选自托管生成</div>
 </div>
 <AbsoluteFill style={{background:'#030504',opacity:k(f,0,9,.45,0)}}/>
 </Stage>};
