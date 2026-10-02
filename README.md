# Last Signal 3D

Night-time 3D first-person survival shooter. Defend the glowing radio tower in the middle of the arena from waves of neon aliens. It's an **endless campaign**: survive 10 waves, a rescue ship turns up and flies you to the next area (the next map), and the run carries on. The run only ends when you die.

Built with Three.js r186, which is copied into `lib/`. It's fully static: no build step, no CDN, ES modules with relative paths, and it works on GitHub Pages.

## Run
```
python3 -m http.server 8000     # in this folder
# open http://localhost:8000
```
(Opening the file directly with `file://` won't work, because browsers block ES modules there. Serve it over HTTP.)

## Graphics / realism

- Physically based materials everywhere (MeshStandardMaterial with roughness/metalness). Procedural PBR textures (`js/textures.js`: concrete, brushed metal, stone, wood, grass, gun polymer) give every surface an albedo, a normal map and a roughness map, with world-scaled UVs so nothing stretches.
- Image-based lighting from a PMREM-filtered `RoomEnvironment`, ACES filmic tone mapping, sRGB output, soft PCF shadows, half-resolution GTAO ambient occlusion.
- More detailed guns (rails, serrations, sights, trigger guards, bolts, scope rings, steel/polymer/brass materials), brass shell ejection, muzzle-flash light, bullet-hole decals, sparks on metal and dust puffs on everything else.
- Enemies have darker organic skin with small glowing accents. Movement is heavier: acceleration and deceleration, a snappier jump, head bob, and heavier guns lag more.
- Quality presets: **Low** turns off shadows, bloom, AO, reflections and normal maps (fastest). **Medium** adds shadows and 85% resolution. **High** adds full resolution, bloom, AO, reflections and normal maps. Each option can also be toggled on its own in Settings.

## Settings

Title screen or pause menu → **SETTINGS**: mouse sensitivity, scoped/ADS multiplier, invert Y, field of view, master/SFX volume, quality preset (low/medium/high), resolution scale, shadows, bloom, FPS counter, crosshair colour and size. Saved in localStorage and applied immediately.

Knife: one hit kills any normal enemy. Against the Hive Colossus boss a slash takes 4% of its max HP and a heavy stab takes 10%. Player max health is 150.

Key bindings live in `CONFIG.KEYS` in `js/config.js` (each action takes a list of `KeyboardEvent.code` values).

## Controls
| Key | Action |
|---|---|
| Mouse | look (click the game to capture the mouse) |
| WASD / arrows | move · **Shift** sprint · **Space** jump |
| Left click | fire (bow: hold to draw, release to shoot) |
| Right click | aim / zoom (sniper scope, bow draw); with the knife: heavy stab |
| Y | inspect weapon |
| C (hold) | crouch: lower stance, slower, tighter spread, smaller target (stays crouched under low cover) |
| Shift + move + C | slide: speed burst that decays over ~0.7 s (1 s cooldown); jump to cancel |
| R | reload |
| 1–7 / mouse wheel / Q | switch owned weapons (1 knife, 2 pistol, 3 rifle, 4 sniper, 5 RPG, 6 grenade launcher, 7 bow) |
| B | market (between waves, or during a wave when standing at the terminal near the tower) |
| Enter / N | start the next wave (buy phase) |
| Esc / P | pause (bloom, shadows, resolution, sensitivity, mute, FPS) |
| G | toggle bloom · **M** mute |

## Files
- `index.html`, `css/style.css`: page, HUD and all the menus (title, map select, market, pause, cutscene, game over)
- `js/config.js`: **all balance numbers**: weapons, items, enemies, waves, area scaling
- `js/main.js`: game states, input, campaign/waves/areas, market rules, damage, rescue cutscene, rendering and bloom
- `js/world.js`: shared arena engine: lights from the map palette, collision, helper builders, tower and market kiosk
- `js/maps/*.js`: one file per map (`build(world, THREE)`, palette, bounds, spawn points). Register a new map in `js/maps/index.js`
- `js/player.js`: movement, collision, armour and health
- `js/weapons.js`: firing (melee, hitscan, rockets, grenades, arrows), ammo, reloads, explosions, viewmodel animation
- `js/viewmodels.js`: first-person weapon models built from primitives
- `js/enemies.js`: runner, brute, spitter, boss; steering and separation; enemy projectiles
- `js/turrets.js`, `js/effects.js`, `js/hud.js`, `js/market.js`, `js/audio.js` (WebAudio sounds)
- `lib/`: vendored `three.module.js`, `three.core.js`, plus the PointerLockControls and EffectComposer/RenderPass/UnrealBloomPass/OutputPass addons

High score and settings are saved in `localStorage`.
