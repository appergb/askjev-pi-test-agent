import "./index.css";
import {Composition,Folder,staticFile} from 'remotion';
import {loadFont} from '@remotion/fonts';
import {Film,scenes} from './v9/Film';

loadFont({family:'Inter',url:staticFile('fonts/Inter.ttf'),weight:'100 900'});
loadFont({family:'Noto Sans SC',url:staticFile('fonts/NotoSansSC.ttf'),weight:'100 900'});

export const RemotionRootV9: React.FC = () => {
  return (
    <>
      <Composition id="AskJEV-Motion" component={Film} durationInFrames={1262} fps={25} width={1920} height={1080} defaultProps={{music:true}}/>
      <Folder name="Scenes">{scenes.map(({id,c,n})=><Composition key={id} id={id} component={c} durationInFrames={n} fps={25} width={1920} height={1080}/>)}</Folder>
    </>
  );
};
