/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
import {enableTailwind} from '@remotion/tailwind-v4';
import path from 'node:path';

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setJpegQuality(94);
Config.setConcurrency(3);
Config.setChromiumOpenGlRenderer('angle');
Config.setChromeMode('headless-shell');
Config.overrideBundlerConfig((config)=>{const styled=enableTailwind(config);return {...styled,resolve:{...styled.resolve,alias:{...styled.resolve?.alias,'@':path.resolve('src')}}}});
