from sqlalchemy import create_engine, text

import app.core.db as db


def test_ensure_column_adds_missing_columns_to_an_old_table(tmp_path, monkeypatch):
    eng = create_engine(f"sqlite:///{tmp_path}/old.db")
    with eng.begin() as c:
        c.execute(text("CREATE TABLE carreport (id INTEGER PRIMARY KEY, user_agent TEXT)"))
        c.execute(text("INSERT INTO carreport (user_agent) VALUES ('old car')"))
    monkeypatch.setattr(db, "engine", eng)
    db.init_db()
    db.init_db()  # idempotent
    with eng.begin() as c:
        cols = {r[1] for r in c.execute(text("PRAGMA table_info(carreport)"))}
        row = c.execute(text("SELECT user_agent, metrics, webcodecs_video FROM carreport")).one()
    assert {"webcodecs_video", "metrics"} <= cols
    assert tuple(row) == ("old car", "", None)
