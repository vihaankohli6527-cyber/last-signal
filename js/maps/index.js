/* maps/index.js — the list of maps shown on the map select screen.
   To add a new map: copy one of the map files, change it, and add it here. */
import { MAP as spaceship } from './spaceship.js';
import { MAP as tomb } from './tomb.js';
import { MAP as graveyard } from './graveyard.js';
import { MAP as box } from './box.js';
import { MAP as yacht } from './yacht.js';

export const MAPS = [spaceship, tomb, graveyard, box, yacht];
