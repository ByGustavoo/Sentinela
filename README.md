<div align="center"> <br>
  <img align="center" alt="sentinela-python" height="150" width="150" src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/python/python-original.svg" />
</div>

<br>

<div align="center">
  Painel local para ver quem está conectado no seu Wi-Fi e cortar o acesso de aparelhos que você não reconhece. Roda 100% na sua máquina — nada vai para a internet.
</div>

<br>

<div align="center">

⚠️ Use apenas na **sua própria rede** (a que você administra). Interferir no tráfego de redes de terceiros é ilegal na maioria dos países.

</div>

<br>

## 🚀 Ferramentas Utilizadas

* 🐍 Python 3.9+

* 🌐 Flask (servidor + painel web)

* 📡 Scapy (descoberta e bloqueio via ARP)

* 🏷️ mac-vendor-lookup (fabricante pelo MAC)

* 🎨 HTML + CSS + JavaScript (front-end do painel)

* 🪟 Npcap (captura/injeção de pacotes no Windows)

<br>

## 🔎 Como Funciona (resumo honesto)

* **Ver os aparelhos:** o programa manda um "quem está aí?" (ARP) para toda a
  sub-rede e lista quem responde — mostrando **IP**, **MAC**, o **fabricante**
  deduzido do MAC (Apple, Samsung, etc.) e o **nome de rede** do aparelho
  (hostname), quando ele divulga um. Funciona igual em qualquer roteador.

  > Sobre "modelo": o modelo exato do aparelho não trafega pela rede. O que dá
  > para saber sem acesso privilegiado ao aparelho é o **fabricante** (pelo MAC)
  > e o **hostname** que ele anuncia (ex.: `iPhone-de-Ana`, `TV-Samsung`) — as
  > melhores pistas de identidade disponíveis, e é isso que o painel mostra.

* **Bloquear:** o botão *Bloquear* usa **ARP spoofing** direcionado — engana o
  aparelho-alvo fazendo o tráfego dele "cair num buraco". É **reversível** e só
  vale **enquanto o programa estiver aberto**. É a mesma técnica de apps
  comerciais tipo NetCut. O botão pede uma **confirmação** antes de cortar, para
  evitar bloqueio acidental. Para bloqueio **permanente**, o certo é o roteador
  (veja abaixo) — o do Sentinela é ótimo para "expulsar agora" alguém desconhecido.

<br>

## ⚙️ Pré-requisitos

* Python 3.9 ou superior

* Privilégios de **administrador** (o ARP exige)

* **Windows:** o Scapy precisa do **Npcap** para capturar/injetar pacotes.
  Instale de [npcap.com](https://npcap.com) marcando *"WinPcap API-compatible mode"*.

<br>

## 📦 Instalação

```bash
pip install -r requirements.txt
```

<br>

## ▶️ Como Executar

O ARP precisa de privilégios de administrador:

```bash
# Linux / macOS
sudo python app.py

# Windows — abra o terminal "como administrador" e rode
python app.py
```

No Windows há também o atalho **`run.bat`** (clique com o botão direito →
*"Executar como administrador"*), que já valida o privilégio e sobe o painel.

Depois abra **http://127.0.0.1:5000** no navegador e clique em **Escanear rede**.

* **Conheço** → marca o aparelho como conhecido (fica verde e é lembrado).
* **Apelido** → dê um nome ("TV da sala", "celular da Ana").
* **Busca e filtros** → ache um aparelho por nome, fabricante, IP ou MAC, ou
  filtre por conhecidos / desconhecidos / bloqueados.
* **Ordenação** → clique num cabeçalho de coluna (ou use "Ordenar") para ordenar
  por nome, fabricante, IP ou MAC, crescente ou decrescente.
* **Atualizar automaticamente** → reescaneia a rede a cada 30 s (pula a
  atualização enquanto você digita um apelido ou confirma um bloqueio).
* **Bloquear** → confirme e o acesso é cortado na hora; **Desbloquear** devolve.
  Se o Sentinela não conseguir resolver o MAC do roteador, o bloqueio fica
  indisponível e o painel avisa (rode como administrador e confira o Npcap).
* Fechar o programa **desbloqueia tudo automaticamente**.

<br>

## 🛡️ Bloqueio Permanente pelo Roteador (recomendado)

O bloqueio do Sentinela some quando você fecha o app. Para banir um aparelho de
vez, copie o **MAC** que aparece no painel e cadastre no roteador:

1. Acesse o roteador no navegador (geralmente `http://192.168.0.1` ou
   `http://192.168.1.1` — o painel mostra o IP do seu roteador em "Roteador").
2. Entre com usuário/senha do roteador (não é a senha do Wi-Fi).
3. Procure por **Controle de Acesso**, **Filtro de MAC** ou **MAC Filtering**.
4. Adicione o MAC do intruso à lista de **bloqueados** e salve.

Depois disso, é uma boa **trocar a senha do Wi-Fi** — assim qualquer
desconhecido que já tinha a senha é desconectado de vez.

<br>

## 📁 Estrutura

```
Sentinela
├── app.py              # Servidor + painel (é o que você roda)
├── scanner.py          # Descoberta dos aparelhos (ARP + fabricante + hostname)
├── blocker.py          # Bloqueio/desbloqueio (ARP spoofing)
├── store.py            # Lembra apelidos e o que é conhecido (known_devices.json)
├── run.bat             # Atalho para rodar como administrador no Windows
├── requirements.txt    # Dependências Python
├── templates
│   └── index.html      # A página do painel
└── static
    ├── style.css       # Aparência do painel
    └── app.js          # Comportamento do painel
```

<br>

## ⚠️ Limitações

* Assume rede doméstica comum (máscara /24). Redes maiores ou segmentadas podem
  não aparecer inteiras.
* O **hostname** só aparece quando o aparelho o divulga; muitos celulares em modo
  de privacidade não respondem, e nesse caso o painel mostra "Nome não divulgado".
* Aparelhos podem "burlar" o bloqueio ARP (fixando ARP estático) — por isso o
  filtro no roteador é mais definitivo.
* Não escaneia redes Wi-Fi de convidado isoladas do seu segmento.

<br>

## 🖥️ Desenvolvedor

### 🔵 LinkedIn: [Gustavo Correa](https://www.linkedin.com/in/gustavo-chauar-correa-946168269/)
