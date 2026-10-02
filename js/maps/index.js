/* maps/index.js — the list of maps shown on the map select screen.
   To add a new map: copy one of the map files, change it, and add it here. */
import { MAP as spaceship } from './spaceship.js?v=5da3e5f8d0';
import { MAP as tomb } from './tomb.js?v=5da3e5f8d0';
import { MAP as graveyard } from './graveyard.js?v=5da3e5f8d0';
import { MAP as box } from './box.js?v=5da3e5f8d0';
import { MAP as yacht } from './yacht.js?v=5da3e5f8d0';

export const MAPS = [spaceship, tomb, graveyard, box, yacht];
