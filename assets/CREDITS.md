# Asset credits

Venice Sunset — Greg Zaal / Poly Haven
Source: https://polyhaven.com/a/venice_sunset
Download: https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/venice_sunset_1k.hdr
Local file: venice-sunset-1k.hdr

Asphalt 02 — Poly Haven
Source: https://polyhaven.com/a/asphalt_02
Downloaded 1K maps: asphalt_02_diff_1k.jpg, asphalt_02_nor_gl_1k.jpg, asphalt_02_rough_1k.jpg
Local files: asphalt-diffuse.jpg, asphalt-normal.jpg, asphalt-roughness.jpg

License for all listed assets: CC0 1.0
https://polyhaven.com/license
https://creativecommons.org/publicdomain/zero/1.0/

The original asset files are unmodified. The game changes mapping scale, lighting, surface roughness and normal intensity at runtime.

---

## Modelli 3D delle auto (`assets/cars/`)

Car Concept — Eric Chadwick (modello e texture), © 2024 Darmstadt Graphics Group GmbH; derivato da un modello CC0 di Unity Fan.
Fonte: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept
File locale: cars/falcone-carconcept.glb (non modificato; a runtime i vetri "transmission" diventano trasparenti, le ruote anteriori vengono raddrizzate e le mesh fuse per materiale)
Licenza: CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

## Registrazioni motore (`assets/engines/`)

I file .wav sono estratti dalle registrazioni originali (tratti ritagliati, mono 32 kHz, volume normalizzato) con `tools/build-engine-audio.mjs`; i .json contengono la mappa dei toni. Le opere derivate da file CC BY-SA sono distribuite con la stessa licenza CC BY-SA.

- engines/falcone.wav — "Ferrari F355 under-hood exhaust sound", enginemusic (Freesound) via Wikimedia Commons, CC BY 3.0.
  https://commons.wikimedia.org/wiki/File:Ferrari_F355_under-hood_exhaust_sound.ogg
- engines/brutus.wav — "Lexus IS-F dynamometer 2UR-GSE (2008)", Altair78 via Wikimedia Commons, CC BY-SA 4.0.
  https://commons.wikimedia.org/wiki/File:Lexus_IS-F_dynamometer_2UR-GSE_(2008).ogg
- engines/fuoco.wav — "Lexus LFA revving 1LR-GUE (2009)", Altair78 via Wikimedia Commons, CC BY-SA 4.0.
  https://commons.wikimedia.org/wiki/File:Lexus_LFA_revving_1LR-GUE_(2009).ogg

## Alberi (`assets/trees/`) e texture PBR (`assets/textures/`) — Poly Haven, CC0

Gli atlanti degli alberi sono "fotografati" da `tools/bake-impostors.mjs` (12 viste, colore + normali) a partire dai modelli fotogrammetrici originali, che non sono inclusi nel gioco:
- street ← tree_small_02 — https://polyhaven.com/a/tree_small_02
- park ← jacaranda_tree — https://polyhaven.com/a/jacaranda_tree
- island1 ← island_tree_01 — https://polyhaven.com/a/island_tree_01
- island2 ← island_tree_02 — https://polyhaven.com/a/island_tree_02

Texture (JPG 1K: diffuse, normal GL, roughness, AO), non modificate:
pavement_02, leafy_grass, coast_sand_01, rock_face_03, aerial_grass_rock, painted_plaster_wall, red_brick_03, concrete_wall_003 — https://polyhaven.com/a/<nome>

Licenza: CC0 1.0 — https://polyhaven.com/license

## Arredo dei parchi (`assets/props/`) — Poly Haven, CC0

painted_wooden_bench, wooden_picnic_table, metal_trash_can — https://polyhaven.com/a/<nome>
I file .gltf originali (con .bin e texture 1K) sono stati impacchettati in un unico .glb per oggetto con `tools/pack-glb.mjs`, senza modifiche al contenuto. Licenza CC0 1.0.

## Test (`tests/fixtures/`)

CesiumMan — © 2017 Cesium, Khronos glTF-Sample-Assets, CC BY 4.0 — https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CesiumMan
Usato solo dai test automatici della folla; non fa parte del gioco.
