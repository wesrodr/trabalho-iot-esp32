#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
analise_mineracao.py
Módulo de Mineração de Dados para Monitoramento IoT ESP32

Executa dois algoritmos de Aprendizado de Máquina sobre os dados reais do sensor PIR:
1. K-Means: Agrupamento de padrões de movimentação (Baixa, Média, Alta movimentação).
2. Isolation Forest: Detecção de anomalias estatísticas e comportamentos incomuns.

Pode ser executado diretamente via terminal (CLI) ou invocado como módulo.
Bibliotecas utilizadas: pandas, numpy, scikit-learn.
"""

import sys
import os
import json
import argparse
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.ensemble import IsolationForest

FUSO_BRASILIA = timezone(timedelta(hours=-3))


def carregar_dados_supabase(url=None, key=None, limite=1000):
    """
    Consulta os registros reais da tabela 'eventos' no Supabase via REST API.
    Lê variáveis de ambiente ou arquivo .env caso os parâmetros não sejam passados.
    """
    if not url or not key:
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_KEY", "")

    if not url or not key:
        # Tenta ler do arquivo .env local se existir
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("SUPABASE_URL=") and not url:
                        url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    elif line.startswith("SUPABASE_KEY=") and not key:
                        key = line.split("=", 1)[1].strip().strip('"').strip("'")

    if not url or not key:
        raise ValueError("SUPABASE_URL e SUPABASE_KEY não configurados.")

    endpoint = f"{url.rstrip('/')}/rest/v1/eventos?select=id,numero_evento,data_hora&order=id.desc&limit={limite}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}" if key.startswith("eyJ") else key,
        "Accept": "application/json"
    }

    req = urllib.request.Request(endpoint, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        if resp.status != 200:
            raise RuntimeError(f"Erro ao consultar Supabase: HTTP {resp.status}")
        dados = json.loads(resp.read().decode("utf-8"))
        return dados


def converter_data_esp32(valor_str):
    """
    Converte o formato do ESP32 'DD/MM/YYYY HH:mm:ss' (em UTC-3) para datetime UTC-3.
    Retorna None se a data for inválida ou 'data_indisponivel'.
    """
    if not valor_str or not isinstance(valor_str, str):
        return None
    valor_str = valor_str.strip()
    if valor_str == "data_indisponivel":
        return None
    try:
        dt = datetime.strptime(valor_str, "%d/%m/%Y %H:%M:%S")
        return dt.replace(tzinfo=FUSO_BRASILIA)
    except Exception:
        return None


def preparar_dados(eventos, intervalo_minutos=30):
    """
    Limpa, deduplica e agrega os registros de eventos em janelas temporais de 'intervalo_minutos'.
    Gera atributos de entrada para os algoritmos de Mineração de Dados:
    - hora: Hora do dia (0 a 23)
    - dia_semana: Dia da semana (0 = Segunda, ..., 6 = Domingo)
    - quantidade_movimentos: Contagem de acionamentos do PIR no intervalo
    - frequencia_movimentacao: Movimentos por minuto no intervalo
    """
    if not eventos:
        return pd.DataFrame()

    registros_validos = []
    chaves_vistas = set()

    for item in eventos:
        dt = converter_data_esp32(item.get("data_hora"))
        if dt is None:
            continue

        num = item.get("numero_evento")
        # Chave de desduplicação
        chave = (num, dt.isoformat())
        if num is not None and chave in chaves_vistas:
            continue
        if num is not None:
            chaves_vistas.add(chave)

        registros_validos.append({
            "id": item.get("id"),
            "numero_evento": num,
            "datetime": dt
        })

    if not registros_validos:
        return pd.DataFrame()

    df_raw = pd.DataFrame(registros_validos)
    df_raw = df_raw.sort_values(by="datetime")
    df_raw = df_raw.set_index("datetime")

    # Agrupamento temporal pelo intervalo desejado (ex: 30 minutos)
    freq_str = f"{intervalo_minutos}min"
    agrupado = df_raw.resample(freq_str).agg(
        quantidade_movimentos=("id", "count")
    ).reset_index()

    # Filtra apenas janelas onde houve pelo menos 1 movimento
    agrupado = agrupado[agrupado["quantidade_movimentos"] > 0].copy()

    if agrupado.empty:
        return pd.DataFrame()

    # Variáveis derivadas para Machine Learning
    agrupado["hora"] = agrupado["datetime"].dt.hour
    agrupado["minuto"] = agrupado["datetime"].dt.minute
    agrupado["dia_semana"] = getattr(agrupado["datetime"].dt, "day_of_week", agrupado["datetime"].dt.dayofweek)
    agrupado["nome_dia"] = agrupado["datetime"].dt.strftime("%a")
    agrupado["frequencia_movimentacao"] = agrupado["quantidade_movimentos"] / float(intervalo_minutos)
    agrupado["data_formatada"] = agrupado["datetime"].dt.strftime("%d/%m/%Y")
    agrupado["hora_formatada"] = agrupado["datetime"].dt.strftime("%H:%M")
    agrupado["timestamp_iso"] = agrupado["datetime"].apply(lambda d: d.isoformat())

    return agrupado


def executar_kmeans(df, n_clusters=3, random_state=42):
    """
    Executa o algoritmo K-Means para agrupamento de padrões de movimentação.
    Garante que os clusters sejam rotulados em ordem crescente da média de movimentos:
    - Menor média -> 'Baixa movimentação'
    - Média intermediária -> 'Média movimentação'
    - Maior média -> 'Alta movimentação'
    """
    if len(df) < n_clusters:
        return df, None, "Dados insuficientes para formar o número de clusters solicitado."

    # Features utilizadas para o clustering
    features = ["hora", "dia_semana", "quantidade_movimentos", "frequencia_movimentacao"]
    X = df[features].copy()

    # Normalização min-max das features para distâncias euclidianas balanceadas
    X_norm = (X - X.min()) / (X.max() - X.min() + 1e-9)

    kmeans = KMeans(n_clusters=n_clusters, random_state=random_state, n_init=10)
    df["cluster_raw"] = kmeans.fit_predict(X_norm)

    # Mapeamento ordenado pela média de quantidade de movimentos
    medias = df.groupby("cluster_raw")["quantidade_movimentos"].mean().sort_values()
    ordem_clusters = list(medias.index)

    rotulos_padrao = ["Baixa movimentação", "Média movimentação", "Alta movimentação"]
    if n_clusters != 3:
        rotulos_padrao = [f"Grupo {i+1} ({medias.iloc[i]:.1f} mov/int)" for i in range(n_clusters)]

    mapa_rotulos = {cluster_id: rotulos_padrao[i] for i, cluster_id in enumerate(ordem_clusters)}
    mapa_graus = {cluster_id: i for i, cluster_id in enumerate(ordem_clusters)}

    df["cluster_label"] = df["cluster_raw"].map(mapa_rotulos)
    df["cluster_grau"] = df["cluster_raw"].map(mapa_graus)

    # Estatísticas de cada cluster
    estatisticas_clusters = []
    for i, cluster_id in enumerate(ordem_clusters):
        sub = df[df["cluster_raw"] == cluster_id]
        estatisticas_clusters.append({
            "grau": i,
            "categoria": rotulos_padrao[i],
            "total_periodos": int(len(sub)),
            "percentual": round(float(len(sub) / len(df) * 100), 1),
            "media_movimentos": round(float(sub["quantidade_movimentos"].mean()), 2),
            "max_movimentos": int(sub["quantidade_movimentos"].max()),
            "min_movimentos": int(sub["quantidade_movimentos"].min()),
            "hora_media": round(float(sub["hora"].mean()), 1)
        })

    return df, estatisticas_clusters, None


def executar_isolation_forest(df, contamination=0.08, random_state=42):
    """
    Executa o algoritmo Isolation Forest para detectar anomalias estatísticas no ambiente.
    Analisa: quantidade_movimentos, frequencia_movimentacao, hora, dia_semana.
    """
    if len(df) < 5:
        return df, None, "Dados insuficientes para análise com Isolation Forest (mínimo de 5 períodos)."

    features = ["quantidade_movimentos", "frequencia_movimentacao", "hora", "dia_semana"]
    X = df[features].copy()

    iso = IsolationForest(
        n_estimators=100,
        contamination=contamination,
        random_state=random_state
    )

    preds = iso.fit_predict(X)
    scores = iso.decision_function(X)

    # -1 representa anomalia, 1 representa normal no scikit-learn
    df["is_anomalia"] = preds == -1
    # Converte decision_function em score normalizado (quanto menor, mais anômalo)
    df["anomaly_score"] = np.round(-scores, 4)

    total = len(df)
    anomalias_qtd = int(df["is_anomalia"].sum())
    percentual = round((anomalias_qtd / total) * 100, 1)

    resumo_anomalias = {
        "total_analisados": total,
        "quantidade_anomalias": anomalias_qtd,
        "percentual_anomalias": percentual,
        "taxa_contaminacao_esperada": contamination
    }

    return df, resumo_anomalias, None


def minerar_dados(eventos, n_clusters=3, contamination=0.08, intervalo_minutos=30):
    """
    Função principal que integra a preparação e os dois algoritmos.
    Retorna dicionário pronto para serialização JSON para a interface.
    """
    inicio = datetime.now()

    if not eventos or len(eventos) < 4:
        return {
            "status": "dados_insuficientes",
            "mensagem": "É necessário acumular mais registros do sensor PIR no Supabase para executar os algoritmos de K-Means e Isolation Forest com relevância estatística.",
            "total_registros_brutos": len(eventos) if eventos else 0
        }

    df = preparar_dados(eventos, intervalo_minutos=intervalo_minutos)
    if df.empty or len(df) < n_clusters:
        return {
            "status": "dados_insuficientes",
            "mensagem": f"Foram encontrados registros, mas agregados em menos de {n_clusters} janelas temporais de {intervalo_minutos} min. Continue captando dados.",
            "total_registros_brutos": len(eventos)
        }

    df, stats_kmeans, erro_km = executar_kmeans(df, n_clusters=n_clusters)
    df, stats_iso, erro_iso = executar_isolation_forest(df, contamination=contamination)

    duracao_ms = int((datetime.now() - inicio).total_seconds() * 1000)

    # Prepara lista de pontos para gráficos
    pontos = []
    for _, row in df.iterrows():
        pontos.append({
            "timestamp": row["timestamp_iso"],
            "data": row["data_formatada"],
            "hora_str": row["hora_formatada"],
            "hora": int(row["hora"]),
            "dia_semana": int(row["dia_semana"]),
            "nome_dia": str(row["nome_dia"]),
            "movimentos": int(row["quantidade_movimentos"]),
            "frequencia": round(float(row["frequencia_movimentacao"]), 3),
            "cluster_grau": int(row["cluster_grau"]) if "cluster_grau" in row else 0,
            "cluster_label": str(row["cluster_label"]) if "cluster_label" in row else "",
            "is_anomalia": bool(row["is_anomalia"]) if "is_anomalia" in row else False,
            "anomaly_score": float(row["anomaly_score"]) if "anomaly_score" in row else 0.0
        })

    # Lista de anomalias ordenadas pelo score (mais anômalas primeiro)
    anomalias = [p for p in pontos if p["is_anomalia"]]
    anomalias.sort(key=lambda x: x["anomaly_score"], reverse=True)

    # Identificação dos períodos de maior e menor atividade
    agrup_hora = df.groupby("hora")["quantidade_movimentos"].mean()
    pico_hora = int(agrup_hora.idxmax())
    calmo_hora = int(agrup_hora.idxmin())

    return {
        "status": "sucesso",
        "timestamp_execucao": datetime.now(FUSO_BRASILIA).isoformat(),
        "duracao_execucao_ms": duracao_ms,
        "total_eventos_brutos": len(eventos),
        "total_periodos_analisados": len(df),
        "intervalo_minutos": intervalo_minutos,
        "kmeans": {
            "n_clusters": n_clusters,
            "distribuicao": stats_kmeans,
            "periodo_maior_atividade": f"{pico_hora:02d}:00 às {(pico_hora+1)%24:02d}:00",
            "periodo_menor_atividade": f"{calmo_hora:02d}:00 às {(calmo_hora+1)%24:02d}:00",
            "erro": erro_km
        },
        "isolation_forest": {
            "resumo": stats_iso,
            "anomalias": anomalias,
            "erro": erro_iso
        },
        "pontos": pontos
    }


def main():
    parser = argparse.ArgumentParser(description="Mineração de Dados - IoT ESP32")
    parser.add_argument("--json", action="store_true", help="Saída estrita em JSON")
    parser.add_argument("--clusters", type=int, default=3, help="Número de grupos para o K-Means (padrão: 3)")
    parser.add_argument("--contamination", type=float, default=0.08, help="Taxa de anomalias estimada (padrão: 0.08)")
    parser.add_argument("--intervalo", type=int, default=30, help="Janela de agregação em minutos (padrão: 30)")
    args = parser.parse_args()

    # Verifica se há JSON vindo por stdin
    if not sys.stdin.isatty():
        try:
            stdin_data = sys.stdin.read()
            if stdin_data.strip():
                eventos = json.loads(stdin_data)
            else:
                eventos = carregar_dados_supabase()
        except Exception:
            eventos = carregar_dados_supabase()
    else:
        try:
            eventos = carregar_dados_supabase()
        except Exception as e:
            if args.json:
                print(json.dumps({"status": "erro", "mensagem": str(e)}))
            else:
                print(f"[ERRO] {e}")
            sys.exit(1)

    resultado = minerar_dados(
        eventos,
        n_clusters=args.clusters,
        contamination=args.contamination,
        intervalo_minutos=args.intervalo
    )

    if args.json:
        print(json.dumps(resultado, ensure_ascii=False, indent=2))
    else:
        print("\n" + "=" * 60)
        print("   RELATÓRIO DE MINERAÇÃO DE DADOS — IoT ESP32")
        print("=" * 60)
        print(f"Status: {resultado['status']}")
        if resultado['status'] != 'sucesso':
            print(f"Mensagem: {resultado.get('mensagem')}")
            sys.exit(0)

        print(f"Total de eventos analisados: {resultado['total_eventos_brutos']}")
        print(f"Períodos temporais ({resultado['intervalo_minutos']} min): {resultado['total_periodos_analisados']}")
        print(f"Tempo de execução: {resultado['duracao_execucao_ms']} ms")

        print("\n--- 1. K-MEANS (Padrões de Movimentação) ---")
        print(f"Período de Maior Atividade: {resultado['kmeans']['periodo_maior_atividade']}")
        print(f"Período de Menor Atividade: {resultado['kmeans']['periodo_menor_atividade']}")
        for dist in resultado['kmeans']['distribuicao']:
            print(f"  [{dist['categoria']}] {dist['total_periodos']} períodos ({dist['percentual']}%) | Média: {dist['media_movimentos']} mov")

        print("\n--- 2. ISOLATION FOREST (Detecção de Anomalias) ---")
        iso = resultado['isolation_forest']['resumo']
        print(f"Anomalias detectadas: {iso['quantidade_anomalias']} ({iso['percentual_anomalias']}%)")
        if resultado['isolation_forest']['anomalias']:
            print("  Eventos incomuns destacados:")
            for a in resultado['isolation_forest']['anomalias'][:5]:
                print(f"   * {a['data']} às {a['hora_str']} ({a['nome_dia']}): {a['movimentos']} mov (Score: {a['anomaly_score']})")

        print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
