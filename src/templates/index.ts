// UI 가 쓰는 예제 프로젝트 (블록 프로젝트 JSON). 만들기: npm run templates
import type { Project } from '../engine/types';
import breakout from './breakout.json';
import dino from './dino.json';
import dodge from './dodge.json';
import flappy from './flappy.json';
import bombs from './bombs.json';
import cartpole from './cartpole.json';
import ducks from './ducks.json';
import invaders from './invaders.json';
import pong from './pong.json';
import ski from './ski.json';
import snake from './snake.json';

export const TEMPLATES = { dino, flappy, breakout, dodge, invaders, pong, bombs, ducks, ski, cartpole, snake } as unknown as Record<
  'dino' | 'flappy' | 'breakout' | 'dodge' | 'invaders' | 'pong' | 'bombs' | 'ducks' | 'ski' | 'cartpole' | 'snake',
  Project
>;
export type TemplateKey = keyof typeof TEMPLATES;
