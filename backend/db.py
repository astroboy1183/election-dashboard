from sqlmodel import SQLModel, Session, create_engine
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "election.db")
DATABASE_URL = f"sqlite:///{os.path.abspath(DB_PATH)}"

engine = create_engine(DATABASE_URL, echo=False)


def create_db():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
