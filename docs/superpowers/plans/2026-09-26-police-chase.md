# Inseguimento polizia — piano di implementazione

> **Per agenti:** eseguire con superpowers:executing-plans, task per task. Checkbox `- [ ]`.

**Obiettivo:** volanti della Polizia con fisica reale, livello ricercato 0–5, inseguimento, fuga e arresto su Valdora e Riviera.

**Architettura:** nuovo modulo `police.js` con `Wanted`, `PoliceUnit`, `PoliceDispatcher`. Le volanti sono istanze della classe `Car` di `index.html` (iniettata come dipendenza), guidate da un input virtuale. Il dispatcher viene aggiornato nel passo fisico fisso (120 Hz) e una volta per frame per AI, audio, HUD.

**Stack:** Three.js 0.160, Web Audio, Vite 8, Playwright.

## Vincoli globali
- UI e testi in italiano.
- Nessuna dipendenza npm nuova.
- Soglie: eccesso di velocità > 90 km/h città, > 140 km/h Riviera; vista < 70 m con linea libera; arresto < 5 km/h entro 7 m per 3 s; fuga dopo `8 + 3·livello` s; volanti max per livello 2/3/4/5/6 (touch max 4); pattuglie 3 (touch 2); arresto = −30% punti.
- Test esistenti devono restare verdi (`npm test`).
- Cartella non è un repo git: niente commit.

---

### Task 1: `Car` guidabile da AI

**File:** modifica `index.html` (classe `Car`: `buildMesh` ~2052-2075, `update` 2356-2533).

**Produce:** `car.input = {up,down,left,right,space}` e `car.pad = {gas,brake,steer,handbrake}` opzionali; `cfg.build(car)` opzionale che sostituisce corpo+ruote e deve impostare `car.wheels`, `car.frontPivots`; `cfg.power` (W) opzionale; `cfg.noHeadlights`.

- [ ] In `update`: `const K=this.input||keys, P=this.pad||pad;` e sostituire ogni `keys.`/`pad.` del metodo con `K.`/`P.`; `toggleGearReq` letto solo se `!this.input`.
- [ ] Potenza: `const power=c.power||{falcone:…}[c.id];`.
- [ ] `buildMesh`: `if(c.build) c.build(this); else { …rami esistenti…; this.buildWheels(); }`; SpotLight solo se `!c.noHeadlights`.
- [ ] Verifica: `npm test` (i 9 test esistenti) verde.

### Task 2: `police.js` — `Wanted`

**File:** crea `police.js`; test `tests/police.spec.js`.

**Produce:** `export class Wanted { level; heat; lostT; bustT; seen; update(dt,{seen,pursuing,playerSpeed,copNear}); crime(kind); reset() }` e `export const WANTED_RULES`.

Regole:
- `crime('speed', dt)`: `heat=min(heat+0.6·dt, max(heat,1.5))` → la sola velocità porta a 1 stella.
- `crime('red'|'crash')`: `heat+=1`; `crime('ram')`: `heat+=1`.
- Durante inseguimento visto: `heat+=dt/35` (escalation lenta).
- `level=min(5,floor(heat))`.
- Fuga: se `level>0 && !seen` → `lostT+=dt`; se `lostT ≥ 8+3·level` → `reset()`. Se `seen` → `lostT=0`.
- Arresto: `level>0 && playerSpeed<5/3.6 && copNear<7` → `bustT+=dt`, altrimenti `bustT=0`; `bustT≥3` → ritorna `'busted'`.

Test (unitari in Node, senza browser):
```js
import {Wanted} from '../police.js';
test('wanted: speed gives one star, evasion clears, standing still near cop busts',()=>{
  const w=new Wanted();for(let i=0;i<300;i++)w.crime('speed',1/60);expect(w.level).toBe(1);
  w.crime('red');expect(w.level).toBe(2);
  let r;for(let i=0;i<60*13.9;i++)r=w.update(1/60,{seen:false,playerSpeed:0,copNear:99});expect(w.level).toBe(2);
  for(let i=0;i<60*0.3;i++)w.update(1/60,{seen:false,playerSpeed:0,copNear:99});expect(w.level).toBe(0);
  w.crime('ram');for(let i=0;i<60*3.1;i++)r=r==='busted'?r:w.update(1/60,{seen:true,playerSpeed:0,copNear:4});expect(r).toBe('busted');
});
```
`police.js` non deve importare `three` al top-level (dipendenze iniettate) così il test gira in Node.

### Task 3: `PoliceUnit` — mesh, AI di guida, stati

**Consuma:** `Car`, `extrudeBody`, `THREE`, `world` (Task 1).

**Produce:** `class PoliceUnit { car; state:'patrol'|'pursuit'|'roadblock'; think(dt, ctx); siren:boolean; lights(t) }`.

- Mesh (`POLICE_CFG.build`): berlina da `extrudeBody` bianca con fascia azzurra `#1f5fa8`, scritta POLIZIA su canvas ai lati e sul cofano, barra lampeggianti (2 box emissivi blu `0x2a6bff`, materiali condivisi tra volanti), ruote leggere (pneumatico + cerchio, 2 mesh).
- `POLICE_CFG`: `mass 1650, engineForce 11500, power 280000, brakeForce 15000, topSpeed 62, maxSteer .6, steerFade .0036, steerSpeed 3.2, stiffF 10, stiffR 10, muF 1.25, muR 1.22, cgH .5, wheelBase 2.85, aDist 1.4, bDist 1.45, drag .42, rollRes 16, drive 'R', gears [15,27,40,54,62], body {w 1.86,h .7,l 4.8,wheelR .33,wheelW .26,track 1.6,clearance .2,neon 0x2a6bff}, noHeadlights:true`.
- Guida (`drive(target, vTarget)`): errore d'angolo `wrap(atan2(dx,dz)-heading)`; `pad.steer=clamp(err·2.2 - yawRate·0.25,-1,1)`; `pad.gas/brake` da `vTarget` vs `vz` (gain 0.35); retromarcia di sblocco se velocità < 1 m/s per 2 s con gas → 1.2 s freno (la `Car` passa da sola in R) sterzando al contrario.
- `vTarget` in curva: `min(vMax, sqrt(1.1·9.81·R))` con `R = distanza al waypoint / (2·sin(|err|/2)+1e-3)`.
- Città: griglia incroci `world.streets` (10×10). Pattuglia: incrocio successivo in direzione casuale non a ritroso, corsia destra +3.3 m, ferma al rosso a 19.6 m dal centro. Inseguimento: se giocatore in vista e < 60 m → pure-pursuit su `pos + vel·min(1.5, dist/max(v,10))`; altrimenti BFS sugli incroci (grafo a griglia, costo uniforme = A* con euristica Manhattan) dall'incrocio più vicino alla volante a quello più vicino al giocatore; waypoint = incrocio successivo del percorso; raggiunto entro 10 m → avanza.
- Riviera: waypoint = campione spline `idx ± 12` nella direzione del giocatore (differenza d'indice modulo N con segno minimo); pure-pursuit se < 60 m e in vista.
- PIT (livello ≥ 3): se distanza laterale < 3 m e longitudinale in [−3, 1.5] m rispetto al giocatore, target = punto 2 m oltre il posteriore del giocatore sul lato opposto.
- Posto di blocco: volante ferma, heading perpendicolare alla strada, `pad` tutto zero.

### Task 4: `PoliceDispatcher` — spawn, collisioni, reati, arresto

**Produce:**
```js
export class PoliceDispatcher {
  constructor({THREE, Car, extrudeBody, scene, world, player, mobile, clock, signalState, traffic:()=>traffic, peds:()=>peds, audio, onBusted})
  step(dt)          // passo fisico fisso: car.update di ogni volante + collisioni
  frame(dt)         // AI, reati, wanted, spawn/despawn, lampeggianti, sirena, sync mesh
  get units()       // PoliceUnit[]
  wanted            // Wanted
  honk()            // tasto H
  dispose()
}
```
- Visibilità: segmento volante→giocatore contro `world.colliders` con prefiltro AABB; solo entro 70 m.
- Collisioni: SAT fra rettangoli orientati (giocatore↔volante, volante↔volante), separazione e impulso con masse reali (restituzione 0.25); impatti > 4 m/s con il giocatore vanno in `player.impacts` e contano come `crime('ram')` (cooldown 1.5 s). Volante↔traffico: come `Traffic` (spinta, `speed*=.3`).
- Reati del giocatore: velocità; rosso (entrata nel riquadro incrocio ±13 m con asse del moto rosso, `signalState(clock(), axis).phase==='red'`, axis 0 se |vz|>|vx|); urto traffico (distanza < 2.8 m e velocità relativa > 4 m/s, cooldown per auto 2 s); pedone (distanza < 1.3 m e velocità > 3 m/s).
- Spawn: pattuglie iniziali su incroci/campioni a 150–350 m dal giocatore; rinforzi a 120–200 m fuori dal cono visivo della camera (angolo rispetto alla direzione del giocatore > 70°) fino al massimo per livello; oltre 400 m e non in inseguimento → riposiziona. Oltre il numero massimo (livello sceso) → le extra tornano pattuglia.
- Posti di blocco (livello ≥ 4, cooldown 20 s, città): incrocio sul percorso del giocatore a 3–6 s (`pos + vel·t` arrotondato alla griglia), 2 volanti ferme di traverso a ±2.5 m.
- `busted` → `onBusted()`; stato: `wanted.reset()`, volanti tornano pattuglia e vengono riposizionate lontano.
- NaN guard: volante con posizione non finita → rigenerata.

Test Playwright (`tests/police.spec.js`) usando `window.__dbg.police`, simulazione a passi (`police.step`/`frame` in `evaluate`, niente tempo reale):
1. volante a 30 m davanti, giocatore a 30 m/s → `wanted.level ≥ 1` e `units[0].state==='pursuit'` entro 3 s simulati;
2. giocatore fermo, `wanted.heat=2`, volante a 80 m → `onBusted` entro 40 s simulati;
3. `heat=2`, volanti tutte a > 300 m dietro edifici → livello 0 dopo 14.1 s;
4. `heat=5`, 60 s simulati → tutte le posizioni finite e nessuna volante dentro un collider oltre 0.3 m.

### Task 5: integrazione `index.html`, HUD, audio, minimappa

- `import { PoliceDispatcher } from './police.js'`; `let police=null; function rebuildPolice()` accanto a `rebuildTraffic`, chiamato dove si chiama `rebuildTraffic` e in `disposeWorld`.
- Loop fisso: `car.update(FIXED, world); if(police) police.step(FIXED);` — dopo il loop `if(police) police.frame(dt)`.
- Tasto `H` → `police.honk()` + clacson audio; aiuto comandi aggiornato.
- HUD: `#wantedBox` (5 stelle SVG/testo ★, classe `.on` per le attive, `.flash` in inseguimento, riga "FUGA 7 s") sotto `#scoreBox`; su touch scala come `#scoreBox`.
- Pannello Ambiente: riga POLIZIA Attiva/Spenta (`.plBtn`, `state.policeOn` default true).
- Minimappa: volanti blu/rosse alternate 4 Hz; cerchio di ricerca tratteggiato attorno a `police.lastSeen` quando `lostT>0`.
- Arresto: overlay `#bustedMsg` "ARRESTATO" 2.5 s, `race.score=Math.round(race.score*.7)`, `recoverCar()`.
- Sirena: `SirenAudio` in `police.js` — per ogni volante in inseguimento (max 3 più vicine) oscillatore sawtooth attraverso bandpass, bitonale 435/580 Hz alternati ogni 0.55 s (tonalità italiana), `PannerNode` HRTF, Doppler `rate = (343+vr_listener)/(343+vr_source)` applicato alla frequenza; se `assets/siren.*` disponibile (Task 6) si usa il buffer registrato con `playbackRate`.
- Luce: una `PointLight` blu/rossa (intensità 0 se nessuna in inseguimento) sulla volante più vicina.
- `__dbg.police` getter.
- Verifica: `npm test` completo + screenshot inseguimento in preview.

### Task 6: sirena registrata (richiede consenso utente per il download)
- Cercare registrazione CC0 di sirena bitonale italiana; chiedere conferma all'utente con nome file, fonte, dimensione, licenza; scaricare in `assets/`, aggiungere a `assets/CREDITS.md` e README.
