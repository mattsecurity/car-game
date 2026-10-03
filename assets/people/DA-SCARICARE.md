# Persone realistiche da Mixamo (≈10 minuti)

Mixamo (Adobe) è gratuito: serve solo un account Adobe. La licenza permette di usare personaggi e animazioni nel gioco, anche commerciale (non si possono rivendere i file così come sono).

Metti tutti i file scaricati in **`assets/people/src/`** con i nomi indicati sotto. Poi dimmelo: lancio io lo strumento che li converte per il gioco.

## 1. Personaggi (6 file)

Su https://www.mixamo.com → scheda **Characters** → cerca il nome → selezionalo → **Download** con queste impostazioni:
- Format: **FBX Binary (.fbx)**
- Pose: **T-pose**

| Cerca | Salva come | Tipo |
| --- | --- | --- |
| Remy | `remy.fbx` | uomo, giacca casual |
| Kate | `kate.fbx` | donna, casual |
| Megan | `megan.fbx` | donna, tailleur |
| Leonard | `leonard.fbx` | uomo anziano |
| Claire | `claire.fbx` | donna, casual |
| Josh | `josh.fbx` | uomo giovane |

Se uno dei nomi non c'è più, va bene qualsiasi personaggio realistico vestito in modo normale (niente armature o costumi): salvalo con un nome qualsiasi in minuscolo.

## 2. Animazioni (3 file)

Scheda **Animations**, con un personaggio qualsiasi selezionato → cerca l'animazione → **Download**:
- Format: **FBX Binary (.fbx)**
- Skin: **Without Skin**
- Frames per Second: **30**
- Keyframe Reduction: **none**

| Cerca | Opzioni nella colonna di destra | Salva come |
| --- | --- | --- |
| Walking | spunta **In Place** | `walk.fbx` |
| Standing Idle (o "Idle") | — | `idle.fbx` |
| Talking On Phone | — | `phone.fbx` |

Tutti i personaggi Mixamo condividono lo stesso scheletro, quindi le 3 animazioni valgono per tutti.

## Cosa succede dopo

`tools/bake-people.mjs` apre i file in un browser invisibile, riduce le texture a 1024 px, esporta ogni personaggio in un `.glb` leggero e registra le pose dello scheletro di ogni animazione in una piccola texture. I file originali in `src/` non vengono usati dal gioco e puoi eliminarli dopo la conversione.
