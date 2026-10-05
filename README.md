# Bot WhatsApp para clínica (IA local e gratuita)

Painel web onde você **lê o QR Code**, conecta o seu WhatsApp e liga/desliga um **bot** (começa sempre **desligado**).
Com o bot ligado, a IA (Ollama, roda local, sem custo) atende pacientes, responde dúvidas, **agenda/cancela consultas** e
passa para a recepção quando o paciente pede um atendente.

## Recursos
- QR Code ao vivo + status da conexão; sessão fica salva (não precisa escanear de novo).
- Botão **Bot ligado/desligado** global e **pausa por conversa** (você assume o atendimento).
- Agenda com horários configuráveis; a IA só oferece horários livres e o servidor valida antes de confirmar.
- Você edita no painel o texto de "como tratar o paciente" (preços, endereço, tom de voz...).
- Responder manualmente pelo painel.

## Rodar (Docker – recomendado, num servidor/VPS)
```bash
docker compose up -d
docker compose exec ollama ollama pull llama3.2:3b   # baixa o modelo (uma vez)
# abra http://SEU_SERVIDOR:3000
```
Defina `PANEL_PASSWORD=suasenha` (usuário qualquer) para proteger o painel se estiver na internet.

## Rodar sem Docker
```bash
# instale o Ollama (https://ollama.com) e: ollama pull llama3.2:3b
npm install && npm start      # http://localhost:3000
```

## Sobre o GitHub
O GitHub guarda o código, mas **GitHub Pages não executa o servidor**. Opções: **GitHub Codespaces** (para testar; use a
porta 3000 e rode o Ollama lá), ou um VPS/PC seu com Docker. Modelos 3B rodam em CPU com 8 GB de RAM (respostas em alguns segundos);
para mais qualidade use `qwen2.5:7b` ou `llama3.1:8b` (troque em *Configurações*).

## Avisos importantes
- Usa a biblioteca **Baileys** (WhatsApp Web não-oficial). Há risco de bloqueio do número se usado para spam;
  use apenas para atender quem entrou em contato, e de preferência com um número dedicado.
- IA pode errar: o bot é instruído a não dar orientação médica e a encaminhar para a recepção. Revise as conversas.
- Dados (conversas de pacientes) ficam no volume `/data`; trate conforme a LGPD e não exponha o painel sem senha/HTTPS.
