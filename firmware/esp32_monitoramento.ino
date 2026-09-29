#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <WiFi.h>
#include <time.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <HTTPClient.h>

const char* SSID = "";
const char* SENHA = "";

const char* SUPABASE_URL = "";
const char* SUPABASE_KEY = "";

const char* SERVIDOR_NTP = "pool.ntp.org";
const long GMT_OFFSET_SEC = -3 * 3600;
const int DAYLIGHT_OFFSET_SEC = 0;

const int PIR_PIN = 27;
const int BUZZER_PIN = 25;
const int OLED_SDA = 21;
const int OLED_SCL = 22;

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define OLED_ADDRESS 0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

unsigned long numeroEvento = 0;
bool movimentoAnterior = false;
unsigned long inicioAlarme = 0;
bool alarmeAtivo = false;
const unsigned long DURACAO_ALARME = 1000;

const unsigned long INTERVALO_RETRY_EVENTOS = 2000;

const char* ARQUIVO_EVENTOS = "/eventos.txt";
Preferences preferencias;

void mostrarDataHora() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    display.println("Data/hora indisponivel");
    return;
  }

  char dataHora[20];
  strftime(dataHora, sizeof(dataHora), "%d/%m/%Y %H:%M:%S", &timeinfo);
  display.println(dataHora);
}

String pegarDataHora() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return "data_indisponivel";

  char dataHora[20];
  strftime(dataHora, sizeof(dataHora), "%d/%m/%Y %H:%M:%S", &timeinfo);
  return String(dataHora);
}

String criarIDEvento() {
  String id = "ESP32-01-";
  if (numeroEvento < 10) id += "00000";
  else if (numeroEvento < 100) id += "0000";
  else if (numeroEvento < 1000) id += "000";
  else if (numeroEvento < 10000) id += "00";
  else if (numeroEvento < 100000) id += "0";
  id += String(numeroEvento);
  return id;
}

void salvarContador() {
  preferencias.putULong("contador", numeroEvento);
}

void carregarContador() {
  numeroEvento = preferencias.getULong("contador", 0);
  Serial.print("Contador recuperado: ");
  Serial.println(numeroEvento);
}

void salvarEventoLocal() {
  String idEvento = criarIDEvento();
  String dataHora = pegarDataHora();
  File arquivo = LittleFS.open(ARQUIVO_EVENTOS, FILE_APPEND);

  if (!arquivo) {
    Serial.println("Erro ao abrir arquivo de eventos.");
    return;
  }

  arquivo.print(idEvento);
  arquivo.print("|");
  arquivo.println(dataHora);
  arquivo.close();

  Serial.println("Evento salvo localmente:");
  Serial.print("ID: ");
  Serial.println(idEvento);
  Serial.print("Data/Hora: ");
  Serial.println(dataHora);
}

int contarEventosPendentes() {
  File arquivo = LittleFS.open(ARQUIVO_EVENTOS, FILE_READ);
  if (!arquivo) return 0;

  int quantidade = 0;
  while (arquivo.available()) {
    String linha = arquivo.readStringUntil('\n');
    if (linha.length() > 0) quantidade++;
  }

  arquivo.close();
  return quantidade;
}

void mostrarEventosSalvos() {
  File arquivo = LittleFS.open(ARQUIVO_EVENTOS, FILE_READ);
  if (!arquivo) {
    Serial.println("Nenhum evento local.");
    return;
  }

  Serial.println("===== EVENTOS LOCAIS =====");
  while (arquivo.available()) {
    Serial.println(arquivo.readStringUntil('\n'));
  }
  Serial.println("==========================");
  arquivo.close();
}

void apagarTodosOsEventos() {
  Serial.println("Apagando eventos locais...");

  if (LittleFS.exists(ARQUIVO_EVENTOS)) {
    LittleFS.remove(ARQUIVO_EVENTOS);
    Serial.println("Arquivo eventos.txt apagado.");
  }

  numeroEvento = 0;
  salvarContador();
  Serial.println("Contador de eventos zerado.");
}

bool enviarEventoSupabase(unsigned long numero, String dataHora) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi desconectado.");
    return false;
  }

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/eventos";
  http.begin(url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

  String dados = "{\"numero_evento\":" + String(numero) + ",\"data_hora\":\"" + dataHora + "\"}";
  Serial.println("Enviando evento para o Supabase...");
  Serial.print("Numero do evento: ");
  Serial.println(numero);
  Serial.print("Data/Hora: ");
  Serial.println(dataHora);

  int codigoResposta = http.POST(dados);
  if (codigoResposta >= 200 && codigoResposta < 300) {
    Serial.println("Evento enviado com sucesso!");
    http.end();
    return true;
  }

  Serial.print("Erro ao enviar evento. HTTP: ");
  Serial.println(codigoResposta);
  Serial.println(http.getString());
  http.end();
  return false;
}

void enviarPrimeiroEvento() {
  File arquivo = LittleFS.open(ARQUIVO_EVENTOS, FILE_READ);
  if (!arquivo) {
    Serial.println("Nenhum evento para enviar.");
    return;
  }

  String linha = arquivo.readStringUntil('\n');
  arquivo.close();
  linha.trim();

  if (linha.length() == 0) {
    Serial.println("Evento vazio.");
    return;
  }

  int separador = linha.indexOf('|');
  if (separador == -1) {
    Serial.println("Formato do evento invalido.");
    return;
  }

  String idEvento = linha.substring(0, separador);
  String dataHora = linha.substring(separador + 1);
  int ultimoTraco = idEvento.lastIndexOf('-');
  if (ultimoTraco == -1) {
    Serial.println("ID do evento invalido.");
    return;
  }

  unsigned long numero = idEvento.substring(ultimoTraco + 1).toInt();
  bool enviado = enviarEventoSupabase(numero, dataHora);
  if (enviado) {
    Serial.println("Teste concluido. O evento continua salvo no eventos.txt.");
  }
}

void verificarComandosSerial() {
  if (!Serial.available()) return;
  char comando = Serial.read();

  if (comando == 'R' || comando == 'r') {
    apagarTodosOsEventos();
  } else if (comando == 'L' || comando == 'l') {
    mostrarEventosSalvos();
  } else if (comando == 'C' || comando == 'c') {
    Serial.print("Numero do ultimo evento: ");
    Serial.println(numeroEvento);
    Serial.print("Eventos pendentes: ");
    Serial.println(contarEventosPendentes());
  } else if (comando == 'S' || comando == 's') {
    enviarPrimeiroEvento();
  }
}

void sincronizarEventos() {
  static unsigned long ultimaTentativa = 0;
  if (WiFi.status() != WL_CONNECTED) return;
  if (millis() - ultimaTentativa < INTERVALO_RETRY_EVENTOS) return;
  if (contarEventosPendentes() == 0) return;
  ultimaTentativa = millis();

  File arquivo = LittleFS.open(ARQUIVO_EVENTOS, FILE_READ);
  if (!arquivo) {
    Serial.println("Erro ao abrir eventos.txt.");
    return;
  }

  String linha = arquivo.readStringUntil('\n');
  arquivo.close();
  linha.trim();

  if (linha.length() == 0) {
    Serial.println("Evento vazio.");
    return;
  }

  int separador = linha.indexOf('|');
  if (separador == -1) {
    Serial.println("Formato do evento invalido.");
    return;
  }

  String idEvento = linha.substring(0, separador);
  String dataHora = linha.substring(separador + 1);
  int ultimoTraco = idEvento.lastIndexOf('-');
  if (ultimoTraco == -1) {
    Serial.println("ID do evento invalido.");
    return;
  }

  unsigned long numero = idEvento.substring(ultimoTraco + 1).toInt();
  if (!enviarEventoSupabase(numero, dataHora)) {
    Serial.println("Evento mantido na memoria local para nova tentativa.");
    return;
  }

  File original = LittleFS.open(ARQUIVO_EVENTOS, FILE_READ);
  File temporario = LittleFS.open("/eventos_temp.txt", FILE_WRITE);
  if (!original || !temporario) {
    Serial.println("Erro ao preparar remocao do evento.");
    if (original) original.close();
    if (temporario) temporario.close();
    return;
  }

  original.readStringUntil('\n');
  while (original.available()) {
    String outraLinha = original.readStringUntil('\n');
    outraLinha.trim();
    if (outraLinha.length() > 0) temporario.println(outraLinha);
  }

  original.close();
  temporario.close();
  LittleFS.remove(ARQUIVO_EVENTOS);
  LittleFS.rename("/eventos_temp.txt", ARQUIVO_EVENTOS);

  Serial.print("Evento removido da memoria local. Restantes: ");
  Serial.println(contarEventosPendentes());
}

void mostrarMonitoramento() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("SISTEMA DE ALARME");
  display.setCursor(0, 20);
  display.println("Monitorando...");
  display.setCursor(0, 40);
  display.print("Eventos: ");
  display.println(numeroEvento);
  display.display();
}

void mostrarEvento() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("MOVIMENTO!");
  display.setCursor(0, 15);
  display.print("Evento: ");
  display.println(numeroEvento);
  display.setCursor(0, 30);
  mostrarDataHora();
  display.setCursor(0, 50);
  display.println("Alarme ativo");
  display.display();
}

void conectarWiFi() {
  WiFi.begin(SSID, SENHA, 6);
  Serial.print("Conectando ao Wi-Fi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("Wi-Fi conectado!");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

void configurarHorario() {
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, SERVIDOR_NTP);
  Serial.println("Sincronizando horario...");

  struct tm timeinfo;
  while (!getLocalTime(&timeinfo)) {
    Serial.println("Aguardando horario...");
    delay(1000);
  }

  Serial.println("Horario sincronizado!");
  Serial.printf("Data: %02d/%02d/%04d\n", timeinfo.tm_mday, timeinfo.tm_mon + 1, timeinfo.tm_year + 1900);
  Serial.printf("Hora: %02d:%02d:%02d\n", timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
}

void iniciarMemoria() {
  if (!LittleFS.begin()) {
    Serial.println("Erro ao iniciar memoria local.");
    return;
  }

  Serial.println("Memoria local iniciada.");
  Serial.print("Eventos pendentes encontrados: ");
  Serial.println(contarEventosPendentes());
  mostrarEventosSalvos();
}

void setup() {
  Serial.begin(115200);
  pinMode(PIR_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  noTone(BUZZER_PIN);

  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("Erro ao inicializar OLED.");
    while (true) delay(100);
  }

  iniciarMemoria();
  preferencias.begin("alarme", false);
  carregarContador();
  conectarWiFi();
  configurarHorario();
  sincronizarEventos();
  mostrarMonitoramento();

  Serial.println("Sistema de alarme iniciado.");
  Serial.println("Monitorando movimento...");
  Serial.println("COMANDOS DO MONITOR SERIAL:");
  Serial.println("R = apagar todos os eventos e zerar contador");
  Serial.println("L = listar eventos salvos");
  Serial.println("C = mostrar contador");
  Serial.println("S = enviar primeiro evento para o Supabase");
}

void loop() {
  verificarComandosSerial();

  bool movimentoAtual = digitalRead(PIR_PIN) == HIGH;
  bool novoMovimento = movimentoAtual && !movimentoAnterior;

  if (novoMovimento) {
    numeroEvento++;
    salvarContador();

    Serial.print("Movimento detectado - Evento: ");
    Serial.println(numeroEvento);

    struct tm timeinfo;
    if (getLocalTime(&timeinfo)) {
      Serial.printf("Data/Hora: %02d/%02d/%04d %02d:%02d:%02d\n",
        timeinfo.tm_mday, timeinfo.tm_mon + 1, timeinfo.tm_year + 1900,
        timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
    }

    salvarEventoLocal();
    tone(BUZZER_PIN, 1000);
    inicioAlarme = millis();
    alarmeAtivo = true;
    mostrarEvento();
  }

  movimentoAnterior = movimentoAtual;

  if (alarmeAtivo && millis() - inicioAlarme >= DURACAO_ALARME) {
    noTone(BUZZER_PIN);
    alarmeAtivo = false;
    mostrarMonitoramento();
  }

  sincronizarEventos();
  delay(20);
}
