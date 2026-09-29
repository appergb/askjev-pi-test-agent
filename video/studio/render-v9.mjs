import {bundle} from '@remotion/bundler';
import {enableTailwind} from '@remotion/tailwind-v4';
import {ensureBrowser,openBrowser,selectComposition,renderStill,renderMedia} from '@remotion/renderer';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

const serveUrl=await bundle({entryPoint:path.resolve('src/index-v9.ts'),bundlerOverride:(config)=>{const styled=enableTailwind(config);return {...styled,resolve:{...styled.resolve,alias:{...styled.resolve?.alias,'@':path.resolve('src')}}}}});
// Use the headless shell pinned by the exact Remotion package version.
// System Chrome 153 duplicated compositor tiles in full-resolution exports.
const chromeMode='headless-shell';
const chromiumOptions={gl:'angle'};
await ensureBrowser({chromeMode});
const browser=await openBrowser('chrome',{chromeMode,chromiumOptions});
try {
const composition=await selectComposition({serveUrl,id:'AskJEV-Motion',puppeteerInstance:browser});
const mode=process.argv[2]||'stills';
if(mode.startsWith('stills')){
 const frames=process.argv[3]?JSON.parse(process.argv[3]):[145,149,155,352,357,501,505,742,748,839,843,850,860,880,920,964,984,989,997,1009,1038,1044,1082,1091,1103,1145,1156,1161,1170,1185,1210,1255];
 await mkdir('../analysis/qa-v9',{recursive:true});
 for(let i=0;i<frames.length;i+=3){
  await Promise.all(frames.slice(i,i+3).map(async frame=>{
   await renderStill({serveUrl,composition,puppeteerInstance:browser,frame,scale:1,output:`../analysis/qa-v9/f-${String(frame).padStart(4,'0')}.png`,chromeMode,chromiumOptions,logLevel:'error'});
   console.log(`still ${frame} / ${(frame/25).toFixed(2)}s`);
  }));
 }
}else{
 const preview=mode==='preview';
 const outputLocation=process.argv[3]||(preview?'../exports/askjev-v9-review-540p.mp4':'../exports/askjev-v9-1080p.mp4');
 await mkdir(path.dirname(outputLocation),{recursive:true});
 let last=-1;
 await renderMedia({serveUrl,composition,puppeteerInstance:browser,outputLocation,codec:'h264',crf:preview?23:17,scale:preview?.5:1,concurrency:3,audioBitrate:'256k',imageFormat:'jpeg',jpegQuality:94,chromeMode,chromiumOptions,onProgress:p=>{const n=Math.floor(p.progress*20);if(n!==last){last=n;console.log(`${n*5}% · rendered ${p.renderedFrames}/${composition.durationInFrames}`)}}});
 console.log(outputLocation);
}
} finally {
 await browser.close({silent:true});
}
