from services.db_handler import (
    MongoService
)

db = MongoService().db


def get_rtg_config():

    return db.global_config.find_one(
        {},
        {"_id": 0}
    )