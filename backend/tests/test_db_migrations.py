from sqlalchemy import create_engine, text

import app.core.db as db


def test_ensure_column_adds_a_missing_column_to_an_old_table(tmp_path, monkeypatch):
    eng = create_engine(f"sqlite:///{tmp_path}/old.db")
    with eng.begin() as c:
        c.execute(text("CREATE TABLE thing (id INTEGER PRIMARY KEY, name TEXT)"))
        c.execute(text("INSERT INTO thing (name) VALUES ('old')"))
    monkeypatch.setattr(db, "engine", eng)
    db._ensure_column("thing", "note", "TEXT NOT NULL DEFAULT ''")
    db._ensure_column("thing", "note", "TEXT NOT NULL DEFAULT ''")  # idempotent
    with eng.begin() as c:
        assert tuple(c.execute(text("SELECT name, note FROM thing")).one()) == ("old", "")


def test_tables_of_removed_features_are_dropped_and_the_rest_kept(tmp_path, monkeypatch):
    eng = create_engine(f"sqlite:///{tmp_path}/v01.db")
    with eng.begin() as c:
        for table in ("video", "playlistsource", "carreport"):
            c.execute(text(f"CREATE TABLE {table} (id INTEGER PRIMARY KEY)"))
    monkeypatch.setattr(db, "engine", eng)
    db.init_db()
    db.init_db()  # idempotent
    with eng.begin() as c:
        tables = {r[0] for r in c.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))}
    assert not tables & {"video", "playlistsource", "carreport"}
    assert {"device", "watchedvideo", "followedchannel"} <= tables
