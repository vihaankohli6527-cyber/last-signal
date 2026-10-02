/* maps/index.js — the list of maps shown on the map select screen.
   To add a new map: copy one of the map files, change it, and add it here. */
import { MAP as spaceship } from './spaceship.js?v=e898eff5dd';
import { MAP as tomb } from './tomb.js?v=e898eff5dd';
import { MAP as graveyard } from './graveyard.js?v=e898eff5dd';
import { MAP as box } from './box.js?v=e898eff5dd';
import { MAP as yacht } from './yacht.js?v=e898eff5dd';

export const MAPS = [spaceship, tomb, graveyard, box, yacht];
