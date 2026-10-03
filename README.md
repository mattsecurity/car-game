# VELOCE — Italian Driving Experience

Gioco di guida WebGL in italiano, con quattro veicoli, una città esplorabile e un circuito costiero. La versione originale è conservata in `backups/index.original.html`.

## Avvio

Richiede Node.js 22.12+ oppure 24+.

```sh
npm install
npm run dev
```

Apri l'indirizzo mostrato dal terminale. Per preparare la versione distribuibile:

```sh
npm run build
npm run preview
```

`dist/` contiene il gioco e gli asset locali; si può servire con un normale server statico. Il gioco richiede un browser con WebGL 2. I font Google sono facoltativi: senza rete viene usato il font di sistema. Non aprire l'HTML con `file://`.

## Comandi

| Azione | Comando |
| --- | --- |
| Acceleratore / freno / sterzo | WASD oppure frecce |
| Freno a mano | Spazio |
| Marcia avanti / retromarcia | R, a bassa velocità |
| Cambio telecamera | C |
| Garage e pausa | Esc |
| Modalità foto | P; trascina per ruotare, rotella per zoom |
| Riposizionamento e nuova sessione | T |
| Disattiva / riattiva audio | M |
| Clacson (vicino a una volante: una stella) | H |
| Cambia veicolo | 1–4 |

Controller con mappatura standard: stick sinistro per lo sterzo, RT/R2 per accelerare, LT/L2 per frenare, primo pulsante frontale per il freno a mano. Su telefono sono disponibili comandi touch; la modalità orizzontale offre più spazio. `?touch=1` permette di provare l'interfaccia touch su desktop. La modalità foto si chiude anche toccando il suggerimento in basso.

## Interventi

### Fisica realistica (fase 5)

- **Modello a 4 ruote** (`vehicle-physics.js`, 240 Hz): pneumatici con la "Magic Formula" di Pacejka e slittamento combinato (frenando o accelerando resta meno aderenza laterale), rotazione vera di ogni ruota (pattinamenti e bloccaggi visibili), sensibilità al carico.
- **Sospensioni** a molla e ammortizzatore per angolo con barre antirollio: beccheggio in frenata, affondamento in accelerazione, rollio in curva e trasferimenti di carico emergono dalla fisica; ogni ruota segue le asperità del terreno.
- **Motore e trasmissione**: curva di coppia per ogni auto, cambio automatico con i rapporti reali e isteresi, frizione in partenza, freno motore per marcia, differenziale autobloccante, trazione integrale per la Volt, carico aerodinamico per la F1. I giri e la marcia del cruscotto (e il motore registrato) sono quelli veri.
- **Assistenze** (pannello Ambiente): ABS, controllo di trazione e controllo di stabilità leggero, attivi per default; spente = guida simulativa. Le volanti guidano sempre con le assistenze.
- Valori misurati nei test: 0–100 km/h Falcone ≈ 4,2 s, Fuoco ≈ 3,2 s, Volt ≈ 5,1 s, Brutus ≈ 6,5 s; frenata da 100 km/h Falcone ≈ 30 m; accelerazione laterale ≈ μ·g (Falcone 1,29 g, F1 2 g).

### Persone realistiche (fase 4)

- **Folla con pelle a istanze** (`crowd.js`): i personaggi sono disegnati a istanze e la deformazione dello scheletro avviene nello shader leggendo le pose da una texture (una riga per fotogramma). Centinaia di pedoni costano pochi disegni, qualunque sia il dettaglio del modello; camminata con cadenza adattata alla velocità, attese al semaforo in piedi o al telefono, ombre.
- **Personaggi Mixamo**: istruzioni in `assets/people/DA-SCARICARE.md` (6 personaggi + camminata, attesa, telefonata). Poi `node tools/bake-people.mjs assets/people/src` li converte (texture ridotte a 1024 px, `.glb` leggero, pose in half float). Finché non ci sono, restano i pedoni procedurali.
- Collaudo automatico con il personaggio di prova Khronos CesiumMan (CC BY 4.0, solo nei test).

### Mare, parchi e luce (fase 3C)

- **Mare realistico** (`ocean.js`) senza passaggi di rendering aggiuntivi: materiale fisico con indice di rifrazione dell'acqua (riflessi Fresnel del cielo, scintillio del sole), otto treni d'onda calcolati nello shader e attenuati con la distanza, mare lungo che solleva la superficie. Una mappa della profondità ricavata dal fondale dà acqua turchese e trasparente sulla spiaggia, blu al largo e schiuma animata sulla battigia.
- **Strada costiera sopra il livello del mare**: un tratto scendeva fino a 5 m sotto il mare; ora la quota minima è 1,2 m sopra l'acqua, con raccordo morbido (strada su argine).
- **Parchi**: vialetti lastricati a croce, laghetto con acqua vera e bordo in pietra, panchine, tavoli da picnic e cestini Poly Haven disegnati a istanze; panchine vere anche sui marciapiedi.
- **Occlusione ambientale GTAO** (desktop, qualità adattiva e alta): ombre di contatto fra edifici, marciapiedi, auto e arredo; gli alberi-impostore sono esclusi dal calcolo per evitare aloni.

### Traffico realistico e guida a destra (fase 3B)

- **Auto civili realistiche** al posto delle scatole, sia nel traffico sia nei parcheggi: berlina, utilitaria, SUV, furgone e taxi bianco con insegna, con passaruota, ruote che girano e sterzano, vetri, paraurti, specchietti, targhe, vernici metallizzate. Disegnate a istanze: pochi disegni per qualsiasi numero di auto.
- **Luci funzionanti**: stop accesi in frenata e da fermi al semaforo, frecce che lampeggiano sul lato della svolta, fari più intensi di notte; beccheggio in frenata.
- **Circolazione a destra, come in Italia**: prima il traffico viaggiava a sinistra. Corsie di città e costa, volanti, partenza del giocatore, linee di stop, pali e lanterne dei semafori e accostamento alle sirene sono stati allineati alla guida a destra.

### Città e Riviera più realistiche (fase 3A)

- **Alberi fotogrammetrici**: quattro specie Poly Haven (albero da viale, jacaranda, due ulivi) fotografate da 12 angolazioni in atlanti di colore e normali; in gioco ogni albero è un pannello che mostra la vista giusta, illuminata, con ombra fogliata e leggero movimento al vento. Circa 450 alberi in città e 440 ulivi in Riviera, una sola draw call per specie.
- **Materiali PBR**: marciapiedi in lastre di pietra alla scala reale, prati veri nei parchi e nei giardini, terreno della Riviera che mescola sabbia, prato mediterraneo e roccia secondo quota e pendenza, rilievo di intonaco e cemento sulle facciate.
- **Villette all'italiana**: intonaci ocra, rosa e avorio, finestre con persiane, portone e tetti in coppi.
- Rigenerare gli atlanti: `node tools/bake-impostors.mjs <cartella con i modelli Poly Haven>`.

### Auto reali e motori registrati

- **Falcone GT-S** usa un modello glTF reale (Khronos *Car Concept*): vernice clearcoat, cerchi e pinze, interni, fari e stop del modello collegati alla frenata e all'illuminazione. Il caricatore (`vehicle-models.js`) orienta e scala il modello sulle misure fisiche dell'auto, riconosce le quattro ruote, le re-impernia al centro e raddrizza quelle già sterzate nel file; le mesh vengono fuse per materiale (circa 40 disegni per auto invece di 100).
- Gli altri veicoli restano procedurali finché non si aggiunge il loro modello in `assets/cars/` (istruzioni e link in `assets/cars/DA-SCARICARE.md`).
- **Motori registrati**: Falcone (Ferrari F355 V8), Brutus (Lexus IS-F V8 al banco prova) e Fuoco (Lexus LFA V10) suonano con un motore granulare: frammenti di 90 ms della registrazione vera, scelti al tono corrispondente al regime e sovrapposti senza stacchi. Le registrazioni coprono circa 1,4× di gamma; sopra e sotto si estende variando la velocità di riproduzione. La Volt resta elettrica sintetizzata (il fischio dell'inverter è di per sé un tono elettronico).
- Rigenerare i banchi motore: `node tools/build-engine-audio.mjs <cartella con gli .ogg originali>`.

### Polizia e inseguimenti

- Livello ricercato da 0 a 5 stelle. Una volante deve **vedere** il reato: eccesso di velocità (oltre 90 km/h a Valdora, 140 km/h in Riviera), passaggio col rosso, urto con auto o pedoni. Speronare una volante conta sempre.
- Le volanti usano la stessa fisica del giocatore (massa, gomme, trasferimento di carico). In città seguono la griglia degli incroci verso l'ultima posizione nota, in Riviera il nastro stradale; schivano il traffico, sorpassano solo con la corsia opposta libera e recuperano dalle sbandate. Dalla terza stella tentano la manovra PIT, dalla quarta compaiono posti di blocco agli incroci.
- Rinforzi fino a 6 volanti (4 su telefono), in arrivo da fuori campo visivo. Il traffico civile rallenta e si accosta quando sente una sirena alle spalle.
- Fuga: fuori dalla vista di tutte le volanti per 8 s + 3 s per stella. Arresto: fermo entro 7 m da una volante per 3 s (−30% punti).
- Sirena bitonale spazializzata (HRTF) con effetto Doppler, lampeggianti blu/rossi con luce reale sulla volante più vicina, stelle nell'HUD e volanti sulla minimappa. Interruttore POLIZIA nel pannello Ambiente.
- Aggiunto il freno motore a gas chiuso sulle auto termiche.
- Sirena registrata facoltativa: un file `assets/siren.ogg` (loop bitonale, licenza compatibile, da citare in `assets/CREDITS.md`) sostituisce automaticamente la sintesi, mantenendo spazializzazione e Doppler.

### Aggiornamento Valdora

- Città rinominata **Valdora**, compresi menu, cartelli, HUD e minimappa.
- Interfaccia ridisegnata: tachimetro digitale, pannelli compatti, nuove schede del garage, impostazioni Ambiente richiudibili, indicazione del prossimo semaforo.
- **Riviera del Sole** viene caricata già selezionandola nel garage. Camera inizializzata alla quota della strada, traffico posizionato prima del primo frame, terreno abbassato sotto il nastro e ricerca spaziale dei segmenti stradali.
- Dinamica con limite di potenza per veicolo, budget di attrito combinato, componente longitudinale delle forze di sterzata, sterzo Ackermann, risposta verticale smorzata al terreno e gravità quando il contatto viene perso. (Sostituito nella fase 5 da un modello a quattro ruote con pneumatici Pacejka e sospensioni.)
- Semafori condivisi tra luci, HUD, traffico e pedoni: 28 secondi di verde, 3 di giallo e 2 di tutto rosso per ogni direzione. Il traffico rallenta prima della linea e riparte al verde.
- Pedoni con arti articolati, ginocchia, gomiti, mani, scarpe, collo, capelli e dettagli del viso. Alcuni percorsi attraversano sulle zebre: la partenza è consentita solo con tempo sufficiente per completare l'attraversamento. Dettaglio grafico aggiornato solo entro la distanza visibile per contenere il costo GPU.
- Corretto un riflesso erroneamente applicato al disco del sole, che poteva apparire nero.

### Miglioramenti precedenti

- Nuovo garage con anteprima della scena 3D, selezione accessibile da tastiera, interfaccia sobria e tre profili grafici memorizzati.
- Nuova carrozzeria procedurale della Falcone GT-S: superfici curve, aperture per le ruote, montanti, specchi, griglie, diffusore, fanali e copertura motore. Dettagli di cerchi, vetri, vernici e contatto a terra migliorati su tutti i veicoli.
- Facciate con solai, montanti e balconi, vetrine italiane, texture finestre più definite, vegetazione meno satura, segnaletica aggiornata.
- Illuminazione fotografica HDR al tramonto sereno; ambienti procedurali per giorno, notte e maltempo. Asfalto PBR con mappe diffuse, normali e rugosità; risposta del materiale alla pioggia.
- Nuvole procedurali e animazione del mare sulla GPU.
- Fisica fissa a 120 Hz, interpolazione della posizione visibile, saturazione progressiva della forza laterale, trazione integrale corretta, collisioni con l'ingombro orientato della carrozzeria.
- Camera con variazione del campo visivo limitata e accorciamento del braccio vicino agli edifici; riposizionamento d'emergenza.
- Sintesi audio con armoniche di combustione, taglio di cambiata indipendente dagli FPS, rotolamento, vento, pioggia e impatti; compressore per limitare i picchi. L'audio parte solo dopo un gesto utente.
- Geometrie statiche raggruppate per cella e materiale, rilascio delle risorse durante cambio auto/mappa, risoluzione adattiva, reset input alla perdita del focus e pausa quando la pagina viene nascosta.

È un prototipo browser migliorato, non un simulatore certificato o una produzione AAA: le auto e la città sono prevalentemente procedurali; l'audio è sintetizzato, non registrato da veicoli reali. L'ambiente HDR produce riflessi di illuminazione, non riflessioni in tempo reale di ogni oggetto. Le prestazioni effettive dipendono da GPU, risoluzione e browser.

## Verifica

```sh
npx playwright install chromium
npm test
```

Le verifiche automatiche coprono avvio e cambio di tutti i veicoli, entrambe le mappe, movimento, audio attivo, meteo, pausa/foto, adattamento touch, frenata su asciutto/bagnato, stabilità numerica, collisione della carrozzeria, rilascio dei tasti e input controller simulato, cambio immediato del mondo, quote stradali della Riviera, intervalli di sicurezza dei semafori, arresto/ripartenza del traffico, attesa/attraversamento dei pedoni, conservazione dell’energia in curva e caduta sotto gravità; per la polizia: livello ricercato, avvio dell’inseguimento, arresto, fuga, stabilità con sei volanti e inseguimenti in movimento in città e in Riviera. Una verifica aggiuntiva della resa ravvicinata dei personaggi è inclusa nelle nove verifiche. Gli screenshot vengono salvati in `test-results/`.

Nel test fisico controllato, da 25 m/s (90 km/h) a meno di 0,5 m/s: circa 26,50 m sull'asciutto e 43,67 m sul bagnato. Sono risultati del modello di gioco, non misure di un'automobile reale. Il controller è verificato tramite input simulati; non è stato provato un dispositivo fisico.

## Asset e attribuzioni

- Alberi e texture Poly Haven (CC0), Car Concept (Khronos, CC BY 4.0) e registrazioni motore da Wikimedia Commons (CC BY / CC BY-SA): dettagli in `assets/CREDITS.md`.
- [Venice Sunset](https://polyhaven.com/a/venice_sunset), Greg Zaal / Poly Haven: ambiente HDR 1K.
- [Asphalt 02](https://polyhaven.com/a/asphalt_02), Poly Haven: diffuse, normal OpenGL e roughness 1K.
- Gli asset Poly Haven sono distribuiti sotto [CC0](https://polyhaven.com/license); copie locali nella cartella `assets/`. L'applicazione non chiama l'API Poly Haven durante il gioco.
- Three.js 0.160.0: licenza MIT, disponibile in `node_modules/three/LICENSE` dopo l'installazione.
