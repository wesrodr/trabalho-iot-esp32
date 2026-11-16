# Monitoramento IoT com ESP32

Projeto acadêmico de monitoramento de movimento com sensor PIR, ESP32, Supabase e painel web. O painel apresenta os eventos recebidos, gráfico por período, histórico com filtros e exportação CSV.

## Identificação

- **Alunos:** Gisele Maria, Markus Aurélius, Juliano Moraes, Sheylla Pereira, Wesley Ruan
- **Professor(a):** João Victor Lopes de Loiola
- **Faculdade:** Piauí Instituto de Tecnologia

## Estrutura do projeto

```text
.
├── api/
│   └── dashboard.js                 # Função serverless da Vercel
├── assets/                          # Imagens, ícones e prompt da arte
├── firmware/
│   └── esp32_monitoramento.ino       # Código do ESP32
├── supabase/
│   └── schema.sql                   # Tabela, permissões e políticas RLS
├── tests/
│   ├── browser/                     # Testes de interface com Playwright
│   ├── monitor.test.js              # Testes de regras e dados
│   └── server.test.js               # Testes das rotas e integração
├── .env.example                     # Modelo das variáveis locais
├── index.html                       # Página do painel
├── monitor.js                       # Regras de datas, eventos e gráfico
├── script.js                        # Interações da interface
├── server.js                        # Servidor local e handler compartilhado
├── style.css                        # Estilos
├── package.json
└── package-lock.json
```

## Requisitos

- Node.js 20.12 ou superior
- npm
- Projeto Supabase para usar dados reais
- Arduino IDE e bibliotecas do firmware para gravar o ESP32

## Executar localmente

Instale as dependências e inicie o servidor:

```powershell
npm.cmd install
npm.cmd start
```

Acesse [http://localhost:3000](http://localhost:3000). O navegador consulta `GET /api/dashboard`; o servidor local encaminha a consulta ao Supabase quando configurado. Sem configuração, o backend usa dados de demonstração e a interface identifica esse modo.

Para configurar os dados reais, copie `.env.example` para `.env` e preencha:

```dotenv
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_KEY=SUA_CHAVE_PUBLISHABLE_OU_ANON
IOT_DEMO_MODE=false
PORT=3000
HOST=127.0.0.1
```

Reinicie o servidor depois de alterar o `.env`. Esse arquivo é local, está no `.gitignore` e não deve ser enviado ao GitHub.

## Publicar na Vercel

O arquivo `api/dashboard.js` é a função serverless que atende às requisições do painel. A Vercel detecta a pasta `api/` na raiz do projeto; não é necessário iniciar `server.js` como processo persistente.

1. Importe o repositório do GitHub na Vercel e mantenha a raiz do projeto como **Root Directory**.
2. Em **Project Settings → Environment Variables**, cadastre `SUPABASE_URL`, `SUPABASE_KEY` e `IOT_DEMO_MODE`.
3. Defina `IOT_DEMO_MODE` como `false` para exigir a conexão real com o banco.
4. Selecione os ambientes em que cada variável estará disponível (Production, Preview e/ou Development).
5. Faça um novo deploy após salvar as variáveis.

Teste a função acessando `https://SEU-DOMINIO/api/dashboard?hours=24`. Com uma configuração válida, a resposta deve ser JSON com `"mode":"live"`. A chave do Supabase não deve ser colocada no JavaScript do navegador.

## Configurar o Supabase

1. No SQL Editor do Supabase, execute [`supabase/schema.sql`](supabase/schema.sql). O script cria a tabela `eventos`, ativa RLS e configura as permissões necessárias. Ele remove uma tabela antiga chamada `sensor_state`, se existir, mas não apaga os registros de `eventos`.
2. Use a URL do projeto e uma chave publishable/anon em `SUPABASE_URL` e `SUPABASE_KEY`.
3. Mantenha `IOT_DEMO_MODE=false` no ambiente conectado ao banco.

Execute também [`supabase/atividade_sensor.sql`](supabase/atividade_sensor.sql) para criar a tabela de leituras sem movimento, caso necessário. O script permite que o ESP32 insira as amostras e que o painel as consulte.

Para informar o estado do ESP32, execute [`supabase/status_dispositivo.sql`](supabase/status_dispositivo.sql). O painel consulta heartbeats recentes quando disponiveis. Para manter o firmware atual sem heartbeat, tambem usa o horario do ultimo movimento recebido como sinal de atividade: ate 2 minutos depois, mostra ONLINE; apos esse prazo, mostra OFFLINE. Isso indica atividade recente, mas nao confirma a conexao Wi-Fi quando nao ha movimento. O estado e recalculado a cada 5 segundos com a aba visivel.

O firmware envia um heartbeat `online` a cada 30 segundos para `status_dispositivo`, usando horário UTC. Execute o SQL acima para liberar a inserção anônima, configure as credenciais no sketch e grave o firmware atualizado. O ESP32 não precisa gravar `offline`: a ausência de heartbeat por mais de 2 minutos faz o painel exibir OFFLINE. Datas ausentes, inválidas ou futuras não indicam ONLINE. Status do dispositivo não entra na contagem de movimento do gráfico.

O backend consulta `eventos` (`id`, `numero_evento`, `data_hora`) e `atividade_sensor` (`id`, `data_hora`), sem devolver a chave ao navegador. Cada registro de `atividade_sensor` representa uma leitura sem movimento; sua data deve ser `timestamptz`, por exemplo `2026-09-29T14:00:00-03:00`. A consulta considera até 1.000 registros por tabela e exibe um aviso quando atinge esse limite.

O gráfico apresenta contagens separadas para movimento e ausência de movimento, usando as leituras reais gravadas nas tabelas `eventos` e `atividade_sensor`. Os históricos combinam as duas tabelas por data, com filtros por tipo e exportação CSV identificando a tabela de origem.

O firmware envia eventos de movimento para `eventos` e uma leitura sem movimento para `atividade_sensor` a cada 30 segundos enquanto o PIR permanece em LOW. Após movimento, aguarda 30 segundos antes de registrar a próxima amostra sem movimento. Execute o SQL atualizado da tabela `atividade_sensor` e grave o sketch atualizado no ESP32.

**Atenção à segurança:** as políticas permitem inserção anônima de eventos e de heartbeats `online`, então qualquer pessoa com a chave pública pode enviar registros válidos. Não use a chave `service_role` no firmware, no frontend nem no GitHub. Para uso em produção, restrinja a escrita com autenticação ou use uma Edge Function protegida.

## Firmware do ESP32

O sketch está em [`firmware/esp32_monitoramento.ino`](firmware/esp32_monitoramento.ino). Antes de gravar o código no dispositivo, configure `SSID`, `SENHA`, `SUPABASE_URL` e `SUPABASE_KEY` no sketch. Não faça commit de credenciais pessoais de Wi-Fi ou chaves privadas.

O ESP32 envia cada detecção do PIR para a API REST do Supabase, na tabela `eventos`, com os campos `numero_evento` e `data_hora`. O banco gera o `id`. A data usa `DD/MM/YYYY HH:mm:ss` em UTC−3; quando não há horário NTP disponível, o firmware registra `data_indisponivel`. Eventos pendentes são armazenados no LittleFS e reenviados quando a conexão retorna.

## Funcionamento do painel

- Atualiza os dados a cada cinco segundos enquanto a aba estiver visível.
- Permite visualizar períodos de uma hora, 24 horas e sete dias.
- Filtra o histórico e exporta os resultados em CSV.
- Exibe horários em UTC−3 e agrupa reenvios com o mesmo número e horário.
- Mostra a última leitura registrada e o último status informado pelo ESP32, com seus horários.
- A demonstração não grava dados no Supabase nem controla um dispositivo real.

## Testes

Testes de regras, servidor e função da Vercel:

```powershell
npm.cmd test
```

Testes de interface com Playwright e Microsoft Edge instalado:

```powershell
npm.cmd install
npm.cmd run test:ui
```


## Controle do LED pelo painel

Execute `supabase/comando_dispositivo.sql` no SQL Editor do Supabase. Configure as credenciais do projeto no firmware e no servidor, depois grave o sketch atualizado. No site conectado ao Supabase, o botao alterna o estado solicitado do LED; o ESP32 consulta o comando a cada 5 segundos, exibe o estado no OLED e controla o GPIO 26. Ligue um LED externo ao GPIO 26 com resistor em serie e o outro terminal ao GND.

A solicitacao e gravada no Supabase. O site confirma que ela foi salva; o ESP32 aplica o comando quando estiver conectado e fizer a proxima consulta. A tabela autoriza a chave anon a alterar esse estado, portanto use uma protecao adicional antes de expor o projeto publicamente.
