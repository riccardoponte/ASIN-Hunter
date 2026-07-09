# ASIN Hunter

Estensione per **Chrome/Edge** (Manifest V3) che monitora il **prezzo corrente** di una lista di ASIN usando la **tua sessione Amazon reale** (loggata): Amazon non ti vede come "robot" e non blocca le richieste. Forza la **localizzazione Italia** (CAP), gestisce **varianti/taglie**, tiene uno **storico cumulativo** con mini‑grafici e include un **gestore ASIN** con import da Excel/CSV.

## Disponibile sul Chrome Web Store

**ASIN Hunter è pubblicata anche sul Google Chrome Web Store come estensione.**

Questo significa che puoi installarla direttamente dallo store, con un solo clic su **"Aggiungi a Chrome"**, senza dover attivare la Modalità sviluppatore né caricare manualmente la cartella. Lo store gestisce anche gli **aggiornamenti automatici**: quando viene pubblicata una nuova versione, il browser la aggiorna da solo.

<!-- Sostituisci il link qui sotto con l'URL definitivo della pagina Chrome Web Store quando disponibile -->
> Link Chrome Web Store: _da inserire_

In alternativa, questa repository contiene il **codice sorgente completo** dell'estensione, che puoi caricare manualmente come estensione non pacchettizzata (vedi [Installazione manuale](#installazione-manuale-da-sorgente)).

## Funzionalità principali

- **Gestore ASIN persistente**: costruisci e mantieni la lista di prodotti, salvata finché non la elimini.
- **Import Excel/CSV**: rilevamento automatico della colonna ASIN, con anteprima e scelta manuale; etichette prese da una colonna testuale se presente.
- **Raccolta prezzi in sessione reale**: visita ogni ASIN in una finestra in background, legge **prezzo + variante** (forzando la variante esatta con `psc=1`), gestisce "Non disponibile" e **captcha**.
- **Forza Italia**: imposta il CAP (default 20121 = Milano) tramite il flusso ufficiale di Amazon.
- **Storico cumulativo**: ogni raccolta si accumula; per ogni prodotto vedi ultimo prezzo, **variazione** vs rilevazione precedente (▲/▼) e un **mini‑grafico** (sparkline).
- **Export CSV** compatibile con Excel italiano (separatore `;` e BOM UTF‑8).

## Installazione

### Dal Chrome Web Store (consigliato)

1. Apri la pagina dell'estensione sul Chrome Web Store.
2. Clicca **"Aggiungi a Chrome"** e conferma.
3. Clicca l'icona dell'estensione per aprire l'app a tutto schermo.

### Installazione manuale (da sorgente)

#### Chrome
1. Apri `chrome://extensions`
2. Attiva in alto a destra **Modalità sviluppatore**
3. **Carica estensione non pacchettizzata** → seleziona questa cartella

#### Edge
1. Apri `edge://extensions`
2. Attiva **Modalità sviluppatore** (in basso a sinistra)
3. **Carica decompressa** → seleziona questa cartella

Clicca l'icona € → l'app si apre **a tutto schermo** con 3 schede.

## Utilizzo

### Scheda "Gestione ASIN"
Costruisci e mantieni la lista di prodotti, salvata in modo permanente finché non la elimini.
- **Incolla ASIN**: uno per riga (o incolla una colonna copiata da Excel).
- **Importa da file** `.xlsx` o `.csv`: rilevamento automatico della colonna ASIN, anteprima e scelta manuale. Le etichette vengono prese da una colonna testuale se presente.
- Ogni ASIN ha un'**etichetta** modificabile. Duplicati ignorati.
- **Esporta lista** / **Svuota tutto**.

### Scheda "Raccolta"
- Imposta **dominio** e **CAP** (default 20121 = Milano) con "Forza CAP".
- **▶ Raccogli prezzi**: visita ogni ASIN in una finestra in background, legge **prezzo + variante** (`psc=1`), gestisce "Non disponibile" e **captcha** (avvisa di risolverlo a mano).
- Al termine: i dati vengono salvati nello **Storico** e scaricati come CSV `prezzi_amazon_AAAA-MM-GG.csv`.

### Scheda "Storico"
- **Andamento nel tempo**: ogni raccolta si accumula. Per ogni prodotto: ultimo prezzo, **variazione** vs rilevazione precedente (▲/▼) e **mini‑grafico** (sparkline).
- **Tutte le rilevazioni** in tabella.
- **Esporta storico (CSV)**: un unico file con tutta la cronologia (`Data;ASIN;Etichetta;Variante;Prezzo;PrezzoNum;URL;Titolo`).
- **Cancella storico** per ripartire.

## Note tecniche

- **Varianti/taglie**: ogni ASIN è una variante specifica; con `psc=1` si legge il prezzo di quell'esatta dimensione (colonna Variante).
- **Forza Italia**: usa il flusso ufficiale di Amazon per impostare il CAP (endpoint glow con token anti‑CSRF letto dalla pagina).
- **Import Excel senza librerie**: `.xlsx` letto in locale (ZIP + inflate nativo del browser), nessuna dipendenza esterna, nessun invio dati.
- **Persistenza**: lista ASIN, storico e impostazioni sono in `chrome.storage.local` (restano tra sessioni).
- **Privacy**: nessun dato lascia il browser, a parte le normali richieste ad Amazon.

## Struttura del progetto

| File | Descrizione |
|------|-------------|
| `manifest.json` | Configurazione dell'estensione (Manifest V3) |
| `background.js` | Apre l'app a tutto schermo al clic sull'icona |
| `app.html` / `app.js` | Interfaccia a schede e logica applicativa |
| `xlsx.js` | Parser XLSX/CSV in‑browser |
| `pa.css` / `ui.css` | Fogli di stile |
| `icon*.png` | Icone dell'estensione (16/32/48/128) |
| `make_icon.py` | Script per generare le icone |

## CSV per Excel italiano

Tutti i CSV usano `;` e BOM UTF‑8: si aprono correttamente in Excel italiano, con la € leggibile e le colonne separate.

## Privacy

L'estensione non invia dati a server di terze parti. Tutte le informazioni (lista ASIN, storico, impostazioni) restano nel browser tramite `chrome.storage.local`. Le uniche richieste di rete sono quelle dirette ad Amazon, effettuate con la tua sessione già loggata.
