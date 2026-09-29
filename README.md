# ESP32 IoT — Monitoramento inteligente

Landing page responsiva inspirada na referência, com painel de movimento, estado do sistema, gráfico por período, histórico com filtros e exportação CSV. HTML, CSS e JavaScript, sem dependências de execução. A ilustração é um arquivo local.

## Executar

Com Node.js 20.12 ou superior, execute na pasta do projeto:

```powershell
npm.cmd start
```

Abra **http://localhost:3000**. O servidor Node é necessário: o navegador consulta `GET /api/dashboard?hours=24`, e o backend lê o Supabase. Para publicar, use uma hospedagem com suporte a Node.js, configure as variáveis de ambiente e execute `npm start`. Use `HOST=0.0.0.0` quando a hospedagem exigir acesso externo. Não abra apenas o HTML nem publique como site exclusivamente estático.

## Demonstração

Sem configuração, os dados são **simulados e identificados na interface**. O modo é escolhido exclusivamente pelo backend. Os botões abaixo do painel simulam movimento por oito segundos e o desligamento/ligamento do sistema. Nenhuma ação da demonstração envia dados ao banco ou controla um dispositivo real. No modo real, os controles de simulação não aparecem.

O seletor do gráfico alterna entre uma hora, 24 horas e sete dias. O histórico e a exportação respeitam esse período e os filtros de status/data. Horários são exibidos no fuso local do navegador; o banco armazena datas com fuso horário.

## Configurar o Supabase no backend

1. No SQL Editor do seu projeto Supabase, execute [`supabase/schema.sql`](supabase/schema.sql). O schema mantém somente `eventos` e remove `sensor_state`, caso ela tenha sido criada pela versão anterior. Os registros de `eventos` não são removidos.
2. Copie [`.env.example`](.env.example) para `.env` na pasta do servidor.
3. Preencha `SUPABASE_URL` e `SUPABASE_KEY` com a URL e a chave publishable/anon do projeto. Mantenha `IOT_DEMO_MODE=false` para exigir a conexão real.
4. Reinicie o servidor com `npm.cmd start`. Na hospedagem, essas mesmas variáveis podem ser definidas no painel do provedor.

Não há formulário, botão ou endpoint para alterar a conexão pela interface. URL e chave ficam no servidor. O backend consulta `eventos`, normaliza os registros e não expõe a chave nem outros campos da tabela. O arquivo `.env` não é servido e está no `.gitignore`.

`IOT_DEMO_MODE=true` força a demonstração. Sem URL/chave e sem essa variável, o servidor abre a demonstração para desenvolvimento. Configuração incompleta ou inválida no modo real retorna indisponibilidade, sem substituir dados reais por exemplos. O backend usa a [Data API REST do Supabase](https://supabase.com/docs/guides/api).

O firmware usa somente a chave publishable/anon e não autentica um usuário. Por isso, o schema permite **inserção pública** na tabela `eventos`; qualquer pessoa que conheça a chave pública poderá gravar eventos válidos. Isso é aceitável apenas para demonstração. Não use a chave `service_role` no ESP32. Para um ambiente real, restrinja a escrita com autenticação ou mova a gravação para uma Edge Function com segredo mantido fora do dispositivo.

## Contrato para o ESP32

O firmware do ESP32 deve enviar `POST` para:

```text
https://SEU-PROJETO.supabase.co/rest/v1/eventos
```

O sketch completo atualizado está em [`firmware/esp32_monitoramento.ino`](firmware/esp32_monitoramento.ino). Preencha nele `SSID`, `SENHA`, `SUPABASE_URL` e `SUPABASE_KEY` e grave-o no ESP32. O envio de eventos continua usando estes cabeçalhos e este corpo:

```text
apikey: SUA_CHAVE_PUBLICA
Content-Type: application/json
Prefer: return=minimal
```

Corpo enviado pelo firmware a cada nova detecção do PIR:

```json
{
  "numero_evento": 1,
  "data_hora": "28/09/2026 12:00:00"
}
```

O banco gera `id`; o ESP32 não envia esse campo. `data_hora` usa o formato `DD/MM/YYYY HH:mm:ss` em UTC−3. Se o NTP não estiver disponível, o firmware grava `data_indisponivel`; o evento continua visível no histórico, mas não entra no gráfico. O ESP32 salva eventos no LittleFS e tenta reenviá-los quando há Wi-Fi. Como o firmware mantém o evento local após o comando serial `S`, o painel agrupa reenvios com o mesmo número e horário.

## Estados e atualização

- Consulta automática a cada **5 segundos**, enquanto a aba estiver visível. Não usa WebSocket; existe a latência da consulta.
- O painel mostra a detecção mais recente, contagens por período e histórico. Horários são exibidos em Brasília (UTC−3).
- O firmware registra o evento quando o PIR passa de inativo para ativo. A tabela não armazena mudanças para inativo nem heartbeat.
- A interface mostra a última detecção registrada; não indica se há movimento neste instante nem se o ESP32 está conectado.
- Erro na consulta aparece como indisponibilidade dos dados; o painel não inventa um estado do dispositivo.

O gráfico/histórico consulta até **1.000 eventos mais recentes**. Para volumes maiores, implemente paginação remota ou agregação no banco.

## Verificações

```powershell
npm.cmd test
```

Os testes cobrem a conversão do horário do firmware, deduplicação de reenvios, contagem de eventos, filtros, exportação e consulta segura do endpoint. A conexão com um Supabase real depende da configuração do seu projeto.

Testes de interface com Playwright e Microsoft Edge instalado:

```powershell
npm.cmd install
npm.cmd run test:ui
```

Esses testes verificam a interação da demonstração, filtros, download, respostas simuladas da API e o layout entre 360 e 1440 pixels.

## Arte

[`assets/hero.png`](assets/hero.png) foi criada com a ferramenta integrada de imagegen. O prompt final está em [`assets/hero-prompt.txt`](assets/hero-prompt.txt).
