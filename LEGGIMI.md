# Prezzi Amazon (estensione Chrome/Edge) — v3.0

Monitora il **prezzo corrente** di una lista di ASIN usando la **tua sessione Amazon reale** (loggata) → Amazon non ti vede come "robot" e non blocca. **Forza la localizzazione Italia** (CAP), gestisce **varianti/taglie**, tiene uno **storico cumulativo** con mini-grafici, e include un **gestore ASIN** con import da Excel/CSV.

## Disponibile sul Chrome Web Store
**ASIN Hunter è pubblicata anche sul Google Chrome Web Store come estensione.** Puoi installarla con un clic su "Aggiungi a Chrome", senza attivare la Modalità sviluppatore, e ricevere gli aggiornamenti automatici. In alternativa puoi installarla manualmente da questa cartella (vedi sotto).

## Installazione (una volta sola)
### Chrome
1. Apri `chrome://extensions`
2. Attiva in alto a destra **Modalità sviluppatore**
3. **Carica estensione non pacchettizzata** → seleziona questa cartella
### Edge
1. Apri `edge://extensions`
2. Attiva **Modalità sviluppatore** (in basso a sinistra)
3. **Carica decompressa** → seleziona questa cartella

Clicca l'icona € → l'app si apre **a tutto schermo** con 3 schede.

## Scheda "Gestione ASIN"
Qui costruisci e mantieni la lista di prodotti, **salvata in modo permanente** finché non la elimini.
- **Incolla ASIN**: uno per riga (o incolla direttamente una colonna copiata da Excel).
- **Importa da file** `.xlsx` o `.csv`: l'app rileva automaticamente la **colonna degli ASIN**, mostra un'anteprima e permette di sceglierla manualmente. Le etichette (nome prodotto) vengono prese da una colonna testuale se presente.
- Ogni ASIN ha un'**etichetta** modificabile. Duplicati ignorati.
- **Esporta lista** / **Svuota tutto**.

## Scheda "Raccolta"
- Imposta **dominio** e **CAP** (default 20121 = Milano) con "Forza CAP".
- **▶ Raccogli prezzi**: visita ogni ASIN della lista in una finestra in background, legge **prezzo + variante** (forzando la variante esatta con `psc=1`), gestisce "Non disponibile" e **captcha** (avvisa di risolverlo a mano).
- Al termine: i dati vengono **salvati nello Storico** e scaricati come CSV `prezzi_amazon_AAAA-MM-GG.csv`.

## Scheda "Storico"
- **Andamento nel tempo**: ogni raccolta si accumula. Per ogni prodotto vedi ultimo prezzo, **variazione** vs rilevazione precedente (▲/▼) e un **mini-grafico** (sparkline).
- **Tutte le rilevazioni** in tabella.
- **Esporta storico (CSV)**: un unico file con tutta la cronologia (`Data;ASIN;Etichetta;Variante;Prezzo;PrezzoNum;URL;Titolo`).
- **Cancella storico** se vuoi ripartire.

## Note tecniche
- **Varianti/taglie**: ogni ASIN è una variante specifica; con `psc=1` si legge il prezzo di quell'esatta dimensione (colonna Variante).
- **Forza Italia**: usa il flusso ufficiale di Amazon per impostare il CAP (endpoint glow con token anti-CSRF letto dalla pagina).
- **Import Excel senza librerie**: `.xlsx` letto in locale (ZIP + inflate nativo del browser), nessuna dipendenza esterna, nessun invio dati.
- **Persistenza**: lista ASIN, storico e impostazioni sono in `chrome.storage.local` (restano tra sessioni).
- **Privacy**: nessun dato lascia il browser, a parte le normali richieste ad Amazon.

## File
- `manifest.json` — configurazione (Manifest V3)
- `background.js` — apre l'app a tutto schermo al clic sull'icona
- `app.html` / `app.js` — interfaccia a schede e logica
- `xlsx.js` — parser XLSX/CSV in-browser
- `icon.png` — icona

## CSV per Excel italiano
Tutti i CSV usano `;` e BOM UTF-8: si aprono correttamente in Excel italiano con la € leggibile e le colonne separate.
