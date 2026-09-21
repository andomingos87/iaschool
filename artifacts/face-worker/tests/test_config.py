import pytest

from face_worker.config import ConfigError, load_config


def test_exige_url_e_chave():
    with pytest.raises(ConfigError, match="SUPABASE_URL"):
        load_config({})
    with pytest.raises(ConfigError, match="SUPABASE_SERVICE_ROLE_KEY"):
        load_config({"SUPABASE_URL": "https://x.supabase.co"})


def test_padroes_da_spec():
    cfg = load_config({"SUPABASE_URL": "https://x.supabase.co/", "SUPABASE_SERVICE_ROLE_KEY": "k"})
    # A barra final estraga a montagem das URLs; o config tira.
    assert cfg.supabase_url == "https://x.supabase.co"
    assert cfg.port == 8080
    assert cfg.claim_batch == 8
    assert cfg.lease_seconds == 300
    assert cfg.log_level == "INFO"


def test_recusa_inteiro_invalido():
    base = {"SUPABASE_URL": "https://x", "SUPABASE_SERVICE_ROLE_KEY": "k"}
    with pytest.raises(ConfigError, match="CLAIM_BATCH"):
        load_config({**base, "CLAIM_BATCH": "zero"})
    with pytest.raises(ConfigError, match="CLAIM_BATCH"):
        load_config({**base, "CLAIM_BATCH": "0"})
    with pytest.raises(ConfigError, match="LEASE_SECONDS"):
        load_config({**base, "LEASE_SECONDS": "-5"})
