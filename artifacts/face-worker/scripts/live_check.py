"""Verificação ponta a ponta do face-worker contra o Supabase real.

Semeia uma escola de ensaio, sobe material de teste, roda o worker de verdade
(`python -m face_worker`, o mesmo binário do contêiner) e confere o resultado
no banco. No fim apaga tudo o que criou.

**Regra de dado (spec §9.5).** O material é
`scripts/spike-face/results/sample_scene_20_faces.jpg`: uma cena sintética
composta de 20 rostos do LFW, conjunto público **de adultos**. Nenhuma foto
real de criança ou adolescente entra aqui — nem deve, enquanto as pendências
de `docs/pendencias-producao.md` não fecharem.

O que o roteiro prova:

1. A fila de referência funciona: três retratos viram três vetores em
   `student_reference_faces`, com `det_size` 640.
2. O reconhecimento acha os 20 rostos da cena com `det_size` 1600.
3. Os três alunos com referência são **sugeridos** (nunca confirmados — D6).
4. Os outros 17 rostos ficam `unassigned` e **sem vetor** (D5, spec §9.3).
5. `bbox`, `det_score` e recorte existem para todo rosto (spec §9.3.1).
6. O evento sai de `processing` para `review` quando o último job termina.

Uso (a partir da raiz do repositório):

    set -a; . ./.env.local; set +a
    artifacts/face-worker/.venv/bin/python artifacts/face-worker/scripts/live_check.py
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
import uuid
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
WORKER = REPO / "artifacts" / "face-worker"
sys.path.insert(0, str(WORKER / "src"))

import cv2  # noqa: E402
import numpy as np  # noqa: E402

from face_worker.engine import FaceEngine, crop_face, decode_image  # noqa: E402
from face_worker.supabase import SupabaseClient  # noqa: E402

SCENE = REPO / "scripts" / "spike-face" / "results" / "sample_scene_20_faces.jpg"
REFERENCE_STUDENTS = 3
TIMEOUT_SECONDS = 300


def env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        sys.exit(f"variável de ambiente ausente: {name}")
    return value


def main() -> int:
    url = env("SUPABASE_URL").rstrip("/")
    key = env("SUPABASE_SERVICE_ROLE_KEY")
    if not SCENE.is_file():
        sys.exit(f"material de teste ausente: {SCENE}")

    api = SupabaseClient(url, key)
    school = str(uuid.uuid4())
    event = str(uuid.uuid4())
    photo = str(uuid.uuid4())
    students: list[str] = []
    created_objects: list[tuple[str, str]] = []

    try:
        # ---------- 1. Semeadura ----------
        owner = api.select("profiles", {"select": "id", "limit": "1"})
        if not owner:
            sys.exit("o banco não tem nenhum profile; crie o super admin antes")
        owner_id = owner[0]["id"]

        _insert(api, "schools", {"id": school, "name": "Escola Ensaio face-worker"})
        for i in range(REFERENCE_STUDENTS):
            sid = str(uuid.uuid4())
            students.append(sid)
            _insert(
                api,
                "students",
                {
                    "id": sid,
                    "school_id": school,
                    "owner_id": owner_id,
                    "name": f"Aluno Ensaio {i + 1}",
                    "whatsapp": f"+551199999{i:04d}",
                    "photos": [],
                },
            )
        _insert(
            api,
            "events",
            {
                "id": event,
                "school_id": school,
                "name": "Evento Ensaio face-worker",
                "event_date": time.strftime("%Y-%m-%d"),
                "status": "processing",
                "created_by": owner_id,
            },
        )
        batch = _insert(
            api,
            "batch_jobs",
            {
                "school_id": school,
                "event_id": event,
                "kind": "ingest",
                "status": "running",
                "total": 1,
                "created_by": owner_id,
            },
        )["id"]

        # ---------- 2. Recortes da cena viram retratos de referência ----------
        print("carregando o motor para recortar as referências...")
        engine = FaceEngine()
        scene_bytes = SCENE.read_bytes()
        scene = decode_image(scene_bytes)
        faces = engine.analyze(scene, det_size=1600, min_det_score=0.5, min_face_px=40)
        print(f"a cena tem {len(faces)} rostos detectados")
        if len(faces) < REFERENCE_STUDENTS:
            sys.exit("a cena de ensaio tem menos rostos que alunos")

        # Os rostos maiores primeiro: retrato de referência precisa de resolução.
        chosen = sorted(faces, key=lambda f: f.size, reverse=True)[:REFERENCE_STUDENTS]
        for sid, face in zip(students, chosen, strict=True):
            auth = _insert(
                api,
                "authorizations",
                {
                    "school_id": school,
                    "student_id": sid,
                    "scope": "biometric_sorting",
                    "granted_at": "now()",
                    "created_by": owner_id,
                },
            )["id"]
            job_id = str(uuid.uuid4())
            path = f"{school}/{sid}/{job_id}.jpg"
            api.upload("student-refs", path, _portrait(scene, face.bbox), "image/jpeg")
            created_objects.append(("student-refs", path))
            _insert(
                api,
                "student_reference_jobs",
                {
                    "id": job_id,
                    "school_id": school,
                    "student_id": sid,
                    "authorization_id": auth,
                    "storage_path": path,
                    "created_by": owner_id,
                },
            )

        # ---------- 3. A cena inteira vira a foto do evento ----------
        photo_path = f"{school}/{event}/{photo}.jpg"
        api.upload("event-photos", photo_path, scene_bytes, "image/jpeg")
        created_objects.append(("event-photos", photo_path))
        _insert(
            api,
            "photos",
            {
                "id": photo,
                "school_id": school,
                "event_id": event,
                "batch_id": batch,
                "storage_path": photo_path,
                "content_hash": uuid.uuid4().hex * 2,
                "original_filename": "cena_ensaio.jpg",
                "bytes": len(scene_bytes),
                "status": "processed",
                "uploaded_by": owner_id,
            },
        )
        # O job de ingest nasce por trigger; aqui o que interessa é o de
        # reconhecimento, que na produção o `ingest-worker` enfileira ao
        # concluir (M3). Sem ele rodando, a gente enfileira direto.
        _insert(api, "photo_jobs", {"batch_id": batch, "photo_id": photo, "kind": "recognize"})

        # ---------- 4. O worker de verdade ----------
        print("subindo o face-worker...")
        proc = subprocess.Popen(
            [str(WORKER / ".venv" / "bin" / "python"), "-m", "face_worker"],
            cwd=str(WORKER),
            env={**os.environ, "PYTHONPATH": str(WORKER / "src"), "PORT": "8099"},
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        try:
            _wait_for_drain(api, school, photo, proc)
        finally:
            proc.terminate()
            out, _ = proc.communicate(timeout=60)
            print("--- log do worker ---")
            print(out.strip()[-4000:])
            print("--- fim do log ---")

        # ---------- 5. Conferência ----------
        return _assert_results(api, school, event, photo, students)

    finally:
        print("limpando...")
        for bucket, path in created_objects:
            try:
                api.remove(bucket, [path])
            except Exception as exc:  # noqa: BLE001
                print(f"  aviso: {bucket}/{path} não foi removido ({exc})")
        try:
            crops = api.select(
                "photo_faces", {"photo_id": f"eq.{photo}", "select": "crop_path"}
            )
            paths = [c["crop_path"] for c in crops if c.get("crop_path")]
            if paths:
                api.remove("face-crops", paths)
        except Exception as exc:  # noqa: BLE001
            print(f"  aviso: recortes não removidos ({exc})")
        # `schools` cascateia para alunos, evento, fotos, rostos e filas.
        try:
            _delete(api, "schools", {"id": f"eq.{school}"})
        except Exception as exc:  # noqa: BLE001
            print(f"  aviso: escola de ensaio não removida ({exc})")
        api.close()


def _portrait(scene: np.ndarray, bbox: tuple[int, int, int, int]) -> bytes:
    """Recorte grande, como um retrato enviado pela escola."""
    data = crop_face(scene, bbox, margin=0.6)
    img = decode_image(data)
    # Retratos chegam em resoluções variadas; 512px é um tamanho plausível e
    # mantém o rosto bem acima do mínimo de detecção.
    side = 512
    resized = cv2.resize(img, (side, side), interpolation=cv2.INTER_CUBIC)
    ok, buf = cv2.imencode(".jpg", resized, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    if not ok:
        raise RuntimeError("falha ao codificar o retrato de ensaio")
    return buf.tobytes()


def _insert(api: SupabaseClient, table: str, row: dict) -> dict:
    # `granted_at: "now()"` não é aceito pelo PostgREST; troca por ISO.
    row = {k: (time.strftime("%Y-%m-%dT%H:%M:%SZ") if v == "now()" else v) for k, v in row.items()}
    resp = api._client.post(  # noqa: SLF001 — roteiro de ensaio, não produção
        f"{api._url}/rest/v1/{table}",
        json=row,
        headers={"Content-Type": "application/json", "Prefer": "return=representation"},
    )
    if not resp.is_success:
        raise RuntimeError(f"insert {table}: {resp.status_code} {resp.text[:300]}")
    data = resp.json()
    return data[0] if isinstance(data, list) else data


def _delete(api: SupabaseClient, table: str, params: dict) -> None:
    resp = api._client.request(  # noqa: SLF001
        "DELETE", f"{api._url}/rest/v1/{table}", params=params
    )
    if not resp.is_success:
        raise RuntimeError(f"delete {table}: {resp.status_code} {resp.text[:300]}")


def _wait_for_drain(api: SupabaseClient, school: str, photo: str, proc) -> None:
    deadline = time.time() + TIMEOUT_SECONDS
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError("o worker morreu antes de terminar a fila")
        refs = api.select(
            "student_reference_jobs",
            {"school_id": f"eq.{school}", "status": "neq.done", "select": "id"},
        )
        jobs = api.select(
            "photo_jobs",
            {"photo_id": f"eq.{photo}", "kind": "eq.recognize", "select": "id,status"},
        )
        pending_jobs = [j for j in jobs if j["status"] in ("queued", "leased")]
        if not refs and not pending_jobs:
            print("as duas filas esvaziaram")
            return
        time.sleep(2)
    raise RuntimeError("tempo esgotado esperando as filas")


def _assert_results(
    api: SupabaseClient, school: str, event: str, photo: str, students: list[str]
) -> int:
    problems: list[str] = []

    refs = api.select(
        "student_reference_faces", {"school_id": f"eq.{school}", "select": "student_id,quality"}
    )
    if len(refs) != REFERENCE_STUDENTS:
        problems.append(f"esperava {REFERENCE_STUDENTS} referências, achei {len(refs)}")

    faces = api.select(
        "photo_faces",
        {
            "photo_id": f"eq.{photo}",
            "select": "state,student_id,match_score,det_score,bbox,crop_path,embedding",
        },
    )
    print(f"rostos gravados: {len(faces)}")
    if len(faces) < 18:
        problems.append(f"esperava ~20 rostos na cena, achei {len(faces)}")

    suggested = [f for f in faces if f["state"] == "suggested"]
    unassigned = [f for f in faces if f["state"] == "unassigned"]
    with_vector = [f for f in faces if f.get("embedding")]
    print(f"  sugeridos: {len(suggested)} · sem atribuição: {len(unassigned)}")
    print(f"  com vetor persistido: {len(with_vector)}")

    if len(suggested) != REFERENCE_STUDENTS:
        problems.append(
            f"esperava {REFERENCE_STUDENTS} rostos sugeridos, achei {len(suggested)}"
        )
    if {f["student_id"] for f in suggested} != set(students):
        problems.append("os rostos sugeridos não são os dos alunos com referência")
    # D5: vetor só de quem foi correspondido e consentiu.
    if len(with_vector) != len(suggested):
        problems.append(
            f"D5 violada: {len(with_vector)} vetores para {len(suggested)} rostos atribuídos"
        )
    # §9.3.1: bbox, det_score e recorte de TODO rosto.
    if any(not f.get("bbox") or not f.get("det_score") for f in faces):
        problems.append("há rosto sem bbox ou det_score (spec §9.3.1)")
    if any(not f.get("crop_path") for f in faces):
        problems.append("há rosto sem recorte para a revisão")
    # D6: nada nasce confirmado.
    if any(f["state"] == "confirmed" for f in faces):
        problems.append("D6 violada: rosto nasceu confirmado")

    status = api.select("events", {"id": f"eq.{event}", "select": "status"})[0]["status"]
    print(f"status do evento: {status}")
    if status != "review":
        problems.append(f"o evento devia estar em review, está em {status}")

    if problems:
        print("\nFALHOU:")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("\nroundtrip do face-worker ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
