// UI 가 쓰는 예제 프로젝트 (블록 프로젝트 JSON). 만들기: npm run templates
import type { Project } from '../engine/types';
import breakout from './breakout.json';
import dino from './dino.json';
import dodge from './dodge.json';
import flappy from './flappy.json';
import cartpole from './cartpole.json';
import crossy from './crossy.json';
import freeway from './freeway.json';
import freewayHard from './freewayHard.json';
import invaders from './invaders.json';
import pong from './pong.json';
import snake from './snake.json';

export const TEMPLATES = { dino, flappy, breakout, dodge, invaders, pong, crossy, cartpole, snake, freeway, freewayHard } as unknown as Record<
  'dino' | 'flappy' | 'breakout' | 'dodge' | 'invaders' | 'pong' | 'crossy' | 'cartpole' | 'snake' | 'freeway' | 'freewayHard',
  Project
>;
export type TemplateKey = keyof typeof TEMPLATES;
