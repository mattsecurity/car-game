# Fase 3A — Vegetazione fotorealistica e materiali PBR (design)

Data: 2026-09-26 · Stato: approvato dall'utente (approccio "impostori cotti")

## Obiettivo
Sostituire gli alberi low-poly con alberi fotogrammetrici (Poly Haven, CC0) resi come impostori, e dare materiali PBR reali a marciapiedi, parchi, sabbia, rocce e facciate.

## Impostori
- `tools/bake-impostors.mjs` (Node + Playwright, offline): apre `tools/impostor-baker.html` in Chromium headless, carica un albero glTF, lo inquadra e lo rende da **12 angolazioni** orizzontali (camera ortografica, elevazione 8°) in due atlanti 12×1: colore con alfa (sfondo trasparente) e normali in spazio vista (per la luce). Risoluzione per vista 256×512 (atlante 3072×512). Salva `assets/trees/<id>-color.png`, `<id>-normal.png`, `<id>.json` = `{ width, height, views, pivotY }` in metri reali.
- `impostor-trees.js` (runtime): `ImpostorForest(species, instances)` → per specie una `InstancedMesh` di un quad verticale con `ShaderMaterial`: ruota verso la camera attorno a y (billboard cilindrico), sceglie le due viste più vicine all'angolo camera-albero e le fonde, illumina con la normale dell'atlante (sole + emisfero dell'ambiente di gioco + nebbia), `alphaTest` 0.5. Variazione per istanza: scala 0.85–1.2, tinta ±6%, rotazione di base casuale. Ombra: `customDepthMaterial` con lo stesso alpha test → gli alberi proiettano ombre fogliate.
- Specie: `street` ← tree_small_02 (scalato a ~7 m, viali), `park` ← jacaranda_tree (~12 m) + island_tree_01, `coast` ← island_tree_01 e island_tree_02 (Riviera).
- Integrazione: gli alberi esistenti (definizioni in città: viali, parchi; costa: pini/palme instanced) forniscono posizioni e scale; le loro mesh vengono sostituite dalle foreste di impostori. Collider invariati. Le palme della costa restano (il set Poly Haven non ha palme).
- Fallback: atlante mancante → restano gli alberi attuali.

## Materiali PBR (Poly Haven, CC0, 1k JPG: diffuse, normal GL, roughness, AO)
- Marciapiedi: `pavement_02`, ripetizione tarata su lastre reali (~40 cm).
- Prato dei parchi: `leafy_grass`; colline della costa: `aerial_grass_rock`; spiaggia: `coast_sand_01`; roccia (scarpate): `rock_face_03`.
- Facciate: `painted_plaster_wall` (residenziale/misto), `red_brick_03` (parte del misto), `concrete_wall_003` (industriale) come texture di dettaglio (normal + roughness + albedo modulato) sotto finestre e cornici esistenti; notte e finestre emissive invariate.
- Modulo `pbr-textures.js`: `loadPBR(id, repeat)` restituisce le mappe con `colorSpace` corretto e cache; texture condivise fra materiali (registrate come condivise per non essere eliminate col mondo).

## Prestazioni
- Target: ≤ +40 draw call rispetto a oggi (una per specie + ombre), memoria texture < 60 MB GPU.
- Mobile: 60% degli alberi, texture a 512 via `anisotropy` ridotta.

## Test
1. Node: per ogni specie JSON valido, PNG presenti, dimensioni atlante = 12 viste.
2. Playwright: in città e in Riviera esistono foreste di impostori con N istanze > 0, i vecchi alberi sono nascosti, nessun errore; screenshot parco/viale/costa.
3. Playwright: i materiali di marciapiede, prato e sabbia hanno `normalMap` e `roughnessMap`.
4. Test esistenti verdi.
