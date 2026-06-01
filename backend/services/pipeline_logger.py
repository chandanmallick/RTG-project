from datetime import datetime

import traceback

from services.db_handler import (
    MongoService
)

class PipelineLogger:

    def __init__(self):

        self.db = MongoService().db

        self.collection = (
            self.db["pipeline_logs"]
        )

    def log(

        self,

        revision_id,

        pipeline_type,

        process_name,

        status,

        message,

        extra_data=None,

        payload=None,

        response_data=None,

        traceback_error=None
    ):

        self.collection.insert_one({

            "revision_id":
                revision_id,

            "pipeline_type":
                pipeline_type,

            "process_name":
                process_name,

            "status":
                status,

            "message":
                message,

            "extra_data":
                extra_data or {},

            "payload":
                payload,

            "response_data":
                response_data,

            "traceback":
                traceback_error,

            "timestamp":
                datetime.now()
        })