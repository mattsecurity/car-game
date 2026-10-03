# Fase 2 — Auto reali e suono motore registrato (design)

Data: 2026-09-26 · Stato: approvato dall'utente (approccio "misto" per i modelli, motore granulare per l'audio)

## Obiettivo
Sostituire le carrozzerie procedurali con modelli glTF realistici quando disponibili e il motore sintetizzato con registrazioni reali riprodotte in modo granulare in funzione dei giri.

## Modelli: `vehicle-models.js`
- Manifest `assets/cars/cars.json`: `{ "<id>": { file, yaw, credit, license, source, paint?, wheels? } }`. Id: `falcone`, `brutus`, `volt`, `fuoco`, `police`, `traffic` (array).
- `loadVehicleModel(id)` → Promise del template (GLTFLoader, cache per id). File mancante o errore → `null`, mai eccezioni.
- `applyVehicleModel(car, template)`: clona, ruota di `yaw`, scala la lunghezza del bounding box a `cfg.body.l`, appoggia a terra (min y = 0), nasconde il corpo procedurale (figli di `car.chassis`) e le ruote procedurali, aggancia le ruote del modello.
- Ruote: nodi il cui nome combacia con `wheels` del manifest o `/wheel|tire|tyre|rim|rueda|ruota/i`; raggruppate per quadrante (x, z rispetto al centro). Ogni gruppo di quadrante viene messo in un pivot posizionato al centro della ruota; i pivot anteriori diventano `car.frontPivots`, tutti `car.wheels` (rotazione x). Se non si trovano 4 quadranti → ruote del modello restano fisse, `car.modelWheels=false`.
- Vernice: materiale con nome `paint` del manifest (o il materiale più esteso con clearcoat/metalness) prende `cfg.body.color`; tutti i materiali ricevono l'environment map dell'auto come oggi (`envMats`).
- Ombre: `castShadow` su tutte le mesh del modello.
- Integrazione: `Car.buildMesh` resta sincrono; dopo la costruzione, `index.html` chiama `attachModel(car)` che applica il modello quando la Promise si risolve (se l'auto non è stata eliminata nel frattempo). Preload del modello del veicolo selezionato durante la schermata di caricamento.
- Traffico: se `traffic` è presente, ogni modello viene fuso per materiale (`mergeGeometries`) una volta e clonato per auto.
- Prima consegna: `falcone` = Khronos CarConcept (CC BY 4.0). `assets/cars/DA-SCARICARE.md` elenca link Sketchfab CC-BY per gli altri id, con il nome file atteso.

## Audio: motore granulare
- Script `tools/build-engine-audio.mjs` (Node + ffmpeg): decodifica a PCM mono 44.1 kHz, stima la frequenza di scoppio fotogramma per fotogramma (autocorrelazione normalizzata su finestre di 2048 campioni, passo 512, ricerca nel range atteso per quel motore), converte in giri (`rpm = f·120/cilindri`), filtra (mediana), tiene i fotogrammi con confidenza alta, scrive `assets/engines/<id>.m4a` (AAC 128k, tratto utile ritagliato) e `assets/engines/<id>.json` = `{ cylinders, grains:[{t, rpm}] ordinati per rpm }`.
- Runtime `GranularEngine` in `engine-audio.js`: per il regime corrente sceglie il grano con rpm più vicino (ricerca binaria), `playbackRate = rpmTarget/rpmGrano` (limitato 0.8–1.25), grani di 90 ms con inviluppo di Hann, sovrapposizione 50% (uno ogni 45 ms), programmati con 100 ms di anticipo sul clock audio. Gas: più volume e un leggero filtro passa-alto; rilascio: volume ridotto e passa-basso (suono in rilascio).
- `EngineAudio` esistente: se il profilo del veicolo ha un motore granulare caricato, la catena sintetica del motore va a zero e resta attivo tutto il resto (gomme, vento, pioggia, impatti, pop di scarico). Volt EV: resta sintetica, fischio inverter migliorato.
- Abbinamenti: scelti dopo l'analisi fra i candidati scaricati (preferenza a registrazioni statiche senza effetto Doppler): Falcone ← Ferrari F355 / 599 GTO; Brutus ← Lexus IS-F al banco / Corvette ZR1 / Maserati; Fuoco ← Williams FW18 / Lexus LFA (V10) / Benetton B192.

## Crediti e licenze
`assets/CREDITS.md` + README: titolo, autore, licenza, URL, modifiche. I file audio derivati da CC BY-SA restano CC BY-SA.

## Test
1. Node: ogni `assets/engines/*.json` ha ≥ 40 grani, rpm crescenti che coprono almeno il 60% del range del veicolo, tutti i `t` entro la durata.
2. Playwright: Falcone ottiene il modello, 4 pivot ruota, lunghezza bbox entro ±5% di `cfg.body.l`, nessun errore; con id senza file l'auto resta procedurale senza errori.
3. Playwright: dopo un tasto, `audio.granular` attivo per Falcone e i grani vengono programmati (contatore > 0 dopo 1 s).
4. Test esistenti verdi.
