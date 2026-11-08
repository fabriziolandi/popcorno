# Inventario DNS di popcorno.it (Task 11, Step 1)

Data: 2026-11-08. Nameserver attuali: `dns103.ovh.net`, `ns103.ovh.net` (OVH).
Fonte: interrogazione DNS pubblica (DNS over HTTPS). **Da completare** con l'elenco della zona dalla CLI OVH
(`ovhcloud domain-zone record list popcorno.it`, serve `ovhcloud login`) o dal pannello OVH:
i record su nomi non noti (es. chiavi DKIM con selettore diverso) non si vedono dall'esterno.

| Nome | Tipo | Valore | TTL | Su Cloudflare |
|---|---|---|---|---|
| popcorno.it | MX | 1 mx1.mail.ovh.net. | 3600 | ✅ ricreare (solo DNS) |
| popcorno.it | MX | 5 mx2.mail.ovh.net. | 3600 | ✅ ricreare |
| popcorno.it | MX | 100 mx3.mail.ovh.net. | 3600 | ✅ ricreare |
| popcorno.it | TXT | `v=spf1 include:mx.ovh.com -all` | 3600 | ✅ ricreare |
| popcorno.it | TXT | `google-site-verification=Npdvzj6Kfims_Et41o7qzgz78AsyG8NzHZXIugGUb_8` | 3600 | ✅ ricreare (Google Search Console) |
| popcorno.it | TXT | `1\|www.popcorno.it` | 3600 | ❌ non serve (record di reindirizzamento web OVH) |
| ftp.popcorno.it | CNAME | popcorno.it. | 3600 | ❌ non serve (nessun FTP; con il dominio sul Worker punterebbe al sito) |
| popcorno.it | A | 185.199.108–111.153 | 3600 | ❌ GitHub Pages: sostituito dal dominio personalizzato del Worker |
| popcorno.it | AAAA | 2606:50c0:8000–8003::153 | 3600 | ❌ GitHub Pages: come sopra |
| www.popcorno.it | CNAME | fabriziolandi.github.io. | 3600 | ❌ GitHub Pages: `www` va collegato al Worker (reindirizza a `popcorno.it`) |

Non trovati: DMARC (`_dmarc`), DKIM `ovhmo-selector-1/2`, SRV di autodiscover, CAA.

Dopo il passaggio, attesi: `NS` → Cloudflare; `MX` → gli stessi tre valori di sopra; email di prova a `privacy@popcorno.it` arrivata.
