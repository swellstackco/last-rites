# Fonts

Self-hosted so the page needs no remote origin (the CSP stays strict). The woff2 files are the Latin, normal-style files copied unchanged from the published Fontsource packages (obtained with `npm pack` in a temporary directory). No Fontsource package is a dependency of this repo.

| file | family | weight | source package | version | SHA-256 |
|---|---|---|---|---|---|
| `barlow-condensed-latin-600-normal.woff2` | Barlow Condensed | 600 | `@fontsource/barlow-condensed` | 5.3.0 | `215a93c696f442034a46fbb382958f753fda60e30490683aeea6b235fcbb2b66` |
| `barlow-condensed-latin-700-normal.woff2` | Barlow Condensed | 700 | `@fontsource/barlow-condensed` | 5.3.0 | `3787a5a419171630e6890cfa47c4da067474d005cd0ff8dc11ec090fdc3ee2b8` |
| `ibm-plex-mono-latin-400-normal.woff2` | IBM Plex Mono | 400 | `@fontsource/ibm-plex-mono` | 5.3.0 | `08949f728dc52d528e69b1667d15c89a5686a4ee9a296ff90983985f99c380f7` |
| `ibm-plex-mono-latin-600-normal.woff2` | IBM Plex Mono | 600 | `@fontsource/ibm-plex-mono` | 5.3.0 | `0d1f0b8d0722224e32e9f28261bdc86c79115be73444ae5eceb73976a1bcdf83` |
| `ibm-plex-sans-latin-400-normal.woff2` | IBM Plex Sans | 400 | `@fontsource/ibm-plex-sans` | 5.3.0 | `3b646991d30055a93a4ecc499713d4347953a74a947ecab435ab72070cbdab0e` |
| `ibm-plex-sans-latin-600-normal.woff2` | IBM Plex Sans | 600 | `@fontsource/ibm-plex-sans` | 5.3.0 | `8960851d691c054ed38e259bdcf1a6190d157b4203ed5bb32c632a863fb8ec2f` |
| `special-elite-latin-400-normal.woff2` | Special Elite | 400 | `@fontsource/special-elite` | 5.3.0 | `770493d84cbb753cd0573d0f014550583138f40469d137e310d239593a1949d8` |

## Licenses

Full texts are in `licenses/`, copied from each package's `LICENSE` file (every package ships one, so none was taken from an upstream repository).

| family | license | file | copyright |
|---|---|---|---|
| Barlow Condensed | SIL Open Font License 1.1 | `licenses/OFL-Barlow-Condensed.txt` | The Barlow Project Authors |
| IBM Plex Sans | SIL Open Font License 1.1 | `licenses/OFL-IBM-Plex-Sans.txt` | IBM Corp. |
| IBM Plex Mono | SIL Open Font License 1.1 | `licenses/OFL-IBM-Plex-Mono.txt` | IBM Corp. |
| Special Elite | Apache License 2.0 | `licenses/Apache-2.0-Special-Elite.txt` | Copyright (c) 2010 by Brian J. Bonislawsky DBA Astigmatic (AOETI) |

Special Elite is Apache-2.0; the other three families are SIL OFL 1.1.
