from services.db_handler import (
    MongoService
)

class PipelineConfigService:

    def __init__(self):

        self.db = MongoService().db

        self.collection = (
            self.db["pipeline_config"]
        )

    def get_config(
        self,
        config_type
    ):

        return self.collection.find_one(

            {
                "config_type":
                    config_type
            },

            {"_id": 0}
        )