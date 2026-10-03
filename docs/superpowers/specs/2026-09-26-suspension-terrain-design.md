# Fase 5B — Sospensioni sul terreno (design)

Data: 2026-09-26 · Stato: approvato dall'utente (approccio B "ruote con massa")

La fisica gomme di base (Pacejka combinato, ruote implicite, sospensioni per angolo, ABS/TC/ESC) esiste già in `vehicle-physics.js`. Questa fase fa sentire alle sospensioni il terreno reale: marciapiedi di Valdora, dossi e tombini, cordoli della Riviera.

## Obiettivo
- Salire su un marciapiede dà un colpo alla ruota; poi l'auto ci viaggia sopra, inclinata se è a cavallo.
- Dossi e tombini si sentono ruota per ruota; un dosso preso forte fa staccare le ruote.
- I cordoli a dente di sega della Riviera fanno vibrare e scomporre l'auto.
- Le ruote disegnate seguono la corsa delle sospensioni.

Fuori scopo: salti/rampe sulla costa, nuovi ostacoli solidi (guardrail, lampioni, alberi restano attraversabili), temperatura/usura gomme, force feedback dello sterzo.

## 1. Modello fisico (`vehicle-physics.js`)

### Stato per ruota
Ogni ruota diventa una massa non sospesa con grado di libertà verticale:
- `hubY` (quota mondo del mozzo) e `hubV` (velocità verticale).
- Massa non sospesa `mu` da `cfg.phys.unsprung`: 40 kg di default, 20 kg per la F1 (`fuoco`).
- Massa sospesa per l'heave: `ms = m − 4·mu`. Le forze orizzontali continuano a usare la massa totale `m`.

### Gomma verticale
- Rigidezza `kt` = 250 kN/m (`cfg.phys.tireK`), smorzamento `ct` = 400 N·s/m.
- Penetrazione `pen = groundContact − (hubY − R)`; forza `Ft = max(0, kt·pen + ct·penRate)` solo se `pen > 0`.
- **`w.fz = Ft`**: il carico che entra in Pacejka è quello della gomma, non più quello della molla. Una ruota che rimbalza perde aderenza.

### Sospensione
- Compressione `cs = (hubY − R) − yc + s0 + δt0`, dove `yc = rideY − d·pitch + l·roll` è la quota dell'angolo di scocca e `δt0` = schiacciamento statico della gomma (compensa l'altezza di marcia: all'equilibrio `rideY` resta entro 1 cm da quello attuale).
- Forza `Fs = k·cs + c·ċs`, con k, c ricavati come oggi da `freq`/`zeta` (ma sulla massa d'angolo sospesa).
- Fine corsa in compressione: oltre `s0 + travelBump` (0.09 m, F1 0.03 m) molla progressiva `+40k·eccesso` (come oggi).
- Fine corsa in estensione: sotto `cs = 0` (molla scarica) molla di arresto `40k·cs` (negativa): la ruota tutta estesa viene sollevata con la scocca.
- Barre antirollio: forza `arb·(csL − csR)` tra le ruote dello stesso asse, applicata a scocca e ruote.

### Equazioni e integrazione
- Ruota: `mu·ÿ = Ft − Fs − mu·g`. Scocca: `ms·ÿ = ΣFs − downforce − ms·g`; beccheggio e rollio dai momenti delle `Fs` agli angoli (come oggi).
- La deportanza `df·v²` agisce sulla scocca, non più direttamente su `w.fz`.
- Eulero semi-implicito (velocità poi posizioni) nel passo esistente a 240 Hz (`step` ×2 per tick da 120 Hz). Frequenza di saltellamento attesa 10–16 Hz: ω·dt ≤ 0.9 anche con i fine corsa, dentro il limite di stabilità (2).
- `reset()`/`synced`: i mozzi partono all'equilibrio statico sul terreno sotto ciascuna ruota.

### Contatto: inviluppo del pneumatico
- `groundContact` non è più `height(centro ruota)` ma l'inviluppo del cerchio della gomma: `max_i [ height(p_i) − (R − √(R² − s_i²)) ]` su 13 punti `s_i ∈ [−0.9R, 0.9R]` (passo 0.15R) lungo la direzione di marcia, più **2 punti laterali** a ±0.35·larghezza gomma in `s = 0`. Due campioni extra alle estremità (15 in tutto) danno l'inviluppo spostato di ±un passo → **pendenza del contatto** `gradF` (esatta su pendenze uniformi) e `gradL` dai laterali.
- **Normale di contatto inclinata**: ogni ruota riceve anche una forza orizzontale `−fz·gradF` (e `−fz·gradL` di lato), limitata a |grad| ≤ 3. Salire su un cordolo costa velocità; sulle pendenze sostituisce il vecchio termine `env.slope` (rimosso).
- Calcolato al primo dei due sotto-passi di ogni tick da 120 Hz (`env.reprobe`); nel secondo la quota viene estrapolata con le pendenze e la velocità (`gc += gradF·vz·dt + gradL·vx·dt`). Senza `env.reprobe` (test) si ricalcola sempre.
- Volanti (`dyn.fast = true`): 5 punti longitudinali (passo 0.9R), nessun laterale.

### Fondo scocca
- 5 punti sotto la scocca (4 angoli a ±(w/2−0.2), ±(l/2−0.4) e il centro) alla quota `clearance` nel riferimento della scocca (tenendo conto di pitch/roll).
- Se il suolo li supera: forza verticale sulla scocca `kScrape·pen` (kScrape = 30·kF, smorzata), attrito orizzontale μ = 0.45 opposto alla velocità, momento di beccheggio/rollio dal punto.
- Evento `scrape` `{ x, y, z, speed, pen }` accodato in `car.scrapes` (come `car.impacts`).

### Uscite nuove
- Per ruota: `hubY`, `travel` (= `cs − s0`, per la grafica), `fz`, `contact` (bool), `hit` (picco di `Ft` oltre 2.2× il carico statico → impatto).
- `step()` mantiene firma e risultato attuali (`contact`, `slipF`, `slipR`, `spin`, `abs`).

## 2. Terreno

### Modulo `road-features.js`
- `RoadFeatures`: griglia hash a celle di 8 m; ogni elemento registra il suo rettangolo d'ingombro nelle celle toccate.
- `heightAt(x, z)` restituisce la somma dei contributi degli elementi nella cella (0 se nessuno). La `height()` di ogni mappa = terreno liscio + `features.heightAt`.
- Tipi di elemento con profilo analitico nella griglia: `bump` (dosso), `manhole` (tombino), `patch` (rattoppo). Profili puri esportati a parte: `cityCurbHeight(x,z)` (marciapiedi) e `kerbHeight(u, lungo)` (cordolo costiero, usato da fisica e mesh).
- `buildMeshes()` crea la grafica: una InstancedMesh per tipo (dossi, tombini, rattoppi); i cordoli costieri riusano i quad esistenti rialzati.

### Valdora
- Costante `CURB_H = 0.15` (prima 0.30). Tutto ciò che poggia sul marciapiede viene riportato a `CURB_H`: pedoni (`pedestrians.js`, `crowd.js`), prati e vialetti dei parchi, laghetto e bordo, giardini delle villette, panchine, idranti, lampioni, alberi (impostori), arredo Poly Haven, qualunque `y` legata a 0.30/0.304/0.307/0.33/0.36.
- Profilo del cordolo: formula diretta sulla griglia regolare degli isolati (`cityCurbHeight`, O(1), niente griglia hash): rettangolo 70×70 con angoli arrotondati (raggio 1.5 m), quota `CURB_H·smoothstep(−0.01, 0.035, profondità dal bordo)` — faccia quasi verticale (pendenza max ≈ 5) con spigoli smussati, angoli dell'isolato arrotondati con raggio 1.5 m (anche la lastra disegnata: `ExtrudeGeometry` di un rettangolo con angoli arrotondati, alta `CURB_H`).
- Superficie dei parchi invariata (erba, grip 0.62), ora alla quota del marciapiede.
- **Dossi**: ~30, prima delle strisce pedonali nei distretti residenziale e attorno ai parchi, a 6 m dalla linea di stop. Profilo a coseno, 7 cm × 0.9 m, larghi quanto la carreggiata; grafica con strisce gialle/nere.
- **Tombini**: ghisa ⌀ 0.7 m, 1.5 cm sotto l'asfalto con bordo a filo, 2–3 per tratto di strada nelle corsie; texture canvas.
- **Rattoppi**: rettangoli 1–3 m, ±1 cm, asfalto più scuro; decal istanziati.

### Riviera
- **Cordoli**: dove oggi sono dipinti (`|turn| ≥ 0.042`), tra 6.95 e 7.9 m dal centro: rampa trasversale 0 → 4 cm verso l'esterno + denti longitudinali di 1 cm con passo 25 cm (salita 20 cm, discesa 5 cm), crescenti verso l'esterno (`kerbHeight(u,s) = u·(0.04 + 0.01·dente(s))`). Bordo esterno con una piccola faccia verticale fino alla banchina. La grafica esistente viene rialzata per combaciare (inclusa la dentellatura, via vertici).
- La superficie grip 1.0 si estende fino a 7.9 m (oggi 7.3) per coprire tutto il cordolo.
- **Banchina**: nastro di terreno da ±7.0 a ±26.4 m (dove terreno disegnato e fisico tornano a coincidere), alla risoluzione della spline (600 campioni), con quote da `heightAt` − 1 cm e lo stesso materiale a strati del terreno (sabbia/prato/roccia). Elimina il distacco fino a 0.51 m fra terreno disegnato e fisico ai bordi della strada. Oltre 26.4 m resta la mesh attuale.

### Invariati
- Traffico: altezza al centro dell'auto (passa i dossi sollevandosi). Polizia: fisica completa con `probe: 'fast'`.
- Nessun nuovo collider.

## 3. Grafica e sensazioni (`index.html`)

- **Assetto**: `car.group` orientato solo per imbardata (niente più normale del terreno); `chassis.rotation` = `dyn.pitch`/`dyn.roll` (già riferiti al mondo). Clamp di pitch/roll portato da ±0.2 a ±0.35 rad. Elimina la doppia inclinazione in salita.
- **Ruote**: ogni supporto ruota ha `y = hubY(interpolato) − group.y`; abbinamento ruota fisica ↔ mesh invariato (per quadrante).
- **Ombra di contatto e alone sotto l'auto**: piano a terra al centro, inclinazione dal piano delle 4 quote di contatto.
- **Scintille**: gli eventi `scrape` usano `burstSparks` e `audio.impact` a volume ridotto, proporzionali a velocità e penetrazione.
- **Fumo e segni**: emessi alla quota di contatto reale della ruota; ruota staccata (`contact=false`) → nessun segno né fumo.
- **Camera**: scossone verticale 2–3 cm, 0.15 s, sugli eventi `hit`; nessuno scossone sulla vibrazione continua dei cordoli.
- **Gamepad**: `vibrationActuator.playEffect('dual-rumble')` breve su `hit`, debole e continua sui cordoli; ignorata se non supportata.

## 4. Test

Node (`tests/suspension.spec.js`, terreni sintetici con `height` e `surface` fittizi):
1. Equilibrio da fermo: `fz` di ogni ruota = carico statico d'angolo ±2%; `rideY` entro 1 cm dal valore attuale; frequenza di saltellamento della ruota 9–18 Hz.
2. Marciapiede 15 cm a 20 km/h: tutte e 4 le ruote in cima, `rideY` +0.15, valori finiti, picco di `Ft` limitato.
3. Dosso 7 cm: a 30 km/h `fz > 0` sempre; a 80 km/h almeno una ruota con `fz = 0` per > 30 ms e riatterraggio stabile.
4. Cordolo a denti in curva: oscillazione di `fz` > 25% e accelerazione laterale media inferiore all'asfalto.
5. Fondo: F1 su marciapiede → almeno un `scrape`; Falcone su dosso a 30 km/h → nessuno.
6. Regressione: i test di `tests/physics.spec.js` passano con le soglie invariate.

Playwright:
7. Valdora: `height` = 0.15 sul marciapiede, 0 in strada, profilo del cordolo monotono; esistono dossi e tombini (heightAt ≠ 0 nei loro punti).
8. In gioco, guidando su un marciapiede: `group.position.y` sale di ~0.15 e i supporti ruota cambiano `y`.
9. Riviera: sul cordolo `height > strada`; la banchina coincide con `height` entro 2 cm.
10. Nessun errore in console; suite completa verde (soglie esistenti invariate).

## Prestazioni
- Inviluppo: 13 letture di `height` per ruota a 120 Hz (≈ 6.000/s per l'auto del giocatore), 3 per le volanti.
- Griglia degli elementi: lettura O(elementi nella cella).
- Obiettivo: nessun calo di FPS misurabile in guida normale; draw call aggiuntive ≤ 6.

## Rischi
- F1 (corsa 2.4 cm): tarare `unsprung`, `travelBump` e rigidezze perché resti guidabile sui cordoli.
- Abbassamento del marciapiede: cambiamento largo, guidato da `CURB_H` e verificato con screenshot di parco, viale, villette.
- Integrazione numerica sui fine corsa: ω·dt controllato; se instabile, sotto-passo dedicato solo per le ruote.
