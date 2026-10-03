# Fase 1 — Inseguimento polizia (design)

Data: 2026-09-26 · Stato: approvato dall'utente

Prima di cinque fasi (1 polizia, 2 auto `.glb` + audio registrato, 3 mappe, 4 persone, 5 fisica pneumatici). Qui solo la polizia.

## Obiettivo

Il giocatore può commettere reati, attirare volanti della Polizia e scegliere se fuggire o farsi arrestare, su entrambe le mappe (Valdora e Riviera del Sole).

## Componenti

Nuovo modulo `police.js` (ES module, importato da `index.html`). Dipendenze iniettate dal chiamante (`THREE`, `Car`, `scene`, `world`, `signalState`), così il modulo resta testabile.

### `Wanted` — livello ricercato
- `level` 0–5, `heat` continuo; `level = floor(heat)` con tetto 5.
- Reati (solo se una volante li *vede*: distanza < 70 m e linea di vista libera da collider edifici):
  - eccesso di velocità: > 90 km/h in città, > 140 km/h in Riviera → +0.6 heat/s;
  - rosso: il giocatore attraversa la linea di stop con semaforo rosso per il suo asse → +1;
  - urto con traffico o pedone (impatto > 4 m/s) → +1;
  - urto con volante → +1 immediato, visto sempre.
- Tasto `H`: clacson; se una volante è entro 40 m e il livello è 0 → livello 1 (provocazione).
- Fuga: se nessuna volante vede il giocatore, parte un timer; dopo `8 + 3·level` s il livello torna 0. Se una volante lo rivede, il timer si azzera.
- Arresto: velocità < 5 km/h e una volante entro 7 m per 3 s continui → evento `busted`.

### `PoliceUnit` — volante
- Istanza di `Car` con `cfg` dedicata (`id:'police'`, berlina 1600 kg, trazione posteriore, top speed ≈ 62 m/s, stesso modello fisico del giocatore) e `cfg.aiLights:false` (niente SpotLight per non moltiplicare le luci).
- `Car.update` legge input da `this.input` / `this.pad` quando presenti, altrimenti dai globali `keys`/`pad` (modifica minima e retro-compatibile).
- Mesh berlina procedurale con livrea Polizia (bianco/azzurro, scritta POLIZIA, barra lampeggianti) — provvisoria, sostituita nella Fase 2.
- Stati: `patrol` (segue la griglia come il traffico, velocità 11 m/s, rispetta i semafori), `pursuit`, `roadblock` (ferma di traverso), `recover` (retromarcia se bloccata > 2 s).
- Guida AI in `pursuit`:
  - Città: se giocatore in vista e < 60 m → pure-pursuit sulla posizione prevista (`pos + vel·t`, `t = dist / max(velocità propria, 10)`, max 1.5 s). Altrimenti A* sugli incroci della griglia `world.streets` fino all'incrocio più vicino al giocatore, poi pure-pursuit.
  - Riviera: target = campione spline a monte/valle verso il giocatore, poi pure-pursuit quando vicino.
  - Velocità obiettivo limitata in curva: `v ≤ sqrt(μ·g·R)` stimata dall'angolo al prossimo waypoint.
  - Livello ≥ 3: se affiancata al giocatore entro 3 m laterali, sterza verso il suo posteriore (manovra PIT).
- Collisioni: volante ↔ giocatore con impulso a masse reali; volante ↔ collider mondo tramite la routine già esistente in `Car.update`; volante ↔ traffico come per il giocatore.

### `PoliceDispatcher`
- Tiene 3 pattuglie in giro a livello 0 (2 su touch).
- Volanti massime per livello: 1→2, 2→3, 3→4, 4→5, 5→6 (touch: max 4). I rinforzi nascono su una strada fuori dal campo visivo, 120–200 m dal giocatore.
- Livello ≥ 4: posto di blocco (2 volanti di traverso) all'incrocio che il giocatore raggiungerà tra 3–6 s.
- Volanti a > 400 m e fuori inseguimento vengono riposizionate come nuove pattuglie.
- `busted`: schermata "ARRESTATO", −30% punti, livello 0, respawn in partenza, volanti di nuovo in pattuglia.
- `dispose()` al cambio mappa / uscita, come `Traffic`.

### Audio e luci
- Sirena bitonale italiana: file audio registrato con licenza CC0 in `assets/` (fonte e licenza in `assets/CREDITS.md`); fallback sintetico bitonale 435/580 Hz se il file manca. Una sorgente per volante in inseguimento (max 3 udibili), `PannerNode` HRTF + Doppler calcolato a mano da velocità relativa (`playbackRate`).
- Lampeggianti: sprite emissivi blu alternati (bloom su desktop) per tutte; una sola `PointLight` blu condivisa, spostata sulla volante più vicina.

### HUD
- Stelle ricercato a destra sotto `#scoreBox`, lampeggiano durante l'inseguimento; testo "FUGA 7 s" quando fuori vista.
- Minimappa: volanti come punti blu/rossi lampeggianti; cerchio di ricerca attorno all'ultima posizione vista.
- Toggle HUD "POLIZIA" (default attivo), come "TRAFFICO"/"PEDONI".
- Aiuto comandi e README aggiornati (`H` = clacson).

## Integrazione in `index.html`
- `import { PoliceDispatcher } from './police.js'`.
- `rebuildPolice()` accanto a `rebuildTraffic()`; `police.update(dt)` in `animate()` dentro il passo fisico fisso (le volanti fanno `update(FIXED)` come il giocatore).
- `window.__dbg.police` per i test.

## Errori e limiti
- Asset sirena mancante o AudioContext sospeso → fallback sintetico / silenzio, nessun errore.
- A* senza percorso → pure-pursuit diretto.
- Volante con NaN in posizione → rimossa e rigenerata.

## Test (Playwright, `tests/police.spec.js`)
1. Eccesso di velocità davanti a una volante porta il livello ≥ 1 e la volante passa a `pursuit`.
2. Giocatore fermo con livello 2: una volante lo raggiunge ed entro 40 s simulati scatta `busted`.
3. Livello 2 senza volanti in vista: dopo `8+3·2` s simulati il livello torna 0.
4. 6 volanti per 60 s simulati: nessun NaN, nessuna volante dentro gli edifici.
5. I test esistenti continuano a passare.
